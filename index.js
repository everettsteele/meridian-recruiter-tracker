const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const PASSWORD = process.env.AUTH_PASSWORD || '';

// Seeds live in /seeds/ — never under the Railway volume mount.
// Railway volume mounts at /app/data. Seeds at /app/seeds are untouched by the volume.
// Overrides (runtime status changes) live in /app/data/overrides.json on the volume.
const SEEDS_DIR = path.join(__dirname, 'seeds');
const DATA_DIR  = path.join(__dirname, 'data');
const OVERRIDES_PATH = path.join(DATA_DIR, 'overrides.json');

const SEED_PATHS = {
  firms: path.join(SEEDS_DIR, 'seed_firms.json'),
  ceos:  path.join(SEEDS_DIR, 'seed_ceos.json'),
  vcs:   path.join(SEEDS_DIR, 'seed_vcs.json'),
};

try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e){}

function readSeed(key) {
  try { return JSON.parse(fs.readFileSync(SEED_PATHS[key], 'utf8')); } catch(e) {
    console.error('Failed to read seed:', key, e.message);
    return [];
  }
}

function loadOverrides() {
  try {
    if (fs.existsSync(OVERRIDES_PATH)) return JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
  } catch(e) {}
  return { firms: {}, ceos: {}, vcs: {} };
}

function saveOverrides(o) {
  try { fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(o, null, 2)); } catch(e) {}
}

function getDB(key) {
  const seed = readSeed(key);
  const ov = (loadOverrides()[key]) || {};
  return seed.map(item => {
    const o = ov[String(item.id)];
    return o ? { ...item, ...o } : item;
  });
}

const counts = { firms: readSeed('firms').length, ceos: readSeed('ceos').length, vcs: readSeed('vcs').length };
console.log(`HopeSpot ready — firms:${counts.firms} ceos:${counts.ceos} vcs:${counts.vcs} — seeds from /seeds/, overrides on volume`);

const sessions = new Set();
function requireAuth(req, res, next) {
  if (!PASSWORD) return next();
  const token = req.headers['x-auth-token'] || req.query.token;
  if (sessions.has(token)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

app.use(express.json());

app.post('/api/login', (req, res) => {
  if (!PASSWORD) return res.json({ ok: true, token: 'no-auth' });
  if (req.body.password === PASSWORD) {
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessions.add(token); res.json({ ok: true, token });
  } else res.status(401).json({ error: 'Wrong password' });
});

app.get('/api/auth-required', (req, res) => res.json({ required: !!PASSWORD }));
app.get('/api/firms', requireAuth, (req, res) => res.json(getDB('firms')));
app.get('/api/ceos',  requireAuth, (req, res) => res.json(getDB('ceos')));
app.get('/api/vcs',   requireAuth, (req, res) => res.json(getDB('vcs')));

// Debug endpoint — shows seed counts and overrides count so we can verify the right files are loading
app.get('/api/debug', requireAuth, (req, res) => {
  const ov = loadOverrides();
  res.json({
    seedsDir: SEEDS_DIR,
    dataDir: DATA_DIR,
    seedCounts: { firms: readSeed('firms').length, ceos: readSeed('ceos').length, vcs: readSeed('vcs').length },
    overrideCounts: { firms: Object.keys(ov.firms||{}).length, ceos: Object.keys(ov.ceos||{}).length, vcs: Object.keys(ov.vcs||{}).length },
    overridesPath: OVERRIDES_PATH,
    overridesExists: fs.existsSync(OVERRIDES_PATH),
  });
});

app.get('/api/stats', requireAuth, (req, res) => {
  const firms = getDB('firms');
  const ceos  = getDB('ceos');
  const vcs   = getDB('vcs');

  function seg(arr, label) {
    const contacted = arr.filter(x => ['contacted','in conversation'].includes(x.status)).length;
    const drafts    = arr.filter(x => x.status === 'draft').length;
    const conv      = arr.filter(x => x.status === 'in conversation').length;
    const bounced   = arr.filter(x => x.status === 'bounced' || (x.contacts||[]).some(c => c.status === 'bounced')).length;
    return { label, total: arr.length, contacted, drafts, conv, bounced, responseRate: contacted > 0 ? Math.round((conv/contacted)*100) : 0 };
  }

  const allItems = [
    ...firms.map(x => ({ ...x, _key: 'firms' })),
    ...ceos.map(x  => ({ ...x, _key: 'ceos' })),
    ...vcs.map(x   => ({ ...x, _key: 'vcs' })),
  ];

  const byDate = {};
  allItems.forEach(item => {
    if (!item.last_contacted) return;
    const d = item.last_contacted;
    if (!byDate[d]) byDate[d] = { recruiters: 0, ceos: 0, vcs: 0, total: 0 };
    if (['contacted','in conversation'].includes(item.status)) {
      if (item._key === 'firms') byDate[d].recruiters++;
      if (item._key === 'ceos')  byDate[d].ceos++;
      if (item._key === 'vcs')   byDate[d].vcs++;
      byDate[d].total++;
    }
  });

  const daily = Object.entries(byDate)
    .sort(([a],[b]) => a > b ? 1 : -1)
    .map(([date, counts]) => ({ date, ...counts }));

  res.json({
    segments: [seg(firms,'Recruiters'), seg(ceos,'Direct CEO'), seg(vcs,'VC Firms')],
    daily,
    totals: {
      contacted: allItems.filter(x => ['contacted','in conversation'].includes(x.status)).length,
      inConversation: allItems.filter(x => x.status === 'in conversation').length,
      drafts: allItems.filter(x => x.status === 'draft').length,
      bounced: allItems.filter(x => x.status === 'bounced').length,
      total: allItems.length,
    }
  });
});

function makePatch(key) {
  return (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const seed = readSeed(key);
      const item = seed.find(x => x.id === id);
      if (!item) return res.status(404).json({ error: 'Not found' });
      const ov = loadOverrides();
      if (!ov[key]) ov[key] = {};
      const cur = ov[key][String(id)] || {};
      const upd = { ...cur };
      ['status','notes','followup_date'].forEach(k => { if (req.body[k] !== undefined) upd[k] = req.body[k]; });
      if (req.body.status && !['not contacted','draft'].includes(req.body.status))
        upd.last_contacted = new Date().toISOString().split('T')[0];
      ov[key][String(id)] = upd;
      saveOverrides(ov);
      res.json({ ...item, ...upd });
    } catch(e) { res.status(500).json({ error: e.message }); }
  };
}

app.patch('/api/firms/:id', requireAuth, makePatch('firms'));
app.patch('/api/ceos/:id',  requireAuth, makePatch('ceos'));
app.patch('/api/vcs/:id',   requireAuth, makePatch('vcs'));

app.post('/api/reseed', requireAuth, (req, res) => {
  saveOverrides({ firms: {}, ceos: {}, vcs: {} });
  res.json({ ok: true, message: 'Overrides cleared. All statuses reset to seed defaults.' });
});

app.post('/api/sync', requireAuth, (req, res) => {
  const updates = req.body.updates || [];
  if (!updates.length) return res.json({ ok: true, changed: 0 });
  let changed = 0;
  const ov = loadOverrides();
  ['firms','ceos','vcs'].forEach(key => {
    const seed = readSeed(key);
    seed.forEach(item => {
      (item.contacts||[]).forEach(c => {
        const match = updates.find(u => u.email && c.email && u.email.toLowerCase() === c.email.toLowerCase());
        if (!match) return;
        if (!ov[key]) ov[key] = {};
        const cur = ov[key][String(item.id)] || {};
        const upd = { ...cur };
        if (match.status) upd.status = match.status;
        if (match.note) {
          const ts = new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'});
          upd.notes = upd.notes ? upd.notes+'\n['+ts+'] '+match.note : '['+ts+'] '+match.note;
        }
        upd.last_contacted = new Date().toISOString().split('T')[0];
        ov[key][String(item.id)] = upd;
        changed++;
      });
    });
  });
  saveOverrides(ov);
  res.json({ ok: true, changed });
});

app.get('/health', (req, res) => res.json({ ok: true, port: PORT, seedCounts: { firms: readSeed('firms').length, ceos: readSeed('ceos').length, vcs: readSeed('vcs').length } }));
app.use(express.static(path.join(__dirname, 'public')));
app.listen(PORT, '0.0.0.0', () => console.log('Listening on port '+PORT));

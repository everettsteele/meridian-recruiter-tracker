const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PASSWORD = process.env.AUTH_PASSWORD || '';

const PATHS = {
  firms: path.join(DATA_DIR, 'tracker.json'),
  ceos:  path.join(DATA_DIR, 'ceos.json'),
  vcs:   path.join(DATA_DIR, 'vcs.json'),
};
const SEEDS = {
  firms: path.join(DATA_DIR, 'seed_firms.json'),
  ceos:  path.join(DATA_DIR, 'seed_ceos.json'),
  vcs:   path.join(DATA_DIR, 'seed_vcs.json'),
};

try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e){}

function readSeed(key) {
  try { return JSON.parse(fs.readFileSync(SEEDS[key], 'utf8')); } catch(e) { return []; }
}
function loadDB(key) {
  try {
    if (fs.existsSync(PATHS[key])) return JSON.parse(fs.readFileSync(PATHS[key], 'utf8'));
  } catch(e) {}
  const seed = readSeed(key);
  try { fs.writeFileSync(PATHS[key], JSON.stringify(seed, null, 2)); } catch(e) {}
  return seed;
}
function saveDB(key, data) {
  try { fs.writeFileSync(PATHS[key], JSON.stringify(data, null, 2)); } catch(e) {}
}

['firms','ceos','vcs'].forEach(k => loadDB(k));
console.log('DBs ready');

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
app.get('/api/firms', requireAuth, (req, res) => res.json(loadDB('firms')));
app.get('/api/ceos',  requireAuth, (req, res) => res.json(loadDB('ceos')));
app.get('/api/vcs',   requireAuth, (req, res) => res.json(loadDB('vcs')));

app.get('/api/stats', requireAuth, (req, res) => {
  const firms = loadDB('firms');
  const ceos  = loadDB('ceos');
  const vcs   = loadDB('vcs');

  function seg(arr, label) {
    const total     = arr.length;
    const contacted = arr.filter(x => ['contacted','in conversation'].includes(x.status)).length;
    const drafts    = arr.filter(x => x.status === 'draft').length;
    const conv      = arr.filter(x => x.status === 'in conversation').length;
    const bounced   = arr.filter(x => x.status === 'bounced' || (x.contacts||[]).some(c => c.status === 'bounced')).length;
    const passed    = arr.filter(x => x.status === 'passed').length;
    const rateNum   = contacted > 0 ? Math.round((conv / contacted) * 100) : 0;
    return { label, total, contacted, drafts, conv, bounced, passed, responseRate: rateNum };
  }

  // Build daily activity from last_contacted dates across all records
  const allItems = [...firms, ...ceos, ...vcs];
  const byDate = {};
  allItems.forEach(item => {
    if (!item.last_contacted) return;
    const d = item.last_contacted;
    if (!byDate[d]) byDate[d] = { recruiters: 0, ceos: 0, vcs: 0, total: 0 };
    const isFirm = firms.includes(item);
    const isCeo  = ceos.includes(item);
    const isVc   = vcs.includes(item);
    if (['contacted','in conversation'].includes(item.status)) {
      if (isFirm) byDate[d].recruiters++;
      if (isCeo)  byDate[d].ceos++;
      if (isVc)   byDate[d].vcs++;
      byDate[d].total++;
    }
  });
  const daily = Object.entries(byDate)
    .sort(([a],[b]) => a > b ? 1 : -1)
    .map(([date, counts]) => ({ date, ...counts }));

  res.json({
    segments: [
      seg(firms, 'Recruiters'),
      seg(ceos,  'Direct CEO'),
      seg(vcs,   'VC Firms'),
    ],
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
      const data = loadDB(key);
      const idx = data.findIndex(f => f.id === id);
      if (idx === -1) return res.status(404).json({ error: 'Not found' });
      ['status','notes','followup_date'].forEach(k => { if (req.body[k] !== undefined) data[idx][k] = req.body[k]; });
      if (req.body.status && !['not contacted','draft'].includes(req.body.status))
        data[idx].last_contacted = new Date().toISOString().split('T')[0];
      saveDB(key, data); res.json(data[idx]);
    } catch(e) { res.status(500).json({ error: e.message }); }
  };
}

app.patch('/api/firms/:id', requireAuth, makePatch('firms'));
app.patch('/api/ceos/:id',  requireAuth, makePatch('ceos'));
app.patch('/api/vcs/:id',   requireAuth, makePatch('vcs'));

app.post('/api/sync', requireAuth, (req, res) => {
  const updates = req.body.updates || [];
  if (!updates.length) return res.json({ ok: true, changed: 0 });
  let changed = 0;
  ['firms','ceos','vcs'].forEach(key => {
    const data = loadDB(key);
    let dirty = false;
    data.forEach(item => {
      (item.contacts||[]).forEach(c => {
        const match = updates.find(u => u.email && c.email && u.email.toLowerCase() === c.email.toLowerCase());
        if (!match) return;
        if (match.status) { c.status = match.status; item.status = match.status; }
        if (match.note) {
          const ts = new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'});
          const line = '['+ts+'] '+match.note;
          item.notes = item.notes ? item.notes+'\n'+line : line;
          c.notes = c.notes ? c.notes+'\n'+line : line;
        }
        item.last_contacted = new Date().toISOString().split('T')[0];
        dirty = true; changed++;
      });
    });
    if (dirty) saveDB(key, data);
  });
  res.json({ ok: true, changed });
});

app.get('/health', (req, res) => res.json({ ok: true, port: PORT }));
app.use(express.static(path.join(__dirname, 'public')));
app.listen(PORT, '0.0.0.0', () => console.log('HopeSpot on port '+PORT));

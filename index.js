const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'tracker.json');
const PASSWORD = process.env.AUTH_PASSWORD || '';

if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// Simple session store (in-memory, resets on redeploy — fine for single-user)
const sessions = new Set();

const SEED_FIRMS = [
  { id: 1,  tier: 1, name: 'Bespoke Partners', why: 'Top PE-backed SaaS exec search. Places COO/President roles. 700K exec network. Exact profile match.', contact: 'bespokepartners.com - submit via site, then find a practice partner on LinkedIn', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/bespoke-partners/', website: 'https://bespokepartners.com', last_contacted: null, followup_date: null },
  { id: 2,  tier: 1, name: 'Talentfoot', why: 'SaaS-only exec search. PE-backed sweet spot. Atlanta reach. Strong COO/ops practice.', contact: 'talentfoot.com - candidate submission form. Chicago HQ, national.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/talentfoot/', website: 'https://talentfoot.com', last_contacted: null, followup_date: null },
  { id: 3,  tier: 1, name: 'Cowen Partners', why: 'Forbes Top 100. PE-backed COO specialists. Deep ops practice. Atlanta listed. Fast time-to-fill.', contact: 'cowenpartners.com - direct candidate outreach. Find ops practice partner on LinkedIn.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/cowen-partners/', website: 'https://cowenpartners.com', last_contacted: null, followup_date: null },
  { id: 4,  tier: 1, name: 'BSG (Boston Search Group)', why: 'Mid-market PE. Builder-leader profile match. SaaS and healthcare tech verticals.', contact: 'bostonsearchgroup.com - reach out to partners directly via LinkedIn.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/boston-search-group/', website: 'https://bostonsearchgroup.com', last_contacted: null, followup_date: null },
  { id: 5,  tier: 1, name: 'Bloom Recruiting (Callie Vandegrift)', why: 'Warm relationship. Already placed you in a process. Has resume and full context.', contact: 'Callie Vandegrift - direct. Already in your network.', status: 'not contacted', notes: '', linkedin: '', website: '', last_contacted: null, followup_date: null },
  { id: 6,  tier: 2, name: 'True Search', why: 'PE/VC tech companies. Transparent process. Strong Series B/C COO practice.', contact: 'truesearch.com - candidate submission via site.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/true-search/', website: 'https://truesearch.com', last_contacted: null, followup_date: null },
  { id: 7,  tier: 2, name: 'Heidrick and Struggles', why: 'National. COO practice. Good for high-profile PE-backed ops roles at scale.', contact: 'heidrick.com - candidate registration via site.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/heidrick-struggles/', website: 'https://heidrick.com', last_contacted: null, followup_date: null },
  { id: 8,  tier: 2, name: 'Korn Ferry', why: 'Large national firm. COO/SVP Ops practice. Best for Series C/D and PE-owned companies.', contact: 'kornferry.com - candidate portal on site.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/korn-ferry/', website: 'https://kornferry.com', last_contacted: null, followup_date: null },
  { id: 9,  tier: 2, name: 'TGC Search', why: 'Placed COOs for IPO-prep SaaS. Experience in scaling scenarios like ChartRequest.', contact: 'tgcsearch.com - reach out to partners directly via LinkedIn.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/tgc-search/', website: 'https://tgcsearch.com', last_contacted: null, followup_date: null },
  { id: 10, tier: 2, name: 'Charles Aris', why: 'NC-based, national reach. Consistent COO placements in Southeast growth companies.', contact: 'charlesaris.com - candidate submission form on site.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/charles-aris/', website: 'https://charlesaris.com', last_contacted: null, followup_date: null },
  { id: 11, tier: 3, name: 'ReadySetExec', why: 'Atlanta-based. SaaS/COO local focus. Strong regional relationships.', contact: 'readysetexec.com - Atlanta-based, reach out via site.', status: 'not contacted', notes: '', linkedin: '', website: 'https://readysetexec.com', last_contacted: null, followup_date: null },
  { id: 12, tier: 3, name: 'Klein Hersh', why: 'Healthcare tech and digital health SaaS. ChartRequest background is a specific credential here.', contact: 'kleinhersh.com - candidate submission via site.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/klein-hersh/', website: 'https://kleinhersh.com', last_contacted: null, followup_date: null },
  { id: 13, tier: 3, name: 'Diversified Search Group', why: 'Mission-driven lens opens nonprofit and civic-adjacent operating roles.', contact: 'diversifiedsearchgroup.com - candidate registration on site.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/diversified-search/', website: 'https://diversifiedsearchgroup.com', last_contacted: null, followup_date: null },
];

function loadDB() {
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(SEED_FIRMS, null, 2));
  const firms = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  // Migrate existing records to include new fields
  return firms.map(f => ({
    last_contacted: null,
    followup_date: null,
    ...f
  }));
}

function saveDB(firms) {
  fs.writeFileSync(DB_PATH, JSON.stringify(firms, null, 2));
}

// Auth middleware
function requireAuth(req, res, next) {
  if (!PASSWORD) return next(); // No password set, open access
  const token = req.headers['x-auth-token'] || req.query.token;
  if (sessions.has(token)) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

app.use(express.json());

// Auth endpoints (unprotected)
app.post('/api/login', (req, res) => {
  if (!PASSWORD) return res.json({ ok: true, token: 'no-auth' });
  if (req.body.password === PASSWORD) {
    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessions.add(token);
    res.json({ ok: true, token });
  } else {
    res.status(401).json({ error: 'Wrong password' });
  }
});

app.get('/api/auth-required', (req, res) => {
  res.json({ required: !!PASSWORD });
});

// Protected routes
app.get('/api/firms', requireAuth, (req, res) => res.json(loadDB()));

app.patch('/api/firms/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const firms = loadDB();
  const idx = firms.findIndex(f => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const allowed = ['status', 'notes', 'followup_date'];
  allowed.forEach(k => { if (req.body[k] !== undefined) firms[idx][k] = req.body[k]; });
  // Auto-stamp last_contacted when status moves away from not contacted
  if (req.body.status && req.body.status !== 'not contacted') {
    firms[idx].last_contacted = new Date().toISOString().split('T')[0];
  }
  saveDB(firms);
  res.json(firms[idx]);
});

app.post('/api/firms', requireAuth, (req, res) => {
  const firms = loadDB();
  const next = {
    id: Math.max(...firms.map(f => f.id)) + 1,
    tier: req.body.tier || 3,
    name: req.body.name || 'New Firm',
    why: req.body.why || '',
    contact: req.body.contact || '',
    status: 'not contacted',
    notes: '',
    linkedin: req.body.linkedin || '',
    website: req.body.website || '',
    last_contacted: null,
    followup_date: null
  };
  firms.push(next);
  saveDB(firms);
  res.status(201).json(next);
});

// CSV export
app.get('/api/export.csv', requireAuth, (req, res) => {
  const firms = loadDB();
  const headers = ['id', 'tier', 'name', 'status', 'last_contacted', 'followup_date', 'why', 'contact', 'website', 'linkedin', 'notes'];
  const escape = v => '"' + String(v || '').replace(/"/g, '""') + '"';
  const rows = firms.map(f => headers.map(h => escape(f[h])).join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="recruiter-tracker.csv"');
  res.send([headers.join(','), ...rows].join('\n'));
});

// CSV import (appends or updates by name match)
app.post('/api/import', requireAuth, (req, res) => {
  const rows = req.body.rows; // array of objects
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be array' });
  const firms = loadDB();
  let added = 0, updated = 0;
  rows.forEach(row => {
    const existing = firms.find(f => f.name.toLowerCase() === (row.name || '').toLowerCase());
    if (existing) {
      ['tier', 'why', 'contact', 'website', 'linkedin', 'notes', 'status', 'followup_date'].forEach(k => {
        if (row[k] !== undefined && row[k] !== '') existing[k] = row[k];
      });
      updated++;
    } else {
      firms.push({
        id: Math.max(...firms.map(f => f.id)) + 1,
        tier: parseInt(row.tier) || 3,
        name: row.name || 'Unnamed',
        why: row.why || '',
        contact: row.contact || '',
        status: row.status || 'not contacted',
        notes: row.notes || '',
        linkedin: row.linkedin || '',
        website: row.website || '',
        last_contacted: row.last_contacted || null,
        followup_date: row.followup_date || null
      });
      added++;
    }
  });
  saveDB(firms);
  res.json({ ok: true, added, updated });
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => console.log('Recruiter tracker running on :' + PORT));

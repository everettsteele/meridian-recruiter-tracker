const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'tracker.json');

if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

const SEED_FIRMS = [
  { id: 1,  tier: 1, name: 'Bespoke Partners', why: 'Top PE-backed SaaS exec search. Places COO/President roles. 700K exec network. Exact profile match.', contact: 'bespokepartners.com - submit via site, then find a practice partner on LinkedIn', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/bespoke-partners/', website: 'https://bespokepartners.com' },
  { id: 2,  tier: 1, name: 'Talentfoot', why: 'SaaS-only exec search. PE-backed sweet spot. Atlanta reach. Strong COO/ops practice.', contact: 'talentfoot.com - candidate submission form. Chicago HQ, national.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/talentfoot/', website: 'https://talentfoot.com' },
  { id: 3,  tier: 1, name: 'Cowen Partners', why: 'Forbes Top 100. PE-backed COO specialists. Deep ops practice. Atlanta listed. Fast time-to-fill.', contact: 'cowenpartners.com - direct candidate outreach. Find ops practice partner on LinkedIn.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/cowen-partners/', website: 'https://cowenpartners.com' },
  { id: 4,  tier: 1, name: 'BSG (Boston Search Group)', why: 'Mid-market PE. Builder-leader profile match. SaaS and healthcare tech verticals.', contact: 'bostonsearchgroup.com - reach out to partners directly via LinkedIn.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/boston-search-group/', website: 'https://bostonsearchgroup.com' },
  { id: 5,  tier: 1, name: 'Bloom Recruiting (Callie Vandegrift)', why: 'Warm relationship. Already placed you in a process. Has resume and full context.', contact: 'Callie Vandegrift - direct. Already in your network.', status: 'not contacted', notes: '', linkedin: '', website: '' },
  { id: 6,  tier: 2, name: 'True Search', why: 'PE/VC tech companies. Transparent process. Strong Series B/C COO practice.', contact: 'truesearch.com - candidate submission via site.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/true-search/', website: 'https://truesearch.com' },
  { id: 7,  tier: 2, name: 'Heidrick and Struggles', why: 'National. COO practice. Good for high-profile PE-backed ops roles at scale.', contact: 'heidrick.com - candidate registration via site.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/heidrick-struggles/', website: 'https://heidrick.com' },
  { id: 8,  tier: 2, name: 'Korn Ferry', why: 'Large national firm. COO/SVP Ops practice. Best for Series C/D and PE-owned companies.', contact: 'kornferry.com - candidate portal on site.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/korn-ferry/', website: 'https://kornferry.com' },
  { id: 9,  tier: 2, name: 'TGC Search', why: 'Placed COOs for IPO-prep SaaS. Experience in scaling scenarios like ChartRequest.', contact: 'tgcsearch.com - reach out to partners directly via LinkedIn.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/tgc-search/', website: 'https://tgcsearch.com' },
  { id: 10, tier: 2, name: 'Charles Aris', why: 'NC-based, national reach. Consistent COO placements in Southeast growth companies.', contact: 'charlesaris.com - candidate submission form on site.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/charles-aris/', website: 'https://charlesaris.com' },
  { id: 11, tier: 3, name: 'ReadySetExec', why: 'Atlanta-based. SaaS/COO local focus. Strong regional relationships.', contact: 'readysetexec.com - Atlanta-based, reach out via site.', status: 'not contacted', notes: '', linkedin: '', website: 'https://readysetexec.com' },
  { id: 12, tier: 3, name: 'Klein Hersh', why: 'Healthcare tech and digital health SaaS. ChartRequest background is a specific credential here.', contact: 'kleinhersh.com - candidate submission via site.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/klein-hersh/', website: 'https://kleinhersh.com' },
  { id: 13, tier: 3, name: 'Diversified Search Group', why: 'Mission-driven lens opens nonprofit and civic-adjacent operating roles.', contact: 'diversifiedsearchgroup.com - candidate registration on site.', status: 'not contacted', notes: '', linkedin: 'https://www.linkedin.com/company/diversified-search/', website: 'https://diversifiedsearchgroup.com' },
];

function loadDB() {
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(SEED_FIRMS, null, 2));
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveDB(firms) {
  fs.writeFileSync(DB_PATH, JSON.stringify(firms, null, 2));
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/firms', (req, res) => res.json(loadDB()));

app.patch('/api/firms/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const firms = loadDB();
  const idx = firms.findIndex(f => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  ['status', 'notes'].forEach(k => { if (req.body[k] !== undefined) firms[idx][k] = req.body[k]; });
  saveDB(firms);
  res.json(firms[idx]);
});

app.post('/api/firms', (req, res) => {
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
    website: req.body.website || ''
  };
  firms.push(next);
  saveDB(firms);
  res.status(201).json(next);
});

app.listen(PORT, () => console.log('Recruiter tracker running on :' + PORT));

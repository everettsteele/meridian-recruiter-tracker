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

const sessions = new Set();

// STATUS KEY:
// 'contacted'      = email confirmed sent
// 'not contacted'  = draft created or not yet reached out
// 'in conversation' = response received, active dialogue
// 'passed'         = dead end, wrong contact, bounced with no replacement

const SEED_FIRMS = [

  // ---- TIER 1: PRIORITY ----

  {
    id: 1, tier: 1, name: 'Bespoke Partners',
    why: 'Top PE-backed SaaS exec search. Places COO/President roles. Dedicated healthcare software practice.',
    status: 'contacted', last_contacted: '2026-03-26', followup_date: '2026-04-02',
    notes: '', linkedin: 'https://www.linkedin.com/company/bespoke-partners/', website: 'https://bespokepartners.com',
    contacts: [
      { id: 1, name: 'Katherine Baker', title: 'Partner, CEO & P&L Practice', email: 'katherine.baker@bespokepartners.com', linkedin: 'https://www.linkedin.com/in/katherinebaker14/', last_contacted: '2026-03-26', status: 'emailed', notes: 'Email sent 3/26. LinkedIn connection sent.' }
    ]
  },

  {
    id: 2, tier: 1, name: 'Talentfoot',
    why: 'SaaS-only exec search. PE-backed sweet spot. Atlanta reach. Strong COO/ops practice.',
    status: 'in conversation', last_contacted: '2026-03-26', followup_date: null,
    notes: 'Camille responded same day. Connected to colleagues. Flagged President role for March. Replied highlighting marketing ownership at ChartRequest.',
    linkedin: 'https://www.linkedin.com/company/talentfoot/', website: 'https://talentfoot.com',
    contacts: [
      { id: 1, name: 'Camille Fetter', title: 'Founder & CEO', email: 'cfetter@talentfoot.com', linkedin: 'https://www.linkedin.com/in/digitalmarketingrecruiter1/', last_contacted: '2026-03-26', status: 'in conversation', notes: 'Responded same day. Active.' }
    ]
  },

  {
    id: 3, tier: 1, name: 'Cowen Partners',
    why: 'Forbes Top 100. PE-backed COO specialists. Deep ops practice.',
    status: 'contacted', last_contacted: '2026-03-26', followup_date: '2026-04-02',
    notes: '', linkedin: 'https://www.linkedin.com/company/cowen-partners/', website: 'https://cowenpartners.com',
    contacts: [
      { id: 1, name: 'Shawn Cole', title: 'President & Founding Partner', email: 'shawn@cowenpartners.com', linkedin: 'https://www.linkedin.com/in/coleshawn', last_contacted: '2026-03-26', status: 'emailed', notes: 'Email sent 3/26. LinkedIn connection sent.' }
    ]
  },

  {
    id: 4, tier: 1, name: 'BSG (Boston Search Group)',
    why: 'Mid-market PE. Builder-leader profile match. SaaS and healthcare tech verticals.',
    status: 'contacted', last_contacted: '2026-03-26', followup_date: '2026-04-02',
    notes: '', linkedin: 'https://www.linkedin.com/company/bsg-team-ventures/', website: 'https://bostonsearchgroup.com',
    contacts: [
      { id: 1, name: 'Clark Waterfall', title: 'Founder & Managing Director', email: 'cwaterfall@bostonsearchgroup.com', linkedin: 'https://www.linkedin.com/in/clarkwaterfall', last_contacted: '2026-03-26', status: 'emailed', notes: 'Email sent 3/26. LinkedIn connection sent.' }
    ]
  },

  {
    id: 5, tier: 1, name: 'Bloom Recruiting',
    why: 'Warm relationship. Callie has full context and is actively working the pipeline.',
    status: 'in conversation', last_contacted: '2026-03-26', followup_date: null,
    notes: 'Active conversation. Has resume and full context. Flagged President role for March.',
    linkedin: '', website: '',
    contacts: [
      { id: 1, name: 'Callie Vandegrift', title: 'Recruiter', email: '', linkedin: '', last_contacted: '2026-03-26', status: 'in conversation', notes: 'Active. Has resume and full context.' }
    ]
  },

  {
    id: 6, tier: 1, name: 'JM Search',
    why: 'Andrew Henry leads Healthcare & Life Sciences. 20+ years PE-backed healthcare tech COO placements. Hunt Scanlon Top 50.',
    status: 'not contacted', last_contacted: null, followup_date: null,
    notes: 'Draft created 3/26 — not yet sent. Attach resume before sending. Also: Pam Zients and Kristy Lindquist if Andrew does not respond.',
    linkedin: 'https://www.linkedin.com/company/jm-search/', website: 'https://jmsearch.com',
    contacts: [
      { id: 1, name: 'Andrew Henry', title: 'Managing Partner, Healthcare & Life Sciences', email: 'ahenry@jmsearch.com', linkedin: 'https://www.linkedin.com/in/andrew-henry-7179964/', last_contacted: null, status: 'not contacted', notes: 'Draft ready. Email not yet sent.' }
    ]
  },

  {
    id: 7, tier: 1, name: 'Daversa Partners',
    why: 'Will Sheridan focuses on CEO/President/COO at growth-stage VC-backed SaaS. Forbes #145.',
    status: 'not contacted', last_contacted: null, followup_date: null,
    notes: 'Draft created 3/26 — not yet sent. Email format: first@daversa.com.',
    linkedin: 'https://www.linkedin.com/company/daversa-partners/', website: 'https://daversa.com',
    contacts: [
      { id: 1, name: 'Will Sheridan', title: 'Director, Orlando Office', email: 'will@daversa.com', linkedin: 'https://daversa.com/team', last_contacted: null, status: 'not contacted', notes: 'Draft ready. Email not yet sent.' }
    ]
  },

  {
    id: 8, tier: 1, name: 'Acertitude',
    why: 'Rick DeRose leads Technology & Healthcare. PE portfolio C-suite specialist. 200+ placements for Platinum Equity. Forbes #139.',
    status: 'not contacted', last_contacted: null, followup_date: null,
    notes: 'Draft created 3/26 — not yet sent. Email format: FLast@acertitude.com. PE Power 75 firm.',
    linkedin: 'https://www.linkedin.com/company/acertitude/', website: 'https://acertitude.com',
    contacts: [
      { id: 1, name: 'Rick DeRose', title: 'Co-Founder & Managing Partner, Technology & Healthcare', email: 'rderose@acertitude.com', linkedin: 'https://www.linkedin.com/in/deroserick/', last_contacted: null, status: 'not contacted', notes: 'Draft ready. Email not yet sent.' }
    ]
  },

  {
    id: 9, tier: 1, name: 'ON Partners',
    why: 'Seth Harris is the dedicated SaaS practice partner. Forbes #34. Partner-led. Explicit VC/PE SaaS COO work.',
    status: 'not contacted', last_contacted: null, followup_date: null,
    notes: 'Draft created 3/26 — not yet sent. Email format: FLast@onpartners.com.',
    linkedin: 'https://www.linkedin.com/company/on-search-partners/', website: 'https://onpartners.com',
    contacts: [
      { id: 1, name: 'Seth Harris', title: 'Partner, SaaS & Technology', email: 'sharris@onpartners.com', linkedin: 'https://www.linkedin.com/in/sethoharris/', last_contacted: null, status: 'not contacted', notes: 'Draft ready. Email not yet sent.' }
    ]
  },

  {
    id: 10, tier: 1, name: 'CarterBaldwin Executive Search',
    why: 'Atlanta HQ (Roswell). Jennifer Sobocinski leads Technology practice. PE-backed C-suite COO placements. Hunt Scanlon Top 50. Local home-field advantage.',
    status: 'not contacted', last_contacted: null, followup_date: null,
    notes: 'Draft created 3/26 — not yet sent. Email format: FLast@carterbaldwin.com. Roswell GA, Mansell Road office.',
    linkedin: 'https://www.linkedin.com/company/carterbaldwin/', website: 'https://carterbaldwin.com',
    contacts: [
      { id: 1, name: 'Jennifer Sobocinski', title: 'Founding Partner, Technology Practice', email: 'jsobocinski@carterbaldwin.com', linkedin: '', last_contacted: null, status: 'not contacted', notes: 'Draft ready. Email not yet sent. Leads technology practice.' }
    ]
  },

  {
    id: 11, tier: 1, name: 'Crist|Kolder Associates',
    why: 'Scott Simmons explicitly leads COO and operating officer searches. CEO/CFO/COO/Board only firm. No off-limits conflicts. PE portfolio work.',
    status: 'not contacted', last_contacted: null, followup_date: null,
    notes: 'Draft created 3/26 — not yet sent. Email format: FLast@cristkolder.com.',
    linkedin: 'https://www.linkedin.com/company/crist-kolder-associates/', website: 'https://cristkolder.com',
    contacts: [
      { id: 1, name: 'Scott Simmons', title: 'Co-Managing Partner', email: 'ssimmons@cristkolder.com', linkedin: 'https://www.linkedin.com/in/scott-w-simmons-b1b9942/', last_contacted: null, status: 'not contacted', notes: 'Draft ready. Email not yet sent.' }
    ]
  },

  // ---- TIER 2: SECONDARY ----

  {
    id: 12, tier: 2, name: 'True Search',
    why: 'PE/VC tech companies. Strong Series B/C COO practice.',
    status: 'contacted', last_contacted: '2026-03-26', followup_date: '2026-04-02',
    notes: '', linkedin: 'https://www.linkedin.com/company/true-search/', website: 'https://trueplatform.com',
    contacts: [
      { id: 1, name: 'Steve Tutelman', title: 'Managing Director, PE Practice', email: 'steve.tutelman@truesearch.com', linkedin: 'https://www.linkedin.com/in/stevetutelman/', last_contacted: '2026-03-26', status: 'emailed', notes: 'Email sent 3/26.' },
      { id: 2, name: 'Nora Sutherland', title: 'Partner, Technology Practice', email: 'nora.sutherland@trueplatform.com', linkedin: 'https://www.linkedin.com/in/nsutherlanddsg/', last_contacted: '2026-03-26', status: 'emailed', notes: 'Formerly at DSG. Email sent to True Search address 3/26.' }
    ]
  },

  {
    id: 13, tier: 2, name: 'Korn Ferry',
    why: 'Large national firm. COO/SVP Ops practice. Best for Series C/D and PE-owned companies.',
    status: 'contacted', last_contacted: '2026-03-26', followup_date: '2026-04-02',
    notes: 'LinkedIn connection pending — out of free connects this month.',
    linkedin: 'https://www.linkedin.com/company/kornferry/', website: 'https://kornferry.com',
    contacts: [
      { id: 1, name: 'Doug Greenberg', title: 'Senior Partner, Healthcare Technology', email: 'doug.greenberg@kornferry.com', linkedin: 'https://www.linkedin.com/in/doug-greenberg-6593a41/', last_contacted: '2026-03-26', status: 'emailed', notes: 'Email sent 3/26.' }
    ]
  },

  {
    id: 14, tier: 2, name: 'Charles Aris',
    why: 'NC-based, national reach. Consistent COO placements in Southeast growth companies.',
    status: 'contacted', last_contacted: '2026-03-26', followup_date: '2026-04-02',
    notes: '', linkedin: 'https://www.linkedin.com/company/charles-aris-inc-/', website: 'https://charlesaris.com',
    contacts: [
      { id: 1, name: 'Kevin Stemke', title: 'Practice Leader', email: 'kevin.stemke@charlesaris.com', linkedin: 'https://www.linkedin.com/in/kevinstemke/', last_contacted: '2026-03-26', status: 'emailed', notes: 'Email sent 3/26. LinkedIn connection sent.' }
    ]
  },

  {
    id: 15, tier: 2, name: 'StevenDouglas',
    why: 'Drew Zachmann leads Operations & COO search from Atlanta. PE-backed portfolio COO placements.',
    status: 'not contacted', last_contacted: null, followup_date: null,
    notes: 'Draft created 3/26 — not yet sent. Atlanta-based. Also: Matthew Beck (national Ops practice leader).',
    linkedin: '', website: 'https://stevendouglas.com',
    contacts: [
      { id: 1, name: 'Drew Zachmann', title: 'Director, Operations & Supply Chain Executive Search', email: 'dzachmann@stevendouglas.com', linkedin: 'https://stevendouglas.com/who-we-are/team/drew-zachmann/', last_contacted: null, status: 'not contacted', notes: 'Draft ready. Email not yet sent.' }
    ]
  },

  {
    id: 16, tier: 2, name: 'Slayton Search Partners',
    why: 'Forbes #38. PE-backed portfolio COO/CFO/C-suite focus. Rick Slayton leads.',
    status: 'not contacted', last_contacted: null, followup_date: null,
    notes: 'Draft created 3/26 — not yet sent. Acquired by The Judge Group 2022, operates independently. Email format: FLast@slaytonsearch.com.',
    linkedin: 'https://www.linkedin.com/company/slayton-search-partners/', website: 'https://slaytonsearch.com',
    contacts: [
      { id: 1, name: 'Rick Slayton', title: 'Managing Partner & CEO', email: 'rslayton@slaytonsearch.com', linkedin: 'https://www.linkedin.com/in/rickslayton/', last_contacted: null, status: 'not contacted', notes: 'Draft ready. Email not yet sent.' }
    ]
  },

  {
    id: 17, tier: 2, name: 'Nexus Search Partners',
    why: 'Thadd Jones — Amazon AWS / Fortune 50 background. Charlotte. PE-backed COO/President placements. Fast-growing.',
    status: 'not contacted', last_contacted: null, followup_date: null,
    notes: 'Draft created 3/26 — not yet sent. Founded 2023. Also: info@nexussearchpartners.com.',
    linkedin: '', website: 'https://nexussearchpartners.com',
    contacts: [
      { id: 1, name: 'Thaddeus Jones', title: 'Founder & Managing Partner', email: 'tjones@nexussearchpartners.com', linkedin: '', last_contacted: null, status: 'not contacted', notes: 'Draft ready. Email not yet sent.' }
    ]
  },

  // ---- TIER 3: OPPORTUNISTIC ----

  {
    id: 18, tier: 3, name: 'Riviera Partners',
    why: 'Ryan Brogan joined PE practice Sept 2025. Primarily tech/engineering but PE practice does operating leader work.',
    status: 'not contacted', last_contacted: null, followup_date: null,
    notes: 'Draft created 3/26 — not yet sent. Lower probability; primarily CTO/CPO/VP Eng. Email format: FLast@rivierapartners.com.',
    linkedin: 'https://www.linkedin.com/company/riviera-partners/', website: 'https://rivierapartners.com',
    contacts: [
      { id: 1, name: 'Ryan Brogan', title: 'Client Partner, Private Equity Practice', email: 'rbrogan@rivierapartners.com', linkedin: 'https://www.linkedin.com/in/ryanbrogan/', last_contacted: null, status: 'not contacted', notes: 'Draft ready. Email not yet sent. Joined Riviera PE practice Sept 2025.' }
    ]
  },

  {
    id: 19, tier: 3, name: 'ReadySetExec',
    why: 'Founder-led boutique. Operations and SaaS focus.',
    status: 'contacted', last_contacted: '2026-03-26', followup_date: '2026-04-02',
    notes: 'patrick@ and patrick.shea@ both bounced. Correct address confirmed pshea@readysetexec.com. Resent 3/26.',
    linkedin: '', website: 'https://readysetexec.com',
    contacts: [
      { id: 1, name: 'Patrick Shea', title: 'Co-Founder & Managing Partner', email: 'pshea@readysetexec.com', linkedin: 'https://www.linkedin.com/in/patrick-jm-shea/', last_contacted: '2026-03-26', status: 'emailed', notes: 'Two prior bounces resolved. Email sent to correct address 3/26.' }
    ]
  },

  {
    id: 20, tier: 3, name: 'Klein Hersh',
    why: 'Healthcare tech and digital health SaaS. ChartRequest background is a direct credential.',
    status: 'contacted', last_contacted: '2026-03-26', followup_date: '2026-04-02',
    notes: 'jesse@kleinhersh.com bounced. Correct address jklein@kleinhersh.com. Resent 3/26.',
    linkedin: 'https://www.linkedin.com/company/klein-hersh/', website: 'https://kleinhersh.com',
    contacts: [
      { id: 1, name: 'Jesse Klein', title: 'Managing Director & COO', email: 'jklein@kleinhersh.com', linkedin: 'https://www.linkedin.com/in/kleinjesse/', last_contacted: '2026-03-26', status: 'emailed', notes: 'Bounce resolved. Email sent to correct address 3/26.' }
    ]
  },

  {
    id: 21, tier: 3, name: 'TGC Search',
    why: 'Placed COOs for IPO-prep SaaS.',
    status: 'contacted', last_contacted: '2026-03-26', followup_date: '2026-04-02',
    notes: 'No named partner found. Sent to general inbox. Follow up: find a named contact.',
    linkedin: 'https://www.linkedin.com/company/tgc-search/', website: 'https://tgcsearch.com',
    contacts: [
      { id: 1, name: 'General Inbox', title: '', email: 'info@tgcsearch.com', linkedin: '', last_contacted: '2026-03-26', status: 'emailed', notes: 'Email sent to general inbox 3/26. Find a named contact for follow-up.' }
    ]
  },

  {
    id: 22, tier: 3, name: 'Heidrick and Struggles',
    why: 'National. COO practice.',
    status: 'passed', last_contacted: '2026-03-26', followup_date: null,
    notes: 'Emailed Doug Greenberg at Heidrick but he is at Korn Ferry. Dead end unless a new contact is identified.',
    linkedin: 'https://www.linkedin.com/company/heidrick-struggles/', website: 'https://heidrick.com',
    contacts: [
      { id: 1, name: 'Doug Greenberg', title: 'Confirmed at Korn Ferry, not Heidrick', email: 'doug.greenberg@heidrick.com', linkedin: 'https://www.linkedin.com/in/doug-greenberg-6593a41/', last_contacted: '2026-03-26', status: 'dead end', notes: 'Wrong firm. Doug is at Korn Ferry. See Korn Ferry entry.' }
    ]
  },

  {
    id: 23, tier: 3, name: 'Diversified Search Group',
    why: 'PE-backed tech practice.',
    status: 'passed', last_contacted: '2026-03-26', followup_date: null,
    notes: 'Nora Sutherland moved to True Search. DSG address bounced. Dead end.',
    linkedin: 'https://www.linkedin.com/company/diversifiedsearchgroup/', website: 'https://diversifiedsearchgroup.com',
    contacts: [
      { id: 1, name: 'Nora Sutherland', title: 'Moved to True Search', email: 'nora.sutherland@divsearch.com', linkedin: 'https://www.linkedin.com/in/nsutherlanddsg/', last_contacted: '2026-03-26', status: 'dead end', notes: 'Bounced. Now at True Search. See True Search entry.' }
    ]
  },

  // ---- TIER 4: HEALTH TECH SPECIALISTS ----

  {
    id: 24, tier: 4, name: 'Direct Recruiters Inc. (DRI)',
    why: 'Dedicated digital health and healthcare IT executive search. Placed COOs and C-suite at health SaaS. ChartRequest background directly relevant.',
    status: 'not contacted', last_contacted: null, followup_date: null,
    notes: 'Two targets. Norman Volsky hosts the Digital Health Heavyweights Podcast — warm angle. Mike Silverstein leads HCIT practice.',
    linkedin: 'https://www.linkedin.com/company/direct-recruiters-inc/', website: 'https://directrecruiters.com',
    contacts: [
      { id: 1, name: 'Norman Volsky', title: 'Managing Partner, Digital Health Practice', email: 'nvolsky@directrecruiters.com', linkedin: 'https://www.linkedin.com/in/normanvolsky/', last_contacted: null, status: 'not contacted', notes: 'Digital Health Heavyweights Podcast host. Deep digital health SaaS network. Primary target.' },
      { id: 2, name: 'Mike Silverstein', title: 'Managing Partner, Healthcare IT Practice', email: 'msilverstein@directrecruiters.com', linkedin: 'https://www.linkedin.com/in/mikesilverstein1/', last_contacted: null, status: 'not contacted', notes: 'Leads HCIT practice. PE and VC portfolio company specialist. Pinnacle Society member.' }
    ]
  },

  {
    id: 25, tier: 4, name: 'Storm3',
    why: 'Leading US HealthTech-specialist recruiter. Finance & Operations practice explicitly places COOs. Exact vertical fit.',
    status: 'not contacted', last_contacted: null, followup_date: null,
    notes: 'Draft created 3/26 — not yet sent. NYC World Trade Center office. Email format: first.last@storm3.com.',
    linkedin: 'https://www.linkedin.com/company/storm3/', website: 'https://storm3.com',
    contacts: [
      { id: 1, name: 'Perrin Joel', title: 'Commercial Manager, US', email: 'perrin.joel@storm3.com', linkedin: '', last_contacted: null, status: 'not contacted', notes: 'Draft ready. Email not yet sent.' }
    ]
  }

];

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(SEED_FIRMS, null, 2));
    return SEED_FIRMS;
  }
  const firms = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  return firms.map(f => ({ last_contacted: null, followup_date: null, contacts: [], ...f }));
}
function saveDB(firms) { fs.writeFileSync(DB_PATH, JSON.stringify(firms, null, 2)); }

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
app.get('/api/firms', requireAuth, (req, res) => res.json(loadDB()));

app.patch('/api/firms/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const firms = loadDB();
  const idx = firms.findIndex(f => f.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  ['status', 'notes', 'followup_date'].forEach(k => { if (req.body[k] !== undefined) firms[idx][k] = req.body[k]; });
  if (req.body.status && req.body.status !== 'not contacted') firms[idx].last_contacted = new Date().toISOString().split('T')[0];
  saveDB(firms); res.json(firms[idx]);
});

app.post('/api/firms', requireAuth, (req, res) => {
  const firms = loadDB();
  const next = { id: Math.max(0, ...firms.map(f => f.id)) + 1, tier: req.body.tier || 3, name: req.body.name || 'New Firm', why: req.body.why || '', status: 'not contacted', notes: '', linkedin: req.body.linkedin || '', website: req.body.website || '', last_contacted: null, followup_date: null, contacts: [] };
  firms.push(next); saveDB(firms); res.status(201).json(next);
});

app.post('/api/firms/:id/contacts', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  const firms = loadDB();
  const firm = firms.find(f => f.id === id);
  if (!firm) return res.status(404).json({ error: 'Firm not found' });
  const contacts = firm.contacts || [];
  const contact = { id: Math.max(0, ...contacts.map(c => c.id)) + 1, name: req.body.name || '', title: req.body.title || '', email: req.body.email || '', linkedin: req.body.linkedin || '', last_contacted: req.body.last_contacted || null, status: req.body.status || 'not contacted', notes: req.body.notes || '' };
  firm.contacts = [...contacts, contact]; saveDB(firms); res.status(201).json(contact);
});

app.patch('/api/firms/:id/contacts/:cid', requireAuth, (req, res) => {
  const id = parseInt(req.params.id), cid = parseInt(req.params.cid);
  const firms = loadDB();
  const firm = firms.find(f => f.id === id);
  if (!firm) return res.status(404).json({ error: 'Firm not found' });
  const contact = (firm.contacts || []).find(c => c.id === cid);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  ['name', 'title', 'email', 'linkedin', 'last_contacted', 'status', 'notes'].forEach(k => { if (req.body[k] !== undefined) contact[k] = req.body[k]; });
  saveDB(firms); res.json(contact);
});

app.delete('/api/firms/:id/contacts/:cid', requireAuth, (req, res) => {
  const id = parseInt(req.params.id), cid = parseInt(req.params.cid);
  const firms = loadDB();
  const firm = firms.find(f => f.id === id);
  if (!firm) return res.status(404).json({ error: 'Firm not found' });
  firm.contacts = (firm.contacts || []).filter(c => c.id !== cid);
  saveDB(firms); res.json({ ok: true });
});

app.get('/api/export.csv', requireAuth, (req, res) => {
  const firms = loadDB();
  const headers = ['id', 'tier', 'name', 'status', 'last_contacted', 'followup_date', 'why', 'website', 'linkedin', 'notes', 'contacts_count'];
  const escape = v => '"' + String(v || '').replace(/"/g, '""') + '"';
  const rows = firms.map(f => [...headers.slice(0,-1).map(h => escape(f[h])), escape((f.contacts||[]).length)].join(','));
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="recruiter-tracker.csv"');
  res.send([headers.join(','), ...rows].join('\n'));
});

app.post('/api/import', requireAuth, (req, res) => {
  const rows = req.body.rows;
  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be array' });
  const firms = loadDB();
  let added = 0, updated = 0;
  rows.forEach(row => {
    const existing = firms.find(f => f.name.toLowerCase() === (row.name || '').toLowerCase());
    if (existing) {
      ['tier', 'why', 'website', 'linkedin', 'notes', 'status', 'followup_date'].forEach(k => { if (row[k] !== undefined && row[k] !== '') existing[k] = row[k]; });
      updated++;
    } else {
      firms.push({ id: Math.max(0, ...firms.map(f => f.id)) + 1, tier: parseInt(row.tier) || 3, name: row.name || 'Unnamed', why: row.why || '', status: row.status || 'not contacted', notes: row.notes || '', linkedin: row.linkedin || '', website: row.website || '', last_contacted: row.last_contacted || null, followup_date: row.followup_date || null, contacts: [] });
      added++;
    }
  });
  saveDB(firms); res.json({ ok: true, added, updated });
});

app.use(express.static(path.join(__dirname, 'public')));
app.listen(PORT, () => console.log('HopeSpot running on :' + PORT));

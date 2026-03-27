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
// contacted      = email confirmed sent and delivered
// not contacted  = not yet reached out (or email bounced with no replacement sent)
// in conversation = response received, active dialogue
// passed         = dead end / wrong contact / bounced with no replacement found

const SEED_FIRMS = [

  // ============================================================
  // TIER 1: PRIORITY — Direct functional/industry/stage match
  // ============================================================

  {
    id: 1, tier: 1, name: 'Bespoke Partners',
    why: 'Top PE-backed SaaS exec search. Places COO/President roles. Dedicated healthcare software practice.',
    status: 'contacted', last_contacted: '2026-03-26', followup_date: '2026-04-02',
    notes: 'LinkedIn connection sent 3/26.',
    linkedin: 'https://www.linkedin.com/company/bespoke-partners/', website: 'https://bespokepartners.com',
    contacts: [
      { id: 1, name: 'Katherine Baker', title: 'Partner, CEO & P&L Practice', email: 'katherine.baker@bespokepartners.com', linkedin: 'https://www.linkedin.com/in/katherinebaker14/', last_contacted: '2026-03-26', status: 'emailed', notes: 'Email sent 3/26. LinkedIn connection sent 3/26.' }
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
    notes: 'LinkedIn connection sent 3/26.',
    linkedin: 'https://www.linkedin.com/company/cowen-partners/', website: 'https://cowenpartners.com',
    contacts: [
      { id: 1, name: 'Shawn Cole', title: 'President & Founding Partner', email: 'shawn@cowenpartners.com', linkedin: 'https://www.linkedin.com/in/coleshawn', last_contacted: '2026-03-26', status: 'emailed', notes: 'Email sent 3/26. LinkedIn connection sent 3/26.' }
    ]
  },

  {
    id: 4, tier: 1, name: 'BSG (Boston Search Group)',
    why: 'Mid-market PE. Builder-leader profile match. SaaS and healthcare tech verticals.',
    status: 'contacted', last_contacted: '2026-03-26', followup_date: '2026-04-02',
    notes: 'LinkedIn connection sent 3/26.',
    linkedin: 'https://www.linkedin.com/company/bsg-team-ventures/', website: 'https://bostonsearchgroup.com',
    contacts: [
      { id: 1, name: 'Clark Waterfall', title: 'Founder & Managing Director', email: 'cwaterfall@bostonsearchgroup.com', linkedin: 'https://www.linkedin.com/in/clarkwaterfall', last_contacted: '2026-03-26', status: 'emailed', notes: 'Email sent 3/26. LinkedIn connection sent 3/26.' }
    ]
  },

  {
    id: 5, tier: 1, name: 'Bloom Recruiting',
    why: 'Warm relationship. Callie has full context and is actively working the pipeline.',
    status: 'in conversation', last_contacted: '2026-03-26', followup_date: null,
    notes: 'Active conversation. Has resume and full context.',
    linkedin: '', website: '',
    contacts: [
      { id: 1, name: 'Callie Vandegrift', title: 'Recruiter', email: '', linkedin: '', last_contacted: '2026-03-26', status: 'in conversation', notes: 'Active.' }
    ]
  },

  {
    id: 6, tier: 1, name: 'JM Search',
    why: 'Andrew Henry leads Healthcare & Life Sciences. 20+ years PE-backed healthcare tech COO placements. Hunt Scanlon Top 50.',
    status: 'not contacted', last_contacted: null, followup_date: null,
    notes: 'Email to ahenry@jmsearch.com bounced 3/27 — address not found. LinkedIn is primary channel. Also try: Pam Zients or Kristy Lindquist.',
    linkedin: 'https://www.linkedin.com/company/jm-search/', website: 'https://jmsearch.com',
    contacts: [
      { id: 1, name: 'Andrew Henry', title: 'Managing Partner, Healthcare & Life Sciences', email: 'ahenry@jmsearch.com', linkedin: 'https://www.linkedin.com/in/andrew-henry-7179964/', last_contacted: null, status: 'bounced', notes: 'Email bounced 3/27 — address not found. LinkedIn connection is primary channel now.' }
    ]
  },

  {
    id: 7, tier: 1, name: 'Daversa Partners',
    why: 'Will Sheridan focuses on CEO/President/COO at growth-stage VC-backed SaaS. Forbes #145.',
    status: 'contacted', last_contacted: '2026-03-27', followup_date: '2026-04-03',
    notes: 'Email sent 3/27. LinkedIn connection pending.',
    linkedin: 'https://www.linkedin.com/company/daversa-partners/', website: 'https://daversa.com',
    contacts: [
      { id: 1, name: 'Will Sheridan', title: 'Director, Orlando Office', email: 'will@daversa.com', linkedin: 'https://www.linkedin.com/in/willsheridan/', last_contacted: '2026-03-27', status: 'emailed', notes: 'Email sent 3/27. LinkedIn connection pending.' }
    ]
  },

  {
    id: 8, tier: 1, name: 'Acertitude',
    why: 'Rick DeRose leads Technology & Healthcare. PE portfolio C-suite specialist. Forbes #139.',
    status: 'contacted', last_contacted: '2026-03-27', followup_date: '2026-04-03',
    notes: 'Email sent 3/27. LinkedIn connection pending.',
    linkedin: 'https://www.linkedin.com/company/acertitude/', website: 'https://acertitude.com',
    contacts: [
      { id: 1, name: 'Rick DeRose', title: 'Co-Founder & Managing Partner, Technology & Healthcare', email: 'rderose@acertitude.com', linkedin: 'https://www.linkedin.com/in/deroserick/', last_contacted: '2026-03-27', status: 'emailed', notes: 'Email sent 3/27. LinkedIn connection pending.' }
    ]
  },

  {
    id: 9, tier: 1, name: 'ON Partners',
    why: 'Dedicated SaaS practice. Forbes #34. Partner-led. Explicit VC/PE SaaS COO work.',
    status: 'not contacted', last_contacted: null, followup_date: null,
    notes: 'Email to sharris@onpartners.com bounced 3/27 — address not found. LinkedIn is primary channel. Verify correct email format.',
    linkedin: 'https://www.linkedin.com/company/on-search-partners/', website: 'https://onpartners.com',
    contacts: [
      { id: 1, name: 'Seth Harris', title: 'Partner, SaaS & Technology', email: 'sharris@onpartners.com', linkedin: 'https://www.linkedin.com/in/sethoharris/', last_contacted: null, status: 'bounced', notes: 'Email bounced 3/27 — address not found. LinkedIn connection is primary channel now.' }
    ]
  },

  {
    id: 10, tier: 1, name: 'CarterBaldwin Executive Search',
    why: 'Atlanta HQ (Roswell). Leads Technology practice. PE-backed C-suite COO placements. Hunt Scanlon Top 50. Local home-field advantage.',
    status: 'contacted', last_contacted: '2026-03-27', followup_date: '2026-04-03',
    notes: 'Email sent 3/27. LinkedIn connection pending. Roswell GA office.',
    linkedin: 'https://www.linkedin.com/company/carterbaldwin/', website: 'https://carterbaldwin.com',
    contacts: [
      { id: 1, name: 'Jennifer Sobocinski', title: 'Founding Partner, Technology Practice', email: 'jsobocinski@carterbaldwin.com', linkedin: 'https://www.linkedin.com/in/jennifersobocinski/', last_contacted: '2026-03-27', status: 'emailed', notes: 'Email sent 3/27. LinkedIn connection pending.' }
    ]
  },

  {
    id: 11, tier: 1, name: 'Crist|Kolder Associates',
    why: 'Scott Simmons explicitly leads COO and operating officer searches. CEO/CFO/COO/Board only firm.',
    status: 'contacted', last_contacted: '2026-03-27', followup_date: '2026-04-03',
    notes: 'Email sent 3/27. LinkedIn connection pending.',
    linkedin: 'https://www.linkedin.com/company/crist-kolder-associates/', website: 'https://cristkolder.com',
    contacts: [
      { id: 1, name: 'Scott Simmons', title: 'Co-Managing Partner', email: 'ssimmons@cristkolder.com', linkedin: 'https://www.linkedin.com/in/scott-w-simmons-b1b9942/', last_contacted: '2026-03-27', status: 'emailed', notes: 'Email sent 3/27. LinkedIn connection pending.' }
    ]
  },

  {
    id: 26, tier: 1, name: 'SPMB Executive Search',
    why: 'Top tech executive search firm. VC/PE-backed CEO, President, COO practice. Okta, GitHub, Snowflake, Toast, Klaviyo placements.',
    status: 'contacted', last_contacted: '2026-03-27', followup_date: '2026-04-03',
    notes: 'Email sent 3/27 to dave@spmb.com. LinkedIn connection pending.',
    linkedin: 'https://www.linkedin.com/company/spmb-executivesearch/', website: 'https://spmb.com',
    contacts: [
      { id: 1, name: 'Dave Mullarkey', title: 'Managing Partner, CEO/President/COO Practice', email: 'dave@spmb.com', linkedin: 'https://www.linkedin.com/in/dave-mullarkey/', last_contacted: '2026-03-27', status: 'emailed', notes: 'Email sent 3/27. LinkedIn connection pending.' }
    ]
  },

  // ============================================================
  // TIER 2: SECONDARY
  // ============================================================

  {
    id: 12, tier: 2, name: 'True Search',
    why: 'PE/VC tech companies. Strong Series B/C COO practice.',
    status: 'contacted', last_contacted: '2026-03-26', followup_date: '2026-04-02',
    notes: 'Emails sent 3/26.',
    linkedin: 'https://www.linkedin.com/company/true-search/', website: 'https://trueplatform.com',
    contacts: [
      { id: 1, name: 'Steve Tutelman', title: 'Managing Director, PE Practice', email: 'steve.tutelman@truesearch.com', linkedin: 'https://www.linkedin.com/in/stevetutelman/', last_contacted: '2026-03-26', status: 'emailed', notes: 'Email sent 3/26.' },
      { id: 2, name: 'Nora Sutherland', title: 'Partner, Technology Practice', email: 'nora.sutherland@trueplatform.com', linkedin: 'https://www.linkedin.com/in/nsutherlanddsg/', last_contacted: '2026-03-26', status: 'emailed', notes: 'Formerly at DSG. Email sent 3/26.' }
    ]
  },

  {
    id: 13, tier: 2, name: 'Korn Ferry',
    why: 'Large national firm. COO/SVP Ops practice. Series C/D and PE-owned companies.',
    status: 'contacted', last_contacted: '2026-03-26', followup_date: '2026-04-02',
    notes: 'Email sent 3/26. LinkedIn connection pending.',
    linkedin: 'https://www.linkedin.com/company/kornferry/', website: 'https://kornferry.com',
    contacts: [
      { id: 1, name: 'Doug Greenberg', title: 'Senior Partner, Healthcare Technology', email: 'doug.greenberg@kornferry.com', linkedin: 'https://www.linkedin.com/in/doug-greenberg-6593a41/', last_contacted: '2026-03-26', status: 'emailed', notes: 'Email sent 3/26. LinkedIn connection pending.' }
    ]
  },

  {
    id: 14, tier: 2, name: 'Charles Aris',
    why: 'NC-based, national reach. COO placements in Southeast growth companies.',
    status: 'contacted', last_contacted: '2026-03-26', followup_date: '2026-04-02',
    notes: 'Email and LinkedIn sent 3/26.',
    linkedin: 'https://www.linkedin.com/company/charles-aris-inc-/', website: 'https://charlesaris.com',
    contacts: [
      { id: 1, name: 'Kevin Stemke', title: 'Practice Leader', email: 'kevin.stemke@charlesaris.com', linkedin: 'https://www.linkedin.com/in/kevinstemke/', last_contacted: '2026-03-26', status: 'emailed', notes: 'Email sent 3/26. LinkedIn connection sent 3/26.' }
    ]
  },

  {
    id: 15, tier: 2, name: 'StevenDouglas',
    why: 'Drew Zachmann leads Operations & COO search from Atlanta. PE-backed portfolio COO placements.',
    status: 'contacted', last_contacted: '2026-03-27', followup_date: '2026-04-03',
    notes: 'Email sent 3/27. LinkedIn connection pending.',
    linkedin: '', website: 'https://stevendouglas.com',
    contacts: [
      { id: 1, name: 'Drew Zachmann', title: 'Director, Operations & Supply Chain Executive Search', email: 'dzachmann@stevendouglas.com', linkedin: 'https://www.linkedin.com/in/drewzachmann/', last_contacted: '2026-03-27', status: 'emailed', notes: 'Email sent 3/27. LinkedIn connection pending.' }
    ]
  },

  {
    id: 16, tier: 2, name: 'Slayton Search Partners',
    why: 'Forbes #38. PE-backed portfolio COO/CFO/C-suite focus.',
    status: 'contacted', last_contacted: '2026-03-27', followup_date: '2026-04-03',
    notes: 'Email sent 3/27. LinkedIn connection pending.',
    linkedin: 'https://www.linkedin.com/company/slayton-search-partners/', website: 'https://slaytonsearch.com',
    contacts: [
      { id: 1, name: 'Rick Slayton', title: 'Managing Partner & CEO', email: 'rslayton@slaytonsearch.com', linkedin: 'https://www.linkedin.com/in/rickslayton/', last_contacted: '2026-03-27', status: 'emailed', notes: 'Email sent 3/27. LinkedIn connection pending.' }
    ]
  },

  {
    id: 17, tier: 2, name: 'Nexus Search Partners',
    why: 'Amazon AWS background. Charlotte. PE-backed COO/President placements.',
    status: 'contacted', last_contacted: '2026-03-27', followup_date: '2026-04-03',
    notes: 'Email sent 3/27. LinkedIn connection pending.',
    linkedin: '', website: 'https://nexussearchpartners.com',
    contacts: [
      { id: 1, name: 'Thaddeus Jones', title: 'Founder & Managing Partner', email: 'tjones@nexussearchpartners.com', linkedin: '', last_contacted: '2026-03-27', status: 'emailed', notes: 'Email sent 3/27.' }
    ]
  },

  {
    id: 27, tier: 2, name: 'WittKieffer',
    why: 'Julie Chavey is Atlanta-based. 20+ years VC/PE healthcare, healthtech, life sciences recruiting.',
    status: 'contacted', last_contacted: '2026-03-27', followup_date: '2026-04-03',
    notes: 'Email sent 3/27 to jchavey@wittkieffer.com. LinkedIn connection pending.',
    linkedin: 'https://www.linkedin.com/company/wittkieffer/', website: 'https://wittkieffer.com',
    contacts: [
      { id: 1, name: 'Julie Chavey', title: 'Consultant, Investor-Backed Healthcare', email: 'jchavey@wittkieffer.com', linkedin: 'https://www.linkedin.com/in/juliechanvey/', last_contacted: '2026-03-27', status: 'emailed', notes: 'Email sent 3/27. Atlanta-based. LinkedIn connection pending.' }
    ]
  },

  {
    id: 28, tier: 2, name: 'ZRG Partners',
    why: 'Fastest-growing global talent advisory firm. $120M funded. PE-backed tech and healthcare/life sciences COO practice.',
    status: 'contacted', last_contacted: '2026-03-27', followup_date: '2026-04-03',
    notes: 'Email sent 3/27 to jnoel@zrgpartners.com. LinkedIn connection pending.',
    linkedin: 'https://www.linkedin.com/company/zrg-partners/', website: 'https://zrgpartners.com',
    contacts: [
      { id: 1, name: 'Joni Noel', title: 'Co-Head, Healthcare & Life Sciences Practice', email: 'jnoel@zrgpartners.com', linkedin: 'https://www.linkedin.com/in/joninoel/', last_contacted: '2026-03-27', status: 'emailed', notes: 'Email sent 3/27. LinkedIn connection pending.' }
    ]
  },

  {
    id: 29, tier: 2, name: 'Caldwell Partners',
    why: 'Global retained search. COO, CFO, CEO placements. PE platform clients. COO and operating officer focus.',
    status: 'not contacted', last_contacted: null, followup_date: null,
    notes: 'Email format: FLast@caldwellpartners.com. Richard Perkey is a Managing Partner focused on CEO succession and C-suite.',
    linkedin: 'https://www.linkedin.com/company/the-caldwell-partners/', website: 'https://caldwell.com',
    contacts: [
      { id: 1, name: 'Richard Perkey', title: 'Managing Partner', email: 'rperkey@caldwellpartners.com', linkedin: '', last_contacted: null, status: 'not contacted', notes: 'Draft ready. Attach resume and send.' }
    ]
  },

  {
    id: 30, tier: 2, name: 'Direct Recruiters Inc. (DRI)',
    why: 'Dedicated digital health and healthcare IT executive search. COOs at health SaaS. ChartRequest background directly relevant.',
    status: 'not contacted', last_contacted: null, followup_date: null,
    notes: 'Norman Volsky hosts the Digital Health Heavyweights Podcast — warm angle. Mike Silverstein leads HCIT practice.',
    linkedin: 'https://www.linkedin.com/company/direct-recruiters-inc/', website: 'https://directrecruiters.com',
    contacts: [
      { id: 1, name: 'Norman Volsky', title: 'Managing Partner, Digital Health Practice', email: 'nvolsky@directrecruiters.com', linkedin: 'https://www.linkedin.com/in/normanvolsky/', last_contacted: null, status: 'not contacted', notes: 'Digital Health Heavyweights Podcast host. Primary target.' },
      { id: 2, name: 'Mike Silverstein', title: 'Managing Partner, Healthcare IT Practice', email: 'msilverstein@directrecruiters.com', linkedin: 'https://www.linkedin.com/in/mikesilverstein1/', last_contacted: null, status: 'not contacted', notes: 'Leads HCIT practice.' }
    ]
  },

  // ============================================================
  // TIER 3: OPPORTUNISTIC
  // ============================================================

  {
    id: 18, tier: 3, name: 'Riviera Partners',
    why: 'Ryan Brogan in PE practice. Primarily CTO/CPO but PE practice does operating leader work.',
    status: 'contacted', last_contacted: '2026-03-27', followup_date: '2026-04-03',
    notes: 'Email sent 3/27. Lower probability — primarily technical roles. LinkedIn connection pending.',
    linkedin: 'https://www.linkedin.com/company/riviera-partners/', website: 'https://rivierapartners.com',
    contacts: [
      { id: 1, name: 'Ryan Brogan', title: 'Client Partner, Private Equity Practice', email: 'rbrogan@rivierapartners.com', linkedin: 'https://www.linkedin.com/in/ryanbrogan/', last_contacted: '2026-03-27', status: 'emailed', notes: 'Email sent 3/27. Joined Riviera PE practice Sept 2025.' }
    ]
  },

  {
    id: 19, tier: 3, name: 'ReadySetExec',
    why: 'Founder-led boutique. Operations and SaaS focus.',
    status: 'contacted', last_contacted: '2026-03-26', followup_date: '2026-04-02',
    notes: 'Three bounces resolved. Correct address is pshea@readysetexec.com. Email sent 3/26.',
    linkedin: '', website: 'https://readysetexec.com',
    contacts: [
      { id: 1, name: 'Patrick Shea', title: 'Co-Founder & Managing Partner', email: 'pshea@readysetexec.com', linkedin: 'https://www.linkedin.com/in/patrick-jm-shea/', last_contacted: '2026-03-26', status: 'emailed', notes: 'Bounce resolved. Email sent 3/26.' }
    ]
  },

  {
    id: 20, tier: 3, name: 'Klein Hersh',
    why: 'Healthcare tech and digital health SaaS. ChartRequest background is a direct credential.',
    status: 'contacted', last_contacted: '2026-03-26', followup_date: '2026-04-02',
    notes: 'Bounce on jesse@kleinhersh.com resolved. Sent to jklein@kleinhersh.com.',
    linkedin: 'https://www.linkedin.com/company/klein-hersh/', website: 'https://kleinhersh.com',
    contacts: [
      { id: 1, name: 'Jesse Klein', title: 'Managing Director & COO', email: 'jklein@kleinhersh.com', linkedin: 'https://www.linkedin.com/in/kleinjesse/', last_contacted: '2026-03-26', status: 'emailed', notes: 'Bounce resolved. Email sent 3/26.' }
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
    notes: 'Doug Greenberg confirmed at Korn Ferry, not Heidrick. Need new contact to reactivate.',
    linkedin: 'https://www.linkedin.com/company/heidrick-struggles/', website: 'https://heidrick.com',
    contacts: [
      { id: 1, name: 'Doug Greenberg', title: 'Confirmed at Korn Ferry — not Heidrick', email: 'doug.greenberg@heidrick.com', linkedin: 'https://www.linkedin.com/in/doug-greenberg-6593a41/', last_contacted: '2026-03-26', status: 'dead end', notes: 'Wrong firm. Now at Korn Ferry.' }
    ]
  },

  {
    id: 23, tier: 3, name: 'Diversified Search Group',
    why: 'PE-backed tech practice.',
    status: 'passed', last_contacted: '2026-03-26', followup_date: null,
    notes: 'Nora Sutherland moved to True Search. DSG address bounced.',
    linkedin: 'https://www.linkedin.com/company/diversifiedsearchgroup/', website: 'https://diversifiedsearchgroup.com',
    contacts: [
      { id: 1, name: 'Nora Sutherland', title: 'Moved to True Search', email: 'nora.sutherland@divsearch.com', linkedin: 'https://www.linkedin.com/in/nsutherlanddsg/', last_contacted: '2026-03-26', status: 'dead end', notes: 'Bounced. Now at True Search.' }
    ]
  },

  { id: 31, tier: 3, name: 'Spencer Stuart', why: 'Global Big 5 firm. COO/President placements at major PE-backed and public companies.', status: 'not contacted', last_contacted: null, followup_date: null, notes: 'Need named contact in healthcare/tech ops practice. Email format: FLast@spencerstuart.com. Better with warm intro.', linkedin: 'https://www.linkedin.com/company/spencer-stuart/', website: 'https://spencerstuart.com', contacts: [{ id: 1, name: 'Research needed', title: 'Healthcare/Technology Operations Practice', email: '', linkedin: '', last_contacted: null, status: 'not contacted', notes: 'Find named contact in SE region or healthcare/tech COO practice.' }] },
  { id: 32, tier: 3, name: 'Russell Reynolds Associates', why: 'Global firm with dedicated COO/operations practice.', status: 'not contacted', last_contacted: null, followup_date: null, notes: 'Email format: First.Last@russellreynolds.com. Need named contact.', linkedin: 'https://www.linkedin.com/company/russell-reynolds-associates/', website: 'https://russellreynolds.com', contacts: [{ id: 1, name: 'Research needed', title: 'COO/Operations Practice', email: '', linkedin: '', last_contacted: null, status: 'not contacted', notes: 'Find named contact with COO/ops focus or Southeast region.' }] },
  { id: 33, tier: 3, name: 'DHR Global', why: 'Operations and technology C-suite placements. PE-backed company experience. Atlanta office.', status: 'not contacted', last_contacted: null, followup_date: null, notes: 'Email format likely FLast@dhrglobal.com. Atlanta office exists.', linkedin: 'https://www.linkedin.com/company/dhr-global/', website: 'https://dhrglobal.com', contacts: [{ id: 1, name: 'Research needed', title: 'Technology/Operations Practice', email: '', linkedin: '', last_contacted: null, status: 'not contacted', notes: 'Find named contact in technology or operations COO practice. Atlanta office preferred.' }] },
  { id: 34, tier: 3, name: 'Stanton Chase', why: 'Southeast US office. Technology and operations C-suite placements.', status: 'not contacted', last_contacted: null, followup_date: null, notes: 'Need Atlanta/Southeast office contact. Email format varies.', linkedin: 'https://www.linkedin.com/company/stanton-chase/', website: 'https://stantonchase.com', contacts: [{ id: 1, name: 'Research needed', title: 'Atlanta/Southeast Office', email: '', linkedin: '', last_contacted: null, status: 'not contacted', notes: 'Find Atlanta or Southeast practice leader.' }] },
  { id: 35, tier: 3, name: 'Odgers Berndtson', why: 'Strong PE and technology practices. COO placements at PE-backed tech.', status: 'not contacted', last_contacted: null, followup_date: null, notes: 'Email format: FLast@odgersberndtson.com.', linkedin: 'https://www.linkedin.com/company/odgers-berndtson/', website: 'https://odgersberndtson.com', contacts: [{ id: 1, name: 'Research needed', title: 'Technology/PE Practice, US', email: '', linkedin: '', last_contacted: null, status: 'not contacted', notes: 'Find named contact in US technology or PE practice.' }] },
  { id: 36, tier: 3, name: 'Frederickson Partners', why: 'PE/VC-focused. Technology operations COO placements. Series B/C.', status: 'not contacted', last_contacted: null, followup_date: null, notes: 'Email format: first@fredpartners.com or FLast@fredpartners.com.', linkedin: 'https://www.linkedin.com/company/frederickson-partners/', website: 'https://fredpartners.com', contacts: [{ id: 1, name: 'Research needed', title: 'Technology/Operations Practice', email: '', linkedin: '', last_contacted: null, status: 'not contacted', notes: 'Find named contact with COO/operations focus.' }] },
  { id: 37, tier: 3, name: 'Kaye/Bassman International', why: '30+ year HCIT executive search specialist. Directly relevant to ChartRequest vertical.', status: 'not contacted', last_contacted: null, followup_date: null, notes: 'Email format: FLast@kbic.com or First.Last@kbic.com.', linkedin: 'https://www.linkedin.com/company/kaye-bassman/', website: 'https://kbic.com', contacts: [{ id: 1, name: 'Research needed', title: 'Healthcare IT Practice', email: '', linkedin: '', last_contacted: null, status: 'not contacted', notes: 'Find named contact in HCIT/SaaS COO practice.' }] },
  { id: 38, tier: 3, name: 'Slone Partners', why: 'Life sciences and digital health. VC/PE-backed COO placements.', status: 'not contacted', last_contacted: null, followup_date: null, notes: 'Email format: FLast@slonepartners.com.', linkedin: 'https://www.linkedin.com/company/slone-partners/', website: 'https://slonepartners.com', contacts: [{ id: 1, name: 'Research needed', title: 'Digital Health/Operations Practice', email: '', linkedin: '', last_contacted: null, status: 'not contacted', notes: 'Find named contact in digital health/healthtech COO practice.' }] },
  { id: 39, tier: 3, name: 'Furst Group', why: 'Healthcare operations exec search. COO/President at healthtech companies.', status: 'not contacted', last_contacted: null, followup_date: null, notes: 'Need to identify contact in healthcare tech operations practice.', linkedin: 'https://www.linkedin.com/company/furst-group/', website: 'https://furstgroup.com', contacts: [{ id: 1, name: 'Research needed', title: 'Healthcare Technology Practice', email: '', linkedin: '', last_contacted: null, status: 'not contacted', notes: 'Find named contact in healthcare technology or digital health COO practice.' }] },
  { id: 40, tier: 3, name: 'Kingsley Gate Partners', why: 'PE-backed C-suite specialist. CEO, COO, CFO placements. Growth equity and buyout focus.', status: 'not contacted', last_contacted: null, followup_date: null, notes: 'Email format: FLast@kingsleygate.com.', linkedin: 'https://www.linkedin.com/company/kingsley-gate-partners/', website: 'https://kingsleygate.com', contacts: [{ id: 1, name: 'Research needed', title: 'Technology/Operations Practice', email: '', linkedin: '', last_contacted: null, status: 'not contacted', notes: 'Find named contact with COO/ops focus for PE growth equity and buyout.' }] },

  // ============================================================
  // TIER 4: HEALTH TECH SPECIALISTS
  // ============================================================

  {
    id: 24, tier: 4, name: 'Storm3',
    why: 'HealthTech-specialist recruiter. Finance & Operations practice places COOs. Exact vertical fit.',
    status: 'passed', last_contacted: '2026-03-27', followup_date: null,
    notes: 'Email to perrin.joel@storm3.com blocked 3/27 — admin rule, inbox no longer active. Need to find current US contact at Storm3.',
    linkedin: 'https://www.linkedin.com/company/storm3/', website: 'https://storm3.com',
    contacts: [
      { id: 1, name: 'Perrin Joel', title: 'Commercial Manager, US (may have departed)', email: 'perrin.joel@storm3.com', linkedin: '', last_contacted: '2026-03-27', status: 'dead end', notes: 'Email blocked 3/27 — inbox no longer active per admin rule. Find current US contact.' }
    ]
  },

  {
    id: 25, tier: 4, name: 'Epsen Fuller Group',
    why: 'Healthcare IT exec search boutique. COO, CIO, VP Operations at healthcare SaaS. Directly relevant vertical.',
    status: 'not contacted', last_contacted: null, followup_date: null,
    notes: 'Need to identify contact. Email format: FLast@epsenfuller.com.',
    linkedin: 'https://www.linkedin.com/company/epsen-fuller-group/', website: 'https://epsenfuller.com',
    contacts: [
      { id: 1, name: 'Research needed', title: 'Healthcare IT/SaaS Practice', email: '', linkedin: '', last_contacted: null, status: 'not contacted', notes: 'Find named contact in healthcare IT/digital health COO practice.' }
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

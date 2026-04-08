#!/usr/bin/env node
// HopeSpot — Drive package builder for apps 002-010
// Usage: HOPESPOT_API_KEY=your_key node scripts/build_packages.js
// Reads HOPESPOT_API_KEY from env. TRACKER_URL defaults to production.

const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const TRACKER_URL = process.env.TRACKER_URL || 'https://meridian-recruiter-tracker-production.up.railway.app';
const API_KEY = process.env.HOPESPOT_API_KEY;
if (!API_KEY) { console.error('HOPESPOT_API_KEY env var required'); process.exit(1); }

const PACKAGES = [
  {
    app_id: 'app-002',
    company: 'BluZinc',
    role: 'Chief of Staff / Strategic Operations Director',
    variant: 'Partner',
    cover_letter: `Three years ago I took over full operating ownership of a vertical SaaS healthcare platform with $2M ARR, no operating framework, and 40 employees. By early 2026, it ran at a $16M ARR pace with 80%+ gross margin and 180+ employees across four countries. The work that made that possible is exactly what a Chief of Staff is supposed to do: build the systems, align the executive team, own the decisions that don't have a natural home.

The infrastructure I designed — scorecards, decision rights, structured meeting cadence, incentive comp models — scaled without modification from 40 to 180+ employees. I held ownership across every function simultaneously: marketing, sales, client services, product, IT, security, HR. Not as a generalist dabbling, but as the operating layer the CEO needed to not think about.

BluZinc's combination of scope and stage is exactly where this kind of operating leverage matters most. The window between early traction and institutional scale is short. You need someone who can build the infrastructure while still being in the weeds on execution. That is what I have done in consecutive companies.

I would welcome a direct conversation about where the operating gaps are.`
  },
  {
    app_id: 'app-003',
    company: 'Array',
    role: 'Chief of Staff',
    variant: 'Partner',
    cover_letter: `Scaling a fintech from series A to series C requires building operating infrastructure that keeps pace with the product. Most Chief of Staff candidates bring the framework but not the technical fluency. I bring both.

At ChartRequest, I owned the full operating stack from $2M ARR to a $16M run rate — including direct ownership of product, IT operations, security and compliance, and HR alongside commercial functions. I designed ChartRequestOS, a company-wide operating framework that scaled without modification from 40 to 180+ employees across four countries. Gross margin expanded to 80%+ while revenue grew eight times.

Array's position at the intersection of credit infrastructure and developer distribution is the kind of technical B2B motion that requires operational precision. The Chief of Staff role at a General Catalyst-backed company at your stage is where operating leverage makes the biggest difference. I have built that leverage before and know exactly what needs to be built next.

Happy to be direct about fit. Would welcome 20 minutes.`
  },
  {
    app_id: 'app-004',
    company: 'Total AI Systems',
    role: 'Chief of Staff',
    variant: 'Innovator',
    cover_letter: `AI-native operations is what I have been building since before it had a name.

At ChartRequest, I served as de facto COO while the CEO ran external-facing functions — building the entire operating layer, aligning a 180+ person team across four countries, and driving $2M ARR to a $16M run rate with 80%+ gross margin. The operating system I designed, ChartRequestOS, covered scorecards, decision rights, structured meeting cadence, and incentive models. It scaled without modification.

Total AI Systems is building at the intersection of enterprise software and large-scale AI deployment. A Chief of Staff in this space needs to think like an operator and reason like a product person. I have built internal AI tooling, run enterprise GTM, and managed the full operating stack of a SaaS company simultaneously. I operate at the CEO's altitude and execute at the team level.

That is the role. I would like to talk about what you are building.`
  },
  {
    app_id: 'app-005',
    company: 'GameChanger',
    role: 'Director, Strategic Operations',
    variant: 'Operator',
    cover_letter: `At ChartRequest I owned every business function simultaneously — marketing, sales, client services, product, IT, HR — while building the operating infrastructure that took the company from $2M to $16M ARR. The role required systems thinking at the strategic level and hands-on execution at the team level. That is the balance a Director of Strategic Operations at a scaled consumer technology company needs to hold.

GameChanger sits at a unique intersection: consumer-scale product complexity, enterprise-quality data infrastructure, and a brand that parents and coaches genuinely trust. The operational challenge is sustaining that quality while scaling both the platform and the business. I have built operating frameworks that scale. I have managed cross-functional teams across multiple geographies. And I have done it inside companies that care about their users.

Prior to ChartRequest, I built and sold two companies — an IT services firm and a logistics tech startup acquired by GEODIS — which gave me the founder's perspective on how operating systems either enable or constrain growth. That perspective is what differentiates a director who optimizes what exists from one who builds what's needed next.

I would welcome a conversation about where the operational priorities are this year.`
  },
  {
    app_id: 'app-006',
    company: 'DSD Recruitment (client)',
    role: 'Chief Operating Officer',
    variant: 'Operator',
    cover_letter: `The COO role exists to make sure the CEO can focus on what only the CEO can do. At ChartRequest, I held that function as SVP while the CEO ran external relationships. In practice, I owned every internal function: marketing, sales, client services, product, IT operations, security and compliance, HR. All of them. Simultaneously. Over three years, revenue grew eight times — $2M ARR to a $16M run rate — headcount grew from 40 to 180+, and gross margin expanded to above 80%. The operating framework I built scaled without modification.

Before ChartRequest, I built and sold two companies. Steele Technology Partners grew from zero to acquisition within two years, with enterprise partnerships including NCR, Delta, and AFLAC. Kanga Technology raised $2M+ in institutional capital and was acquired by GEODIS. The pattern across all of it: building operating infrastructure that enables growth while preserving the founder's ability to move fast.

The COO role at a growing company needs someone who has done the full stack. I have. I would welcome a conversation about what you are building and where the operating gaps are.`
  },
  {
    app_id: 'app-007',
    company: '24 Seven Talent (client)',
    role: 'Chief Operating Officer',
    variant: 'Operator',
    cover_letter: `Running a company's full operations — not a function within it, the whole operating stack — requires a specific kind of fluency. You need to hold the finance conversation, the talent conversation, the systems conversation, and the product conversation at the same time. That is what I have built a career doing.

At ChartRequest, I operated as de facto COO with direct ownership across seven functions and an executive team of five. Revenue grew from $2M to a $16M run rate in three years. The operating framework I designed scaled without modification from 40 to 180+ employees across the US, India, the Philippines, and Latin America. I led talent reviews, built the leadership development program that produced multiple promotions to senior and executive-adjacent roles, and managed cross-functional incentive design.

Prior to that: Chief of Staff to Andre Dickens in Atlanta city government, where I led the consolidation of dozens of independent agencies into the Atlanta Department of Transportation. And two company exits before that. I have built companies, scaled companies, and run the operating layer of high-growth SaaS.

I would like to understand what you are building.`
  },
  {
    app_id: 'app-008',
    company: 'TalentRemedy (client)',
    role: 'Vice President, Operations',
    variant: 'Operator',
    cover_letter: `Strong operations at a growing company is not about managing what exists. It is about building what the next stage of growth requires before it becomes a constraint.

At ChartRequest, I built ChartRequestOS from scratch — a company-wide operating system covering scorecards, defined decision rights, structured meeting cadence, and incentive compensation. It scaled without modification from 40 to 180+ employees. During that period, revenue grew from $2M to a $16M run rate, gross margin expanded to 80%+, and I held direct ownership across seven functions simultaneously.

Before that: Chief of Staff for Andre Dickens in Atlanta city government, where I directed multi-year legislative initiatives and stakeholder coalitions. And two companies built and sold. The VP Operations role is one I have functionally held for years. I bring a full-stack operating perspective and the pattern recognition that comes from doing it across multiple company types and stages.

Would welcome a direct conversation about fit.`
  },
  {
    app_id: 'app-009',
    company: 'The Humane League',
    role: 'Vice President, Operations',
    variant: 'Operator',
    cover_letter: `Scaling the impact of a mission-driven organization requires the same operational discipline as scaling a commercial one — with less tolerance for waste and higher accountability to the mission itself.

My operating background is in high-growth SaaS: I took ChartRequest from $2M ARR to a $16M run rate with 80%+ gross margin, built the company's full operating infrastructure, and held ownership across seven functions. The discipline I applied — clear decision rights, structured cadences, measurable outcomes — translates directly to the kind of precision The Humane League needs to maximize the reach of its corporate outreach work.

What draws me to this role is the leverage model. The Humane League's focus on changing corporate practices means every operational investment can influence food production at scale. That kind of multiplier effect on welfare outcomes is the right frame for thinking about where operations resources should go. I have built operating systems with that lens before — by design, not by chance.

I would welcome a conversation about how operations can serve the mission at this stage.`
  },
  {
    app_id: 'app-010',
    company: 'Operation Homefront',
    role: 'Chief Impact Officer',
    variant: 'Builder',
    cover_letter: `I left Baghdad in 2010 with the same lesson every infantry officer learns the hard way: the difference between a good plan and a great outcome is the quality of the operational infrastructure behind it. That lesson shaped every company I have built since.

Operation Homefront's work — direct, tangible support for military families navigating a system that asks a lot and often delivers inconsistently — is exactly the kind of mission that deserves operational excellence. Not process for process's sake, but the kind of infrastructure that ensures a family in crisis gets what they need with certainty and dignity.

My path since the Army: Chief of Staff at Atlanta City Hall, two companies built and sold, and three years as de facto COO of a vertical SaaS healthcare company where I scaled operations from $2M to a $16M run rate with 80%+ gross margin across four countries. I understand how to build the systems that let mission-driven organizations deliver at scale without losing what makes them worth building.

The Chief Impact Officer role requires someone who has seen the mission and the operations simultaneously. I have. I would be honored to talk.`
  }
];

async function buildPackage(pkg) {
  console.log(`\nBuilding: ${pkg.app_id} — ${pkg.company}`);
  try {
    const res = await fetch(`${TRACKER_URL}/api/create-drive-package`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
      body: JSON.stringify({
        app_id: pkg.app_id,
        variant: pkg.variant,
        cover_letter_text: pkg.cover_letter,
        company: pkg.company,
        role: pkg.role
      })
    });
    const data = await res.json();
    if (data.ok) {
      console.log(`  SUCCESS: ${data.folderUrl}`);
      return { app_id: pkg.app_id, ok: true, url: data.folderUrl };
    } else {
      console.error(`  FAILED: ${data.error}`);
      return { app_id: pkg.app_id, ok: false, error: data.error };
    }
  } catch(e) {
    console.error(`  ERROR: ${e.message}`);
    return { app_id: pkg.app_id, ok: false, error: e.message };
  }
}

async function main() {
  console.log(`HopeSpot Drive Package Builder`);
  console.log(`Tracker: ${TRACKER_URL}`);
  console.log(`Building ${PACKAGES.length} packages...`);
  const results = [];
  for (const pkg of PACKAGES) {
    const r = await buildPackage(pkg);
    results.push(r);
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('\n--- RESULTS ---');
  results.forEach(r => {
    console.log(`${r.ok ? 'OK' : 'FAIL'} ${r.app_id}: ${r.ok ? r.url : r.error}`);
  });
  const failed = results.filter(r => !r.ok);
  if (failed.length) {
    console.log(`\n${failed.length} failed. Re-run for those IDs or check DRIVE_WEBHOOK_URL config.`);
  } else {
    console.log('\nAll packages built successfully.');
  }
}

main();

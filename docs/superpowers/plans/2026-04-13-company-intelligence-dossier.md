# Company Intelligence Dossier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a per-company dossier (one-paragraph summary + 3-6 key facts) generated from each application's cached JD, surfaced as a new "Company" tab in the expanded application row.

**Architecture:** New tenant-independent `company_dossiers` table keyed by a normalized `company_key`. A small service (`src/services/dossier.js`) owns generation (one Sonnet call), caching (30-day TTL), and quota semantics. A thin route (`src/routes/dossier.js`) exposes read and build endpoints. A background auto-build fires on application creation when the Free quota permits or the user is Pro. The frontend adds a Company tab with four render states (cached-fresh, stale, build-CTA, locked).

**Tech Stack:** Node/Express 4, PostgreSQL (pg), React 19, @tanstack/react-query, Anthropic SDK (`claude-sonnet-4-6`), Tailwind 4, Vite 6. No new deps.

---

## File Map

**Created:**
- `src/db/migrations/010_company_dossiers.sql`
- `src/services/dossier.js`
- `src/routes/dossier.js`

**Modified:**
- `src/db/store.js` — dossier accessors (get, upsert)
- `src/middleware/tier.js` — add `dossier_generations_per_week: 3`
- `src/routes/applications.js` — add `autoBuildDossierInBackground` helper + call from POST /applications
- `src/routes/jobboard.js` — call `autoBuildDossierInBackground` on snag
- `server.js` — mount dossier routes
- `client/src/components/applications/ApplicationRow.jsx` — add Company tab + CompanyTab component
- `src/services/events.js` — no change (reuse `logEvent` from F1)

---

## Task 1: Migration 010 — company_dossiers table

**Files:**
- Create: `src/db/migrations/010_company_dossiers.sql`

- [ ] **Step 1: Write the migration**

Create `/Users/everettsteele/PROJECTS/snag-jobs/src/db/migrations/010_company_dossiers.sql`:

```sql
-- 010_company_dossiers.sql
-- Shared (tenant-independent) company info cache. Populated on demand by
-- the dossier service. Reads are always free; generations are quota-gated.

BEGIN;

CREATE TABLE IF NOT EXISTS company_dossiers (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_key           TEXT NOT NULL UNIQUE,
  display_name          TEXT NOT NULL,
  source_domain         TEXT,
  summary               TEXT,
  facts                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  links                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  tokens_in             INT NOT NULL DEFAULT 0,
  tokens_out            INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_company_dossiers_key
  ON company_dossiers(company_key);

COMMIT;
```

- [ ] **Step 2: Balance check**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  grep -c "BEGIN;" src/db/migrations/010_company_dossiers.sql && \
  grep -c "COMMIT;" src/db/migrations/010_company_dossiers.sql
```

Expected: `1` then `1`.

- [ ] **Step 3: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add src/db/migrations/010_company_dossiers.sql && \
  git commit -m "feat: migration 010 — company_dossiers table"
```

DO NOT push.

---

## Task 2: Dossier DB accessors

**Files:**
- Modify: `src/db/store.js`

- [ ] **Step 1: Add the accessors just above `module.exports`**

```js
// ================================================================
// COMPANY DOSSIERS (shared, tenant-independent)
// ================================================================

async function getCompanyDossier(companyKey) {
  const { rows } = await query(
    `SELECT * FROM company_dossiers WHERE company_key = $1`,
    [companyKey]
  );
  return rows[0] || null;
}

async function upsertCompanyDossier(data) {
  const { rows } = await query(
    `INSERT INTO company_dossiers
       (company_key, display_name, source_domain, summary, facts, links,
        generated_by_user_id, tokens_in, tokens_out, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, NOW())
     ON CONFLICT (company_key) DO UPDATE
       SET display_name = EXCLUDED.display_name,
           source_domain = EXCLUDED.source_domain,
           summary = EXCLUDED.summary,
           facts = EXCLUDED.facts,
           links = EXCLUDED.links,
           generated_by_user_id = EXCLUDED.generated_by_user_id,
           tokens_in = EXCLUDED.tokens_in,
           tokens_out = EXCLUDED.tokens_out,
           updated_at = NOW()
     RETURNING *`,
    [
      data.company_key,
      data.display_name,
      data.source_domain || null,
      data.summary || null,
      JSON.stringify(data.facts || []),
      JSON.stringify(data.links || {}),
      data.generated_by_user_id || null,
      data.tokens_in || 0,
      data.tokens_out || 0,
    ]
  );
  return rows[0];
}
```

Extend `module.exports`:

```js
  getCompanyDossier,
  upsertCompanyDossier,
```

- [ ] **Step 2: Syntax + require smoke**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  node -c src/db/store.js && \
  node -e "const s = require('./src/db/store'); console.log('fns:', typeof s.getCompanyDossier, typeof s.upsertCompanyDossier);" && \
  echo OK
```

Expected: `fns: function function` then `OK`.

- [ ] **Step 3: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add src/db/store.js && \
  git commit -m "feat: company_dossiers get/upsert accessors"
```

---

## Task 3: Quota limit constant

**Files:**
- Modify: `src/middleware/tier.js`

- [ ] **Step 1: Add the limit key**

Open `/Users/everettsteele/PROJECTS/snag-jobs/src/middleware/tier.js`. Find the `const LIMITS = { ... }` block. Add a new entry:

```js
const LIMITS = {
  cover_letters_per_week: 3,
  resumes: 1,
  dossier_generations_per_week: 3,
};
```

No other changes needed — the existing `checkAiLimit('dossier_generation')` middleware factory will automatically look up `dossier_generation_per_week` via its template. **BUT** — the factory uses `${action}_per_week`, so `action = 'dossier_generation'` looks for `dossier_generation_per_week`. Match the key exactly. Change the LIMITS key to match what the middleware will look for:

```js
const LIMITS = {
  cover_letters_per_week: 3,
  resumes: 1,
  dossier_generation_per_week: 3,
};
```

(Singular `dossier_generation_per_week` so `checkAiLimit('dossier_generation')` composes correctly.)

- [ ] **Step 2: Syntax check**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  node -c src/middleware/tier.js && echo OK
```

Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add src/middleware/tier.js && \
  git commit -m "feat: dossier_generation weekly quota (Free 3/week)"
```

---

## Task 4: Dossier service

**Files:**
- Create: `src/services/dossier.js`

- [ ] **Step 1: Create the service**

Create `/Users/everettsteele/PROJECTS/snag-jobs/src/services/dossier.js`:

```js
const db = require('../db/store');
const { diagLog } = require('../utils');
const { extractCompanyFromUrl } = require('./anthropic');

const TTL_DAYS = 30;

// Compute a stable per-company cache key from user-typed company + optional source URL.
// Prefers the URL-derived slug (more deterministic than freeform names).
function companyKey(company, sourceUrl) {
  const fromUrl = extractCompanyFromUrl(sourceUrl || '');
  const base = (fromUrl || company || '').toLowerCase().trim();
  return base
    .replace(/[.,]/g, '')
    .replace(/\b(inc|llc|corp|co|company|ltd|limited)\b/gi, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function isFresh(dossier) {
  if (!dossier?.updated_at) return false;
  const ageMs = Date.now() - new Date(dossier.updated_at).getTime();
  return ageMs < TTL_DAYS * 86400000;
}

function ageDays(dossier) {
  if (!dossier?.updated_at) return null;
  return Math.floor((Date.now() - new Date(dossier.updated_at).getTime()) / 86400000);
}

// Read-through cache helper: just looks up by key, no generation.
async function getCachedDossier(key) {
  if (!key) return null;
  return await db.getCompanyDossier(key);
}

// Build a dossier via one Sonnet call, persist it, return it.
// Throws on validation failure or API error — callers decide how to surface.
async function buildDossier({ userId, company, sourceUrl, jdText }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  const key = companyKey(company, sourceUrl);
  if (!key) throw new Error('Cannot derive company_key — company and source_url both empty');
  if (!jdText || jdText.length < 200) throw new Error('Not enough context');

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `Extract a short factual dossier about the EMPLOYER company from the job posting below. Output ONLY a JSON object with this exact shape, no preamble or explanation:

{
  "summary": "2-4 sentence paragraph about what the company does, who they serve, and any notable stage/funding/size signal you can infer. Plain prose.",
  "facts": ["Label: value", "Label: value", ...],
  "links": {"website": "url", "linkedin": "url"}
}

STRICT RULES:
- If something is not inferable from the text, DO NOT invent it. Say "unknown" in the relevant fact or omit.
- facts: 3-6 items. Each is "Label: value" (e.g. "Industry: Healthcare AI", "Stage: Series B", "Size signal: ~100-250 employees", "HQ: Palo Alto, remote-friendly", "Notable products: X, Y").
- links: only include URLs that appear verbatim in the posting text. Never guess.
- NEVER invent funding amounts, employee counts, or product names.

COMPANY NAME: ${company || '(unknown)'}
POSTING URL: ${sourceUrl || '(unknown)'}

POSTING TEXT:
${jdText.slice(0, 8000)}`;

  const resp = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = (resp.content?.[0]?.text || '').trim();
  const jsonStr = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let parsed;
  try { parsed = JSON.parse(jsonStr); } catch (e) {
    diagLog('dossier parse failed: ' + e.message);
    throw new Error('Could not parse dossier from model output');
  }

  const summary = String(parsed.summary || '').slice(0, 2000);
  const facts = Array.isArray(parsed.facts)
    ? parsed.facts.filter(f => typeof f === 'string').slice(0, 8).map(f => f.slice(0, 300))
    : [];
  const links = (parsed.links && typeof parsed.links === 'object')
    ? Object.fromEntries(
        Object.entries(parsed.links)
          .filter(([, v]) => typeof v === 'string' && /^https?:\/\//.test(v))
          .slice(0, 5)
          .map(([k, v]) => [String(k).slice(0, 30), String(v).slice(0, 500)])
      )
    : {};

  if (!summary) throw new Error('Model returned empty summary');

  let sourceDomain = '';
  try { sourceDomain = new URL(sourceUrl).hostname.toLowerCase(); } catch (_) {}

  const row = await db.upsertCompanyDossier({
    company_key: key,
    display_name: company || key,
    source_domain: sourceDomain,
    summary,
    facts,
    links,
    generated_by_user_id: userId,
    tokens_in: resp.usage?.input_tokens || 0,
    tokens_out: resp.usage?.output_tokens || 0,
  });
  return row;
}

module.exports = {
  companyKey,
  isFresh,
  ageDays,
  getCachedDossier,
  buildDossier,
  TTL_DAYS,
};
```

- [ ] **Step 2: Smoke test**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  node -c src/services/dossier.js && \
  node -e "
    const d = require('./src/services/dossier');
    console.log('companyKey clean:', d.companyKey('Machinify, Inc.', ''));
    console.log('companyKey url:', d.companyKey('', 'https://job-boards.greenhouse.io/machinifyinc/jobs/1'));
    console.log('isFresh new:', d.isFresh({ updated_at: new Date().toISOString() }));
    console.log('isFresh old:', d.isFresh({ updated_at: '2020-01-01' }));
    console.log('ageDays:', d.ageDays({ updated_at: '2026-04-10' }));
  " && echo OK
```

Expected:
```
companyKey clean: machinify
companyKey url: machinify
isFresh new: true
isFresh old: false
ageDays: 3
OK
```

(Exact `ageDays` may vary with current date.)

- [ ] **Step 3: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add src/services/dossier.js && \
  git commit -m "feat: dossier service — companyKey normalization + buildDossier"
```

---

## Task 5: Dossier route

**Files:**
- Create: `src/routes/dossier.js`
- Modify: `server.js`

- [ ] **Step 1: Create the route file**

Create `/Users/everettsteele/PROJECTS/snag-jobs/src/routes/dossier.js`:

```js
const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { expensiveLimiter } = require('../middleware/security');
const { checkAiLimit, logAiUsage, isPro } = require('../middleware/tier');
const db = require('../db/store');
const { fetchJobDescription } = require('../services/anthropic');
const {
  companyKey, getCachedDossier, buildDossier, isFresh, ageDays, TTL_DAYS,
} = require('../services/dossier');
const { logEvent, lengthBucket } = require('../services/events');

const router = Router();

// Count how many fresh dossier generations this user has logged in the past 7 days.
async function dossierQuotaUsed(userId) {
  const { query } = require('../db/pool');
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM usage_log
       WHERE user_id = $1 AND action = 'dossier_generation'
       AND created_at > NOW() - INTERVAL '7 days'`,
    [userId]
  );
  return rows[0]?.n || 0;
}

// Describe the user's current quota state for the UI.
async function quotaState(user) {
  if (isPro(user)) return { pro: true, used: null, cap: null, remaining: null };
  const used = await dossierQuotaUsed(user.id);
  const cap = 3;
  return { pro: false, used, cap, remaining: Math.max(0, cap - used) };
}

// GET /applications/:id/dossier
// Returns { dossier, cached, stale, quota } — never triggers generation.
router.get('/applications/:id/dossier', requireAuth, async (req, res) => {
  const app = await db.getApplication(req.user.tenantId, req.params.id);
  if (!app || app.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });

  const key = companyKey(app.company, app.source_url);
  const dossier = key ? await getCachedDossier(key) : null;
  const quota = await quotaState(req.user);

  if (dossier) {
    logEvent(req.user.tenantId, req.user.id, 'company_dossier.read', {
      entityType: 'application',
      entityId: app.id,
      payload: { company_key: key, from_cache: true, stale: !isFresh(dossier), age_days: ageDays(dossier) },
    });
  }

  res.json({
    dossier,
    cached: !!dossier,
    stale: dossier ? !isFresh(dossier) : false,
    quota,
  });
});

// POST /applications/:id/dossier/build
// Generates (or regenerates) a dossier. Quota-gated for Free users.
router.post('/applications/:id/dossier/build',
  requireAuth, expensiveLimiter, checkAiLimit('dossier_generation'),
  async (req, res) => {
    const app = await db.getApplication(req.user.tenantId, req.params.id);
    if (!app || app.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });

    const key = companyKey(app.company, app.source_url);
    if (!key) return res.status(422).json({ error: 'Cannot build dossier: company and source URL both empty' });

    // Cached + fresh? Serve from cache without incurring quota.
    const existing = await getCachedDossier(key);
    const forceRefresh = req.body?.refresh === true;
    if (existing && isFresh(existing) && !forceRefresh) {
      const quota = await quotaState(req.user);
      return res.json({ dossier: existing, cached: true, stale: false, quota });
    }

    // If a refresh was requested, only Pro can do it.
    if (forceRefresh && existing && !isPro(req.user)) {
      return res.status(403).json({ error: 'Dossier refresh is a Pro feature', upgrade: true });
    }

    // Need JD text for generation.
    let jdText = app.jd_text || '';
    if (!jdText && app.source_url) {
      try {
        jdText = await fetchJobDescription(app.source_url);
        if (jdText && jdText.length > 50) {
          await db.setJdText(req.user.tenantId, app.id, jdText);
        }
      } catch (_) {}
    }
    if (!jdText || jdText.length < 200) {
      return res.status(422).json({ error: 'Not enough context — the job description is missing or too short to summarize the company.' });
    }

    let dossier;
    try {
      dossier = await buildDossier({
        userId: req.user.id,
        company: app.company,
        sourceUrl: app.source_url,
        jdText,
      });
    } catch (e) {
      console.error('[dossier build]', e.message);
      return res.status(500).json({ error: e.message || 'Dossier build failed' });
    }

    // Log quota usage for net-new generations (refresh also counts for Pro, but
    // Pro doesn't have a quota so it's just observational).
    await logAiUsage(req.user.tenantId, req.user.id, 'dossier_generation',
      (dossier.tokens_in || 0) + (dossier.tokens_out || 0),
      { company_key: key });

    logEvent(req.user.tenantId, req.user.id,
      forceRefresh ? 'company_dossier.refresh_requested' : 'company_dossier.built', {
      entityType: 'application',
      entityId: app.id,
      payload: {
        company_key: key,
        from_cache: false,
        tokens_in: dossier.tokens_in || 0,
        tokens_out: dossier.tokens_out || 0,
        jd_length_bucket: lengthBucket(jdText),
        ...(forceRefresh ? { was_stale: !!(existing && !isFresh(existing)) } : {}),
      },
    });

    const quota = await quotaState(req.user);
    res.json({ dossier, cached: false, stale: false, quota });
  });

module.exports = router;
```

- [ ] **Step 2: Mount in server.js**

Open `/Users/everettsteele/PROJECTS/snag-jobs/server.js`. Find the block of `const ...Routes = require('./src/routes/...')` near the top. Add:

```js
const dossierRoutes = require('./src/routes/dossier');
```

Find the block of `app.use('/api', ...)` mounts. Add (near the other application-related routes):

```js
app.use('/api', dossierRoutes);
```

- [ ] **Step 3: Syntax + require smoke**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  node -c src/routes/dossier.js && \
  node -c server.js && \
  node -e "const r = require('./src/routes/dossier'); console.log('router:', typeof r);" && \
  echo OK
```

Expected: `router: function` then `OK`.

- [ ] **Step 4: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add src/routes/dossier.js server.js && \
  git commit -m "feat: GET + POST /applications/:id/dossier route (quota-gated build)"
```

---

## Task 6: Auto-build on application creation

**Files:**
- Modify: `src/routes/applications.js`
- Modify: `src/routes/jobboard.js`

- [ ] **Step 1: Add `autoBuildDossierInBackground` helper in applications.js**

Open `/Users/everettsteele/PROJECTS/snag-jobs/src/routes/applications.js`. Find the existing `autoSelectResumeInBackground` helper. Just below it, add:

```js
// Fire-and-forget: build (or reuse) a company dossier for a newly created app.
// Silently skips when quota is exhausted, when no usable signal exists, or when
// the cached dossier is still fresh.
function autoBuildDossierInBackground(tenantId, user, app) {
  if (!process.env.ANTHROPIC_API_KEY) return;
  if (!app.source_url && !app.company) return;
  setImmediate(async () => {
    try {
      const { companyKey, getCachedDossier, isFresh, buildDossier } =
        require('../services/dossier');
      const { isPro, logAiUsage } = require('../middleware/tier');
      const { query } = require('../db/pool');
      const { fetchJobDescription } = require('../services/anthropic');

      const key = companyKey(app.company, app.source_url);
      if (!key) return;

      const existing = await getCachedDossier(key);
      if (existing && isFresh(existing)) {
        diagLog(`AUTO-DOSSIER cache hit key=${key} app=${app.id}`);
        return;
      }

      // Quota gate for Free users.
      if (!isPro(user)) {
        const { rows } = await query(
          `SELECT COUNT(*)::int AS n FROM usage_log
             WHERE user_id = $1 AND action = 'dossier_generation'
             AND created_at > NOW() - INTERVAL '7 days'`,
          [user.id]
        );
        if ((rows[0]?.n || 0) >= 3) {
          diagLog(`AUTO-DOSSIER quota exhausted user=${user.id} app=${app.id}`);
          return;
        }
      }

      // Need JD text.
      let jdText = app.jd_text || '';
      if (!jdText && app.source_url) {
        try {
          jdText = await fetchJobDescription(app.source_url);
          if (jdText && jdText.length > 50) {
            await db.setJdText(tenantId, app.id, jdText);
          }
        } catch (_) {}
      }
      if (!jdText || jdText.length < 200) {
        diagLog(`AUTO-DOSSIER not enough context app=${app.id}`);
        return;
      }

      const dossier = await buildDossier({
        userId: user.id,
        company: app.company,
        sourceUrl: app.source_url,
        jdText,
      });
      await logAiUsage(tenantId, user.id, 'dossier_generation',
        (dossier.tokens_in || 0) + (dossier.tokens_out || 0),
        { company_key: key, auto: true });
      logEvent(tenantId, user.id, 'company_dossier.built', {
        entityType: 'application',
        entityId: app.id,
        payload: {
          company_key: key,
          from_cache: false,
          tokens_in: dossier.tokens_in || 0,
          tokens_out: dossier.tokens_out || 0,
          jd_length_bucket: lengthBucket(jdText),
          auto: true,
        },
      });
      diagLog(`AUTO-DOSSIER built key=${key} app=${app.id}`);
    } catch (e) {
      diagLog('AUTO-DOSSIER failed: ' + e.message);
    }
  });
}
```

- [ ] **Step 2: Call the helper after POST /applications**

Find the `POST /applications` handler. It currently ends with:

```js
  autoSelectResumeInBackground(req.user.tenantId, req.user.id, app, { fullName: req.user.fullName });
  res.json(app);
});
```

Add the dossier call alongside:

```js
  autoSelectResumeInBackground(req.user.tenantId, req.user.id, app, { fullName: req.user.fullName });
  autoBuildDossierInBackground(req.user.tenantId, req.user, app);
  res.json(app);
});
```

- [ ] **Step 3: Export the helper so jobboard.js can reuse it**

At the bottom of `applications.js`, find the existing `module.exports` augmentation (should read `module.exports.autoSelectResumeInBackground = autoSelectResumeInBackground;`). Add another line below it:

```js
module.exports.autoBuildDossierInBackground = autoBuildDossierInBackground;
```

- [ ] **Step 4: Call the helper from jobboard snag**

Open `/Users/everettsteele/PROJECTS/snag-jobs/src/routes/jobboard.js`. Find the snag handler. It currently includes:

```js
  const { autoSelectResumeInBackground } = require('./applications');
  autoSelectResumeInBackground(req.user.tenantId, req.user.id, newApp, { fullName: req.user.fullName });
```

Add the dossier auto-build right after:

```js
  const { autoSelectResumeInBackground, autoBuildDossierInBackground } = require('./applications');
  autoSelectResumeInBackground(req.user.tenantId, req.user.id, newApp, { fullName: req.user.fullName });
  autoBuildDossierInBackground(req.user.tenantId, req.user, newApp);
```

(Consolidate the destructure with the existing line.)

- [ ] **Step 5: Syntax check**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  node -c src/routes/applications.js && \
  node -c src/routes/jobboard.js && \
  node -e "const a = require('./src/routes/applications'); console.log('exports:', typeof a.autoSelectResumeInBackground, typeof a.autoBuildDossierInBackground);" && \
  echo OK
```

Expected: `exports: function function` then `OK`.

- [ ] **Step 6: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add src/routes/applications.js src/routes/jobboard.js && \
  git commit -m "feat: autoBuildDossierInBackground on app create + snag"
```

---

## Task 7: Company tab in the expanded application row

**Files:**
- Modify: `client/src/components/applications/ApplicationRow.jsx`

- [ ] **Step 1: Add the Company tab entry in ExpandedDetail**

Find the `ExpandedDetail` component in `/Users/everettsteele/PROJECTS/snag-jobs/client/src/components/applications/ApplicationRow.jsx`. It has this block:

```jsx
        {[
          ['timeline', 'Timeline'],
          ['notes', 'Notes'],
          ['people', 'People'],
          ['materials', 'Materials'],
          ...(app.status === 'interviewing' ? [['interview', 'Interview Prep']] : []),
        ].map(...)}
```

Insert `['company', 'Company']` right after `['timeline', 'Timeline']`:

```jsx
        {[
          ['timeline', 'Timeline'],
          ['company', 'Company'],
          ['notes', 'Notes'],
          ['people', 'People'],
          ['materials', 'Materials'],
          ...(app.status === 'interviewing' ? [['interview', 'Interview Prep']] : []),
        ].map(...)}
```

Below the tab bar, find the body dispatch:

```jsx
      <div className="p-4">
        {tab === 'timeline' && <TimelineTab activity={activity} />}
        {tab === 'notes' && <NotesTab app={app} onUpdate={onUpdate} />}
        {tab === 'people' && <PeopleTab app={app} />}
        {tab === 'materials' && <MaterialsTab app={app} variantRow={variantRow} />}
        {tab === 'interview' && <InterviewTabLazy app={app} />}
      </div>
```

Add the company branch:

```jsx
      <div className="p-4">
        {tab === 'timeline' && <TimelineTab activity={activity} />}
        {tab === 'company' && <CompanyTab app={app} />}
        {tab === 'notes' && <NotesTab app={app} onUpdate={onUpdate} />}
        {tab === 'people' && <PeopleTab app={app} />}
        {tab === 'materials' && <MaterialsTab app={app} variantRow={variantRow} />}
        {tab === 'interview' && <InterviewTabLazy app={app} />}
      </div>
```

- [ ] **Step 2: Add the `CompanyTab` component**

Add to the same file, alongside the other tab components (TimelineTab / NotesTab / etc.):

```jsx
function CompanyTab({ app }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['app-dossier', app.id],
    queryFn: () => api.get(`/applications/${app.id}/dossier`),
  });

  const buildMut = useMutation({
    mutationFn: (body) => api.post(`/applications/${app.id}/dossier/build`, body || {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-dossier', app.id] }),
  });

  if (isLoading) return <div className="text-xs text-gray-400 py-4">Loading dossier...</div>;
  if (error) return <div className="text-xs text-red-600 py-4">{error.message}</div>;

  const { dossier, stale, quota } = data || {};
  const isPro = !!quota?.pro;
  const remaining = quota?.remaining ?? 0;
  const canBuildFree = !isPro && remaining > 0;

  if (!dossier) {
    if (!isPro && remaining <= 0) {
      return (
        <div className="text-center py-6">
          <div className="text-sm font-semibold text-[#1F2D3D] mb-1">You've used your weekly dossier quota</div>
          <p className="text-xs text-gray-500 mb-3">
            Upgrade to Pro for unlimited company dossiers and refresh-on-demand.
          </p>
          <a href="/settings#billing" className="inline-block text-xs bg-[#F97316] hover:bg-[#EA580C] text-white px-4 py-2 rounded-lg">
            Upgrade to Pro
          </a>
        </div>
      );
    }
    return (
      <div className="text-center py-6">
        <p className="text-xs text-gray-500 mb-3">
          No dossier for this company yet. Build one to see a summary, key facts, and detected links.
        </p>
        <button
          onClick={() => buildMut.mutate()}
          disabled={buildMut.isPending}
          className="text-sm bg-[#F97316] hover:bg-[#EA580C] text-white px-4 py-2 rounded-lg cursor-pointer disabled:opacity-50"
        >
          {buildMut.isPending
            ? 'Building...'
            : isPro ? 'Build dossier' : `Build dossier (${remaining} left this week)`}
        </button>
        {buildMut.error && (
          <div className="text-xs text-red-600 mt-2">{buildMut.error.message}</div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {stale && (
        <div className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded-md px-3 py-2 flex items-center justify-between">
          <span>Dossier is over 30 days old.</span>
          {isPro ? (
            <button
              onClick={() => buildMut.mutate({ refresh: true })}
              disabled={buildMut.isPending}
              className="text-xs bg-white hover:bg-amber-100 border border-amber-300 px-2 py-0.5 rounded cursor-pointer disabled:opacity-50"
            >
              {buildMut.isPending ? 'Refreshing...' : 'Refresh'}
            </button>
          ) : (
            <a href="/settings#billing" className="text-xs underline hover:text-amber-900">Upgrade to refresh</a>
          )}
        </div>
      )}

      <div>
        <div className="text-sm font-semibold text-[#1F2D3D] mb-1">
          {dossier.display_name}
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">{dossier.summary}</p>
      </div>

      {Array.isArray(dossier.facts) && dossier.facts.length > 0 && (
        <ul className="space-y-1">
          {dossier.facts.map((f, i) => (
            <li key={i} className="text-xs text-gray-700 flex items-start gap-2">
              <span className="w-1 h-1 rounded-full bg-[#F97316] mt-1.5 shrink-0" />
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      {dossier.links && Object.keys(dossier.links).length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {Object.entries(dossier.links).map(([k, v]) => (
            <a
              key={k}
              href={v}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full"
            >
              {k}
            </a>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1">
        <span>
          Last refreshed {dossier.updated_at ? new Date(dossier.updated_at).toLocaleDateString() : 'unknown'}
        </span>
        {isPro && !stale && (
          <button
            onClick={() => buildMut.mutate({ refresh: true })}
            disabled={buildMut.isPending}
            className="hover:text-[#F97316] cursor-pointer"
          >
            {buildMut.isPending ? 'Refreshing...' : 'Refresh'}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && npx vite build 2>&1 | tail -5
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add client/src/components/applications/ApplicationRow.jsx && \
  git commit -m "feat: Company tab in expanded row (dossier reader + build/refresh states)"
```

---

## Task 8: Final smoke + push

- [ ] **Step 1: Full require graph + build**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  node -c server.js && \
  node -e "
    require('./src/services/dossier');
    require('./src/routes/dossier');
    require('./src/routes/applications');
    require('./src/routes/jobboard');
    console.log('all files load');
  " && \
  npx vite build 2>&1 | tail -5 && \
  echo BUILD_OK
```

Expected: `all files load` + clean build + `BUILD_OK`.

- [ ] **Step 2: Commit log review**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && git log --oneline 35d6ba4..HEAD
```

Expected: 7 commits (Tasks 1–7).

- [ ] **Step 3: Push**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && git push
```

Expected: push to origin/main succeeds. Railway auto-applies migration 010.

- [ ] **Step 4: Post-deploy manual verification**

1. Create a fresh app with a known Greenhouse URL (e.g. a test posting). Within a few seconds: open the expanded row → Company tab → dossier populated (cached: false, built automatically by autoBuildDossierInBackground).
2. Delete that app; create another for the same company. Company tab shows the cached dossier instantly.
3. DB check:
   ```sql
   SELECT company_key, display_name, summary FROM company_dossiers ORDER BY updated_at DESC LIMIT 5;
   ```
4. As a Free user, manually trigger Build on 4 net-new companies. 4th should return 429 / locked UI.
5. Pro user on a stale (>30 day) dossier → Refresh button appears and works; timestamp updates.
6. Events check: `SELECT event_type, payload FROM product_events WHERE event_type LIKE 'company_dossier%' ORDER BY created_at DESC LIMIT 10;` — expect built/read events with correct payloads.

---

## Self-Review

**Spec coverage:**
- ✅ Migration 010 with company_dossiers table + unique key + index (Task 1)
- ✅ Store accessors (Task 2)
- ✅ Quota entry `dossier_generation_per_week: 3` (Task 3)
- ✅ Service with companyKey / isFresh / ageDays / getCachedDossier / buildDossier + Sonnet prompt + field truncation (Task 4)
- ✅ GET + POST routes with quota gating + cache shortcut + refresh-Pro-only (Task 5)
- ✅ Auto-build on app creation + snag (Task 6)
- ✅ Company tab with all four UX states: cached-fresh, stale with refresh/upgrade CTA, build-CTA with remaining quota, locked-for-free (Task 7)
- ✅ Three F1 event types logged: company_dossier.built, company_dossier.read, company_dossier.refresh_requested (Tasks 5 + 6)
- ✅ Error handling: empty summary throws, short JD returns 422, unauthorized refresh returns 403, quota-hit returns 429 via existing middleware

**Placeholder scan:** No TBDs. Every step has concrete code.

**Type consistency:**
- `companyKey(company, sourceUrl)` — same signature in service, route, and auto-build helper
- `buildDossier({ userId, company, sourceUrl, jdText })` — consistent destructure across route and auto-build call sites
- `quotaState(user)` — returns `{pro, used, cap, remaining}`; consumed in GET route and UI (which reads `quota.pro`, `quota.remaining`)
- Event names match: `company_dossier.built`, `.read`, `.refresh_requested`

**Known minor:** no ESLint / tests run — consistent with prior plans in this repo (no test harness). Manual post-deploy verification is the gate.

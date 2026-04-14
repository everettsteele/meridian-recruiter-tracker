# Should-I-Apply AI Verdict Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render an instant Haiku-powered fit verdict (score + reasoning + flags) at the top of the Add Application modal when a user pastes a URL into the quick-add input.

**Architecture:** A small standalone service (`src/services/verdict.js`) owns the Haiku call and output validation. A thin route (`src/routes/verdict.js`) loads per-user context (base resume, target_roles, background), fetches the JD via `fetchJobDescription`, calls the service, and logs a `verdict.generated` product event. The Applications page fires the verdict request in parallel with the existing `parse-url` call; the modal displays a `VerdictCard` at the top that swaps skeleton → result as the network request resolves.

**Tech Stack:** Node/Express 4, PostgreSQL (pg), Anthropic SDK (`claude-haiku-4-5-20251001`), React 19, @tanstack/react-query, Tailwind 4, Vite 6. No new deps. No migration.

---

## File Map

**Created:**
- `src/services/verdict.js` — Haiku call + prompt + JSON extraction + validation
- `src/routes/verdict.js` — POST /applications/verdict, loads context, invokes service, logs event

**Modified:**
- `server.js` — mount new route
- `client/src/pages/Applications.jsx` — add verdictMutation kicked off in parallel with parse-url; pass verdict state into AddApplicationModal; add VerdictCard component; extend the existing prefill-modal flow

---

## Task 1: Verdict service

**Files:**
- Create: `src/services/verdict.js`

- [ ] **Step 1: Create the file**

Create `/Users/everettsteele/PROJECTS/snag-jobs/src/services/verdict.js`:

```js
const { diagLog } = require('../utils');

const VALID_VERDICTS = new Set(['strong_fit', 'fit', 'stretch', 'weak_fit']);

// Neutral fallback used when the JD can't be fetched.
function neutralVerdict(reason) {
  return {
    verdict: 'stretch',
    score: 50,
    reasoning: reason || "Couldn't read the posting clearly — fit estimate is uncertain.",
    green_flags: [],
    red_flags: [],
  };
}

// Call Haiku 4.5 for a structured fit verdict.
// Throws only on SDK/network errors. Callers decide how to surface them.
async function generateVerdict({ url, jdText, resumeText, targetRoles, background, displayCompany, displayRole }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  // No JD at all → return neutral fallback instead of calling the model.
  if (!jdText || jdText.length < 200) {
    return neutralVerdict();
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const roles = Array.isArray(targetRoles) ? targetRoles.join(', ') : '';
  const prompt = `You are sizing up whether a specific job posting is a good fit for a specific candidate. Return ONLY a JSON object with this exact shape, no preamble or explanation:

{
  "verdict": "strong_fit" | "fit" | "stretch" | "weak_fit",
  "score": 0..100,
  "reasoning": "2-3 sentence explanation.",
  "green_flags": ["up to 3 short strings"],
  "red_flags":   ["up to 3 short strings"]
}

STRICT RULES:
- Ground every flag in text actually present in either the posting or the resume. DO NOT invent facts about the candidate.
- "green_flags" are specific things the candidate's resume or background clearly matches with this role.
- "red_flags" are specific mismatches or concerns visible in the posting vs. the candidate.
- If neither is meaningfully inferable, leave the array empty.
- score: 80-100 = strong_fit, 60-79 = fit, 40-59 = stretch, 0-39 = weak_fit. Pick a score that matches the verdict you chose.
- reasoning: plain prose, 2-3 sentences. Reference concrete signals.

ROLE: ${displayRole || '(unknown)'}
COMPANY: ${displayCompany || '(unknown)'}
POSTING URL: ${url || '(unknown)'}

TARGET ROLES (candidate is searching for):
${roles || '(none listed)'}

CANDIDATE BACKGROUND:
${(background || '(none recorded)').slice(0, 1500)}

CANDIDATE RESUME (base):
${(resumeText || '(no base resume uploaded)').slice(0, 3000)}

JOB POSTING TEXT:
${jdText.slice(0, 4000)}`;

  let raw = '';
  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });
    raw = (resp.content?.[0]?.text || '').trim();
  } catch (e) {
    diagLog('verdict model error: ' + e.message);
    throw new Error('Verdict model call failed: ' + e.message);
  }

  // Extract the first {...} block (robust to preambles or code fences).
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    diagLog('verdict: no JSON block in response');
    throw new Error('Could not parse verdict from model output');
  }

  let parsed;
  try { parsed = JSON.parse(match[0]); } catch (e) {
    diagLog('verdict parse failed: ' + e.message);
    throw new Error('Could not parse verdict JSON');
  }

  // Validate + clamp.
  const verdict = VALID_VERDICTS.has(parsed.verdict) ? parsed.verdict : 'stretch';
  let score = Number(parsed.score);
  if (!Number.isFinite(score)) score = 50;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const reasoning = String(parsed.reasoning || '').slice(0, 1000);
  const clean = (arr) => Array.isArray(arr)
    ? arr.filter(s => typeof s === 'string').slice(0, 3).map(s => s.slice(0, 200))
    : [];

  return {
    verdict,
    score,
    reasoning,
    green_flags: clean(parsed.green_flags),
    red_flags: clean(parsed.red_flags),
  };
}

module.exports = { generateVerdict, neutralVerdict, VALID_VERDICTS };
```

- [ ] **Step 2: Syntax + smoke**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  node -c src/services/verdict.js && \
  node -e "
    const v = require('./src/services/verdict');
    console.log('exports:', typeof v.generateVerdict, typeof v.neutralVerdict);
    console.log('neutral:', JSON.stringify(v.neutralVerdict()));
  " && echo OK
```

Expected:
```
exports: function function
neutral: {"verdict":"stretch","score":50,"reasoning":"Couldn't read the posting clearly — fit estimate is uncertain.","green_flags":[],"red_flags":[]}
OK
```

- [ ] **Step 3: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add src/services/verdict.js && \
  git commit -m "feat: verdict service — Haiku call + prompt + output validation"
```

DO NOT push.

---

## Task 2: Verdict route

**Files:**
- Create: `src/routes/verdict.js`
- Modify: `server.js`

- [ ] **Step 1: Create the route file**

Create `/Users/everettsteele/PROJECTS/snag-jobs/src/routes/verdict.js`:

```js
const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { expensiveLimiter } = require('../middleware/security');
const { validate, schemas } = require('../middleware/validate');
const { fetchJobDescription, extractJobPostingMeta } = require('../services/anthropic');
const { generateVerdict, neutralVerdict } = require('../services/verdict');
const { getResumeVariants } = require('../db/users');
const { logEvent, lengthBucket, urlHost } = require('../services/events');

const router = Router();

// POST /applications/verdict — returns a Haiku-powered fit verdict for a pasted URL.
router.post('/applications/verdict',
  requireAuth, expensiveLimiter, validate(schemas.parseUrlRequest),
  async (req, res) => {
    const { url } = req.body;
    const host = urlHost(url);

    // Fetch JD + lightweight meta extraction in parallel with resume load.
    let jdText = '';
    try { jdText = await fetchJobDescription(url); } catch (_) {}

    const [meta, variants] = await Promise.all([
      jdText && jdText.length > 200
        ? extractJobPostingMeta(jdText, url).catch(() => ({ company: '', role: '' }))
        : Promise.resolve({ company: '', role: '' }),
      getResumeVariants(req.user.id).catch(() => []),
    ]);

    // Pick the base resume if present; else any variant with content.
    const base = variants.find(v => v.slug === 'base' && v.parsed_text)
      || variants.find(v => v.parsed_text);
    const resumeText = base?.parsed_text || '';
    const profile = req.user.profile || {};

    let verdict;
    try {
      verdict = await generateVerdict({
        url,
        jdText,
        resumeText,
        targetRoles: profile.target_roles || profile.targetRoles || [],
        background: profile.background_text || profile.backgroundText || '',
        displayCompany: meta.company,
        displayRole: meta.role,
      });
    } catch (e) {
      console.error('[verdict]', e.message);
      // Return a neutral fallback so the UI still renders something useful
      // rather than propagating an error that would just blank the card.
      verdict = neutralVerdict("Couldn't run the fit check. Save or edit manually.");
    }

    logEvent(req.user.tenantId, req.user.id, 'verdict.generated', {
      payload: {
        verdict: verdict.verdict,
        score: verdict.score,
        host,
        jd_length_bucket: lengthBucket(jdText),
        has_base_resume: !!resumeText,
      },
    });

    res.json({ ...verdict, host });
  });

module.exports = router;
```

- [ ] **Step 2: Mount in server.js**

Open `/Users/everettsteele/PROJECTS/snag-jobs/server.js`. Near the top, find the `const dossierRoutes = require('./src/routes/dossier');` line. Below it, add:

```js
const verdictRoutes = require('./src/routes/verdict');
```

Find `app.use('/api', dossierRoutes);` and add directly below:

```js
app.use('/api', verdictRoutes);
```

- [ ] **Step 3: Syntax + smoke**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  node -c src/routes/verdict.js && \
  node -c server.js && \
  node -e "const r = require('./src/routes/verdict'); console.log('router:', typeof r);" && \
  echo OK
```

Expected: `router: function` then `OK`.

- [ ] **Step 4: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add src/routes/verdict.js server.js && \
  git commit -m "feat: POST /applications/verdict route + mount"
```

DO NOT push.

---

## Task 3: Frontend — fire verdictMutation in parallel + pass into modal

**Files:**
- Modify: `client/src/pages/Applications.jsx`

- [ ] **Step 1: Add verdictMutation alongside parseUrlMutation**

Open `/Users/everettsteele/PROJECTS/snag-jobs/client/src/pages/Applications.jsx`. Find the existing `parseUrlMutation`:

```jsx
  const parseUrlMutation = useMutation({
    mutationFn: (url) => api.post('/applications/parse-url', { url }),
    onSuccess: (d) => {
      setPrefill({ company: d.company, role: d.role, source_url: d.source_url });
      setShowModal(true);
      setQuickInput('');
    },
    onError: (err) => toast(err.message || 'Could not parse URL', 'error'),
  });
```

Just below it, add:

```jsx
  const verdictMutation = useMutation({
    mutationFn: (url) => api.post('/applications/verdict', { url }),
  });
```

No `onSuccess` / `onError` — the UI reads `verdictMutation.data` / `.isPending` / `.error` directly.

- [ ] **Step 2: Kick off verdict in parallel when the user submits a URL**

Find the `handleQuick` function. It currently reads:

```jsx
  const handleQuick = () => {
    const v = quickInput.trim();
    if (!v) return;
    if (/^https?:\/\//i.test(v)) {
      parseUrlMutation.mutate(v);
    } else {
      setPrefill({ company: v });
      setShowModal(true);
      setQuickInput('');
    }
  };
```

Change the URL branch to fire both mutations:

```jsx
  const handleQuick = () => {
    const v = quickInput.trim();
    if (!v) return;
    if (/^https?:\/\//i.test(v)) {
      verdictMutation.reset();
      verdictMutation.mutate(v);
      parseUrlMutation.mutate(v);
    } else {
      setPrefill({ company: v });
      setShowModal(true);
      setQuickInput('');
    }
  };
```

`verdictMutation.reset()` ensures a stale previous verdict doesn't linger when the user starts a new paste.

- [ ] **Step 3: Reset verdictMutation when the modal is dismissed**

Find the modal `onClose` handler in the JSX (look for the AddApplicationModal render and the `onClose={() => { setShowModal(false); setPrefill(null); }}` line). Update it to also reset the mutation:

```jsx
      {showModal && (
        <AddApplicationModal
          prefill={prefill}
          verdict={verdictMutation.data || null}
          verdictLoading={verdictMutation.isPending}
          verdictError={verdictMutation.error}
          onClose={() => { setShowModal(false); setPrefill(null); verdictMutation.reset(); }}
          onSave={(d) => addMutation.mutate(d)}
          saving={addMutation.isPending}
        />
      )}
```

(New props: `verdict`, `verdictLoading`, `verdictError`.)

- [ ] **Step 4: Build to confirm no typos**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && npx vite build 2>&1 | tail -5
```

Expected: clean build. (The modal won't render the card yet — that's Task 4. The new props are passed but ignored for now.)

- [ ] **Step 5: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add client/src/pages/Applications.jsx && \
  git commit -m "feat: fire verdict mutation in parallel with parse-url on URL paste"
```

DO NOT push.

---

## Task 4: Frontend — VerdictCard in AddApplicationModal

**Files:**
- Modify: `client/src/pages/Applications.jsx`

- [ ] **Step 1: Update AddApplicationModal signature + render VerdictCard**

Find `function AddApplicationModal(...)` in `/Users/everettsteele/PROJECTS/snag-jobs/client/src/pages/Applications.jsx`. Its current signature is:

```jsx
function AddApplicationModal({ prefill, onClose, onSave, saving }) {
```

Change to:

```jsx
function AddApplicationModal({ prefill, verdict, verdictLoading, verdictError, onClose, onSave, saving }) {
```

Immediately inside the modal's content area (above the existing form fields — usually right after the modal header/title), add:

```jsx
      <VerdictCard verdict={verdict} loading={verdictLoading} error={verdictError} />
```

Find the exact insertion point: the modal's body container (usually a `<div className="...">` that wraps the form inputs). Put `<VerdictCard />` as the FIRST child of that container. If the modal layout has a scrollable body wrapper, put it inside the scrollable area so long flags lists can scroll with the form.

- [ ] **Step 2: Add the VerdictCard component**

Add `VerdictCard` at module scope in the same file, near the bottom alongside other component helpers (not inside `AddApplicationModal` or `ApplicationsPage`):

```jsx
const VERDICT_STYLE = {
  strong_fit: { label: 'Strong Fit', bar: 'bg-green-500', tint: 'bg-green-50 border-green-200 text-green-900' },
  fit:        { label: 'Good Fit',   bar: 'bg-emerald-500', tint: 'bg-emerald-50 border-emerald-200 text-emerald-900' },
  stretch:    { label: 'Stretch',    bar: 'bg-amber-500',   tint: 'bg-amber-50 border-amber-200 text-amber-900' },
  weak_fit:   { label: 'Weak Fit',   bar: 'bg-rose-500',    tint: 'bg-rose-50 border-rose-200 text-rose-900' },
};

function VerdictCard({ verdict, loading, error }) {
  if (!verdict && !loading && !error) return null;

  if (loading) {
    return (
      <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 flex items-center gap-3">
        <div className="w-4 h-4 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin" />
        <div className="text-xs text-gray-600">Snag is sizing up this role...</div>
      </div>
    );
  }

  if (error || !verdict) {
    return (
      <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2 text-[11px] text-gray-500">
        Couldn't size up this role — save or edit manually.
      </div>
    );
  }

  const style = VERDICT_STYLE[verdict.verdict] || VERDICT_STYLE.stretch;

  return (
    <div className={`mb-4 rounded-lg border ${style.tint} px-4 py-3`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`inline-block w-2 h-6 rounded-sm ${style.bar}`} />
        <span className="text-sm font-semibold">{style.label}</span>
        <span className="text-xs opacity-70 ml-auto">{verdict.score}/100</span>
      </div>
      {verdict.reasoning && (
        <p className="text-xs leading-relaxed mb-2">{verdict.reasoning}</p>
      )}
      {(Array.isArray(verdict.green_flags) && verdict.green_flags.length > 0)
        || (Array.isArray(verdict.red_flags) && verdict.red_flags.length > 0) ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
          {Array.isArray(verdict.green_flags) && verdict.green_flags.length > 0 && (
            <div>
              <div className="font-semibold mb-1 opacity-80">What's working</div>
              <ul className="space-y-0.5">
                {verdict.green_flags.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-green-600 mt-0.5">+</span>
                    <span className="flex-1">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {Array.isArray(verdict.red_flags) && verdict.red_flags.length > 0 && (
            <div>
              <div className="font-semibold mb-1 opacity-80">Watch out for</div>
              <ul className="space-y-0.5">
                {verdict.red_flags.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-rose-600 mt-0.5">−</span>
                    <span className="flex-1">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : null}
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
  git add client/src/pages/Applications.jsx && \
  git commit -m "feat: VerdictCard at top of AddApplicationModal (color-coded fit read)"
```

DO NOT push.

---

## Task 5: Final smoke + push

- [ ] **Step 1: Full require graph + build**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  node -c server.js && \
  node -e "
    require('./src/services/verdict');
    require('./src/routes/verdict');
    console.log('all files load');
  " && \
  npx vite build 2>&1 | tail -5 && \
  echo BUILD_OK
```

Expected: `all files load` then clean build then `BUILD_OK`.

- [ ] **Step 2: Commit log**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && git log --oneline cf19760..HEAD
```

Expected: 4 commits (Tasks 1-4).

- [ ] **Step 3: Push**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && git push
```

Expected: push succeeds to origin/main.

- [ ] **Step 4: Post-deploy manual verification**

After Railway deploys:

1. Log in as yourself. Paste a LinkedIn URL for a role that matches your `target_roles` into the quick-add. Modal opens with company/role prefilled. VerdictCard renders a "Good Fit" or "Strong Fit" within a few seconds.
2. Paste a URL for a role that's clearly off-target (e.g., iOS Engineer if you're a COO) → VerdictCard renders "Stretch" or "Weak Fit" with explanation.
3. Paste a 404 URL → Modal still opens (parse-url returns hostname fallback), VerdictCard renders neutral "Stretch" with "Couldn't read the posting" copy.
4. DB: `SELECT event_type, payload FROM product_events WHERE event_type = 'verdict.generated' ORDER BY created_at DESC LIMIT 5;` — verify payload shape includes verdict/score/host/jd_length_bucket/has_base_resume.
5. Upload NO base resume, retry step 1 — verdict still renders; event has `has_base_resume: false`.

---

## Self-Review

**Spec coverage:**
- ✅ `POST /applications/verdict` route with requireAuth + expensiveLimiter + validate(parseUrlRequest) (Task 2)
- ✅ Service with one Haiku 4.5 call, 600 max_tokens, robust JSON extraction via regex, validation + clamping (Task 1)
- ✅ Neutral fallback for empty JD (Task 1 — `neutralVerdict` used when jdText < 200 chars; also in route when model fails)
- ✅ Context load: JD via fetchJobDescription, base resume (slug='base' preferred) via getResumeVariants, profile target_roles + background_text (Task 2)
- ✅ Parallel parse-url + verdict on URL paste (Task 3)
- ✅ VerdictCard at top of AddApplicationModal with loading / error / 4 verdict states (Task 4)
- ✅ product_events `verdict.generated` with verdict/score/host/jd_length_bucket/has_base_resume payload (Task 2)

**Placeholder scan:** No TBDs. Every step has concrete code.

**Type consistency:**
- `generateVerdict({ url, jdText, resumeText, targetRoles, background, displayCompany, displayRole })` — same signature in service definition (Task 1) and route call site (Task 2).
- Verdict response shape `{ verdict, score, reasoning, green_flags, red_flags }` matches across service → route → frontend → VerdictCard render.
- `verdict.verdict` is one of the 4 enum values and matches the `VERDICT_STYLE` keys in the frontend (Task 4).
- `neutralVerdict()` shape matches `generateVerdict` shape so the modal renders identically on fallback.

**Known non-blocker:** No unit tests; relying on manual post-deploy verification (consistent with prior plans in this repo).

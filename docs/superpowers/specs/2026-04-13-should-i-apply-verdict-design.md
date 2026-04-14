# Should-I-Apply AI Verdict — Design

**Date:** 2026-04-13
**Status:** Approved
**Scope:** Instant AI verdict on whether a pasted job URL is worth applying to. Shows up inside the existing Add Application modal alongside the auto-extracted company/role, so the decision happens before the user commits.

## Goal

Turn Snag into a daily-use tool by making the paste-URL flow smarter: beyond extracting company + role, Snag renders a color-coded fit verdict with 2–3 sentences of reasoning and short bullet lists of green/red flags. User still decides, but with a grounded second opinion.

## Non-Goals

- Pattern analysis against the user's own rejection history (needs F1 data maturity; future spec).
- Counterfactual coaching ("here's what to add to your resume for this role") — different feature, future spec.
- Side-by-side comparison of two jobs.
- Standalone preview mode (verdict without creating an app).
- Gating the verdict behind Pro. Haiku is cheap enough that universal access is stickier.

## User Flow

1. User pastes a URL into the quick-add input on the Applications page and presses Enter (existing flow).
2. The page fires **two requests in parallel**: the existing `POST /applications/parse-url` and a new `POST /applications/verdict`. Both take the URL in the body.
3. The Add Application modal opens as soon as `parse-url` returns (company + role prefilled). The verdict card at the top of the modal shows a spinner until `verdict` returns, then swaps in the color-coded card.
4. User clicks Save to add the app, Cancel to discard, or edits fields and saves. The verdict itself is not persisted on the application row; it's ephemeral UI + a `product_events` log row.
5. Optional future: if the user saves the app, we can copy the verdict's flags into the application's `notes` as seed text — deferred to a later pass.

## API

### `POST /applications/verdict`

Body:
```json
{ "url": "https://..." }
```

Response:
```json
{
  "verdict": "strong_fit" | "fit" | "stretch" | "weak_fit",
  "score": 0..100,
  "reasoning": "2-3 sentence paragraph.",
  "green_flags": ["up to 3 short strings"],
  "red_flags":   ["up to 3 short strings"],
  "host": "example.com"
}
```

Middleware: `requireAuth, expensiveLimiter, validate(schemas.parseUrlRequest)` — reuse the existing URL schema.

Errors:
- Missing `ANTHROPIC_API_KEY` → 503.
- URL fetch returns empty → return a neutral verdict (`stretch`, score 50, reasoning explaining the absent JD) so the UI never hangs.
- Model parse failure → 500 with readable error.
- Rate-limited by `expensiveLimiter`.

### Model Prompt

One Haiku 4.5 call. System/user prompt includes:

- JD text (truncated at 4000 chars) from `fetchJobDescription`.
- Source URL hostname (for signals about ATS / company type).
- User's base resume `parsed_text` (truncated at 3000 chars) from `resume_variants` where `slug = 'base'`. Fallback: any variant with content.
- User's `target_roles` (array) and `background_text` from `user_profiles`.

Prompt directs Haiku to return strict JSON with the schema above. `NEVER invent resume facts. Ground every flag in text that's literally present.`

`max_tokens: 600`. Enough for reasoning + flags without truncation risk.

### Service

New file `src/services/verdict.js` with a single export:

```js
async function generateVerdict({ url, jdText, resumeText, targetRoles, background }) → verdict
```

Does the Haiku call, parses the JSON (with robust-extraction pattern: regex-match first `{…}` block, same as `dossier.js`), clamps fields (score 0-100 int, verdict enum whitelist, reasoning ≤ 1000 chars, flags ≤ 3 × 200 chars each).

### Route

New file `src/routes/verdict.js`:

- `POST /applications/verdict` — the endpoint above.
- Loads user's base resume + profile inside the handler.
- Returns verdict or neutral fallback.
- Logs `verdict.generated` product event.

Mounted in `server.js` alongside `dossierRoutes`.

## Frontend

### `client/src/pages/Applications.jsx`

In the existing `parseUrlMutation` flow, kick off a second mutation in parallel.

- `verdictMutation` (React Query) — POST `/applications/verdict` with the URL.
- On success, store the verdict in `prefill` alongside company/role/source_url.
- The modal reads `prefill.verdict` and renders a `VerdictCard` at the top when present.
- Spinner state when parse is done but verdict still pending.

### `AddApplicationModal`

Accepts a new `verdict` prop and `verdictLoading` prop. Renders `VerdictCard` above the form fields:

- **strong_fit** → green bar, "Strong Fit" badge.
- **fit** → green-ish (slightly softer), "Good Fit" badge.
- **stretch** → amber, "Stretch" badge.
- **weak_fit** → red/amber, "Weak Fit" badge.

Layout:
- Badge + score (e.g., `87/100`) on the first row.
- Reasoning paragraph below.
- Two columns: "What's working" (green_flags) and "Watch out for" (red_flags). Shown only when the respective array is non-empty.

If verdict is still loading, show a skeleton with a spinner and text "Snag is sizing up this role…".

If verdict failed (mutation error), show a tiny muted note: "Couldn't size up this role — save or edit manually." Don't block.

## Data Model

No schema change. No `applications` column added for the verdict — it's ephemeral.

## Event Logging (F1 integration)

One new event type:

- `verdict.generated` — payload:
  - `verdict` (enum)
  - `score` (int)
  - `host` (string — domain of URL)
  - `jd_length_bucket` (from `lengthBucket`)
  - `has_base_resume` (bool)

Future analyses (across all users with opt-in):
- "response rate by verdict tier" once `application.status_changed → interviewing` data accrues
- "verdict calibration" against closed outcomes

## Gating & Cost

No user quota. `expensiveLimiter` handles abuse (same rate cap as other Haiku endpoints like `/applications/parse-url`).

Cost per verdict: ~5K input tokens + ~400 output ≈ $0.0015 on Haiku 4.5. At 50 verdicts/day/user for heavy users: $2/month. Negligible.

## Error Handling

- `ANTHROPIC_API_KEY` missing → 503.
- Empty JD → neutral `stretch` fallback with honest reasoning ("Couldn't read the posting; fit estimate is uncertain.").
- Model returns non-JSON / missing fields → 500 with error body; UI shows muted "Couldn't size up" text but doesn't block the add flow.
- URL fetch timeout (12s in `fetchJobDescription`) → treated as empty JD → neutral fallback.
- User has no base resume yet → still run the verdict; prompt notes the absence; verdict will lean on target_roles only.

## Testing

Manual smoke post-deploy:

1. Paste a LinkedIn-looking job URL for a role clearly in your target_roles. Modal opens; verdict renders as strong_fit or fit with relevant green flags.
2. Paste a URL for a role clearly outside your target (e.g., "Senior iOS Engineer" when you're a COO) → verdict renders weak_fit.
3. Paste a URL that 404s → modal still opens (parse-url falls back), verdict shows neutral stretch.
4. Query: `SELECT event_type, payload FROM product_events WHERE event_type = 'verdict.generated' ORDER BY created_at DESC LIMIT 5;` — verify payloads.
5. Rate-limit: paste 20 URLs in rapid succession as a non-admin user — `expensiveLimiter` should 429 around the existing threshold.

## File Map

**Created:**
- `src/services/verdict.js` — Haiku call, prompt, parsing
- `src/routes/verdict.js` — POST /applications/verdict

**Modified:**
- `server.js` — mount new route
- `client/src/pages/Applications.jsx` — parallel verdictMutation + pass verdict into modal
- `client/src/pages/Applications.jsx` (same file) — AddApplicationModal adds VerdictCard
- No validate.js change (reuse existing `parseUrlRequest` schema)
- No migration

## Open Questions Resolved

- **Gated or ungated?** Ungated. Haiku cost is negligible; gating creates friction on a daily-use feature.
- **Verdict persisted?** No. Ephemeral. The product_events row is the only lasting trace.
- **Can verdict auto-populate notes?** Deferred. First version is read-only on the verdict.
- **Different Free vs Pro UX?** No. Same verdict for everyone.

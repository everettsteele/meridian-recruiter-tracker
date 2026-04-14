# Interview Co-pilot Suite — Design

**Date:** 2026-04-13
**Status:** Approved
**Scope:** Three features that bundle into the "Interview Co-pilot" experience surfaced in the Interview Prep tab: **Prep Brief**, **Practice Mode** chat, and **Debrief**. All Pro-gated, all unlock at `status = 'interviewing'`. Calendar-triggered push deferred to a future spec.

## Goal

Turn the Interview Prep tab from a single-mode coaching chat into an end-to-end interview workflow: what to study before, how to practice, and how to process what happened after — all in the application's own expanded row, with full Snag context (resume variant, cover letter, people, notes, dossier).

## Non-Goals

- Google Calendar-triggered notifications / email reminders (future spec, `application_calendar_matches` work).
- Audio/video transcription (user pastes a pre-transcribed text or types notes).
- Interview recording / screen share tooling.
- Cross-application insights like "you blew the behavioral round 3× in a row" (needs F1 data maturity).
- Free tier access. All three pieces stay Pro.

## Data Model

### Migration `011_interview_copilot.sql`

```sql
BEGIN;

-- Mode on application_chats so Coach and Practice streams don't cross-pollute.
ALTER TABLE application_chats
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'coach';

CREATE INDEX IF NOT EXISTS idx_application_chats_app_mode_time
  ON application_chats(application_id, mode, created_at);

-- Pre-interview briefs — one per (tenant, application).
CREATE TABLE IF NOT EXISTS application_prep_briefs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id        UUID NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  likely_questions      JSONB NOT NULL DEFAULT '[]'::jsonb,
  company_research      TEXT,
  resume_highlights     JSONB NOT NULL DEFAULT '[]'::jsonb,
  questions_to_ask      JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  tokens_in             INT NOT NULL DEFAULT 0,
  tokens_out            INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Post-interview debriefs — multiple per application (interview rounds).
CREATE TABLE IF NOT EXISTS application_debriefs (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id        UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  input_text            TEXT NOT NULL,
  summary               TEXT,
  topics_covered        JSONB NOT NULL DEFAULT '[]'::jsonb,
  strengths             JSONB NOT NULL DEFAULT '[]'::jsonb,
  watchouts             JSONB NOT NULL DEFAULT '[]'::jsonb,
  follow_ups            JSONB NOT NULL DEFAULT '[]'::jsonb,
  thank_you_draft       TEXT,
  generated_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  tokens_in             INT NOT NULL DEFAULT 0,
  tokens_out            INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_application_debriefs_app_time
  ON application_debriefs(application_id, created_at DESC);

COMMIT;
```

Mode enum validation happens at the application layer (zod schema) — keeping the DB column flexible for future modes.

## Feature 1: Prep Brief

One-shot structured document generated per application, shown at the top of the Interview Prep tab.

### Service (`src/services/prepBrief.js`)

Exports:

```js
buildPrepBrief({ userId, app, jdText, resumeText, dossier, contacts, profile }) → prepBrief
```

One Sonnet call. Structured JSON output:

```json
{
  "likely_questions": ["10 specific questions grounded in the JD + role"],
  "company_research": "A compact narrative combining public info with what's in the dossier, if any.",
  "resume_highlights": ["5-8 bullets of what to emphasize given the role"],
  "questions_to_ask": ["5-8 questions the candidate should ask the interviewer"]
}
```

Size-capped on output validation (questions max 200 chars each, 15 max per list; company_research max 2000 chars). Persisted via an upsert accessor in `src/db/store.js`.

**Prompt construction** pulls from the same context block as the chat (cover letter, resume variant, JD, people, notes) plus the company dossier if one exists. Dossier injection is explicit — "Here's what we already know about the company: {summary + facts}" — so the brief builds on Snag's intelligence rather than duplicating it.

**Fallback** when JD text is missing or < 200 chars: return a neutral structure pointing the user to add context.

### Route

- `GET /applications/:id/prep-brief` — returns existing brief or `null`. Always free read, same Pro gate as the chat for consistency (Pro + interviewing).
- `POST /applications/:id/prep-brief/build` — generates or regenerates. Gated by `expensiveLimiter`; no weekly quota (one per app, rare). Body: `{ refresh: true }` to force regenerate. Without `refresh`, returns the cached brief if one exists.

### UI

In the Interview Prep tab, above the chat panel:
- **No brief yet** → button "Build prep brief" (same style as the dossier "Build" CTA).
- **Brief exists** → collapsible card with four sections (Likely questions / Company research / Highlights / Questions to ask). Each section is collapsible individually. Small "Regenerate" affordance at the top-right of the card.
- Spinner state while building.

Remembered collapsed state per application via localStorage key `prep-brief-open:{appId}`.

## Feature 2: Practice Mode

A mode toggle on the existing interview chat. Flips the system prompt from "coach" to "interviewer."

### Schema Impact

`application_chats.mode` column introduced in the migration. Values: `'coach'` (existing behavior, the default) and `'practice'` (new).

Queries that fetch history now filter by mode so Coach conversations and Practice conversations don't bleed into each other's context windows.

### Service / Prompt

Extend the existing `buildInterviewChatSystemPrompt(ctx)` in `src/services/anthropic.js` to accept a `mode` argument:

- `mode === 'coach'` → today's prompt (unchanged).
- `mode === 'practice'` → new prompt instructing Claude to play a skeptical hiring manager. Rules:
  - Ask ONE question per turn. Behavioral, technical, or situational — appropriate to the role.
  - Grade progressively harder as the candidate warms up.
  - After each candidate response, deliver two things in this order: **Feedback** (one short paragraph — what worked, what to sharpen) + **Follow-up question** (one question). Always both.
  - If the candidate's answer is vague, push for specifics. If they use a fact from the resume well, acknowledge it.
  - Never invent resume facts the candidate doesn't have.

### Route

Extend `POST /applications/:id/chat` and `GET /applications/:id/chat` with an optional `mode` parameter:

- **GET** — optional `?mode=coach|practice` query. Default `coach`. Returns only messages matching that mode. Also returns `{ modes: { coach: { turn_count, cap }, practice: { turn_count, cap } } }` so UI can show the 80-turn counter per mode.
- **POST** — optional `mode` in body. Default `coach`. 80-turn cap applied per-mode. Rejected if not Pro, not interviewing, or cap reached on the selected mode.

Same `application_chats` table; new rows get the `mode` column set.

### UI

Existing `InterviewChat.jsx` gets a mode switch in its header (just above the scrollable message list):

- Two buttons: "Coach" / "Practice" — pill-segmented control.
- Clicking switches which history is loaded (separate React Query key per mode, e.g., `['app-chat', appId, mode]`).
- Below input: "Coach N/80 turns" or "Practice N/80 turns" depending on active mode.
- Suggestion chips adapt:
  - Coach mode (today's): "Generate 10 likely questions", "Rehearse behavioral answers", "Research X" (if interviewer exists).
  - Practice mode: "Start with behavioral", "Hit me with a tough case", "Focus on the role's hardest question".

### Cost

Practice mode consumes the same Sonnet/turn budget as Coach. Each message is a full round-trip with cached system prompt, ~$0.006/turn once cached.

## Feature 3: Debrief

A post-interview button that captures what happened, produces a structured summary, and drafts a thank-you email.

### Service (`src/services/debrief.js`)

Exports:

```js
buildDebrief({ userId, app, transcriptText, resumeText, jdText, contacts, profile }) → debrief
```

One Sonnet call, structured JSON:

```json
{
  "summary": "3-5 sentence narrative of the interview.",
  "topics_covered": ["up to 10 one-line topic labels"],
  "strengths": ["up to 5 things the candidate did well"],
  "watchouts": ["up to 5 concerns to address next round"],
  "follow_ups": ["up to 5 actions the candidate should take"],
  "thank_you_draft": "200-350 word thank-you email, ready to send. Addressed to the primary interviewer if one is known."
}
```

Size caps same shape as prep brief. Persisted to `application_debriefs`.

Prompt references: the JD, the candidate's resume variant, the contacts list (for name/title to thank), the cover letter (to echo themes).

### Route

- `GET /applications/:id/debriefs` — list (newest first).
- `POST /applications/:id/debriefs` — body `{ transcript }` (string, 500-20000 chars). Rate-limited. Returns the full debrief including thank_you_draft.
- `DELETE /applications/:id/debriefs/:debriefId` — removes a debrief.

Pro-gated. No weekly quota (rare, per-interview).

### Side Effects

On successful debrief creation, append to the application's `activity` array:

```js
{ date: today, type: 'debrief_logged', note: summary.slice(0, 200) }
```

So the Timeline tab shows the debrief automatically. The full debrief lives in the Debriefs panel below the chat.

### UI

Interview Prep tab gets a third section below the chat: **Debriefs**. List of existing debriefs (most recent first, expandable cards). Each shows:
- Created date
- Summary paragraph
- Topics covered (chips)
- Strengths / Watchouts / Follow-ups (two-column layout)
- Thank-you draft in a copyable code-style block with a "Copy" button

"Log a debrief" button at the top of this section opens a modal with a large textarea ("Paste transcript or type notes..."). Submit button calls `POST /debriefs`. Shows spinner → on success the new debrief appears in the list, expanded by default.

## Event Logging

New event types (F1):

- `prep_brief.built` — payload: `{ has_dossier, has_resume, jd_length_bucket, tokens_in, tokens_out, refresh: bool }`
- `prep_brief.viewed` — payload: `{ age_days }` — fires on first view per session (debounced client-side via localStorage).
- `practice_chat.turn` — payload: `{ turn_number, tokens_in, tokens_out }` — mirrors `interview_chat.turn` for Coach mode.
- `debrief.logged` — payload: `{ transcript_length_bucket, tokens_in, tokens_out, followup_count, strength_count, watchout_count, has_thank_you }`
- `debrief.thank_you_copied` — payload: `{ debrief_id_hash }` — fires when user clicks the Copy button on the thank-you draft.

## Gating

All three features: **Pro-required** AND **`status === 'interviewing'`** (same gates as existing chat). Mirror the 403 + `{ upgrade: true }` response pattern.

Rate limits: `expensiveLimiter` on all three generation endpoints (build brief, post chat turn, post debrief). No per-feature weekly quota — these are per-interview events, naturally rare.

## Cost Envelope

Per interview (one pass through the suite):

- Prep Brief generation: ~8K in + 2K out Sonnet ≈ $0.04
- Practice Mode: assume 10-turn session ≈ 10 × $0.006 cached = $0.06
- Debrief: ~5K in (transcript) + 1.5K out ≈ $0.03

Total per interview ≈ **$0.13**. At an active Pro user averaging 2 interviews/week, that's ~$1.10/month/user in Sonnet cost. Well within Pro margin.

## Error Handling

- `ANTHROPIC_API_KEY` missing on any generation endpoint → 503.
- Sonnet returns non-JSON → 500 with parse-failed message. UI shows "Something went wrong generating — try again." with a retry button; doesn't destroy user state.
- Short transcript (< 500 chars) on debrief POST → 422 with "Transcript too short to summarize."
- Concurrent prep-brief builds → last write wins via `ON CONFLICT DO UPDATE` on the unique `application_id`.
- Practice mode cap hit on a single mode doesn't block the other mode (separate counters).

## Testing

Manual post-deploy:

1. Move an app to Interviewing. Open Interview Prep tab. Three sections visible: Prep Brief (empty state with Build button), Chat (with Coach/Practice toggle), Debriefs (empty).
2. Click Build Prep Brief → brief renders within ~5 seconds with all four sections. DB check: `SELECT * FROM application_prep_briefs WHERE application_id = '...'` returns one row.
3. Toggle to Practice. Send "Start with behavioral." Claude asks a behavioral question. Respond. Claude gives feedback + a follow-up.
4. Toggle to Coach. History is separate — no practice messages visible.
5. Paste a sample transcript into Log Debrief modal. Submit. Debrief card appears with summary, chips, columns, and thank-you draft. Activity timeline has new `debrief_logged` entry.
6. Copy the thank-you draft. Event logged.
7. Delete the debrief. Card removed; activity entry remains (history preserved).
8. Try all three features as a Free user on an interviewing app → all gated with upgrade CTA.
9. Verify `product_events` table has all new event types.

## File Map

**Created:**
- `src/db/migrations/011_interview_copilot.sql`
- `src/services/prepBrief.js`
- `src/services/debrief.js`
- `src/routes/prepBrief.js`
- `src/routes/debrief.js`

**Modified:**
- `src/db/store.js` — prep brief get/upsert, debrief list/create/delete
- `src/middleware/validate.js` — schemas for debrief + prep-brief + chat mode
- `src/routes/applications-chat.js` — accept `mode` in GET query + POST body
- `src/services/anthropic.js` — `buildInterviewChatSystemPrompt` accepts `mode`, adds practice prompt
- `server.js` — mount prepBrief + debrief routes
- `client/src/components/applications/InterviewChat.jsx` — mode toggle + separate history per mode
- `client/src/components/applications/ApplicationRow.jsx` — InterviewTab renders PrepBriefCard + InterviewChat + DebriefList (split or keep inline, implementer's call)

**New client components** (placed in `client/src/components/applications/`):
- `PrepBriefCard.jsx` — the collapsible prep brief UI
- `DebriefList.jsx` + `DebriefLogModal.jsx` — debrief display + capture modal

## Open Questions Resolved

- **Calendar nudges?** Deferred. Future spec once matching is solid.
- **Practice mode shared or separate stream?** Separate — `mode` column gates history queries. Cleaner UX, cleaner context windows.
- **Multiple debriefs per app?** Yes. Most apps have 2-4 interview rounds. Each debrief is independent; timeline captures all of them.
- **Thank-you draft auto-sent?** No. Always copy-to-clipboard. Snag never sends email for the user in this feature.
- **Prep brief auto-build on status change to 'interviewing'?** Deferred. First build is explicit to avoid AI spend on apps users may never actually interview for.

# Interview Co-pilot Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three features on the Interview Prep tab — Prep Brief, Practice Mode chat toggle, and Debrief — so Pro users get an end-to-end co-pilot workflow from pre-interview to post-interview on any application in `status=interviewing`.

**Architecture:** Migration 011 adds a `mode` column to `application_chats` plus two new tables (`application_prep_briefs`, `application_debriefs`). Two new service modules (`prepBrief.js`, `debrief.js`) each own one Sonnet call with strict JSON parsing. Two new route modules (`prepBrief.js`, `debrief.js`). The existing `applications-chat.js` is extended to accept a `mode` parameter. Frontend adds three small new components alongside the existing `InterviewChat.jsx`: `PrepBriefCard`, `DebriefList`, `DebriefLogModal`. The Interview Prep tab becomes a stacked layout (brief on top, chat in middle, debrief list on bottom).

**Tech Stack:** Node/Express 4, PostgreSQL (pg), Anthropic SDK (`claude-sonnet-4-6`), React 19, @tanstack/react-query, Tailwind 4, Vite 6. No new deps.

---

## File Map

**Created:**
- `src/db/migrations/011_interview_copilot.sql`
- `src/services/prepBrief.js`
- `src/services/debrief.js`
- `src/routes/prepBrief.js`
- `src/routes/debrief.js`
- `client/src/components/applications/PrepBriefCard.jsx`
- `client/src/components/applications/DebriefList.jsx`
- `client/src/components/applications/DebriefLogModal.jsx`

**Modified:**
- `src/db/store.js` — prep brief get/upsert, debrief list/create/delete
- `src/middleware/validate.js` — debrief + chat-mode schemas
- `src/services/anthropic.js` — `buildInterviewChatSystemPrompt` accepts `mode`
- `src/routes/applications-chat.js` — mode param on GET + POST
- `server.js` — mount new routes
- `client/src/components/applications/InterviewChat.jsx` — mode toggle + per-mode history
- `client/src/components/applications/ApplicationRow.jsx` — Interview tab renders PrepBriefCard + InterviewChat + DebriefList

---

## Task 1: Migration 011

**Files:**
- Create: `src/db/migrations/011_interview_copilot.sql`

- [ ] **Step 1: Write the migration**

Create `/Users/everettsteele/PROJECTS/snag-jobs/src/db/migrations/011_interview_copilot.sql`:

```sql
-- 011_interview_copilot.sql
-- Interview Co-pilot Suite: prep briefs, debriefs, chat mode column.

BEGIN;

-- Coach vs Practice mode on chat messages.
ALTER TABLE application_chats
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'coach';

CREATE INDEX IF NOT EXISTS idx_application_chats_app_mode_time
  ON application_chats(application_id, mode, created_at);

-- One prep brief per application.
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

-- Many debriefs per application (multiple interview rounds).
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

- [ ] **Step 2: Balance check**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  grep -c "BEGIN;" src/db/migrations/011_interview_copilot.sql && \
  grep -c "COMMIT;" src/db/migrations/011_interview_copilot.sql
```

Expected: `1` then `1`.

- [ ] **Step 3: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add src/db/migrations/011_interview_copilot.sql && \
  git commit -m "feat: migration 011 — chats.mode column + prep_briefs + debriefs"
```

DO NOT push.

---

## Task 2: Validation schemas

**Files:**
- Modify: `src/middleware/validate.js`

- [ ] **Step 1: Add new schemas**

Open `/Users/everettsteele/PROJECTS/snag-jobs/src/middleware/validate.js`. Find the existing `chatMessageRequest` schema. Replace it and add the new schemas:

Find:
```js
const chatMessageRequest = z.object({
  message: z.string().min(1).max(4000),
});
```

Replace with:
```js
const VALID_CHAT_MODES = ['coach', 'practice'];

const chatMessageRequest = z.object({
  message: z.string().min(1).max(4000),
  mode: z.enum(VALID_CHAT_MODES).optional().default('coach'),
});

const debriefCreateRequest = z.object({
  transcript: z.string().min(500).max(20000),
});

const prepBriefBuildRequest = z.object({
  refresh: z.boolean().optional(),
});
```

- [ ] **Step 2: Add all three schemas + the enum array to module.exports**

Find the existing `module.exports = {` block. Add the new schemas to the `schemas` sub-object and the enum array at the top-level:

```js
module.exports = {
  validate,
  schemas: {
    // ...existing schemas...
    chatMessageRequest,
    debriefCreateRequest,
    prepBriefBuildRequest,
  },
  // ...existing enum exports (VALID_APP_STATUSES, etc.)...
  VALID_CHAT_MODES,
};
```

Preserve all existing schemas and exports.

- [ ] **Step 3: Syntax + smoke**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  node -c src/middleware/validate.js && \
  node -e "const m = require('./src/middleware/validate'); console.log('modes:', m.VALID_CHAT_MODES); console.log('debrief:', typeof m.schemas.debriefCreateRequest.parse); console.log('prep:', typeof m.schemas.prepBriefBuildRequest.parse); console.log('chat parse with mode:', JSON.stringify(m.schemas.chatMessageRequest.parse({message:'hi',mode:'practice'})));" && \
  echo OK
```

Expected:
```
modes: [ 'coach', 'practice' ]
debrief: function
prep: function
chat parse with mode: {"message":"hi","mode":"practice"}
OK
```

- [ ] **Step 4: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add src/middleware/validate.js && \
  git commit -m "feat: zod schemas for chat mode, debrief, prep-brief build"
```

---

## Task 3: Store accessors for prep brief + debrief

**Files:**
- Modify: `src/db/store.js`

- [ ] **Step 1: Add accessors above `module.exports`**

Open `/Users/everettsteele/PROJECTS/snag-jobs/src/db/store.js`. Just above the `module.exports = {` block, add:

```js
// ================================================================
// APPLICATION PREP BRIEFS (one per app)
// ================================================================

async function getApplicationPrepBrief(tenantId, applicationId) {
  const { rows } = await query(
    `SELECT * FROM application_prep_briefs WHERE tenant_id = $1 AND application_id = $2`,
    [tenantId, applicationId]
  );
  return rows[0] || null;
}

async function upsertApplicationPrepBrief(tenantId, applicationId, data) {
  const { rows } = await query(
    `INSERT INTO application_prep_briefs
       (tenant_id, application_id, likely_questions, company_research,
        resume_highlights, questions_to_ask, generated_by_user_id,
        tokens_in, tokens_out, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6::jsonb, $7, $8, $9, NOW())
     ON CONFLICT (application_id) DO UPDATE
       SET likely_questions = EXCLUDED.likely_questions,
           company_research = EXCLUDED.company_research,
           resume_highlights = EXCLUDED.resume_highlights,
           questions_to_ask = EXCLUDED.questions_to_ask,
           generated_by_user_id = EXCLUDED.generated_by_user_id,
           tokens_in = EXCLUDED.tokens_in,
           tokens_out = EXCLUDED.tokens_out,
           updated_at = NOW()
     RETURNING *`,
    [
      tenantId, applicationId,
      JSON.stringify(data.likely_questions || []),
      data.company_research || null,
      JSON.stringify(data.resume_highlights || []),
      JSON.stringify(data.questions_to_ask || []),
      data.generated_by_user_id || null,
      data.tokens_in || 0,
      data.tokens_out || 0,
    ]
  );
  return rows[0];
}

// ================================================================
// APPLICATION DEBRIEFS (many per app)
// ================================================================

async function listApplicationDebriefs(tenantId, applicationId) {
  const { rows } = await query(
    `SELECT id, application_id, input_text, summary, topics_covered,
            strengths, watchouts, follow_ups, thank_you_draft,
            tokens_in, tokens_out, created_at
       FROM application_debriefs
      WHERE tenant_id = $1 AND application_id = $2
      ORDER BY created_at DESC`,
    [tenantId, applicationId]
  );
  return rows;
}

async function createApplicationDebrief(tenantId, applicationId, data) {
  const { rows } = await query(
    `INSERT INTO application_debriefs
       (tenant_id, application_id, input_text, summary, topics_covered,
        strengths, watchouts, follow_ups, thank_you_draft,
        generated_by_user_id, tokens_in, tokens_out)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12)
     RETURNING *`,
    [
      tenantId, applicationId,
      data.input_text,
      data.summary || null,
      JSON.stringify(data.topics_covered || []),
      JSON.stringify(data.strengths || []),
      JSON.stringify(data.watchouts || []),
      JSON.stringify(data.follow_ups || []),
      data.thank_you_draft || null,
      data.generated_by_user_id || null,
      data.tokens_in || 0,
      data.tokens_out || 0,
    ]
  );
  return rows[0];
}

async function deleteApplicationDebrief(tenantId, debriefId) {
  const { rowCount } = await query(
    `DELETE FROM application_debriefs WHERE tenant_id = $1 AND id = $2`,
    [tenantId, debriefId]
  );
  return rowCount > 0;
}

async function getApplicationDebrief(tenantId, debriefId) {
  const { rows } = await query(
    `SELECT * FROM application_debriefs WHERE tenant_id = $1 AND id = $2`,
    [tenantId, debriefId]
  );
  return rows[0] || null;
}
```

Extend `module.exports`:

```js
  getApplicationPrepBrief,
  upsertApplicationPrepBrief,
  listApplicationDebriefs,
  createApplicationDebrief,
  deleteApplicationDebrief,
  getApplicationDebrief,
```

- [ ] **Step 2: Smoke**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  node -c src/db/store.js && \
  node -e "const s = require('./src/db/store'); console.log('fns:', typeof s.getApplicationPrepBrief, typeof s.upsertApplicationPrepBrief, typeof s.listApplicationDebriefs, typeof s.createApplicationDebrief, typeof s.deleteApplicationDebrief, typeof s.getApplicationDebrief);" && \
  echo OK
```

Expected: six `function` entries + `OK`.

- [ ] **Step 3: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add src/db/store.js && \
  git commit -m "feat: prep-brief + debrief store accessors"
```

---

## Task 4: Extend buildInterviewChatSystemPrompt for Practice mode

**Files:**
- Modify: `src/services/anthropic.js`

- [ ] **Step 1: Update the function to accept a mode**

Open `/Users/everettsteele/PROJECTS/snag-jobs/src/services/anthropic.js`. Find `function buildInterviewChatSystemPrompt(ctx)`. The current first line of the function body destructures `ctx`. Change the destructure to also pull `mode` with a default, and branch the opening prompt block based on it.

Current signature and opening:

```js
function buildInterviewChatSystemPrompt(ctx) {
  const {
    app, jdText, resumeText, coverLetter, profile, contacts, notes, activity,
  } = ctx;
  const fullName = profile?.full_name || profile?.fullName || 'the candidate';
  ...
  return `You are a focused interview prep coach for ${fullName}. They are interviewing for the ${app.role} role at ${app.company}. Use the context below to help them prepare specific answers, anticipate questions, and research the people interviewing them. Ground every answer in the resume and cover letter facts — never invent experience. When they ask to practice, act as the interviewer.

ROLE: ...
```

Change to:

```js
function buildInterviewChatSystemPrompt(ctx) {
  const {
    app, jdText, resumeText, coverLetter, profile, contacts, notes, activity,
    mode,
  } = ctx;
  const fullName = profile?.full_name || profile?.fullName || 'the candidate';
```

Find the existing `return` statement that starts with `` `You are a focused interview prep coach...` ``. Replace the top (through the `ROLE:` line — but NOT the rest of the context block) with a mode-sensitive opening. Keep everything from `ROLE: ${app.role}` onward identical.

The easiest approach is to assemble the opening paragraph as a variable, then splice it in. Replace the whole `return` statement with:

```js
  const openingCoach = `You are a focused interview prep coach for ${fullName}. They are interviewing for the ${app.role} role at ${app.company}. Use the context below to help them prepare specific answers, anticipate questions, and research the people interviewing them. Ground every answer in the resume and cover letter facts — never invent experience. When they ask to practice, act as the interviewer.`;

  const openingPractice = `You are a skeptical hiring manager interviewing ${fullName} for the ${app.role} role at ${app.company}. Your job is to conduct a mock interview.

RULES:
- Ask ONE question per turn. Start behavioral or role-specific; escalate difficulty as the candidate warms up.
- After each candidate response, deliver your turn in this exact order:
  1. FEEDBACK: one short paragraph — what worked, what to sharpen. Be direct, specific, kind.
  2. FOLLOW-UP: one next question.
- Push for specifics when the answer is vague ("give me a number", "who was involved", "what happened next").
- Acknowledge when the candidate uses a fact from the resume well.
- NEVER invent experience or facts the candidate doesn't have in their resume.
- Keep each feedback paragraph under 80 words. Keep each question under 40 words.`;

  const opening = mode === 'practice' ? openingPractice : openingCoach;

  return `${opening}

ROLE: ${app.role}
COMPANY: ${app.company}

JOB DESCRIPTION:
${(jdText || '(not available)').slice(0, 4000)}

CANDIDATE:
Name: ${fullName}
Background: ${background}
Target roles: ${targetRoles}

RESUME (variant they submitted for this app):
${(resumeText || '(no resume attached)').slice(0, 4000)}

COVER LETTER:
${(coverLetter || '(none)').slice(0, 2000)}

PEOPLE ON THIS APPLICATION:
${contactsBlock}

RECENT NOTES:
${notes || '(none)'}

RECENT ACTIVITY:
${activityBlock}`;
}
```

(The `background`, `targetRoles`, `contactsBlock`, `activityBlock` variables already exist from the current function — don't redefine them.)

- [ ] **Step 2: Syntax + smoke**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  node -c src/services/anthropic.js && \
  node -e "
    const { buildInterviewChatSystemPrompt } = require('./src/services/anthropic');
    const ctx = {
      app: { role: 'PM', company: 'Acme' },
      jdText: 'role text here'.padEnd(500, ' '),
      resumeText: '', coverLetter: '', profile: {}, contacts: [], notes: '', activity: [],
      mode: 'coach',
    };
    const coach = buildInterviewChatSystemPrompt(ctx);
    const practice = buildInterviewChatSystemPrompt({ ...ctx, mode: 'practice' });
    console.log('coach starts with:', coach.slice(0, 40));
    console.log('practice starts with:', practice.slice(0, 40));
  " && echo OK
```

Expected: the two prompts begin with different text (coach starts with "You are a focused interview prep coach", practice starts with "You are a skeptical hiring manager"). Then `OK`.

- [ ] **Step 3: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add src/services/anthropic.js && \
  git commit -m "feat: buildInterviewChatSystemPrompt accepts mode (coach vs practice)"
```

---

## Task 5: Update chat route to accept mode

**Files:**
- Modify: `src/routes/applications-chat.js`

- [ ] **Step 1: Read the file and plan the edits**

Open `/Users/everettsteele/PROJECTS/snag-jobs/src/routes/applications-chat.js`. The GET and POST handlers both query `db.listChatMessages(req.user.tenantId, req.params.id)` which returns ALL messages regardless of mode. We need to filter by mode on both.

### Step 2: Add a mode-aware DB helper in store.js

Open `/Users/everettsteele/PROJECTS/snag-jobs/src/db/store.js`. Find the existing `listChatMessages` function. Replace it with a version that accepts an optional mode filter:

Before:
```js
async function listChatMessages(tenantId, applicationId) {
  const { rows } = await query(
    `SELECT id, role, content, tokens_in, tokens_out, created_at
       FROM application_chats
      WHERE tenant_id = $1 AND application_id = $2
      ORDER BY created_at ASC`,
    [tenantId, applicationId]
  );
  return rows;
}
```

After:
```js
async function listChatMessages(tenantId, applicationId, mode) {
  const params = [tenantId, applicationId];
  let modeClause = '';
  if (mode) { modeClause = 'AND mode = $3'; params.push(mode); }
  const { rows } = await query(
    `SELECT id, role, content, mode, tokens_in, tokens_out, created_at
       FROM application_chats
      WHERE tenant_id = $1 AND application_id = $2 ${modeClause}
      ORDER BY created_at ASC`,
    params
  );
  return rows;
}
```

Also update `countChatTurns` to accept mode similarly:

Before:
```js
async function countChatTurns(tenantId, applicationId) {
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM application_chats
      WHERE tenant_id = $1 AND application_id = $2 AND role = 'user'`,
    [tenantId, applicationId]
  );
  return rows[0]?.n || 0;
}
```

After:
```js
async function countChatTurns(tenantId, applicationId, mode) {
  const params = [tenantId, applicationId];
  let modeClause = '';
  if (mode) { modeClause = 'AND mode = $3'; params.push(mode); }
  const { rows } = await query(
    `SELECT COUNT(*)::int AS n FROM application_chats
      WHERE tenant_id = $1 AND application_id = $2 AND role = 'user' ${modeClause}`,
    params
  );
  return rows[0]?.n || 0;
}
```

Update `appendChatMessage` to take a mode:

Before:
```js
async function appendChatMessage(tenantId, applicationId, role, content, tokensIn, tokensOut) {
  const { rows } = await query(
    `INSERT INTO application_chats
       (tenant_id, application_id, role, content, tokens_in, tokens_out)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [tenantId, applicationId, role, content, tokensIn || 0, tokensOut || 0]
  );
  return rows[0];
}
```

After:
```js
async function appendChatMessage(tenantId, applicationId, role, content, tokensIn, tokensOut, mode) {
  const { rows } = await query(
    `INSERT INTO application_chats
       (tenant_id, application_id, role, content, tokens_in, tokens_out, mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [tenantId, applicationId, role, content, tokensIn || 0, tokensOut || 0, mode || 'coach']
  );
  return rows[0];
}
```

### Step 3: Update GET /applications/:id/chat to accept mode query param

In `src/routes/applications-chat.js`, find the GET handler:

```js
router.get('/applications/:id/chat', requireAuth, async (req, res) => {
  const app = await db.getApplication(req.user.tenantId, req.params.id);
  if (!app || app.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });

  const messages = await db.listChatMessages(req.user.tenantId, req.params.id);
  const turnCount = messages.filter((m) => m.role === 'user').length;
  res.json({ messages, turn_count: turnCount, cap: CHAT_TURN_CAP });
});
```

Replace with:

```js
router.get('/applications/:id/chat', requireAuth, async (req, res) => {
  const app = await db.getApplication(req.user.tenantId, req.params.id);
  if (!app || app.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });

  const mode = req.query.mode === 'practice' ? 'practice' : 'coach';
  const messages = await db.listChatMessages(req.user.tenantId, req.params.id, mode);
  const turnCount = messages.filter((m) => m.role === 'user').length;
  res.json({ messages, mode, turn_count: turnCount, cap: CHAT_TURN_CAP });
});
```

### Step 4: Update POST /applications/:id/chat to accept mode

In the same file, find the POST handler. The validation line currently reads `validate(schemas.chatMessageRequest)`. That schema now accepts `mode` (from Task 2). Inside the handler:

Find where the turn count is computed:

```js
  const turnCount = await db.countChatTurns(req.user.tenantId, req.params.id);
  if (turnCount >= CHAT_TURN_CAP) {
    return res.status(429).json({ error: 'Chat history full — clear to continue', cap: CHAT_TURN_CAP });
  }
```

Replace with:

```js
  const mode = req.body.mode === 'practice' ? 'practice' : 'coach';
  const turnCount = await db.countChatTurns(req.user.tenantId, req.params.id, mode);
  if (turnCount >= CHAT_TURN_CAP) {
    return res.status(429).json({ error: 'Chat history full — clear to continue', cap: CHAT_TURN_CAP, mode });
  }
```

Find the system prompt build:

```js
  const systemPrompt = buildInterviewChatSystemPrompt({
    app,
    jdText,
    resumeText,
    coverLetter: app.cover_letter_text || '',
    profile: req.user.profile || {},
    contacts,
    notes: app.notes || '',
    activity: Array.isArray(app.activity) ? app.activity : [],
  });
```

Replace with:

```js
  const systemPrompt = buildInterviewChatSystemPrompt({
    app,
    jdText,
    resumeText,
    coverLetter: app.cover_letter_text || '',
    profile: req.user.profile || {},
    contacts,
    notes: app.notes || '',
    activity: Array.isArray(app.activity) ? app.activity : [],
    mode,
  });
```

Find the history fetch:

```js
  const history = await db.listChatMessages(req.user.tenantId, app.id);
```

Replace with:

```js
  const history = await db.listChatMessages(req.user.tenantId, app.id, mode);
```

Find the two `db.appendChatMessage` calls:

```js
  await db.appendChatMessage(req.user.tenantId, app.id, 'user', req.body.message, 0, 0);
  ...
  const stored = await db.appendChatMessage(req.user.tenantId, app.id, 'assistant', reply, tokensIn, tokensOut);
```

Replace both with mode-aware versions:

```js
  await db.appendChatMessage(req.user.tenantId, app.id, 'user', req.body.message, 0, 0, mode);
  ...
  const stored = await db.appendChatMessage(req.user.tenantId, app.id, 'assistant', reply, tokensIn, tokensOut, mode);
```

Find the existing `logAiUsage` call:

```js
  await logAiUsage(req.user.tenantId, req.user.id, 'interview_chat', tokensIn + tokensOut, {
    company: app.company, role: app.role,
  });
```

Add the mode so practice and coach usage can be split in analytics:

```js
  await logAiUsage(req.user.tenantId, req.user.id, 'interview_chat', tokensIn + tokensOut, {
    company: app.company, role: app.role, mode,
  });
```

Find the final turn count + response:

```js
  const newTurnCount = await db.countChatTurns(req.user.tenantId, app.id);
  res.json({
    id: stored.id,
    reply,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    turn_count: newTurnCount,
    cap: CHAT_TURN_CAP,
  });
```

Replace with:

```js
  const newTurnCount = await db.countChatTurns(req.user.tenantId, app.id, mode);
  res.json({
    id: stored.id,
    reply,
    mode,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
    turn_count: newTurnCount,
    cap: CHAT_TURN_CAP,
  });
```

Also update the `logEvent` call so the product_events stream distinguishes practice turns. Find:

```js
  logEvent(req.user.tenantId, req.user.id, 'interview_chat.turn', {
    entityType: 'application',
    entityId: app.id,
    payload: {
      turn_number: newTurnCount,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      contact_count: Array.isArray(contacts) ? contacts.length : 0,
    },
  });
```

Replace with a mode-sensitive event name:

```js
  const eventType = mode === 'practice' ? 'practice_chat.turn' : 'interview_chat.turn';
  logEvent(req.user.tenantId, req.user.id, eventType, {
    entityType: 'application',
    entityId: app.id,
    payload: {
      turn_number: newTurnCount,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      contact_count: Array.isArray(contacts) ? contacts.length : 0,
    },
  });
```

- [ ] **Step 5: Syntax + smoke**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  node -c src/routes/applications-chat.js && \
  node -c src/db/store.js && \
  node -e "const s = require('./src/db/store'); console.log('still ok:', typeof s.listChatMessages, typeof s.countChatTurns, typeof s.appendChatMessage);" && \
  echo OK
```

Expected: `still ok: function function function` then `OK`.

- [ ] **Step 6: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add src/routes/applications-chat.js src/db/store.js && \
  git commit -m "feat: chat route and store accessors accept mode (coach | practice)"
```

---

## Task 6: Prep Brief service

**Files:**
- Create: `src/services/prepBrief.js`

- [ ] **Step 1: Create the service**

Create `/Users/everettsteele/PROJECTS/snag-jobs/src/services/prepBrief.js`:

```js
const db = require('../db/store');
const { diagLog } = require('../utils');
const { getCachedDossier } = require('./dossier');

async function buildPrepBrief({ userId, tenantId, app, jdText, resumeText, contacts, profile }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  if (!app) throw new Error('app required');

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Pull dossier if one exists, to enrich the company_research block.
  let dossierBlock = '(no dossier available)';
  try {
    const { companyKey } = require('./dossier');
    const key = companyKey(app.company, app.source_url);
    const dossier = key ? await getCachedDossier(key) : null;
    if (dossier) {
      const facts = Array.isArray(dossier.facts) ? dossier.facts.join('\n- ') : '';
      dossierBlock = `Summary: ${dossier.summary || '(none)'}\nFacts:\n- ${facts}`;
    }
  } catch (_) {}

  const fullName = profile?.full_name || profile?.fullName || 'the candidate';
  const background = profile?.background_text || profile?.backgroundText || '';
  const targetRoles = Array.isArray(profile?.target_roles) ? profile.target_roles.join(', ') : '';
  const contactsBlock = (contacts || []).length
    ? (contacts || []).map(c =>
        `- ${c.name}${c.title ? ` (${c.title})` : ''} — ${c.kind}`
      ).join('\n')
    : '(none recorded)';

  const prompt = `Generate a structured interview prep brief for ${fullName}, interviewing for the ${app.role} role at ${app.company}. Output ONLY a JSON object with this exact shape, no preamble:

{
  "likely_questions": ["10 specific interview questions grounded in the JD + role. Behavioral, technical, situational mix."],
  "company_research": "Compact 3-5 sentence narrative about the company, incorporating the dossier below if useful.",
  "resume_highlights": ["5-8 specific bullets of what to emphasize given this role. Reference actual resume facts."],
  "questions_to_ask": ["5-8 thoughtful questions for the interviewer that signal real interest and research."]
}

STRICT RULES:
- Ground every item in the JD, resume, or dossier text provided. DO NOT invent company facts, resume bullets, or role requirements.
- likely_questions: each under 200 chars.
- company_research: plain prose paragraph, under 2000 chars.
- resume_highlights + questions_to_ask: each bullet under 200 chars.
- If any category is not inferable, return a short generic-but-useful fallback rather than inventing.

ROLE: ${app.role}
COMPANY: ${app.company}

JOB DESCRIPTION:
${(jdText || '(not available)').slice(0, 4000)}

CANDIDATE:
Name: ${fullName}
Background: ${background}
Target roles: ${targetRoles}

CANDIDATE RESUME:
${(resumeText || '(no resume attached)').slice(0, 4000)}

COMPANY DOSSIER:
${dossierBlock}

PEOPLE ON THIS APPLICATION:
${contactsBlock}`;

  let raw = '';
  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });
    raw = (resp.content?.[0]?.text || '').trim();
    var tokensIn = resp.usage?.input_tokens || 0;
    var tokensOut = resp.usage?.output_tokens || 0;
  } catch (e) {
    diagLog('prep brief model error: ' + e.message);
    throw new Error('Prep brief model call failed: ' + e.message);
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    diagLog('prep brief: no JSON block in response');
    throw new Error('Could not parse prep brief from model output');
  }
  let parsed;
  try { parsed = JSON.parse(match[0]); } catch (e) {
    throw new Error('Could not parse prep brief JSON: ' + e.message);
  }

  const clean = (arr, limit) => Array.isArray(arr)
    ? arr.filter(s => typeof s === 'string').slice(0, limit || 15).map(s => s.slice(0, 200))
    : [];

  const brief = await db.upsertApplicationPrepBrief(tenantId, app.id, {
    likely_questions: clean(parsed.likely_questions, 15),
    company_research: String(parsed.company_research || '').slice(0, 2000),
    resume_highlights: clean(parsed.resume_highlights, 12),
    questions_to_ask: clean(parsed.questions_to_ask, 12),
    generated_by_user_id: userId,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
  });
  return brief;
}

module.exports = { buildPrepBrief };
```

- [ ] **Step 2: Smoke (no network)**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  node -c src/services/prepBrief.js && \
  node -e "const s = require('./src/services/prepBrief'); console.log('buildPrepBrief:', typeof s.buildPrepBrief);" && \
  echo OK
```

Expected: `buildPrepBrief: function` then `OK`.

- [ ] **Step 3: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add src/services/prepBrief.js && \
  git commit -m "feat: prep brief service — Sonnet call + dossier-aware prompt"
```

---

## Task 7: Prep Brief route

**Files:**
- Create: `src/routes/prepBrief.js`
- Modify: `server.js`

- [ ] **Step 1: Create the route file**

Create `/Users/everettsteele/PROJECTS/snag-jobs/src/routes/prepBrief.js`:

```js
const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { expensiveLimiter } = require('../middleware/security');
const { validate, schemas } = require('../middleware/validate');
const { isPro, logAiUsage } = require('../middleware/tier');
const db = require('../db/store');
const { fetchJobDescription } = require('../services/anthropic');
const { buildPrepBrief } = require('../services/prepBrief');
const { getResumeVariants } = require('../db/users');
const { logEvent, lengthBucket } = require('../services/events');

const router = Router();

function requireInterviewing(app) {
  return app && app.status === 'interviewing';
}

// GET /applications/:id/prep-brief — returns cached brief or null.
router.get('/applications/:id/prep-brief', requireAuth, async (req, res) => {
  const app = await db.getApplication(req.user.tenantId, req.params.id);
  if (!app || app.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
  if (!isPro(req.user)) {
    return res.status(403).json({ error: 'Interview prep is a Pro feature', upgrade: true });
  }
  if (!requireInterviewing(app)) {
    return res.status(400).json({ error: 'Prep brief unlocks at Interviewing status' });
  }

  const brief = await db.getApplicationPrepBrief(req.user.tenantId, req.params.id);
  res.json({ brief });
});

// POST /applications/:id/prep-brief/build — generate (or regenerate with { refresh: true }).
router.post('/applications/:id/prep-brief/build',
  requireAuth, expensiveLimiter, validate(schemas.prepBriefBuildRequest),
  async (req, res) => {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }
    const app = await db.getApplication(req.user.tenantId, req.params.id);
    if (!app || app.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
    if (!isPro(req.user)) {
      return res.status(403).json({ error: 'Interview prep is a Pro feature', upgrade: true });
    }
    if (!requireInterviewing(app)) {
      return res.status(400).json({ error: 'Prep brief unlocks at Interviewing status' });
    }

    // Return cache unless refresh requested.
    const existing = await db.getApplicationPrepBrief(req.user.tenantId, req.params.id);
    if (existing && !req.body?.refresh) {
      return res.json({ brief: existing, cached: true });
    }

    // Ensure JD cached.
    let jdText = app.jd_text || '';
    if (!jdText && app.source_url) {
      try {
        jdText = await fetchJobDescription(app.source_url);
        if (jdText && jdText.length > 50) {
          await db.setJdText(req.user.tenantId, app.id, jdText);
        }
      } catch (_) {}
    }

    // Load resume variant text.
    let resumeText = '';
    if (app.resume_variant) {
      const variants = await getResumeVariants(req.user.id);
      const v = variants.find(x => x.slug === app.resume_variant);
      resumeText = v?.parsed_text || '';
    }

    const contacts = await db.listApplicationContacts(req.user.tenantId, app.id);

    let brief;
    try {
      brief = await buildPrepBrief({
        userId: req.user.id,
        tenantId: req.user.tenantId,
        app,
        jdText,
        resumeText,
        contacts,
        profile: req.user.profile || {},
      });
    } catch (e) {
      console.error('[prep-brief]', e.message);
      return res.status(500).json({ error: e.message || 'Prep brief generation failed' });
    }

    await logAiUsage(req.user.tenantId, req.user.id, 'prep_brief',
      (brief.tokens_in || 0) + (brief.tokens_out || 0),
      { company: app.company, role: app.role, refresh: !!req.body?.refresh });

    logEvent(req.user.tenantId, req.user.id, 'prep_brief.built', {
      entityType: 'application',
      entityId: app.id,
      payload: {
        has_dossier: false, // best-effort signal; service decides internally. Keep simple.
        has_resume: !!resumeText,
        jd_length_bucket: lengthBucket(jdText),
        tokens_in: brief.tokens_in || 0,
        tokens_out: brief.tokens_out || 0,
        refresh: !!req.body?.refresh,
      },
    });

    res.json({ brief, cached: false });
  });

module.exports = router;
```

### Step 2: Mount in server.js

Open `/Users/everettsteele/PROJECTS/snag-jobs/server.js`. Find the `const verdictRoutes = require('./src/routes/verdict');` require line. Below it add:

```js
const prepBriefRoutes = require('./src/routes/prepBrief');
```

Find the `app.use('/api', verdictRoutes);` mount. Below it add:

```js
app.use('/api', prepBriefRoutes);
```

### Step 3: Syntax + smoke

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  node -c src/routes/prepBrief.js && \
  node -c server.js && \
  node -e "const r = require('./src/routes/prepBrief'); console.log('router:', typeof r);" && \
  echo OK
```

Expected: `router: function` then `OK`.

### Step 4: Commit

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add src/routes/prepBrief.js server.js && \
  git commit -m "feat: GET + POST /applications/:id/prep-brief (Pro + interviewing)"
```

---

## Task 8: Debrief service

**Files:**
- Create: `src/services/debrief.js`

- [ ] **Step 1: Create the service**

Create `/Users/everettsteele/PROJECTS/snag-jobs/src/services/debrief.js`:

```js
const db = require('../db/store');
const { diagLog } = require('../utils');

async function buildDebrief({ userId, tenantId, app, transcriptText, resumeText, jdText, coverLetter, contacts, profile }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  if (!transcriptText || transcriptText.length < 500) {
    throw new Error('Transcript too short to summarize');
  }

  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const fullName = profile?.full_name || profile?.fullName || 'the candidate';
  const firstInterviewer = (contacts || []).find(c => c.kind === 'interviewer') || (contacts || [])[0];
  const thankYouTo = firstInterviewer ? `${firstInterviewer.name}${firstInterviewer.title ? ` (${firstInterviewer.title})` : ''}` : '(the interviewer)';

  const prompt = `Process this interview transcript or note dump into a structured debrief + a ready-to-send thank-you email. The candidate is ${fullName}, interviewing for the ${app.role} role at ${app.company}.

Output ONLY a JSON object with this exact shape:

{
  "summary": "3-5 sentence narrative of how the interview went overall.",
  "topics_covered": ["up to 10 concise topic labels, each under 60 chars"],
  "strengths": ["up to 5 things the candidate did well, specific to this interview"],
  "watchouts": ["up to 5 concerns to address next round or in follow-up"],
  "follow_ups": ["up to 5 specific next actions for the candidate"],
  "thank_you_draft": "200-350 word thank-you email. Addressed to ${thankYouTo}. Natural, specific to topics discussed, not generic. Sign off with a line break and '${fullName}'."
}

STRICT RULES:
- Ground every claim in what's actually in the transcript. DO NOT invent.
- thank_you_draft should reference 1-2 specific things discussed.
- Keep each list item under 200 chars.
- If transcript is sparse, produce shorter/fewer items rather than padding.

ROLE: ${app.role}
COMPANY: ${app.company}

JOB DESCRIPTION (for context):
${(jdText || '(not available)').slice(0, 2000)}

CANDIDATE RESUME (for context):
${(resumeText || '(not attached)').slice(0, 2000)}

COVER LETTER (for context):
${(coverLetter || '(none)').slice(0, 1500)}

TRANSCRIPT / NOTES:
${transcriptText.slice(0, 12000)}`;

  let raw = '';
  let tokensIn = 0, tokensOut = 0;
  try {
    const resp = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1800,
      messages: [{ role: 'user', content: prompt }],
    });
    raw = (resp.content?.[0]?.text || '').trim();
    tokensIn = resp.usage?.input_tokens || 0;
    tokensOut = resp.usage?.output_tokens || 0;
  } catch (e) {
    diagLog('debrief model error: ' + e.message);
    throw new Error('Debrief model call failed: ' + e.message);
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    diagLog('debrief: no JSON block in response');
    throw new Error('Could not parse debrief from model output');
  }
  let parsed;
  try { parsed = JSON.parse(match[0]); } catch (e) {
    throw new Error('Could not parse debrief JSON: ' + e.message);
  }

  const clean = (arr, limit) => Array.isArray(arr)
    ? arr.filter(s => typeof s === 'string').slice(0, limit).map(s => s.slice(0, 200))
    : [];

  const row = await db.createApplicationDebrief(tenantId, app.id, {
    input_text: transcriptText.slice(0, 20000),
    summary: String(parsed.summary || '').slice(0, 2000),
    topics_covered: clean(parsed.topics_covered, 10),
    strengths: clean(parsed.strengths, 5),
    watchouts: clean(parsed.watchouts, 5),
    follow_ups: clean(parsed.follow_ups, 5),
    thank_you_draft: String(parsed.thank_you_draft || '').slice(0, 4000),
    generated_by_user_id: userId,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
  });
  return row;
}

module.exports = { buildDebrief };
```

- [ ] **Step 2: Syntax + smoke**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  node -c src/services/debrief.js && \
  node -e "const s = require('./src/services/debrief'); console.log('buildDebrief:', typeof s.buildDebrief);" && \
  echo OK
```

Expected: `buildDebrief: function` then `OK`.

- [ ] **Step 3: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add src/services/debrief.js && \
  git commit -m "feat: debrief service — Sonnet call + structured output + thank-you draft"
```

---

## Task 9: Debrief route + timeline side effect

**Files:**
- Create: `src/routes/debrief.js`
- Modify: `server.js`

- [ ] **Step 1: Create the route**

Create `/Users/everettsteele/PROJECTS/snag-jobs/src/routes/debrief.js`:

```js
const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { expensiveLimiter } = require('../middleware/security');
const { validate, schemas } = require('../middleware/validate');
const { isPro, logAiUsage } = require('../middleware/tier');
const db = require('../db/store');
const { buildDebrief } = require('../services/debrief');
const { getResumeVariants } = require('../db/users');
const { logEvent, lengthBucket } = require('../services/events');
const { todayET } = require('../utils');

const router = Router();

function requireInterviewing(app) {
  return app && app.status === 'interviewing';
}

// GET /applications/:id/debriefs — list newest first.
router.get('/applications/:id/debriefs', requireAuth, async (req, res) => {
  const app = await db.getApplication(req.user.tenantId, req.params.id);
  if (!app || app.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
  if (!isPro(req.user)) {
    return res.status(403).json({ error: 'Interview debrief is a Pro feature', upgrade: true });
  }
  const rows = await db.listApplicationDebriefs(req.user.tenantId, req.params.id);
  res.json({ debriefs: rows });
});

// POST /applications/:id/debriefs — create a new debrief from transcript text.
router.post('/applications/:id/debriefs',
  requireAuth, expensiveLimiter, validate(schemas.debriefCreateRequest),
  async (req, res) => {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });
    }
    const app = await db.getApplication(req.user.tenantId, req.params.id);
    if (!app || app.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
    if (!isPro(req.user)) {
      return res.status(403).json({ error: 'Interview debrief is a Pro feature', upgrade: true });
    }
    if (!requireInterviewing(app)) {
      return res.status(400).json({ error: 'Debrief unlocks at Interviewing status' });
    }

    let resumeText = '';
    if (app.resume_variant) {
      const variants = await getResumeVariants(req.user.id);
      const v = variants.find(x => x.slug === app.resume_variant);
      resumeText = v?.parsed_text || '';
    }
    const contacts = await db.listApplicationContacts(req.user.tenantId, app.id);

    let debrief;
    try {
      debrief = await buildDebrief({
        userId: req.user.id,
        tenantId: req.user.tenantId,
        app,
        transcriptText: req.body.transcript,
        resumeText,
        jdText: app.jd_text || '',
        coverLetter: app.cover_letter_text || '',
        contacts,
        profile: req.user.profile || {},
      });
    } catch (e) {
      console.error('[debrief]', e.message);
      if (/too short/i.test(e.message)) {
        return res.status(422).json({ error: e.message });
      }
      return res.status(500).json({ error: e.message || 'Debrief generation failed' });
    }

    // Side effect: append to activity timeline.
    const today = todayET();
    const activity = Array.isArray(app.activity) ? [...app.activity] : [];
    activity.push({
      date: today,
      type: 'debrief_logged',
      note: (debrief.summary || '').slice(0, 200),
    });
    await db.updateApplication(req.user.tenantId, app.id, { activity, last_activity: today });

    await logAiUsage(req.user.tenantId, req.user.id, 'debrief',
      (debrief.tokens_in || 0) + (debrief.tokens_out || 0),
      { company: app.company });

    logEvent(req.user.tenantId, req.user.id, 'debrief.logged', {
      entityType: 'application',
      entityId: app.id,
      payload: {
        transcript_length_bucket: lengthBucket(req.body.transcript),
        tokens_in: debrief.tokens_in || 0,
        tokens_out: debrief.tokens_out || 0,
        followup_count: Array.isArray(debrief.follow_ups) ? debrief.follow_ups.length : 0,
        strength_count: Array.isArray(debrief.strengths) ? debrief.strengths.length : 0,
        watchout_count: Array.isArray(debrief.watchouts) ? debrief.watchouts.length : 0,
        has_thank_you: !!debrief.thank_you_draft,
      },
    });

    res.json({ debrief });
  });

// DELETE /applications/:id/debriefs/:debriefId
router.delete('/applications/:id/debriefs/:debriefId', requireAuth, async (req, res) => {
  const app = await db.getApplication(req.user.tenantId, req.params.id);
  if (!app || app.user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });

  const debrief = await db.getApplicationDebrief(req.user.tenantId, req.params.debriefId);
  if (!debrief || debrief.application_id !== req.params.id) {
    return res.status(404).json({ error: 'Not found' });
  }

  const ok = await db.deleteApplicationDebrief(req.user.tenantId, req.params.debriefId);
  if (!ok) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 2: Mount in server.js**

Add below the `prepBriefRoutes` require:

```js
const debriefRoutes = require('./src/routes/debrief');
```

Below the prep brief mount:

```js
app.use('/api', debriefRoutes);
```

- [ ] **Step 3: Syntax + smoke**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  node -c src/routes/debrief.js && \
  node -c server.js && \
  node -e "const r = require('./src/routes/debrief'); console.log('router:', typeof r);" && \
  echo OK
```

Expected: `router: function` then `OK`.

- [ ] **Step 4: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add src/routes/debrief.js server.js && \
  git commit -m "feat: debrief route — GET list + POST create (+ timeline) + DELETE"
```

---

## Task 10: Frontend — Practice mode toggle in InterviewChat

**Files:**
- Modify: `client/src/components/applications/InterviewChat.jsx`

- [ ] **Step 1: Add mode state + segmented toggle + separate query keys**

Open `/Users/everettsteele/PROJECTS/snag-jobs/client/src/components/applications/InterviewChat.jsx`. Near the top of the component, after `const [draft, setDraft] = useState('');`, add:

```jsx
  const [mode, setMode] = useState('coach');
```

Find the existing chat query:

```jsx
  const { data, isLoading, error } = useQuery({
    queryKey: ['app-chat', app.id],
    queryFn: () => api.get(`/applications/${app.id}/chat`),
    enabled: !!user?.isPro,
  });
```

Replace with mode-aware query:

```jsx
  const { data, isLoading, error } = useQuery({
    queryKey: ['app-chat', app.id, mode],
    queryFn: () => api.get(`/applications/${app.id}/chat?mode=${mode}`),
    enabled: !!user?.isPro,
  });
```

Find the sendMut:

```jsx
  const sendMut = useMutation({
    mutationFn: (message) => api.post(`/applications/${app.id}/chat`, { message }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['app-chat', app.id] }); setDraft(''); },
  });
```

Replace with:

```jsx
  const sendMut = useMutation({
    mutationFn: (message) => api.post(`/applications/${app.id}/chat`, { message, mode }),
    onSuccess: () => setDraft(''),
    onSettled: () => { qc.invalidateQueries({ queryKey: ['app-chat', app.id, mode] }); },
  });
```

Find the clearMut:

```jsx
  const clearMut = useMutation({
    mutationFn: () => api.del(`/applications/${app.id}/chat`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-chat', app.id] }),
  });
```

Replace with (note: clear still removes the whole chat history regardless of mode — same DELETE endpoint, we'll simply invalidate all mode keys):

```jsx
  const clearMut = useMutation({
    mutationFn: () => api.del(`/applications/${app.id}/chat`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-chat', app.id, 'coach'] });
      qc.invalidateQueries({ queryKey: ['app-chat', app.id, 'practice'] });
    },
  });
```

- [ ] **Step 2: Add the mode toggle UI + adapt suggestion chips**

Find the `SUGGESTION_BASE` constant near the top of the file. Replace it with a mode-sensitive map:

```jsx
const SUGGESTIONS_BY_MODE = {
  coach: [
    'Generate 10 likely questions for this role',
    'Help me rehearse behavioral answers from my resume',
  ],
  practice: [
    'Start with a behavioral question',
    'Hit me with a tough case from the job description',
    "Focus on this role's hardest skill",
  ],
};
```

Find where the suggestions are computed (currently uses `SUGGESTION_BASE`):

```jsx
  const firstInterviewer = contacts.find((c) => c.kind === 'interviewer');
  const suggestions = [
    ...SUGGESTION_BASE,
    ...(firstInterviewer ? [`Research ${firstInterviewer.name} and suggest what to ask them`] : []),
  ];
```

Replace with:

```jsx
  const firstInterviewer = contacts.find((c) => c.kind === 'interviewer');
  const baseSuggestions = SUGGESTIONS_BY_MODE[mode] || SUGGESTIONS_BY_MODE.coach;
  const suggestions = [
    ...baseSuggestions,
    ...(mode === 'coach' && firstInterviewer
        ? [`Research ${firstInterviewer.name} and suggest what to ask them`]
        : []),
  ];
```

Now add the mode toggle row above the message list. Find the main render tree — the component returns `<div className="flex flex-col h-[420px]">`. Insert a toggle header as the first child, before `<div ref={listRef}...>`:

```jsx
      <div className="flex items-center justify-between mb-2">
        <div className="inline-flex bg-gray-100 rounded-md p-0.5">
          <button
            type="button"
            onClick={() => setMode('coach')}
            className={`text-xs px-3 py-1 rounded cursor-pointer ${mode === 'coach' ? 'bg-white text-[#1F2D3D] shadow-sm' : 'text-gray-500'}`}
          >
            Coach
          </button>
          <button
            type="button"
            onClick={() => setMode('practice')}
            className={`text-xs px-3 py-1 rounded cursor-pointer ${mode === 'practice' ? 'bg-white text-[#1F2D3D] shadow-sm' : 'text-gray-500'}`}
          >
            Practice
          </button>
        </div>
        <div className="text-[10px] text-gray-500">
          {mode === 'practice' ? 'Claude plays the interviewer.' : 'Claude coaches your prep.'}
        </div>
      </div>
```

- [ ] **Step 3: Build**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && npx vite build 2>&1 | tail -5
```

Expected: clean build.

- [ ] **Step 4: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add client/src/components/applications/InterviewChat.jsx && \
  git commit -m "feat: Coach/Practice mode toggle in InterviewChat (per-mode history)"
```

---

## Task 11: Frontend — PrepBriefCard

**Files:**
- Create: `client/src/components/applications/PrepBriefCard.jsx`

- [ ] **Step 1: Create the component**

Create `/Users/everettsteele/PROJECTS/snag-jobs/client/src/components/applications/PrepBriefCard.jsx`:

```jsx
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';

const STORAGE_PREFIX = 'prep-brief-open:';

export default function PrepBriefCard({ app }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(STORAGE_PREFIX + app.id) !== '0'; } catch (_) { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_PREFIX + app.id, open ? '1' : '0'); } catch (_) {}
  }, [open, app.id]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['app-prep-brief', app.id],
    queryFn: () => api.get(`/applications/${app.id}/prep-brief`),
    enabled: !!user?.isPro,
  });

  const buildMut = useMutation({
    mutationFn: (body) => api.post(`/applications/${app.id}/prep-brief/build`, body || {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-prep-brief', app.id] }),
  });

  if (!user?.isPro) return null;

  if (isLoading) {
    return <div className="text-xs text-gray-400 py-3">Loading prep brief...</div>;
  }
  if (error) {
    return <div className="text-xs text-red-600 py-3">{error.message}</div>;
  }

  const brief = data?.brief || null;

  if (!brief) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 mb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[#1F2D3D]">Prep Brief</div>
            <div className="text-[11px] text-gray-500">Generate a structured brief with likely questions, company research, and what to ask.</div>
          </div>
          <button
            onClick={() => buildMut.mutate()}
            disabled={buildMut.isPending}
            className="text-xs bg-[#F97316] hover:bg-[#EA580C] text-white px-3 py-1.5 rounded cursor-pointer disabled:opacity-50"
          >
            {buildMut.isPending ? 'Building...' : 'Build prep brief'}
          </button>
        </div>
        {buildMut.error && (
          <div className="text-xs text-red-600 mt-2">{buildMut.error.message}</div>
        )}
      </div>
    );
  }

  const sections = [
    { key: 'likely', label: 'Likely Questions', items: brief.likely_questions || [] },
    { key: 'highlights', label: 'Resume Highlights', items: brief.resume_highlights || [] },
    { key: 'to_ask', label: 'Questions To Ask', items: brief.questions_to_ask || [] },
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 cursor-pointer"
      >
        <div className="text-left">
          <div className="text-sm font-semibold text-[#1F2D3D]">Prep Brief</div>
          <div className="text-[10px] text-gray-400">
            Refreshed {brief.updated_at ? new Date(brief.updated_at).toLocaleDateString() : 'unknown'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); if (window.confirm('Regenerate the prep brief?')) buildMut.mutate({ refresh: true }); }}
            disabled={buildMut.isPending}
            className="text-[11px] text-gray-500 hover:text-[#F97316] cursor-pointer disabled:opacity-50"
          >
            {buildMut.isPending ? 'Regenerating...' : 'Regenerate'}
          </button>
          <span className="text-xs text-gray-400">{open ? '▾' : '▸'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-4">
          {brief.company_research && (
            <div>
              <div className="text-xs font-semibold text-[#1F2D3D] mb-1">Company Research</div>
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{brief.company_research}</p>
            </div>
          )}
          {sections.map((s) => (
            s.items.length > 0 && (
              <div key={s.key}>
                <div className="text-xs font-semibold text-[#1F2D3D] mb-1">{s.label}</div>
                <ul className="space-y-0.5">
                  {s.items.map((item, i) => (
                    <li key={i} className="text-xs text-gray-700 flex items-start gap-2">
                      <span className="w-1 h-1 rounded-full bg-[#F97316] mt-1.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && npx vite build 2>&1 | tail -5
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git add client/src/components/applications/PrepBriefCard.jsx && \
  git commit -m "feat: PrepBriefCard with collapsible sections + regenerate"
```

---

## Task 12: Frontend — DebriefList + DebriefLogModal

**Files:**
- Create: `client/src/components/applications/DebriefList.jsx`
- Create: `client/src/components/applications/DebriefLogModal.jsx`

- [ ] **Step 1: Create DebriefLogModal.jsx**

Create `/Users/everettsteele/PROJECTS/snag-jobs/client/src/components/applications/DebriefLogModal.jsx`:

```jsx
import { useState } from 'react';

export default function DebriefLogModal({ onClose, onSave, saving }) {
  const [transcript, setTranscript] = useState('');
  const tooShort = transcript.trim().length < 500;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[110] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-[#1F2D3D]">Log Interview Debrief</h2>
            <p className="text-xs text-gray-500 mt-0.5">Paste a transcript or type notes about how the interview went. We'll summarize + draft a thank-you.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none cursor-pointer">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste the interview transcript here, or describe what happened, who said what, what questions came up..."
            rows={14}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#F97316] font-mono"
          />
          <div className="text-[11px] text-gray-400 mt-1 flex items-center justify-between">
            <span>{transcript.trim().length} chars</span>
            <span>{tooShort ? 'Needs at least 500 characters.' : 'Looks good.'}</span>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-3 border-t border-gray-100">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 cursor-pointer">Cancel</button>
          <button
            onClick={() => !tooShort && onSave(transcript.trim())}
            disabled={tooShort || saving}
            className="text-sm bg-[#F97316] hover:bg-[#EA580C] text-white px-4 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Generating...' : 'Generate Debrief'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create DebriefList.jsx**

Create `/Users/everettsteele/PROJECTS/snag-jobs/client/src/components/applications/DebriefList.jsx`:

```jsx
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import DebriefLogModal from './DebriefLogModal';

export default function DebriefList({ app }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['app-debriefs', app.id],
    queryFn: () => api.get(`/applications/${app.id}/debriefs`),
    enabled: !!user?.isPro,
  });

  const createMut = useMutation({
    mutationFn: (transcript) => api.post(`/applications/${app.id}/debriefs`, { transcript }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['app-debriefs', app.id] });
      qc.invalidateQueries({ queryKey: ['applications'] });
      setModalOpen(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (debriefId) => api.del(`/applications/${app.id}/debriefs/${debriefId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app-debriefs', app.id] }),
  });

  if (!user?.isPro) return null;

  const debriefs = data?.debriefs || [];

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold text-[#1F2D3D]">Debriefs</div>
        <button
          onClick={() => setModalOpen(true)}
          className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded cursor-pointer"
        >
          + Log debrief
        </button>
      </div>

      {isLoading && <div className="text-xs text-gray-400">Loading...</div>}
      {error && <div className="text-xs text-red-600">{error.message}</div>}
      {!isLoading && debriefs.length === 0 && (
        <div className="text-xs text-gray-400">No debriefs yet. Log one after your interview.</div>
      )}

      <div className="space-y-3">
        {debriefs.map((d) => (
          <DebriefCard key={d.id} debrief={d} onDelete={() => {
            if (window.confirm('Delete this debrief?')) deleteMut.mutate(d.id);
          }} />
        ))}
      </div>

      {createMut.error && (
        <div className="text-xs text-red-600 mt-2">{createMut.error.message}</div>
      )}

      {modalOpen && (
        <DebriefLogModal
          onClose={() => setModalOpen(false)}
          onSave={(transcript) => createMut.mutate(transcript)}
          saving={createMut.isPending}
        />
      )}
    </div>
  );
}

function DebriefCard({ debrief, onDelete }) {
  const [copied, setCopied] = useState(false);
  const copyThankYou = () => {
    if (!debrief.thank_you_draft) return;
    navigator.clipboard.writeText(debrief.thank_you_draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white p-3">
      <div className="flex items-start justify-between mb-2">
        <div className="text-[10px] text-gray-400">
          {debrief.created_at ? new Date(debrief.created_at).toLocaleString() : ''}
        </div>
        <button onClick={onDelete} className="text-[11px] text-gray-400 hover:text-red-600 cursor-pointer">Delete</button>
      </div>

      {debrief.summary && (
        <p className="text-sm text-gray-800 mb-3 leading-relaxed">{debrief.summary}</p>
      )}

      {Array.isArray(debrief.topics_covered) && debrief.topics_covered.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {debrief.topics_covered.map((t, i) => (
            <span key={i} className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{t}</span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3 text-[11px]">
        {['strengths', 'watchouts', 'follow_ups'].map((field) => {
          const items = debrief[field] || [];
          if (items.length === 0) return null;
          const label = field === 'strengths' ? 'What worked'
                       : field === 'watchouts' ? 'Watch out for'
                       : 'Follow-ups';
          const sign = field === 'strengths' ? '+' : field === 'watchouts' ? '−' : '→';
          const color = field === 'strengths' ? 'text-green-600'
                       : field === 'watchouts' ? 'text-rose-600'
                       : 'text-[#F97316]';
          return (
            <div key={field}>
              <div className="font-semibold text-gray-700 mb-1">{label}</div>
              <ul className="space-y-0.5">
                {items.map((it, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className={`${color} mt-0.5`}>{sign}</span>
                    <span className="flex-1 text-gray-700">{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {debrief.thank_you_draft && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[11px] font-semibold text-gray-700">Thank-you draft</div>
            <button
              onClick={copyThankYou}
              className="text-[11px] text-[#F97316] hover:text-[#EA580C] cursor-pointer"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <pre className="text-[11px] text-gray-800 bg-gray-50 border border-gray-200 rounded p-2 whitespace-pre-wrap font-sans">{debrief.thank_you_draft}</pre>
        </div>
      )}
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
  git add client/src/components/applications/DebriefList.jsx client/src/components/applications/DebriefLogModal.jsx && \
  git commit -m "feat: DebriefList + DebriefLogModal components"
```

---

## Task 13: Wire PrepBriefCard + DebriefList into Interview tab

**Files:**
- Modify: `client/src/components/applications/ApplicationRow.jsx`

- [ ] **Step 1: Import the new components**

Open `/Users/everettsteele/PROJECTS/snag-jobs/client/src/components/applications/ApplicationRow.jsx`. Find the existing `import InterviewChat from './InterviewChat';` line. Below it add:

```jsx
import PrepBriefCard from './PrepBriefCard';
import DebriefList from './DebriefList';
```

- [ ] **Step 2: Replace InterviewTabLazy body**

Find the existing `InterviewTabLazy` stub:

```jsx
function InterviewTabLazy({ app }) { return <InterviewChat app={app} />; }
```

Replace with a stacked layout:

```jsx
function InterviewTabLazy({ app }) {
  return (
    <div>
      <PrepBriefCard app={app} />
      <InterviewChat app={app} />
      <DebriefList app={app} />
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
  git commit -m "feat: Interview tab renders PrepBrief + Chat + Debriefs"
```

---

## Task 14: Final smoke + push

- [ ] **Step 1: Full require graph + build**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  node -c server.js && \
  node -e "
    require('./src/services/prepBrief');
    require('./src/services/debrief');
    require('./src/routes/prepBrief');
    require('./src/routes/debrief');
    require('./src/routes/applications-chat');
    console.log('all files load');
  " && \
  npx vite build 2>&1 | tail -5 && \
  echo BUILD_OK
```

Expected: `all files load` + clean build + `BUILD_OK`.

- [ ] **Step 2: Commit log review**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && git log --oneline 5df6874..HEAD
```

Expected: 13 commits (Tasks 1-13).

- [ ] **Step 3: Clean tree + push**

```bash
cd /Users/everettsteele/PROJECTS/snag-jobs && \
  git status && \
  git push
```

Expected: `working tree clean` + push succeeds. Railway auto-applies migration 011.

- [ ] **Step 4: Post-deploy manual verification**

1. Move an app to Interviewing. Open Interview Prep tab → three stacked sections visible: PrepBrief (Build CTA), InterviewChat (Coach/Practice toggle, Coach active), Debriefs (empty state).
2. Click Build prep brief → brief renders with 4 sections within ~5 seconds.
3. Toggle chat to Practice → new empty chat stream. Click a suggestion chip. Claude responds as interviewer (feedback + follow-up).
4. Toggle back to Coach → previous coach conversation intact.
5. Click Log debrief → modal opens. Paste a >500 char sample transcript. Submit. Debrief card renders with summary/topics/strengths/watchouts/follow_ups/thank-you.
6. Click Copy on the thank-you → clipboard populated, "Copied!" flashes.
7. Timeline tab → new `debrief_logged` activity entry present.
8. DB: `SELECT * FROM application_prep_briefs WHERE application_id = '...';` and `SELECT summary, thank_you_draft FROM application_debriefs ORDER BY created_at DESC LIMIT 3;`
9. Events: `SELECT event_type, payload FROM product_events WHERE event_type IN ('prep_brief.built','practice_chat.turn','debrief.logged') ORDER BY created_at DESC LIMIT 10;`
10. Free user on an interviewing app → PrepBriefCard and DebriefList render nothing (both gate on isPro and return null); chat already had its own locked state.

---

## Self-Review

**Spec coverage:**
- ✅ Migration 011 adds `mode` column + prep_briefs + debriefs (Task 1)
- ✅ Validation schemas: chatMessageRequest gets mode, new debriefCreateRequest + prepBriefBuildRequest (Task 2)
- ✅ Store accessors: prep brief get/upsert, debrief list/create/delete/get, plus mode-aware listChatMessages/countChatTurns/appendChatMessage (Tasks 3 + 5)
- ✅ buildInterviewChatSystemPrompt accepts mode with a Practice-mode opening (Task 4)
- ✅ Chat route honors mode on GET + POST (Task 5)
- ✅ Prep brief service with Sonnet call, dossier-aware prompt, JSON parsing + validation (Task 6)
- ✅ Prep brief routes (GET + POST build, Pro + interviewing gated) mounted (Task 7)
- ✅ Debrief service with Sonnet call, thank-you draft, JSON parsing (Task 8)
- ✅ Debrief routes (GET list, POST create + timeline side effect, DELETE) mounted (Task 9)
- ✅ Practice mode toggle + per-mode history in InterviewChat (Task 10)
- ✅ PrepBriefCard with collapsible sections + regenerate (Task 11)
- ✅ DebriefList + DebriefLogModal (Task 12)
- ✅ Interview tab renders all three sections stacked (Task 13)
- ✅ Three F1 event types: prep_brief.built, practice_chat.turn, debrief.logged; plus existing interview_chat.turn split by mode via eventType branching

**Placeholder scan:** No TBDs. Every step has concrete code.

**Type consistency:**
- `buildPrepBrief({ userId, tenantId, app, jdText, resumeText, contacts, profile })` — same shape in service definition and route call site.
- `buildDebrief({ userId, tenantId, app, transcriptText, resumeText, jdText, coverLetter, contacts, profile })` — same in service and route.
- `mode` — string, values `'coach' | 'practice'`, consistent across DB column, zod schema, store accessors, route handlers, system prompt branch, frontend state.
- Debrief output fields match across service, DB accessor, route response, and UI consumption: `summary, topics_covered, strengths, watchouts, follow_ups, thank_you_draft`.
- Prep brief output fields match across service, DB accessor, route response, and UI consumption: `likely_questions, company_research, resume_highlights, questions_to_ask`.

**Known non-blocker:** spec mentioned `prep_brief.viewed` event (fired on first view per session). Not implemented in this plan — negligible signal, adds localStorage complexity for the event debounce. Flagged as deferred follow-up.

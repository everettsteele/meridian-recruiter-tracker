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

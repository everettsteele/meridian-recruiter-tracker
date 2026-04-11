-- Migration 002: Google OAuth integration
-- Stores per-user Google OAuth tokens for Drive, Gmail, and Calendar access.

CREATE TABLE google_tokens (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_token    TEXT NOT NULL,
  refresh_token   TEXT NOT NULL,
  token_type      TEXT NOT NULL DEFAULT 'Bearer',
  expiry_date     BIGINT,  -- ms since epoch
  scope           TEXT NOT NULL DEFAULT '',
  connected_email TEXT,  -- the Google account email
  connected_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track which Drive folder is the user's root for job applications
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS drive_root_folder_id TEXT NOT NULL DEFAULT '';
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS drive_base_resumes_folder_id TEXT NOT NULL DEFAULT '';

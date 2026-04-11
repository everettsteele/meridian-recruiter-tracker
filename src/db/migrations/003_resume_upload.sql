-- Migration 003: Add resume upload support
-- Adds parsed_text column for AI context and filename for display

ALTER TABLE resume_variants ADD COLUMN IF NOT EXISTS parsed_text TEXT NOT NULL DEFAULT '';
ALTER TABLE resume_variants ADD COLUMN IF NOT EXISTS filename TEXT NOT NULL DEFAULT '';

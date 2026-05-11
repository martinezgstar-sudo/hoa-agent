-- 2026-05-10 — email-tracking columns on the suggestions table
--
-- The original spec named `community_suggestions`, but the legacy
-- report-request leads (gm12332@yahoo.com, Rsmythfromrjk@gmail.com,
-- howardchristine@msn.com, apaccione@live.com) live in `suggestions`
-- (the table that /api/report-request actually writes to). Both columns
-- added to that table.
--
-- Run via Supabase SQL editor:
-- https://supabase.com/dashboard/project/uacgzbojhjelzirvbphg/sql

ALTER TABLE suggestions
  ADD COLUMN IF NOT EXISTS auto_responder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS backfill_sent_at TIMESTAMPTZ;

-- Optional: also mirror onto community_suggestions in case a future code
-- path writes there. Harmless if the columns already exist.
ALTER TABLE community_suggestions
  ADD COLUMN IF NOT EXISTS auto_responder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS backfill_sent_at TIMESTAMPTZ;

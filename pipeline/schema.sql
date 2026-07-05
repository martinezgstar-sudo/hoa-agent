-- ============================================================
-- pipeline/schema.sql
-- Local SQLite snapshot schema for the HOA Agent pull-once pipeline.
--
-- One dated file per run lives at:
--   ~/hoa-pipeline/snapshots/snapshot-YYYYMMDD.sqlite
--
-- The pipeline touches Supabase exactly twice per run:
--   pull.py  (morning) fills communities_to_work / rejected_pairings /
--            open_admin_items from Supabase, then disconnects.
--   research.py runs FULLY OFFLINE against this file and writes proposals.
--   push.py  (evening) reads reviewed proposals and writes back to Supabase.
-- ============================================================

-- Communities pulled because they still need core fields.
CREATE TABLE IF NOT EXISTS communities_to_work (
  community_id      TEXT PRIMARY KEY,
  canonical_name    TEXT,
  slug              TEXT,
  city              TEXT,
  status            TEXT,
  website_url       TEXT,
  management_company TEXT,
  raw_json          TEXT,            -- full pulled row (all selected columns)
  pulled_at         TEXT NOT NULL,
  researched        INTEGER NOT NULL DEFAULT 0   -- 0=pending, 1=research checkpointed
);
CREATE INDEX IF NOT EXISTS idx_ctw_researched ON communities_to_work(researched);

-- Known-bad community-to-value matches we must never re-research.
-- A pairing matches when community (by id OR normalized name_key) matches AND
-- field_name matches (or is '*') AND proposed_value matches (or is '*').
CREATE TABLE IF NOT EXISTS rejected_pairings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  community_id    TEXT,              -- nullable: seed entries match by name only
  community_name  TEXT,
  name_key        TEXT,              -- normalized name for matching
  field_name      TEXT NOT NULL DEFAULT '*',     -- '*' = any field
  proposed_value  TEXT NOT NULL DEFAULT '*',     -- '*' = any value
  reason          TEXT,
  source          TEXT,              -- 'seed' | 'supabase' | 'review'
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rp_community_id ON rejected_pairings(community_id);
CREATE INDEX IF NOT EXISTS idx_rp_name_key     ON rejected_pairings(name_key);

-- Rows already pending in Supabase, so research/push never create duplicates.
CREATE TABLE IF NOT EXISTS open_admin_items (
  pcd_id          TEXT PRIMARY KEY,  -- pending_community_data.id
  community_id    TEXT,
  field_name      TEXT,
  proposed_value  TEXT,
  source_type     TEXT,
  confidence      REAL,
  status          TEXT,
  created_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_oai_community ON open_admin_items(community_id);

-- Local findings produced offline by research.py and reviewed before push.
CREATE TABLE IF NOT EXISTS proposals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  community_id    TEXT NOT NULL,
  field_name      TEXT NOT NULL,
  proposed_value  TEXT NOT NULL,
  source_type     TEXT,
  source_url      TEXT,
  confidence      REAL,
  bucket          TEXT NOT NULL DEFAULT 'needs_you', -- approved | needs_you | rejected
  created_at      TEXT NOT NULL,
  pushed          INTEGER NOT NULL DEFAULT 0          -- 1 after a successful push
);
CREATE INDEX IF NOT EXISTS idx_prop_community ON proposals(community_id);
CREATE INDEX IF NOT EXISTS idx_prop_bucket    ON proposals(bucket);

-- Run-level metadata (run_date, cap, pulled counts, etc.).
CREATE TABLE IF NOT EXISTS run_meta (
  key    TEXT PRIMARY KEY,
  value  TEXT
);

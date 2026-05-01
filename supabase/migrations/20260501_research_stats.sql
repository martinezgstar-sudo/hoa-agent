-- ============================================================
-- Migration: 20260501_research_stats
-- Adds age_restricted + gated columns to communities,
-- creates research_stats tracking table.
-- ============================================================

-- 1. New columns on communities
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS age_restricted text,    -- e.g. '55+', 'No', null = unknown
  ADD COLUMN IF NOT EXISTS gated          text;    -- e.g. 'Yes', 'No', null = unknown

-- 2. Research stats table
CREATE TABLE IF NOT EXISTS research_stats (
  id                      uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  run_at                  timestamptz NOT NULL DEFAULT now(),
  communities_researched  integer     NOT NULL DEFAULT 0,
  communities_updated     integer     NOT NULL DEFAULT 0,
  fields_filled           integer     NOT NULL DEFAULT 0,
  sources_queried         integer     NOT NULL DEFAULT 0,
  thin_count_before       integer,      -- published communities with 5+ missing fields before run
  thin_count_after        integer,      -- same count after run
  batch_size              integer,
  mode                    text        DEFAULT 'research',  -- 'research' | 'website_scrape' | 'condo_units'
  notes                   text
);

-- Index for recent-run lookups
CREATE INDEX IF NOT EXISTS idx_research_stats_run_at ON research_stats(run_at DESC);

-- 3. Grant read access to anon role (stats can be public)
GRANT SELECT ON research_stats TO anon;

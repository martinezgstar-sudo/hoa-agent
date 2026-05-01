-- ============================================================
-- Migration: Master / Sub HOA linking system
-- Date: 2026-05-01
-- ============================================================
-- Adds parent_id and is_master columns to communities table.
-- parent_id  — uuid FK pointing to the master community record
--              (semantic equivalent of the existing master_hoa_id column)
-- is_master  — boolean flag marking a community as a master HOA
--              (inverse of the existing is_sub_hoa column for masters)
--
-- IMPORTANT: Run in Supabase SQL Editor.
-- The existing master_hoa_id and is_sub_hoa columns are NOT dropped —
-- they remain for backward compatibility with existing queries.
-- ============================================================

-- 1. Add parent_id if not already present
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES communities(id);

-- 2. Add is_master if not already present
ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS is_master boolean DEFAULT false;

-- 3. Index for fast sub-community lookups
CREATE INDEX IF NOT EXISTS idx_communities_parent_id
  ON communities(parent_id);

-- 4. Migrate existing data: copy master_hoa_id → parent_id
--    (only where parent_id is not already set)
UPDATE communities
SET parent_id = master_hoa_id
WHERE master_hoa_id IS NOT NULL
  AND parent_id IS NULL;

-- 5. Seed is_master = true for known master communities
--    (rows whose id appears as someone else's parent_id or master_hoa_id)
UPDATE communities
SET is_master = true
WHERE id IN (
  SELECT DISTINCT master_hoa_id FROM communities WHERE master_hoa_id IS NOT NULL
  UNION
  SELECT DISTINCT parent_id      FROM communities WHERE parent_id      IS NOT NULL
);

-- 6. Verify result
SELECT
  COUNT(*) FILTER (WHERE is_master = true)          AS is_master_count,
  COUNT(*) FILTER (WHERE parent_id IS NOT NULL)     AS has_parent_id_count,
  COUNT(*) FILTER (WHERE is_sub_hoa = true)         AS is_sub_hoa_count,
  COUNT(*) FILTER (WHERE master_hoa_id IS NOT NULL) AS has_master_hoa_id_count
FROM communities;

-- ============================================================
-- TASK 1: Master/Sub HOA Audit Queries
-- Run these in Supabase SQL Editor (Settings → SQL Editor)
-- ============================================================

-- 1. Check which master/sub columns currently exist
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'communities'
  AND column_name IN (
    'parent_id', 'master_community_id', 'is_master',
    'master_hoa_id', 'is_sub_hoa'
  )
ORDER BY column_name;

-- 2. Find master communities and any existing subs for the four targets
SELECT id, canonical_name, slug, city, status,
       parent_id,
       master_hoa_id,
       is_master,
       is_sub_hoa
FROM communities
WHERE canonical_name ILIKE '%ballenisles%'
   OR canonical_name ILIKE '%ballen isles%'
   OR canonical_name ILIKE '%evergrene%'
   OR canonical_name ILIKE '%olympia%'
   OR canonical_name ILIKE '%seven bridges%'
ORDER BY canonical_name;

-- 3. Count existing master/sub relationships
SELECT
  COUNT(*) FILTER (WHERE is_master = true)       AS is_master_true,
  COUNT(*) FILTER (WHERE is_sub_hoa = true)      AS is_sub_hoa_true,
  COUNT(*) FILTER (WHERE master_hoa_id IS NOT NULL) AS has_master_hoa_id,
  COUNT(*) FILTER (WHERE parent_id IS NOT NULL)  AS has_parent_id
FROM communities;

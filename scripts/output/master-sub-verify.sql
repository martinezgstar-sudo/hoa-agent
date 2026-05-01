-- ============================================================
-- TASK 8: Verification Query
-- Run in Supabase SQL Editor after executing master-sub-inserts.sql
-- ============================================================

-- Main verification: master communities with sub counts
SELECT
  m.canonical_name                                          AS master,
  m.slug                                                    AS master_slug,
  m.is_master,
  m.city,
  m.status,
  COUNT(s.id)                                               AS sub_count,
  COUNT(s.id) FILTER (WHERE s.status = 'published')         AS sub_published,
  COUNT(s.id) FILTER (WHERE s.status = 'draft')             AS sub_draft,
  array_agg(s.canonical_name ORDER BY s.canonical_name)     AS sub_names
FROM communities m
LEFT JOIN communities s ON s.parent_id = m.id
WHERE m.canonical_name ILIKE ANY(ARRAY[
  '%ballenisles%', '%ballen isles%',
  '%evergrene%',
  '%olympia%',
  '%seven bridges%'
])
  AND (m.is_master = true OR m.parent_id IS NULL)
GROUP BY m.id, m.canonical_name, m.slug, m.is_master, m.city, m.status
ORDER BY m.canonical_name;

-- Orphaned subs: communities with parent_id set but master not found
SELECT s.canonical_name, s.slug, s.parent_id, s.status
FROM communities s
WHERE s.parent_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM communities m WHERE m.id = s.parent_id
  );

-- Summary counts
SELECT
  COUNT(*)                                       AS total_communities,
  COUNT(*) FILTER (WHERE is_master = true)       AS total_masters,
  COUNT(*) FILTER (WHERE parent_id IS NOT NULL)  AS total_with_parent_id,
  COUNT(*) FILTER (WHERE is_sub_hoa = true)      AS total_is_sub_hoa
FROM communities;

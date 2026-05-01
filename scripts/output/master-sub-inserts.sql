-- ============================================================
-- Master/Sub HOA — Tasks 4 & 5
-- Run in Supabase SQL Editor AFTER running the migration:
--   supabase/migrations/20260501_master_sub_hoa.sql
-- ============================================================
-- This script:
--   1. Sets is_master=true on the four master communities
--   2. Creates 21 sub-community records (if not already present)
--   3. Links all subs to their master via parent_id
--   4. Sets is_master=false and is_sub_hoa=true on all subs
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- STEP 0: Verify master records exist before continuing
-- ────────────────────────────────────────────────────────────
SELECT id, canonical_name, slug, city, status
FROM communities
WHERE canonical_name ILIKE ANY(ARRAY[
  '%ballenisles%', '%ballen isles%',
  '%evergrene%',
  '%olympia%',
  '%seven bridges%'
])
ORDER BY canonical_name;

-- ────────────────────────────────────────────────────────────
-- STEP 1: Mark all four masters as is_master=true
-- ────────────────────────────────────────────────────────────

UPDATE communities SET is_master = true
WHERE canonical_name ILIKE '%ballenisles%'
   OR canonical_name ILIKE '%ballen isles%';

UPDATE communities SET is_master = true
WHERE canonical_name ILIKE '%evergrene%'
  AND parent_id IS NULL;  -- only the master, not any sub

UPDATE communities SET is_master = true
WHERE canonical_name ILIKE '%olympia%'
  AND (canonical_name ILIKE '%master%' OR canonical_name NOT ILIKE '%village%');

UPDATE communities SET is_master = true
WHERE canonical_name ILIKE '%seven bridges%'
  AND parent_id IS NULL;

-- ────────────────────────────────────────────────────────────
-- STEP 2: BallenIsles — 2 sub-communities
-- ────────────────────────────────────────────────────────────

-- Look up the BallenIsles master id once
DO $$
DECLARE
  master_id uuid;
BEGIN
  SELECT id INTO master_id
  FROM communities
  WHERE canonical_name ILIKE '%ballenisles%'
     OR canonical_name ILIKE '%ballen isles%'
  ORDER BY
    CASE WHEN is_master THEN 0 ELSE 1 END,
    created_at ASC
  LIMIT 1;

  IF master_id IS NULL THEN
    RAISE WARNING 'BallenIsles master not found — skipping sub inserts';
    RETURN;
  END IF;

  RAISE NOTICE 'BallenIsles master_id = %', master_id;

  -- Palm Bay Club Condominium Association
  INSERT INTO communities (
    canonical_name, slug, city, county, state, status,
    property_type, parent_id, is_master, is_sub_hoa
  ) VALUES (
    'Palm Bay Club Condominium Association',
    'palm-bay-club-condominium-association-ballenisles',
    'Palm Beach Gardens', 'Palm Beach', 'FL', 'draft',
    'Condo', master_id, false, true
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id   = EXCLUDED.parent_id,
        is_master   = EXCLUDED.is_master,
        is_sub_hoa  = EXCLUDED.is_sub_hoa;

  -- The Palms at BallenIsles Condominium Association
  INSERT INTO communities (
    canonical_name, slug, city, county, state, status,
    property_type, parent_id, is_master, is_sub_hoa
  ) VALUES (
    'The Palms at BallenIsles Condominium Association',
    'palms-at-ballenisles-condominium-association',
    'Palm Beach Gardens', 'Palm Beach', 'FL', 'draft',
    'Condo', master_id, false, true
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id   = EXCLUDED.parent_id,
        is_master   = EXCLUDED.is_master,
        is_sub_hoa  = EXCLUDED.is_sub_hoa;

END $$;

-- ────────────────────────────────────────────────────────────
-- STEP 3: Evergrene — 2 sub-communities
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE
  master_id uuid;
BEGIN
  SELECT id INTO master_id
  FROM communities
  WHERE canonical_name ILIKE '%evergrene%'
    AND (is_master = true OR parent_id IS NULL)
  ORDER BY
    CASE WHEN is_master THEN 0 ELSE 1 END,
    created_at ASC
  LIMIT 1;

  IF master_id IS NULL THEN
    RAISE WARNING 'Evergrene master not found — skipping sub inserts';
    RETURN;
  END IF;

  RAISE NOTICE 'Evergrene master_id = %', master_id;

  -- The Mansions at Evergrene Condominium Association
  INSERT INTO communities (
    canonical_name, slug, city, county, state, status,
    property_type, parent_id, is_master, is_sub_hoa
  ) VALUES (
    'The Mansions at Evergrene Condominium Association',
    'mansions-at-evergrene-condominium-association',
    'Palm Beach Gardens', 'Palm Beach', 'FL', 'draft',
    'Condo', master_id, false, true
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id   = EXCLUDED.parent_id,
        is_master   = EXCLUDED.is_master,
        is_sub_hoa  = EXCLUDED.is_sub_hoa;

  -- The Mansions at Evergrene West Condominium Association
  INSERT INTO communities (
    canonical_name, slug, city, county, state, status,
    property_type, parent_id, is_master, is_sub_hoa
  ) VALUES (
    'The Mansions at Evergrene West Condominium Association',
    'mansions-at-evergrene-west-condominium-association',
    'Palm Beach Gardens', 'Palm Beach', 'FL', 'draft',
    'Condo', master_id, false, true
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id   = EXCLUDED.parent_id,
        is_master   = EXCLUDED.is_master,
        is_sub_hoa  = EXCLUDED.is_sub_hoa;

END $$;

-- ────────────────────────────────────────────────────────────
-- STEP 4: Olympia — 17 village sub-associations
-- ────────────────────────────────────────────────────────────

DO $$
DECLARE
  master_id uuid;
BEGIN
  SELECT id INTO master_id
  FROM communities
  WHERE canonical_name ILIKE '%olympia%'
    AND (
      canonical_name ILIKE '%master%'
      OR (is_master = true AND canonical_name NOT ILIKE '%village%')
    )
  ORDER BY
    CASE WHEN is_master THEN 0 ELSE 1 END,
    created_at ASC
  LIMIT 1;

  -- Fallback: any olympia record that's not a village
  IF master_id IS NULL THEN
    SELECT id INTO master_id
    FROM communities
    WHERE canonical_name ILIKE '%olympia%'
      AND canonical_name NOT ILIKE '%village%'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  IF master_id IS NULL THEN
    RAISE WARNING 'Olympia master not found — skipping village inserts';
    RETURN;
  END IF;

  RAISE NOTICE 'Olympia master_id = %', master_id;

  -- Insert all 17 village sub-associations
  INSERT INTO communities (
    canonical_name, slug, city, county, state, status,
    property_type, parent_id, is_master, is_sub_hoa
  ) VALUES
    ('Bryden Village Homeowners Association',
     'bryden-village-homeowners-association-olympia',
     'Wellington', 'Palm Beach', 'FL', 'draft', 'HOA', master_id, false, true),
    ('Cooper Village Homeowners Association',
     'cooper-village-homeowners-association-olympia',
     'Wellington', 'Palm Beach', 'FL', 'draft', 'HOA', master_id, false, true),
    ('Danforth Village Homeowners Association',
     'danforth-village-homeowners-association-olympia',
     'Wellington', 'Palm Beach', 'FL', 'draft', 'HOA', master_id, false, true),
    ('Easton Village Homeowners Association',
     'easton-village-homeowners-association-olympia',
     'Wellington', 'Palm Beach', 'FL', 'draft', 'HOA', master_id, false, true),
    ('Hamblin Village Homeowners Association',
     'hamblin-village-homeowners-association-olympia',
     'Wellington', 'Palm Beach', 'FL', 'draft', 'HOA', master_id, false, true),
    ('Merriweather Village Homeowners Association',
     'merriweather-village-homeowners-association-olympia',
     'Wellington', 'Palm Beach', 'FL', 'draft', 'HOA', master_id, false, true),
    ('Payson Village Homeowners Association',
     'payson-village-homeowners-association-olympia',
     'Wellington', 'Palm Beach', 'FL', 'draft', 'HOA', master_id, false, true),
    ('Phipps Village Homeowners Association',
     'phipps-village-homeowners-association-olympia',
     'Wellington', 'Palm Beach', 'FL', 'draft', 'HOA', master_id, false, true),
    ('Postley Village Homeowners Association',
     'postley-village-homeowners-association-olympia',
     'Wellington', 'Palm Beach', 'FL', 'draft', 'HOA', master_id, false, true),
    ('Scribner Village Homeowners Association',
     'scribner-village-homeowners-association-olympia',
     'Wellington', 'Palm Beach', 'FL', 'draft', 'HOA', master_id, false, true),
    ('Shaughnessy Village Homeowners Association',
     'shaughnessy-village-homeowners-association-olympia',
     'Wellington', 'Palm Beach', 'FL', 'draft', 'HOA', master_id, false, true),
    ('Stotesbury Village Homeowners Association',
     'stotesbury-village-homeowners-association-olympia',
     'Wellington', 'Palm Beach', 'FL', 'draft', 'HOA', master_id, false, true),
    ('Thomson Village Homeowners Association',
     'thomson-village-homeowners-association-olympia',
     'Wellington', 'Palm Beach', 'FL', 'draft', 'HOA', master_id, false, true),
    ('Treanor Village Homeowners Association',
     'treanor-village-homeowners-association-olympia',
     'Wellington', 'Palm Beach', 'FL', 'draft', 'HOA', master_id, false, true),
    ('Waburton Village Homeowners Association',
     'waburton-village-homeowners-association-olympia',
     'Wellington', 'Palm Beach', 'FL', 'draft', 'HOA', master_id, false, true),
    ('Widener Village Homeowners Association',
     'widener-village-homeowners-association-olympia',
     'Wellington', 'Palm Beach', 'FL', 'draft', 'HOA', master_id, false, true),
    ('Woodworth Village Homeowners Association',
     'woodworth-village-homeowners-association-olympia',
     'Wellington', 'Palm Beach', 'FL', 'draft', 'HOA', master_id, false, true)
  ON CONFLICT (slug) DO UPDATE
    SET parent_id   = EXCLUDED.parent_id,
        is_master   = EXCLUDED.is_master,
        is_sub_hoa  = EXCLUDED.is_sub_hoa;

END $$;

-- ────────────────────────────────────────────────────────────
-- STEP 5: Seven Bridges — no sub-associations
-- Just mark the master and ensure is_sub_hoa=false
-- ────────────────────────────────────────────────────────────

UPDATE communities
SET is_master  = true,
    is_sub_hoa = false,
    parent_id  = NULL
WHERE canonical_name ILIKE '%seven bridges%';

-- ────────────────────────────────────────────────────────────
-- STEP 6: Link any existing sub-communities
-- If a record matching a known sub already exists without parent_id,
-- this links it to the correct master.
-- ────────────────────────────────────────────────────────────

-- BallenIsles subs — link any existing records that were orphaned
UPDATE communities s
SET parent_id  = m.id,
    is_sub_hoa = true,
    is_master  = false
FROM communities m
WHERE (m.canonical_name ILIKE '%ballenisles%' OR m.canonical_name ILIKE '%ballen isles%')
  AND m.is_master = true
  AND s.id <> m.id
  AND s.parent_id IS NULL
  AND (
    s.canonical_name ILIKE '%palm bay club%'
    OR s.canonical_name ILIKE '%palms at ballen%'
  );

-- Evergrene subs
UPDATE communities s
SET parent_id  = m.id,
    is_sub_hoa = true,
    is_master  = false
FROM communities m
WHERE m.canonical_name ILIKE '%evergrene%'
  AND m.is_master = true
  AND s.id <> m.id
  AND s.parent_id IS NULL
  AND s.canonical_name ILIKE '%mansions at evergrene%';

-- Olympia villages
UPDATE communities s
SET parent_id  = m.id,
    is_sub_hoa = true,
    is_master  = false
FROM communities m
WHERE m.canonical_name ILIKE '%olympia%'
  AND m.is_master = true
  AND m.canonical_name NOT ILIKE '%village%'
  AND s.id <> m.id
  AND s.parent_id IS NULL
  AND (
    s.canonical_name ILIKE '%bryden village%'
    OR s.canonical_name ILIKE '%cooper village%'
    OR s.canonical_name ILIKE '%danforth village%'
    OR s.canonical_name ILIKE '%easton village%'
    OR s.canonical_name ILIKE '%hamblin village%'
    OR s.canonical_name ILIKE '%merriweather village%'
    OR s.canonical_name ILIKE '%payson village%'
    OR s.canonical_name ILIKE '%phipps village%'
    OR s.canonical_name ILIKE '%postley village%'
    OR s.canonical_name ILIKE '%scribner village%'
    OR s.canonical_name ILIKE '%shaughnessy village%'
    OR s.canonical_name ILIKE '%stotesbury village%'
    OR s.canonical_name ILIKE '%thomson village%'
    OR s.canonical_name ILIKE '%treanor village%'
    OR s.canonical_name ILIKE '%waburton village%'
    OR s.canonical_name ILIKE '%widener village%'
    OR s.canonical_name ILIKE '%woodworth village%'
  );

-- ────────────────────────────────────────────────────────────
-- STEP 7: Final verification query (same as Task 8)
-- ────────────────────────────────────────────────────────────

SELECT
  m.canonical_name                    AS master,
  m.slug                              AS master_slug,
  m.is_master,
  COUNT(s.id)                         AS sub_count,
  array_agg(s.canonical_name ORDER BY s.canonical_name) AS sub_names
FROM communities m
LEFT JOIN communities s ON s.parent_id = m.id
WHERE m.canonical_name ILIKE ANY(ARRAY[
  '%ballenisles%', '%ballen isles%',
  '%evergrene%',
  '%olympia%',
  '%seven bridges%'
])
  AND m.is_master = true
GROUP BY m.id, m.canonical_name, m.slug, m.is_master
ORDER BY m.canonical_name;

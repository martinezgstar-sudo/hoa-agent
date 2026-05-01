-- ============================================================
-- Master/Sub HOA Extended Insert Script
-- Communities: PGA National, Abacoa, Ibis Golf & CC, Mirasol
-- Research completed: 2026-05-01
-- Run AFTER: supabase/migrations/20260501_master_sub_hoa.sql
-- Run AFTER: scripts/output/master-sub-inserts.sql
-- Safe to re-run (ON CONFLICT (slug) DO NOTHING on inserts;
-- orphan UPDATEs only set parent_id where it is currently NULL)
-- ============================================================
--
-- THE ACREAGE (Loxahatchee) — confirmed NO master HOA structure.
-- Governed by Indian Trail Improvement District (ITID, a special
-- taxing district). The Acreage Landowners Association (N92000000603)
-- is a voluntary 501(c)(4) civic org — NOT a mandatory HOA.
-- No master/sub rows to create.
--
-- ============================================================

-- ============================================================
-- STEP 1: Mark master communities
-- ============================================================

-- PGA National (PGA Property Owners Association, Inc. — Sunbiz 747410)
UPDATE communities
SET is_master = true
WHERE canonical_name ILIKE '%PGA National%'
  AND city ILIKE '%Palm Beach Gardens%'
  AND is_master IS DISTINCT FROM true;

-- Abacoa (Abacoa Property Owners' Assembly, Inc. — Sunbiz N96000005933)
UPDATE communities
SET is_master = true
WHERE canonical_name ILIKE '%Abacoa%'
  AND city ILIKE '%Jupiter%'
  AND is_master IS DISTINCT FROM true;

-- Ibis Golf & Country Club
-- (The Club at Ibis Property Owners' Association, Inc. — Sunbiz N39275)
UPDATE communities
SET is_master = true
WHERE (
    canonical_name ILIKE '%Ibis Golf%'
    OR canonical_name ILIKE '%Club at Ibis%'
    OR canonical_name ILIKE '%Ibis Country Club%'
  )
  AND city ILIKE '%West Palm Beach%'
  AND is_master IS DISTINCT FROM true;

-- Mirasol (Mirasol Club & Association, Inc. — Sunbiz N00000002392)
UPDATE communities
SET is_master = true
WHERE canonical_name ILIKE '%Mirasol%'
  AND city ILIKE '%Palm Beach Gardens%'
  AND is_master IS DISTINCT FROM true;

-- ============================================================
-- STEP 2: PGA National sub-HOAs (17 communities)
-- Master: PGA Property Owners Association, Inc. (Sunbiz 747410)
-- Located at 4440 PGA Blvd Suite 308, Palm Beach Gardens FL 33418
-- ============================================================

DO $$
DECLARE
  master_id uuid;
BEGIN
  SELECT id INTO master_id
  FROM communities
  WHERE canonical_name ILIKE '%PGA National%'
    AND city ILIKE '%Palm Beach Gardens%'
  ORDER BY (is_master::int) DESC, unit_count DESC NULLS LAST
  LIMIT 1;

  IF master_id IS NULL THEN
    RAISE NOTICE '[PGA National] master NOT FOUND in communities — sub inserts skipped';
    RETURN;
  END IF;

  RAISE NOTICE '[PGA National] master_id = %', master_id;

  -- 1. Ironwood No. 1 (~87 SF homes, along Haig/Fazio Golf Course)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Ironwood No. 1 Homeowners Association',
    'ironwood-no-1-pga-national',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 87
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 2. Prestwick Chase (226 units: 36 patio quads + 82 townhomes — Sunbiz N03525)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Prestwick Chase Homeowners Association',
    'prestwick-chase-pga-national',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 226
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 3. Marlwood Estates (custom SF homes 2,400–4,000 sq ft — Sunbiz 755359)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master
  ) VALUES (
    'Marlwood Homeowners Association',
    'marlwood-estates-pga-national',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 4. Townhomes of Marlwood (Sunbiz 767254)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master
  ) VALUES (
    'Townhomes of Marlwood Homeowners Association',
    'townhomes-of-marlwood-pga-national',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 5. Patio Homes at PGA National (~140 units, lake/golf views)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Patio Homes at PGA National',
    'patio-homes-pga-national',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 140
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 6. Barclay Club at PGA National (~288 SF homes — Sunbiz N13295)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Barclay Club at PGA National',
    'barclay-club-pga-national',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 288
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 7. Bristol Club at PGA National (Sunbiz N22060)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master
  ) VALUES (
    'Bristol Club at PGA National',
    'bristol-club-pga-national',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 8. Eagleton Lakes (Championship POA section — Sunbiz N19587)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master
  ) VALUES (
    'Eagleton Lakes Homeowners Association',
    'eagleton-lakes-pga-national',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 9. Eagleton Estates (Championship POA section — Sunbiz N29906)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master
  ) VALUES (
    'Eagleton Estates Homeowners Association',
    'eagleton-estates-pga-national',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 10. Glenwood (near north entrance — Sunbiz 750782)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master
  ) VALUES (
    'Glenwood Homeowners Association at PGA National',
    'glenwood-pga-national',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 11. Golf Villas at PGA National (condos — Sunbiz N94000003461)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master
  ) VALUES (
    'Golf Villas at PGA National',
    'golf-villas-pga-national',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'Condo', 'draft', true, master_id, false
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 12. Preston Courts at PGA National (25 units — Sunbiz N36993)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Preston Courts at PGA National Homeowners Association',
    'preston-courts-pga-national',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 25
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 13. Villas of Burwick & Thurston (combined — Sunbiz 753030)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master
  ) VALUES (
    'Villas of Burwick and Thurston Homeowners Association',
    'villas-burwick-thurston-pga-national',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 14. Club Cottages (~220 townhomes, built 1981)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Club Cottages at PGA National',
    'club-cottages-pga-national',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 220
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 15. Thurston (~150 SF homes along Haig course)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Thurston at PGA National',
    'thurston-pga-national',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 150
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 16. Meadowbrook (~76 condos)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Meadowbrook at PGA National',
    'meadowbrook-pga-national',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'Condo', 'draft', true, master_id, false, 76
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 17. Coventry (58 SF homes along General Golf Course)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Coventry at PGA National',
    'coventry-pga-national',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 58
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  RAISE NOTICE '[PGA National] 17 sub-HOA inserts/updates complete';
END $$;

-- ============================================================
-- STEP 3: Abacoa sub-HOAs (15 communities)
-- Master: Abacoa Property Owners' Assembly, Inc. (Sunbiz N96000005933)
-- Located at 1031 Community Drive, Jupiter, FL 33458
-- NOTE: Botanica/Sea Plum Master Association is a SEPARATE master
-- community (NOT an Abacoa sub). Camellia, Heritage, Homewood,
-- Legends at the Fields, Princeton Place do NOT exist in Abacoa.
-- ============================================================

DO $$
DECLARE
  master_id uuid;
BEGIN
  SELECT id INTO master_id
  FROM communities
  WHERE canonical_name ILIKE '%Abacoa%'
    AND city ILIKE '%Jupiter%'
  ORDER BY (is_master::int) DESC, unit_count DESC NULLS LAST
  LIMIT 1;

  IF master_id IS NULL THEN
    RAISE NOTICE '[Abacoa] master NOT FOUND in communities — sub inserts skipped';
    RETURN;
  END IF;

  RAISE NOTICE '[Abacoa] master_id = %', master_id;

  -- 1. Antigua at Town Center (~280 townhomes — Sunbiz N02000009107)
  --    Built by Town & Country Builders 2004-2006; Realtime Property Mgmt
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Antigua at Town Center Homeowners Association',
    'antigua-at-abacoa',
    'Jupiter', '33458', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 280
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 2. Mallory Creek (~581 homes — Sunbiz N06000003793)
  --    Key West/beach cottage style; Triton Property Management
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Mallory Creek at Abacoa Homeowners Association',
    'mallory-creek-abacoa',
    'Jupiter', '33458', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 581
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 3. Village at Abacoa / Town Center condos (~413 units — Sunbiz N04000006013)
  --    Residential condos above retail; Castle Group management
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Village at Abacoa Condominium Association',
    'village-at-abacoa-condo',
    'Jupiter', '33458', 'Palm Beach', 'FL',
    'Condo', 'draft', true, master_id, false, 413
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 4. Windsor Park (~380 homes — Sunbiz N06000010430)
  --    Capital Realty Advisors management
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Windsor Park Abacoa Homeowners Association',
    'windsor-park-abacoa',
    'Jupiter', '33458', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 380
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 5. Cambridge at Abacoa (~209 units — Sunbiz N01000000072)
  --    DiVosta 2001; Lang Management
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Cambridge at Abacoa Homeowners Association',
    'cambridge-at-abacoa',
    'Jupiter', '33458', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 209
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 6. Tuscany at Abacoa (~453 units — Sunbiz N01000006205)
  --    Triton Property Management; tuscanyabacoa.com
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Tuscany at Abacoa Homeowners Association',
    'tuscany-at-abacoa',
    'Jupiter', '33458', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 453
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 7. Valencia at Abacoa (~136 homes — Sunbiz N01000000067)
  --    Harbor Management of South Florida; valenciahoa.org
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Valencia at Abacoa Homeowners Association',
    'valencia-at-abacoa',
    'Jupiter', '33458', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 136
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 8. Osceola Woods (~146 townhomes — Sunbiz N01000003459)
  --    Mediterranean 3-story; Community Association Consulting Experts
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Osceola Woods at Abacoa Homeowners Association',
    'osceola-woods-abacoa',
    'Jupiter', '33458', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 146
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 9. Somerset at Abacoa (~266 condos/TH — Sunbiz N03000009144)
  --    GRS Community Management; somersetatabacoa.com
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Somerset at Abacoa Condominium Association',
    'somerset-at-abacoa',
    'Jupiter', '33458', 'Palm Beach', 'FL',
    'Condo', 'draft', true, master_id, false, 266
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 10. Canterbury Place (~317 units: 144 SFH + 173 TH)
  --     Tuscan/French Country style; canterburyplacehoa.org
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Canterbury Place at Abacoa Homeowners Association',
    'canterbury-place-abacoa',
    'Jupiter', '33458', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 317
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 11. Charleston Court (~192 Victorian golf course townhomes)
  --     Built DiVosta 1999-2000; charlestoncourthoa.org
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Charleston Court at Abacoa Homeowners Association',
    'charleston-court-abacoa',
    'Jupiter', '33458', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 192
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 12. Greenwich POA (live/work townhomes — Davenport Professional Mgmt)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master
  ) VALUES (
    'Greenwich at Abacoa Property Owners Association',
    'greenwich-at-abacoa',
    'Jupiter', '33458', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 13. NewHaven at Abacoa (~505 units: Victorian style)
  --     Castle Group management; newhavenabacoa.sites.townsq.io
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'NewHaven at Abacoa Homeowners Association',
    'newhaven-at-abacoa',
    'Jupiter', '33458', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 505
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 14. Martinique at Abacoa (~456 units)
  --     Harbor Management of South Florida; mymartiniquehoa.com
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Martinique at Abacoa Homeowners Association',
    'martinique-at-abacoa',
    'Jupiter', '33458', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 456
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 15. The Island at Abacoa (~176 units: 134 SFH + 42 TH, Victorian)
  --     DiVosta 1999; HOA dues ~$689/quarter
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'The Island at Abacoa Homeowners Association',
    'island-at-abacoa',
    'Jupiter', '33458', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 176
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  RAISE NOTICE '[Abacoa] 15 sub-HOA inserts/updates complete';
END $$;

-- ============================================================
-- STEP 4: Ibis Golf & Country Club sub-HOAs (9 communities)
-- Master: The Club at Ibis Property Owners' Association (Sunbiz N39275)
-- 8225 Ibis Blvd, West Palm Beach FL 33412
-- ~33 total neighborhoods; 9 with confirmed entity numbers surfaced
-- ============================================================

DO $$
DECLARE
  master_id uuid;
BEGIN
  SELECT id INTO master_id
  FROM communities
  WHERE (
    canonical_name ILIKE '%Ibis Golf%'
    OR canonical_name ILIKE '%Club at Ibis%'
    OR canonical_name ILIKE '%Ibis Country Club%'
  )
    AND city ILIKE '%West Palm Beach%'
  ORDER BY (is_master::int) DESC, unit_count DESC NULLS LAST
  LIMIT 1;

  IF master_id IS NULL THEN
    RAISE NOTICE '[Ibis Golf] master NOT FOUND in communities — sub inserts skipped';
    RETURN;
  END IF;

  RAISE NOTICE '[Ibis Golf] master_id = %', master_id;

  -- 1. Sand Cay at Ibis (37 confirmed SF homes — GRS Community Management)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Sand Cay at Ibis Homeowners Association',
    'sand-cay-at-ibis',
    'West Palm Beach', '33412', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 37
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 2. Bent Creek at Ibis (~50 SF homes — Sunbiz N03000004169)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Bent Creek at Ibis Homeowners Association',
    'bent-creek-at-ibis',
    'West Palm Beach', '33412', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 50
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 3. Grande at Ibis (~70 SF homes — Sunbiz N97000001535)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Grande at Ibis Homeowners Association',
    'grande-at-ibis',
    'West Palm Beach', '33412', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 70
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 4. Hawks Landing at Ibis (~60 SF homes — Sunbiz N970000071410)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Hawks Landing at Ibis Homeowners Association',
    'hawks-landing-at-ibis',
    'West Palm Beach', '33412', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 60
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 5. Larkspur Landing at Ibis (~45 SF homes — Sunbiz N97000005347)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Larkspur Landing at Ibis Homeowners Association',
    'larkspur-landing-at-ibis',
    'West Palm Beach', '33412', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 45
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 6. The Preserve at Ibis (~80 SF homes — Sunbiz N42410)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'The Preserve at Ibis Homeowners Association',
    'preserve-at-ibis',
    'West Palm Beach', '33412', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 80
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 7. Ibis Lakes (~60 SF homes — Sunbiz N39277)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Ibis Lakes Homeowners Association',
    'ibis-lakes-at-ibis',
    'West Palm Beach', '33412', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 60
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 8. Quail Meadow at Ibis (~50 SF homes — Sunbiz N39276)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Quail Meadow at Ibis Homeowners Association',
    'quail-meadow-at-ibis',
    'West Palm Beach', '33412', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 50
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 9. Terra Lago at Ibis (~60 SF homes — Sunbiz N01000003956)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Terra Lago at Ibis Homeowners Association',
    'terra-lago-at-ibis',
    'West Palm Beach', '33412', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 60
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  RAISE NOTICE '[Ibis Golf] 9 sub-HOA inserts/updates complete';
END $$;

-- ============================================================
-- STEP 5: Mirasol sub-HOAs (7 communities)
-- Master: Mirasol Club & Association, Inc. (Sunbiz N00000002392)
-- 8409 N. Military Trail Suite 123, Palm Beach Gardens FL 33410
-- NOTE: Mirabella at Mirasol (N01000006194, 492 homes) is a
-- SEPARATE standalone gated community — NOT a Mirasol sub-HOA.
-- Mirasol has 23+ village sub-associations total; 7 confirmed here.
-- ============================================================

DO $$
DECLARE
  master_id uuid;
BEGIN
  SELECT id INTO master_id
  FROM communities
  WHERE canonical_name ILIKE '%Mirasol%'
    AND city ILIKE '%Palm Beach Gardens%'
  ORDER BY (is_master::int) DESC, unit_count DESC NULLS LAST
  LIMIT 1;

  IF master_id IS NULL THEN
    RAISE NOTICE '[Mirasol] master NOT FOUND in communities — sub inserts skipped';
    RETURN;
  END IF;

  RAISE NOTICE '[Mirasol] master_id = %', master_id;

  -- 1. Esperanza at Mirasol (~45 SF homes — Sunbiz N00000007943)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Esperanza at Mirasol Property Owners Association',
    'esperanza-at-mirasol',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 45
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 2. Palacio at Mirasol (~40 SF homes — Sunbiz N02000001537)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Palacio at Mirasol Property Owners Association',
    'palacio-at-mirasol',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 40
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 3. Olivera at Mirasol (41 confirmed SF homes — Sunbiz N01000007291)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Olivera at Mirasol Property Homeowners Association',
    'olivera-at-mirasol',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 41
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 4. Mariposa at Mirasol (~35 SF homes — Sunbiz N02000001540)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Mariposa at Mirasol Property Homeowners Association',
    'mariposa-at-mirasol',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 35
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 5. San Remo at Mirasol (56 confirmed SF homes — Sunbiz N04000006401)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'San Remo at Mirasol Property Owners Association',
    'san-remo-at-mirasol',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 56
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 6. Siesta at Mirasol (~30 SF homes — Sunbiz N04000010103)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Siesta at Mirasol Property Homeowners Association',
    'siesta-at-mirasol',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'HOA', 'draft', true, master_id, false, 30
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  -- 7. Mirasol I Condominium (~40 condos — Sunbiz N05000012248)
  INSERT INTO communities (
    canonical_name, slug, city, zip_code, county, state,
    property_type, status, is_sub_hoa, parent_id, is_master, unit_count
  ) VALUES (
    'Mirasol I Condominium Association',
    'mirasol-i-condominium',
    'Palm Beach Gardens', '33418', 'Palm Beach', 'FL',
    'Condo', 'draft', true, master_id, false, 40
  )
  ON CONFLICT (slug) DO UPDATE
    SET parent_id = EXCLUDED.parent_id, is_sub_hoa = true
    WHERE communities.parent_id IS NULL;

  RAISE NOTICE '[Mirasol] 7 sub-HOA inserts/updates complete';
END $$;

-- ============================================================
-- STEP 6: Link existing orphaned records
-- Finds communities already in DB that match known sub-HOA names
-- but are missing parent_id — links them to their masters
-- ============================================================

-- PGA National orphan links
UPDATE communities AS s
SET    parent_id  = m.id,
       is_sub_hoa = true
FROM   communities m
WHERE  m.canonical_name ILIKE '%PGA National%'
  AND  m.city ILIKE '%Palm Beach Gardens%'
  AND  m.is_master = true
  AND  s.id        <> m.id
  AND  s.parent_id IS NULL
  AND  s.city ILIKE '%Palm Beach Gardens%'
  AND  (
    s.canonical_name ILIKE '%Ironwood%PGA%'
    OR s.canonical_name ILIKE '%Prestwick%Chase%'
    OR s.canonical_name ILIKE '%Marlwood%'
    OR s.canonical_name ILIKE '%Patio Homes%PGA%'
    OR s.canonical_name ILIKE '%Barclay Club%PGA%'
    OR s.canonical_name ILIKE '%Bristol Club%PGA%'
    OR s.canonical_name ILIKE '%Eagleton%'
    OR s.canonical_name ILIKE '%Glenwood%PGA%'
    OR s.canonical_name ILIKE '%Golf Villas%PGA%'
    OR s.canonical_name ILIKE '%Preston Courts%PGA%'
    OR s.canonical_name ILIKE '%Club Cottages%PGA%'
    OR s.canonical_name ILIKE '%Thurston%PGA%'
    OR s.canonical_name ILIKE '%Meadowbrook%PGA%'
    OR s.canonical_name ILIKE '%Coventry%PGA%'
  );

-- Abacoa orphan links
UPDATE communities AS s
SET    parent_id  = m.id,
       is_sub_hoa = true
FROM   communities m
WHERE  m.canonical_name ILIKE '%Abacoa%'
  AND  m.city ILIKE '%Jupiter%'
  AND  m.is_master = true
  AND  s.id        <> m.id
  AND  s.parent_id IS NULL
  AND  s.city ILIKE '%Jupiter%'
  AND  (
    s.canonical_name ILIKE '%Antigua%Abacoa%'
    OR s.canonical_name ILIKE '%Mallory Creek%'
    OR s.canonical_name ILIKE '%Village%Abacoa%'
    OR s.canonical_name ILIKE '%Windsor Park%Abacoa%'
    OR s.canonical_name ILIKE '%Cambridge%Abacoa%'
    OR s.canonical_name ILIKE '%Tuscany%Abacoa%'
    OR s.canonical_name ILIKE '%Valencia%Abacoa%'
    OR s.canonical_name ILIKE '%Osceola Woods%Abacoa%'
    OR s.canonical_name ILIKE '%Somerset%Abacoa%'
    OR s.canonical_name ILIKE '%Canterbury%Abacoa%'
    OR s.canonical_name ILIKE '%Charleston Court%Abacoa%'
    OR s.canonical_name ILIKE '%Greenwich%Abacoa%'
    OR s.canonical_name ILIKE '%NewHaven%Abacoa%'
    OR s.canonical_name ILIKE '%Martinique%Abacoa%'
    OR s.canonical_name ILIKE '%Island%Abacoa%'
  );

-- Ibis orphan links
UPDATE communities AS s
SET    parent_id  = m.id,
       is_sub_hoa = true
FROM   communities m
WHERE  (m.canonical_name ILIKE '%Ibis Golf%' OR m.canonical_name ILIKE '%Club at Ibis%')
  AND  m.city ILIKE '%West Palm Beach%'
  AND  m.is_master = true
  AND  s.id        <> m.id
  AND  s.parent_id IS NULL
  AND  s.city ILIKE '%West Palm Beach%'
  AND  (
    s.canonical_name ILIKE '%Sand Cay%Ibis%'
    OR s.canonical_name ILIKE '%Bent Creek%Ibis%'
    OR s.canonical_name ILIKE '%Grande%Ibis%'
    OR s.canonical_name ILIKE '%Hawks Landing%Ibis%'
    OR s.canonical_name ILIKE '%Larkspur%Ibis%'
    OR s.canonical_name ILIKE '%Preserve%Ibis%'
    OR s.canonical_name ILIKE '%Ibis Lakes%'
    OR s.canonical_name ILIKE '%Quail Meadow%Ibis%'
    OR s.canonical_name ILIKE '%Terra Lago%Ibis%'
  );

-- Mirasol orphan links
UPDATE communities AS s
SET    parent_id  = m.id,
       is_sub_hoa = true
FROM   communities m
WHERE  m.canonical_name ILIKE '%Mirasol%'
  AND  m.city ILIKE '%Palm Beach Gardens%'
  AND  m.is_master = true
  AND  s.id        <> m.id
  AND  s.parent_id IS NULL
  AND  s.city ILIKE '%Palm Beach Gardens%'
  AND  (
    s.canonical_name ILIKE '%Esperanza%Mirasol%'
    OR s.canonical_name ILIKE '%Palacio%Mirasol%'
    OR s.canonical_name ILIKE '%Olivera%Mirasol%'
    OR s.canonical_name ILIKE '%Mariposa%Mirasol%'
    OR s.canonical_name ILIKE '%San Remo%Mirasol%'
    OR s.canonical_name ILIKE '%Siesta%Mirasol%'
    OR s.canonical_name ILIKE '%Mirasol I%'
  );

-- ============================================================
-- STEP 7: Verification (run after all steps above)
-- ============================================================
SELECT
  m.canonical_name                                         AS master,
  m.city,
  m.is_master,
  COUNT(s.id)                                              AS sub_count,
  COUNT(s.id) FILTER (WHERE s.status = 'published')        AS sub_published,
  COUNT(s.id) FILTER (WHERE s.status = 'draft')            AS sub_draft,
  array_agg(s.canonical_name ORDER BY s.canonical_name)    AS sub_names
FROM communities m
LEFT JOIN communities s ON s.parent_id = m.id
WHERE m.canonical_name ILIKE ANY(ARRAY[
  '%PGA National%',
  '%Abacoa%',
  '%Ibis Golf%',
  '%Club at Ibis%',
  '%Mirasol%',
  '%BallenIsles%',
  '%Evergrene%',
  '%Olympia%',
  '%Seven Bridges%'
])
  AND (m.is_master = true OR m.parent_id IS NULL)
GROUP BY m.id, m.canonical_name, m.city, m.is_master
ORDER BY sub_count DESC, m.canonical_name;

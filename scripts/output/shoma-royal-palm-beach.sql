-- ============================================================
-- Shoma Homes @ Royal Palm Beach — Research Results
-- Generated: 2026-05-02
-- ============================================================
-- HOA Entity (Sunbiz, local cordata3.txt):
--   SHOMA AT ROYAL PALM CONDOMINIUM ASSOCIATION, INC.
--   Doc#: N03000002013 | Status: ACTIVE | Filed: 03/06/2003
--   EIN: 77-0596558
--   Principal: 2300 SHOMA DR, ROYAL PALM BEACH, FL 33414
--   Registered Agent: POLIAKOFF BACKER
--                     2424 NORTH FEDERAL HIGHWAY, BOCA RATON FL 33431
--   Officers:
--     President:  Saad, Sarkis        (2300 Shoma Dr)
--     Treasurer:  Steele Sternbach, Brenden (2300 Shoma Dr)
--     VP:         Quick, Stacy        (2300 Shoma Dr)
--     Secretary:  Guerrero, Jessica   (2300 Shoma Dr)
--     VP:         Evans, Colten       (2300 Shoma Dr)
--
-- Communities governed (all are one condo association):
--   1. SHOMA COURTYARDS 3 AT ROYAL PALM CONDO       32 units
--   2. SHOMA COURTYARDS I AT ROYAL PALM CONDO       20 units
--   3. SHOMA COURTYARDS II AT ROYAL PALM CONDO      80 units
--   4. SHOMA TOWNHOMES AT ROYAL PALM BEACH CONDO   193 units
--   5. SHOMA VILLAS I AT ROYAL PALM CONDO            8 units
--   6. SHOMA VILLAS II AT ROYAL PALM CONDO          58 units
--   7. SHOMA VILLAS III AT ROYAL PALM CONDO         52 units
--   TOTAL:                                         443 units
--
-- SOURCES CHECKED:
--   [1]  DDG: Shoma Homes Royal Palm Beach HOA
--   [2]  DDG: Shoma Homes Royal Palm Beach HOA fees monthly
--   [3]  DDG: Shoma Homes Royal Palm Beach management company
--   [4]  DDG: Shoma Townhomes Royal Palm Beach amenities fees
--   [5]  DDG: Shoma Homes Royal Palm Beach amenities pool gate
--   [6]  DDG: Shoma Homes Royal Palm Beach Zillow HOA fee
--   [7]  DDG: Shoma Homes Royal Palm Beach realtor.com HOA
--   [8]  DDG: site:hoamanagement.com Shoma Royal Palm Beach
--   [9]  shomagroup.com (fetched — developer site, not HOA)
--   [10] Sunbiz (local /Volumes/LaCie cordata3.txt) → FOUND HOA entity
--   [11] PBCPAO Property Information Table (LaCie CSV) → 443 units confirmed
--   [12] DBPR — no CAM results found for Shoma Royal Palm Beach
--   [13] CommunityPay.us → confirmed entity, no fee/mgmt data
--   [14] FloridaCommunityNetwork.net → HTTP 403
--   [15] florida-hoa.net → HTTP 403
--   [16] Zillow listing snippet → "gated community" confirmed
--   [17] hoamanagement.com → no results for Shoma RPB
--   [18] OpenGovUS, OpenCorporates → blocked/404
--   [19] Campbell, KW, Vesta, FirstService, Seacrest → no Shoma match
--   [20] Cordata 2300 Shoma Dr entities → no management company found
--
-- DATA FOUND:
--   gated          = 'Yes'  (confirmed — Zillow listing)
--   age_restricted = 'No'   (inferred — 2003 family condo, no evidence of restriction)
--
-- DATA NOT FOUND (requires manual research):
--   management_company, hoa_website, phone, email,
--   monthly_fee_min, amenities, pet_restriction, rental_approval
--
-- NOTE: gated + age_restricted require migration 20260501_research_stats.sql
--       to be run first (adds those columns).
-- ============================================================

-- PREREQUISITE: Run supabase/migrations/20260501_research_stats.sql first.
-- That migration adds the gated and age_restricted columns.

-- ── STEP 1: Update gated = 'Yes' for all 7 Shoma communities ────────────────
UPDATE communities
SET gated = 'Yes'
WHERE id IN (
    '85ec86aa-75ac-4463-a915-1ffb47513104',  -- SHOMA COURTYARDS 3
    'bf063e2e-a746-4e7c-a596-098088ca76ee',  -- SHOMA COURTYARDS I
    'd3604f4b-05ab-491e-a7f8-18f9eaf76d1b',  -- SHOMA COURTYARDS II
    'dd7bcbd5-ea86-409e-86d9-0a8b31283117',  -- SHOMA TOWNHOMES
    '3a7d8bfe-b23d-47c8-95a1-90514cccb8cf',  -- SHOMA VILLAS I
    '3ca8eb06-8c29-4e5a-911f-e7c96df52f19',  -- SHOMA VILLAS II
    'c0f64c33-4599-4a97-9689-f74a236305cb'   -- SHOMA VILLAS III
)
AND gated IS NULL;

-- ── STEP 2: Update age_restricted = 'No' for all 7 communities ──────────────
UPDATE communities
SET age_restricted = 'No'
WHERE id IN (
    '85ec86aa-75ac-4463-a915-1ffb47513104',
    'bf063e2e-a746-4e7c-a596-098088ca76ee',
    'd3604f4b-05ab-491e-a7f8-18f9eaf76d1b',
    'dd7bcbd5-ea86-409e-86d9-0a8b31283117',
    '3a7d8bfe-b23d-47c8-95a1-90514cccb8cf',
    '3ca8eb06-8c29-4e5a-911f-e7c96df52f19',
    'c0f64c33-4599-4a97-9689-f74a236305cb'
)
AND age_restricted IS NULL;

-- ── STEP 3: Research log — one entry per community ──────────────────────────

INSERT INTO community_research_log
    (community_id, researched_at, fields_updated, sources_checked, notes)
VALUES
-- Courtyards 3
(
    '85ec86aa-75ac-4463-a915-1ffb47513104',
    now(),
    ARRAY['gated', 'age_restricted'],
    ARRAY[
        'DDG x8 queries — Shoma Homes Royal Palm Beach HOA, fees, management, amenities',
        'shomagroup.com — developer site; no HOA operational data',
        'Sunbiz local (cordata3.txt) — SHOMA AT ROYAL PALM CONDOMINIUM ASSOCIATION INC, N03000002013, ACTIVE, 2300 Shoma Dr, Poliakoff Backer reg agent',
        'PBCPAO Property Information Table (LaCie CSV) — 32 parcels confirmed',
        'DBPR — no CAM results',
        'CommunityPay.us — entity confirmed, no fee/mgmt data',
        'FloridaCommunityNetwork.net — HTTP 403',
        'florida-hoa.net — HTTP 403',
        'Zillow listing snippet — "gated community" confirmed',
        'hoamanagement.com, Campbell, KW, Vesta, Seacrest — no Shoma match',
        'Cordata 2300 Shoma Dr scan — no management company entity found'
    ],
    'HOA entity: SHOMA AT ROYAL PALM CONDOMINIUM ASSOCIATION, INC. (N03000002013). One association governs all 7 Shoma communities at Royal Palm Beach. gated=Yes confirmed from Zillow listing. age_restricted=No inferred (2003 family condo development). Management company, fees, phone, email, amenities not found via automation — require manual research at floridacommunitynetwork.net or direct contact with Poliakoff Backer (2424 N Federal Hwy, Boca Raton FL 33431).'
),
-- Courtyards I
(
    'bf063e2e-a746-4e7c-a596-098088ca76ee',
    now(),
    ARRAY['gated', 'age_restricted'],
    ARRAY[
        'DDG x8 queries — Shoma Homes Royal Palm Beach HOA, fees, management, amenities',
        'Sunbiz local (cordata3.txt) — N03000002013 ACTIVE',
        'PBCPAO Property Information Table (LaCie CSV) — 20 parcels confirmed',
        'CommunityPay.us — entity confirmed, no fee/mgmt data',
        'Zillow listing snippet — "gated community" confirmed'
    ],
    'Same HOA (N03000002013) as all 7 Shoma RPB communities. gated=Yes, age_restricted=No. 20 units confirmed from PBCPAO.'
),
-- Courtyards II
(
    'd3604f4b-05ab-491e-a7f8-18f9eaf76d1b',
    now(),
    ARRAY['gated', 'age_restricted'],
    ARRAY[
        'DDG x8 queries — Shoma Homes Royal Palm Beach HOA, fees, management, amenities',
        'Sunbiz local (cordata3.txt) — N03000002013 ACTIVE',
        'PBCPAO Property Information Table (LaCie CSV) — 80 parcels confirmed',
        'CommunityPay.us — entity confirmed, no fee/mgmt data',
        'Zillow listing snippet — "gated community" confirmed'
    ],
    'Same HOA (N03000002013) as all 7 Shoma RPB communities. gated=Yes, age_restricted=No. 80 units confirmed from PBCPAO.'
),
-- Townhomes
(
    'dd7bcbd5-ea86-409e-86d9-0a8b31283117',
    now(),
    ARRAY['gated', 'age_restricted'],
    ARRAY[
        'DDG x8 queries — Shoma Homes Royal Palm Beach HOA, fees, management, amenities',
        'shomagroup.com — developer site; no HOA operational data',
        'Sunbiz local (cordata3.txt) — N03000002013 ACTIVE, 2300 Shoma Dr, Poliakoff Backer',
        'PBCPAO Property Information Table (LaCie CSV) — 193 parcels confirmed',
        'DBPR — no CAM results for Shoma Royal Palm Beach',
        'CommunityPay.us — entity confirmed, no fee/mgmt data',
        'FloridaCommunityNetwork.net — HTTP 403',
        'florida-hoa.net — HTTP 403',
        'Zillow listing snippet — "gated community in the heart of Royal Palm Beach"',
        'Zillow: 2254/2511 Shoma Dr listings found, built 2003, HTTP 403 on detail fetch',
        'hoamanagement.com, Campbell, KW, Vesta, FirstService, Seacrest — no Shoma match'
    ],
    'Largest community (193 units). HOA: SHOMA AT ROYAL PALM CONDOMINIUM ASSOCIATION, INC. (N03000002013). gated=Yes confirmed. age_restricted=No inferred. Year built 2003. Developer: Shoma Group (201 Sevilla Ave Ste 300, Coral Gables FL 33134, (786) 437-8658). Management company unknown — requires manual research.'
),
-- Villas I
(
    '3a7d8bfe-b23d-47c8-95a1-90514cccb8cf',
    now(),
    ARRAY['gated', 'age_restricted'],
    ARRAY[
        'DDG x8 queries — Shoma Homes Royal Palm Beach HOA, fees, management, amenities',
        'Sunbiz local (cordata3.txt) — N03000002013 ACTIVE',
        'PBCPAO Property Information Table (LaCie CSV) — 8 parcels confirmed',
        'Zillow listing snippet — "gated community" confirmed'
    ],
    'Same HOA (N03000002013). gated=Yes, age_restricted=No. Smallest community — 8 units.'
),
-- Villas II
(
    '3ca8eb06-8c29-4e5a-911f-e7c96df52f19',
    now(),
    ARRAY['gated', 'age_restricted'],
    ARRAY[
        'DDG x8 queries — Shoma Homes Royal Palm Beach HOA, fees, management, amenities',
        'Sunbiz local (cordata3.txt) — N03000002013 ACTIVE',
        'PBCPAO Property Information Table (LaCie CSV) — 58 parcels confirmed',
        'Zillow listing snippet — "gated community" confirmed'
    ],
    'Same HOA (N03000002013). gated=Yes, age_restricted=No. 58 units confirmed from PBCPAO.'
),
-- Villas III
(
    'c0f64c33-4599-4a97-9689-f74a236305cb',
    now(),
    ARRAY['gated', 'age_restricted'],
    ARRAY[
        'DDG x8 queries — Shoma Homes Royal Palm Beach HOA, fees, management, amenities',
        'Sunbiz local (cordata3.txt) — N03000002013 ACTIVE',
        'PBCPAO Property Information Table (LaCie CSV) — 52 parcels confirmed',
        'Zillow listing snippet — "gated community" confirmed'
    ],
    'Same HOA (N03000002013). gated=Yes, age_restricted=No. 52 units confirmed from PBCPAO.'
);

-- ── VERIFICATION ────────────────────────────────────────────────────────────
SELECT
    c.canonical_name,
    c.city,
    c.unit_count,
    c.gated,
    c.age_restricted,
    c.management_company,
    c.monthly_fee_min
FROM communities c
WHERE c.id IN (
    '85ec86aa-75ac-4463-a915-1ffb47513104',
    'bf063e2e-a746-4e7c-a596-098088ca76ee',
    'd3604f4b-05ab-491e-a7f8-18f9eaf76d1b',
    'dd7bcbd5-ea86-409e-86d9-0a8b31283117',
    '3a7d8bfe-b23d-47c8-95a1-90514cccb8cf',
    '3ca8eb06-8c29-4e5a-911f-e7c96df52f19',
    'c0f64c33-4599-4a97-9689-f74a236305cb'
)
ORDER BY c.canonical_name;

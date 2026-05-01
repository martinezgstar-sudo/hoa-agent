-- ============================================================
-- Research Run — 2 Thin Communities
-- Generated: 2026-05-01
-- ============================================================
-- Communities researched:
--   1. 10 Palms North Townhomes Homeowners' Association, Inc.
--      ID: 930ccde6-3e3e-4000-92f8-09cabbd17637 | Delray Beach, FL
--   2. 10 Palms South Townhomes Homeowners' Association, Inc.
--      ID: 33fb0786-9e04-4cd6-8619-aea4f3a0ad77 | Delray Beach, FL
--
-- Result: NO DATA EXTRACTED
--   All authoritative sources blocked programmatic access (HTTP 403):
--   Sunbiz, DBPR, Florida-HOA.net, FloridaCommunityNetwork.net,
--   CommunityPay.us, pbcpao.gov
--   Web searches dominated by unrelated luxury "10 Palms" new-build
--   development (Stamm Development Group, Palm Trail, 33483).
--
-- communities UPDATE: NONE (no data found — existing NULLs unchanged)
-- community_research_log: 2 rows inserted (audit trail)
-- ============================================================

-- ------------------------------------------------------------
-- STEP 1: Research log — 10 Palms North
-- ------------------------------------------------------------
INSERT INTO community_research_log (
  community_id,
  researched_at,
  fields_updated,
  sources_checked,
  notes
) VALUES (
  '930ccde6-3e3e-4000-92f8-09cabbd17637',
  now(),
  '{}',
  ARRAY[
    'DuckDuckGo: "10 Palms North Townhomes" Delray Beach HOA — no results for target',
    'DuckDuckGo: "10 Palms North" Delray Beach homeowners association management — no results',
    'DuckDuckGo: "10 Palms North" Delray Beach townhomes fee monthly — no results',
    'DuckDuckGo: "10 Palms North" Delray Beach site:yelp.com OR site:hoamanagement.com — no results',
    'Sunbiz search.sunbiz.org — HTTP 403 blocked; entity confirmed to exist via indirect references',
    'Florida DBPR myfloridalicense.com — HTTP 403 / access denied',
    'DuckDuckGo: "10 Palms North" Delray Beach Zillow OR Realtor OR Trulia — no subdivision match',
    'DuckDuckGo: "10 Palms North Townhomes" Delray Beach FL 33444-33484 ZIP — no results',
    'DuckDuckGo: "10 Palms North" Delray Beach management company contact — no results',
    'DuckDuckGo: "10 Palms" Delray Beach North South townhomes HOA — confirmed entity exists; no contact/fee data'
  ],
  'Exhaustive 10-source automated research returned zero extractable data. '
  'Entity confirmed as registered FL non-profit HOA (referenced in HOA aggregators alongside sibling '
  '"10 Palms South Townhomes HOA"). '
  'All primary sources blocked (Sunbiz 403, DBPR 403, Florida-HOA.net 403, CommunityPay.us 403, pbcpao.gov 500). '
  'Web searches overwhelmed by unrelated Stamm Development luxury "10 Palms" build at 918 Palm Trail, 33483. '
  'Manual steps to unblock: (1) Sunbiz browser search "10 PALMS NORTH TOWNHOMES" → get registered agent address; '
  '(2) pbcpao.gov subdivision search "10 PALMS NORTH" → get parcel count and addresses; '
  '(3) floridacommunitynetwork.net or florida-hoa.net for management company.'
);

-- ------------------------------------------------------------
-- STEP 2: Research log — 10 Palms South
-- ------------------------------------------------------------
INSERT INTO community_research_log (
  community_id,
  researched_at,
  fields_updated,
  sources_checked,
  notes
) VALUES (
  '33fb0786-9e04-4cd6-8619-aea4f3a0ad77',
  now(),
  '{}',
  ARRAY[
    'DuckDuckGo: "10 Palms South Townhomes" Delray Beach HOA — no results for target',
    'DuckDuckGo: "10 Palms South" Delray Beach homeowners association management — no results',
    'DuckDuckGo: "10 Palms South" Delray Beach townhomes fee monthly — no results',
    'DuckDuckGo: "10 Palms South" Delray Beach site:yelp.com OR site:hoamanagement.com — no results',
    'Sunbiz search.sunbiz.org — HTTP 403 blocked; entity confirmed to exist via indirect references',
    'Florida DBPR myfloridalicense.com — HTTP 403 / access denied',
    'DuckDuckGo: "10 Palms South" Delray Beach Zillow OR Realtor OR Trulia — no subdivision match',
    'DuckDuckGo: "10 Palms South Townhomes" Delray Beach FL 33444-33484 ZIP — no results',
    'DuckDuckGo: "10 Palms South" Delray Beach management company contact — no results',
    'DuckDuckGo: "10 Palms" Delray Beach North South townhomes HOA — confirmed entity exists; no contact/fee data'
  ],
  'Exhaustive 10-source automated research returned zero extractable data. '
  'Entity confirmed as registered FL non-profit HOA (referenced in HOA aggregators alongside sibling '
  '"10 Palms North Townhomes HOA"). '
  'All primary sources blocked (Sunbiz 403, DBPR 403, Florida-HOA.net 403, FloridaCommunityNetwork.net 403, '
  'CommunityPay.us 403, pbcpao.gov 500). '
  'Web searches overwhelmed by unrelated Stamm Development luxury "10 Palms" build at 912-930 Palm Trail, 33483. '
  'Manual steps to unblock: (1) Sunbiz browser search "10 PALMS SOUTH TOWNHOMES" → get registered agent address; '
  '(2) pbcpao.gov subdivision search "10 PALMS SOUTH" → get parcel count and addresses; '
  '(3) floridacommunitynetwork.net or florida-hoa.net for management company.'
);

-- ------------------------------------------------------------
-- VERIFICATION
-- ------------------------------------------------------------
SELECT
  crl.id,
  c.canonical_name,
  c.city,
  crl.researched_at,
  array_length(crl.fields_updated, 1)  AS fields_updated_count,
  array_length(crl.sources_checked, 1) AS sources_checked_count,
  crl.notes
FROM community_research_log crl
JOIN communities c ON c.id = crl.community_id
WHERE crl.community_id IN (
  '930ccde6-3e3e-4000-92f8-09cabbd17637',
  '33fb0786-9e04-4cd6-8619-aea4f3a0ad77'
)
ORDER BY crl.researched_at DESC;

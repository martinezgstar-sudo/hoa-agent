-- ============================================================
-- TASK 5: Thin Communities Priority Report
-- Run in Supabase SQL Editor, then export as CSV
-- File: scripts/output/thin-communities-priority.csv (gitignored)
-- ============================================================

-- UPDATABLE_FIELDS mirror the cron/research route:
--   management_company, hoa_website, phone, email,
--   unit_count, monthly_fee_min, amenities, pet_restriction, rental_approval,
--   age_restricted, gated  (added in 20260501_research_stats migration)

-- Top 100 thinnest published communities ordered by missing field count
SELECT
  id,
  canonical_name,
  city,
  county,
  property_type,
  status,
  (
    CASE WHEN management_company IS NULL THEN 1 ELSE 0 END +
    CASE WHEN hoa_website        IS NULL THEN 1 ELSE 0 END +
    CASE WHEN phone              IS NULL THEN 1 ELSE 0 END +
    CASE WHEN email              IS NULL THEN 1 ELSE 0 END +
    CASE WHEN unit_count         IS NULL THEN 1 ELSE 0 END +
    CASE WHEN monthly_fee_min    IS NULL THEN 1 ELSE 0 END +
    CASE WHEN amenities          IS NULL THEN 1 ELSE 0 END +
    CASE WHEN pet_restriction    IS NULL THEN 1 ELSE 0 END +
    CASE WHEN rental_approval    IS NULL THEN 1 ELSE 0 END +
    CASE WHEN age_restricted     IS NULL THEN 1 ELSE 0 END +
    CASE WHEN gated              IS NULL THEN 1 ELSE 0 END
  ) AS missing_field_count,
  management_company,
  hoa_website,
  phone,
  email,
  unit_count,
  monthly_fee_min,
  amenities,
  pet_restriction,
  rental_approval,
  age_restricted,
  gated
FROM communities
WHERE status = 'published'
ORDER BY missing_field_count DESC, canonical_name ASC
LIMIT 100;

-- ============================================================
-- Count: how many published communities have 5+ missing fields?
-- ============================================================
SELECT
  COUNT(*)                                                       AS total_published,
  COUNT(*) FILTER (WHERE missing >= 5)                           AS has_5_plus_missing,
  COUNT(*) FILTER (WHERE missing >= 8)                           AS has_8_plus_missing,
  ROUND(COUNT(*) FILTER (WHERE missing >= 5) * 100.0 / COUNT(*), 1) AS pct_5_plus
FROM (
  SELECT
    (
      CASE WHEN management_company IS NULL THEN 1 ELSE 0 END +
      CASE WHEN hoa_website        IS NULL THEN 1 ELSE 0 END +
      CASE WHEN phone              IS NULL THEN 1 ELSE 0 END +
      CASE WHEN email              IS NULL THEN 1 ELSE 0 END +
      CASE WHEN unit_count         IS NULL THEN 1 ELSE 0 END +
      CASE WHEN monthly_fee_min    IS NULL THEN 1 ELSE 0 END +
      CASE WHEN amenities          IS NULL THEN 1 ELSE 0 END +
      CASE WHEN pet_restriction    IS NULL THEN 1 ELSE 0 END +
      CASE WHEN rental_approval    IS NULL THEN 1 ELSE 0 END +
      CASE WHEN age_restricted     IS NULL THEN 1 ELSE 0 END +
      CASE WHEN gated              IS NULL THEN 1 ELSE 0 END
    ) AS missing
  FROM communities
  WHERE status = 'published'
) sub;

-- ============================================================
-- Breakdown by property type
-- ============================================================
SELECT
  property_type,
  COUNT(*)                                      AS total,
  COUNT(*) FILTER (WHERE missing >= 5)          AS thin_5_plus,
  ROUND(AVG(missing), 1)                        AS avg_missing
FROM (
  SELECT
    property_type,
    (
      CASE WHEN management_company IS NULL THEN 1 ELSE 0 END +
      CASE WHEN hoa_website        IS NULL THEN 1 ELSE 0 END +
      CASE WHEN phone              IS NULL THEN 1 ELSE 0 END +
      CASE WHEN email              IS NULL THEN 1 ELSE 0 END +
      CASE WHEN unit_count         IS NULL THEN 1 ELSE 0 END +
      CASE WHEN monthly_fee_min    IS NULL THEN 1 ELSE 0 END +
      CASE WHEN amenities          IS NULL THEN 1 ELSE 0 END +
      CASE WHEN pet_restriction    IS NULL THEN 1 ELSE 0 END +
      CASE WHEN rental_approval    IS NULL THEN 1 ELSE 0 END +
      CASE WHEN age_restricted     IS NULL THEN 1 ELSE 0 END +
      CASE WHEN gated              IS NULL THEN 1 ELSE 0 END
    ) AS missing
  FROM communities
  WHERE status = 'published'
) sub
GROUP BY property_type
ORDER BY thin_5_plus DESC;

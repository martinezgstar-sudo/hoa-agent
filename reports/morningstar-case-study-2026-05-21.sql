-- Verification queries for reports/morningstar-case-study-2026-05-21.md
-- Run against Supabase project uacgzbojhjelzirvbphg. All figures in the
-- one-pager are derived from these queries (rule #18, CLAUDE.md).

-- 1. MorningStar advertiser record (plan, status, target cities)
SELECT id, company_name, category, plan, status,
       array_length(target_cities, 1) AS target_city_count,
       target_cities, website_url, phone, tagline, ad_copy,
       cta_text, cta_url, created_at
FROM advertisers
WHERE company_name ILIKE '%morningstar%';

-- 2. Community pages eligible to render the SponsoredCard
WITH ms AS (SELECT target_cities FROM advertisers WHERE company_name ILIKE '%morningstar%')
SELECT COUNT(*) AS eligible_pages
FROM communities c, ms
WHERE c.status='published'
  AND c.city = ANY (ms.target_cities);

-- 3. Total PBC published pages (denominator for reach %)
SELECT COUNT(*) AS total_published_pbc
FROM communities WHERE status='published';

-- 4. Impressions roll-up (12-day window since first event)
SELECT
  COUNT(*) AS total_events,
  COUNT(*) FILTER (WHERE event_type='impression') AS impressions,
  COUNT(*) FILTER (WHERE event_type='click') AS clicks,
  COUNT(*) FILTER (WHERE event_type='cta_click') AS cta_clicks,
  COUNT(*) FILTER (WHERE event_type='website_click') AS website_clicks,
  COUNT(*) FILTER (WHERE event_type='phone_click') AS phone_clicks,
  COUNT(*) FILTER (WHERE is_bot=true) AS bot_events,
  COUNT(*) FILTER (WHERE is_bot=false) AS human_events,
  MIN(created_at) AS first_seen,
  MAX(created_at) AS last_seen
FROM ad_events;

-- 5. Daily impression trend (14-day window)
SELECT DATE(created_at) AS d, COUNT(*) AS total,
       COUNT(*) FILTER (WHERE is_bot=false) AS human,
       COUNT(*) FILTER (WHERE is_bot=true)  AS bot
FROM ad_events
WHERE created_at >= NOW() - INTERVAL '14 days'
GROUP BY DATE(created_at)
ORDER BY d;

-- 6. Per-city impression breakdown
SELECT city, COUNT(*) AS n,
       COUNT(*) FILTER (WHERE is_bot=false) AS human_n
FROM ad_events
GROUP BY city
ORDER BY n DESC LIMIT 15;

-- 7. Top community pages by human impressions
SELECT community_slug, city, COUNT(*) AS n,
       COUNT(*) FILTER (WHERE is_bot=false) AS human_n
FROM ad_events
WHERE community_slug IS NOT NULL
GROUP BY community_slug, city
ORDER BY n DESC LIMIT 12;

-- 8. Known-gap diagnostic: confirm ad_id / advertiser_id attribution loss
SELECT ad_id, advertiser_id, COUNT(*) AS n,
       COUNT(*) FILTER (WHERE is_bot=false) AS human_n
FROM ad_events
GROUP BY ad_id, advertiser_id
ORDER BY n DESC LIMIT 5;
-- Expected: a single row with ad_id=NULL, advertiser_id=NULL covering
-- all events — confirms the FK-mismatch bug described in Known Gaps.

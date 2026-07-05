-- 20260705_harden_02_fk_indexes.rollback.sql
-- Drops the 11 FK covering indexes (CONCURRENTLY; run each outside a transaction).
drop index concurrently if exists public.idx_communities_master_hoa_id;
drop index concurrently if exists public.idx_ad_analytics_advertiser_id;
drop index concurrently if exists public.idx_ad_generation_sessions_advertiser_id;
drop index concurrently if exists public.idx_advertiser_ads_advertiser_id;
drop index concurrently if exists public.idx_advertiser_profiles_category_id;
drop index concurrently if exists public.idx_advertiser_zip_categories_advertiser_id;
drop index concurrently if exists public.idx_assessment_signals_community_id;
drop index concurrently if exists public.idx_community_legal_cases_legal_case_id;
drop index concurrently if exists public.idx_fee_observations_community_id;
drop index concurrently if exists public.idx_news_replies_community_news_id;
drop index concurrently if exists public.idx_reviews_community_id;

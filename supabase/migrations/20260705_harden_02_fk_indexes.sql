-- 20260705_harden_02_fk_indexes.sql
-- harden(hoa): covering indexes for 11 advisor-flagged unindexed foreign keys (public schema).
-- The 12th (fdd.opportunities.possible_duplicate_of) is in the FROZEN fdd schema -> queued for 2026-07-08.
-- NOTE: each statement uses CREATE INDEX CONCURRENTLY and therefore CANNOT run inside a
-- transaction block. Apply these statements individually (not wrapped in BEGIN/COMMIT).
-- Rollback: 20260705_harden_02_fk_indexes.rollback.sql
-- communities.master_hoa_id is the priority index.

create index concurrently if not exists idx_communities_master_hoa_id on public.communities (master_hoa_id);
create index concurrently if not exists idx_ad_analytics_advertiser_id on public.ad_analytics (advertiser_id);
create index concurrently if not exists idx_ad_generation_sessions_advertiser_id on public.ad_generation_sessions (advertiser_id);
create index concurrently if not exists idx_advertiser_ads_advertiser_id on public.advertiser_ads (advertiser_id);
create index concurrently if not exists idx_advertiser_profiles_category_id on public.advertiser_profiles (category_id);
create index concurrently if not exists idx_advertiser_zip_categories_advertiser_id on public.advertiser_zip_categories (advertiser_id);
create index concurrently if not exists idx_assessment_signals_community_id on public.assessment_signals (community_id);
create index concurrently if not exists idx_community_legal_cases_legal_case_id on public.community_legal_cases (legal_case_id);
create index concurrently if not exists idx_fee_observations_community_id on public.fee_observations (community_id);
create index concurrently if not exists idx_news_replies_community_news_id on public.news_replies (community_news_id);
create index concurrently if not exists idx_reviews_community_id on public.reviews (community_id);

-- 20260907_v3_columns.rollback.sql
-- Reverses 20260907_v3_columns.sql. Drops new tables and columns in the
-- correct dependency order. Safe to re-run (all statements are IF EXISTS).

begin;

-- 5. job_health
drop policy if exists job_health_service_role_all on public.job_health;
drop index  if exists public.idx_job_health_ok_time;
drop index  if exists public.idx_job_health_name_time;
drop table  if exists public.job_health;

-- 4. change_log
drop policy if exists change_log_service_role_all on public.change_log;
drop index  if exists public.idx_change_log_action_time;
drop index  if exists public.idx_change_log_run;
drop index  if exists public.idx_change_log_community_time;
drop table  if exists public.change_log;

-- 3. community_utilities (before utility_providers — FK dependency)
drop policy if exists community_utilities_anon_select      on public.community_utilities;
drop policy if exists community_utilities_service_role_all on public.community_utilities;
drop index  if exists public.idx_community_utilities_provider;
drop table  if exists public.community_utilities;

-- 2. utility_providers
drop policy if exists utility_providers_anon_select        on public.utility_providers;
drop policy if exists utility_providers_service_role_all   on public.utility_providers;
drop index  if exists public.idx_utility_providers_scope;
drop table  if exists public.utility_providers;

-- 1. communities columns (8 truly-new v3 columns)
drop index if exists public.idx_communities_next_research_at;

alter table public.communities
  drop constraint if exists communities_dues_frequency_check;

alter table public.communities
  drop column if exists fees_source,
  drop column if exists management_source,
  drop column if exists location_source,
  drop column if exists identity_source,
  drop column if exists dues_frequency,
  drop column if exists management_website,
  drop column if exists management_phone,
  drop column if exists next_research_at;

commit;

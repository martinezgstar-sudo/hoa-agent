-- 20260909_start_service_links.rollback.sql
-- Reverses 20260909_start_service_links.sql. Drops the check
-- constraint and both new columns. Safe to re-run.

begin;

alter table public.utility_providers
  drop constraint if exists utility_providers_new_service_url_scheme_check;

alter table public.utility_providers
  drop column if exists new_service_verified_at,
  drop column if exists new_service_url;

commit;

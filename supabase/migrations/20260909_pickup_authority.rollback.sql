-- 20260909_pickup_authority.rollback.sql
-- Reverses 20260909_pickup_authority.sql. Drops the check constraint
-- and the five new columns. Safe to re-run (all statements are IF
-- EXISTS). Leaves the pre-existing trash_pickup_days /
-- recycling_pickup_days / trash_provider columns alone.

begin;

alter table public.communities
  drop constraint if exists communities_pickup_lookup_url_scheme_check;

alter table public.communities
  drop column if exists pickup_verified_at,
  drop column if exists pickup_source,
  drop column if exists bulk_pickup_days,
  drop column if exists pickup_lookup_url,
  drop column if exists trash_authority;

commit;

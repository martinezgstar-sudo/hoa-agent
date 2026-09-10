-- 20260909_pickup_authority.sql
-- v3 Phase 10b — pickup-days job schema.
--
-- ADDS ONLY. No column is dropped, no data touched. Rollback file is
-- 20260909_pickup_authority.rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────
-- Context
--
-- The existing schema already has two free-text pickup columns from
-- migration 20260716_trash_utilities.sql:
--
--   communities.trash_pickup_days      text  (0 non-null / 7,964 published)
--   communities.recycling_pickup_days  text  (0 non-null / 7,964 published)
--   communities.trash_provider         text  (0 non-null / 7,964 published)
--
-- Phase 10b's rule-based pickup module (scripts/lib/pickup-days.ts,
-- called from nightly-enrich inside the utilities step for every new
-- and refresh row) will fill those two columns from SWA of PBC
-- address lookups and a city-default table. This migration adds
-- the five NEW columns the owner named:
--
--   trash_authority       text        the entity that publishes the schedule
--                                     (SWA of PBC, City of Boca Raton, …).
--                                     Distinct from trash_provider, which
--                                     is the private hauler brand.
--   pickup_lookup_url     text        per-address lookup where one exists
--                                     (SWA has one) or authority's general
--                                     schedule page. http(s) only.
--   bulk_pickup_days      text        bulk/yard-waste day(s), free text.
--   pickup_source         text        provenance tag (same pattern as
--                                     identity_source, location_source,
--                                     management_source, fees_source):
--                                     'authority-lookup' | 'city-default' |
--                                     'manual' | …
--   pickup_verified_at    timestamptz when the last successful pickup
--                                     write happened. Community-page
--                                     footer reads 'Verified on {date}'
--                                     when set, 'Reported to HOA Agent'
--                                     when null.
--
-- trash_provider is left alone.
-- ─────────────────────────────────────────────────────────────────────

begin;

alter table public.communities
  add column if not exists trash_authority    text,
  add column if not exists pickup_lookup_url  text,
  add column if not exists bulk_pickup_days   text,
  add column if not exists pickup_source      text,
  add column if not exists pickup_verified_at timestamptz;

-- Cheap sanity guard: pickup_lookup_url must be http(s) if present.
-- Keeps the community page from rendering mailto:/file:/javascript: URLs.
alter table public.communities
  add constraint communities_pickup_lookup_url_scheme_check
    check (pickup_lookup_url is null or pickup_lookup_url ~* '^https?://');

commit;

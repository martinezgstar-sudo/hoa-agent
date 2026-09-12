-- 20260909_start_service_links.sql
-- v3 Phase 10c — start-service links on utility_providers.
--
-- ADDS ONLY. No column is dropped, no data touched. Rollback file is
-- 20260909_start_service_links.rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────
-- Context
--
-- utility_providers already has one URL column: `provider_url`, which
-- is the provider's general homepage (fpl.com, swa.org, …). Visitors
-- landing on a community page who are ABOUT TO MOVE IN want a deeper
-- link — the "start service" / "new customer" enrollment page — so
-- they can turn on electric / water / sewer / trash / gas without
-- hunting through the homepage.
--
-- This migration adds two columns:
--
--   new_service_url         text        http(s) only. Deep-link to the
--                                       provider's start-service /
--                                       new-customer enrollment page.
--                                       NULL means "fall back to
--                                       provider_url" on the community
--                                       page render.
--   new_service_verified_at timestamptz set when the fill step last
--                                       resolved this URL against the
--                                       provider's own domain with a
--                                       200 response.
--
-- The provider table is owner-authored (owner ruling 2026-09-10), so
-- no `new_service_source` column — the source is always 'manual' by
-- construction. The 45 existing rows are filled by a follow-up data
-- step, not this migration.
-- ─────────────────────────────────────────────────────────────────────

begin;

alter table public.utility_providers
  add column if not exists new_service_url         text,
  add column if not exists new_service_verified_at timestamptz;

alter table public.utility_providers
  add constraint utility_providers_new_service_url_scheme_check
    check (new_service_url is null or new_service_url ~* '^https?://');

commit;

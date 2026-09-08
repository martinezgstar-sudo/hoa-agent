-- 20260907_v3_columns.sql
-- v3 Phase 2 — schema for the nightly-enrich loop.
--
-- ADDS ONLY. No column is dropped, no data touched. Rollback file is the
-- paired ...rollback.sql; rollback drops the columns and tables added
-- here in reverse order.
--
-- ─────────────────────────────────────────────────────────────────────
-- OWNER RULING (2026-09-08): reuse existing columns where semantics
-- overlap. This migration adds only the 8 truly-new columns; the four
-- proposed collisions (confidence, last_researched_at, location_verified,
-- dues_amount) were rejected. The v3 job path uses the existing names:
--
--   score           -> communities.confidence_score           (smallint holds 0–100)
--   cadence         -> communities.last_verified              (v3 owns after Phase 7)
--   geo-check       -> communities.city_verified              (true when city+zip agree with the county source)
--   fees            -> communities.monthly_fee_median         (write after normalizing to monthly + rounding to $25 per CLAUDE.md rule 14)
--                      raw evidence with the verbatim rule    -> fee_observations
--
-- The three Phase-2-listed identity fields (sunbiz_document_number,
-- sunbiz_status, registered_agent) are also NOT added — the v3 code
-- path uses the existing columns state_entity_number, entity_status,
-- registered_agent directly. No aliases.
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ============================================================
-- 1. communities: 8 truly-new v3 columns
-- ============================================================

alter table public.communities
  add column if not exists next_research_at    timestamptz,
  add column if not exists management_phone    text,
  add column if not exists management_website  text,
  add column if not exists dues_frequency      text,
  add column if not exists identity_source     text,
  add column if not exists location_source     text,
  add column if not exists management_source   text,
  add column if not exists fees_source         text;

-- Constrain dues_frequency to the four values the work-order calls out.
-- 'unknown' handles the "we saw a fee but couldn't classify the cadence" case.
alter table public.communities
  add constraint communities_dues_frequency_check
    check (dues_frequency is null
           or dues_frequency in ('monthly','quarterly','annual','unknown'));

-- Index for the "pick tonight's refresh batch" query:
--   WHERE status='published'
--     AND (next_research_at IS NULL OR next_research_at <= now())
--   ORDER BY next_research_at ASC NULLS FIRST
create index if not exists idx_communities_next_research_at
  on public.communities (next_research_at)
  where status = 'published';

-- ============================================================
-- 2. utility_providers  (canonical list; seed from CSV separately)
-- ============================================================

create table if not exists public.utility_providers (
  id             bigserial primary key,
  county         text        not null,
  city           text,
  zip            text,
  service        text        not null
                 check (service in ('electric','water','sewer','trash','gas')),
  provider_name  text        not null,
  provider_phone text,
  provider_url   text,
  notes          text,
  -- verified_at = fetch timestamp from data/utilities_palm_beach.csv.
  -- NULL means "unverified" — the public site hides provider_phone when
  -- verified_at is NULL (matches CSV rule).
  verified_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One row per (county, city, zip, service). Matches the resolution order
-- Phase 3 uses (county → city → zip). NULL city + NULL zip is the
-- county-wide default; a city-scoped row overrides it inside that city.
create unique index if not exists idx_utility_providers_scope
  on public.utility_providers (
    county,
    coalesce(city, ''),
    coalesce(zip,  ''),
    service
  );

alter table public.utility_providers enable row level security;
create policy utility_providers_service_role_all
  on public.utility_providers for all to service_role using (true) with check (true);
create policy utility_providers_anon_select
  on public.utility_providers for select to anon using (true);

-- ============================================================
-- 3. community_utilities  (per-community mapping to providers)
-- ============================================================

create table if not exists public.community_utilities (
  community_id uuid   not null references public.communities(id) on delete cascade,
  service      text   not null
               check (service in ('electric','water','sewer','trash','gas')),
  provider_id  bigint not null references public.utility_providers(id),
  verified_at  timestamptz not null default now(),
  primary key (community_id, service)
);

create index if not exists idx_community_utilities_provider
  on public.community_utilities (provider_id);

alter table public.community_utilities enable row level security;
create policy community_utilities_service_role_all
  on public.community_utilities for all to service_role using (true) with check (true);
create policy community_utilities_anon_select
  on public.community_utilities for select to anon using (true);

-- ============================================================
-- 4. change_log  (append-only audit trail written by nightly-enrich)
-- ============================================================

create table if not exists public.change_log (
  id           bigserial primary key,
  occurred_at  timestamptz not null default now(),
  community_id uuid        references public.communities(id) on delete set null,
  action       text        not null
               check (action in (
                 'published','refreshed','removed','queued',
                 'approved','rejected','field_updated'
               )),
  field        text,
  old_value    text,
  new_value    text,
  source       text,
  run_id       bigint
);

create index if not exists idx_change_log_community_time
  on public.change_log (community_id, occurred_at desc);
create index if not exists idx_change_log_run
  on public.change_log (run_id);
create index if not exists idx_change_log_action_time
  on public.change_log (action, occurred_at desc);

alter table public.change_log enable row level security;
create policy change_log_service_role_all
  on public.change_log for all to service_role using (true) with check (true);
-- No anon policy — audit log is service-role only.

-- ============================================================
-- 5. job_health  (orchestrator writes one row per check per interval)
-- ============================================================

create table if not exists public.job_health (
  id          bigserial primary key,
  checked_at  timestamptz not null default now(),
  check_name  text        not null,
  ok          boolean     not null,
  detail      text,
  retried     boolean     not null default false,
  alerted     boolean     not null default false
);

create index if not exists idx_job_health_name_time
  on public.job_health (check_name, checked_at desc);
create index if not exists idx_job_health_ok_time
  on public.job_health (ok, checked_at desc);

alter table public.job_health enable row level security;
create policy job_health_service_role_all
  on public.job_health for all to service_role using (true) with check (true);
-- No anon policy — orchestrator health is service-role only.

commit;

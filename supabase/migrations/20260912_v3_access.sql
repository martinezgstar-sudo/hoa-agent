-- 20260912_v3_access.sql
-- v3 Phase 6 — canonical anon/service_role access rule.
--
-- ─────────────────────────────────────────────────────────────────────
-- Owner ruling 2026-09-12 — one anon-allow list, everything else
-- service_role only:
--
--   communities            anon SELECT WHERE status='published'
--   community_utilities    anon SELECT
--   utility_providers      anon SELECT
--   community_comments     anon SELECT WHERE status='approved'
--                          anon INSERT
--   suggestions            anon INSERT
--   fee_observations       anon INSERT
--
-- Every other public table: RLS on, ONE service_role ALL policy,
-- NO anon, NO authenticated, NO {public}-role policies.
--
-- Function surface:
--   REVOKE EXECUTE ON reporting_summary, complete_community, exec_sql
--   FROM anon, authenticated.
--
-- Views:
--   advertiser_ad_stats, v_county_expansion,
--   v_recent_research_activity, v_stuck_queue — recreated
--   WITH (security_invoker = true).
--   cron_daily — dropped (no code reference).
-- ─────────────────────────────────────────────────────────────────────

begin;

-- ═══════════════════════════════════════════════════════════════════
-- 1. anon-allow list — replace policies with the canonical set
-- ═══════════════════════════════════════════════════════════════════

-- communities: drop every existing policy, recreate the two canonical.
drop policy if exists "Public can read published communities"       on public.communities;
drop policy if exists "Public communities are viewable by everyone" on public.communities;
drop policy if exists "Public read communities"                     on public.communities;
drop policy if exists "Service role all communities"                on public.communities;
drop policy if exists "Service role insert communities"             on public.communities;
drop policy if exists "Service role update communities"             on public.communities;
create policy communities_anon_select_published
  on public.communities for select to anon
  using (status = 'published');
create policy communities_service_role_all
  on public.communities for all to service_role
  using (true) with check (true);

-- community_comments: replace anon SELECT with status='approved' guard;
-- keep anon INSERT + service_role ALL.
drop policy if exists community_comments_anon_select on public.community_comments;
create policy community_comments_anon_select
  on public.community_comments for select to anon
  using (status = 'approved');

-- suggestions: drop anon SELECT; keep anon INSERT + service_role ALL.
drop policy if exists suggestions_anon_select on public.suggestions;

-- fee_observations: drop anon SELECT; keep anon INSERT + service_role ALL.
drop policy if exists fee_observations_anon_select on public.fee_observations;

-- community_utilities and utility_providers: already have
-- (anon SELECT true, service_role ALL) — no change.

-- ═══════════════════════════════════════════════════════════════════
-- 2. everything else — drop anon/auth/public, ensure service_role ALL
-- ═══════════════════════════════════════════════════════════════════

drop policy if exists "Public insert analytics"                on public.ad_analytics;

drop policy if exists "advertiser reads own ad_events"         on public.ad_events;

drop policy if exists "Users see own sessions"                 on public.ad_generation_sessions;

drop policy if exists "Users manage own ads"                   on public.advertiser_ads;

drop policy if exists "Users create own profile"               on public.advertiser_profiles;
drop policy if exists "Users read own profile"                 on public.advertiser_profiles;
drop policy if exists "Users update own profile"               on public.advertiser_profiles;

drop policy if exists "Users manage own zip categories"        on public.advertiser_zip_categories;

drop policy if exists anon_read_active_advertisers             on public.advertisers;

drop policy if exists assessment_signals_anon_select           on public.assessment_signals;

drop policy if exists "Anyone can submit suggestion"           on public.community_suggestions_deprecated;
drop policy if exists "Public insert community_suggestions"    on public.community_suggestions_deprecated;
drop policy if exists "Public read approved suggestions"       on public.community_suggestions_deprecated;
drop policy if exists "Service role delete suggestions"        on public.community_suggestions_deprecated;
drop policy if exists "Service role update suggestions"        on public.community_suggestions_deprecated;

drop policy if exists "Public submit field correction"         on public.pending_community_data;

drop policy if exists reviews_anon_select                      on public.reviews;

-- Every public table gets exactly one service_role ALL policy.
-- IF NOT EXISTS keeps this idempotent alongside tables that already
-- have one (change_log, cron_runs, job_health, job_runs, etc.).
do $$
declare
  t record;
begin
  for t in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format(
      'alter table public.%I enable row level security;', t.tablename
    );
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename  = t.tablename
        and 'service_role' = any(roles)
        and cmd = 'ALL'
    ) then
      execute format(
        'create policy %I on public.%I for all to service_role using (true) with check (true);',
        t.tablename || '_service_role_all', t.tablename
      );
    end if;
  end loop;
end
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 3. functions — anon and authenticated cannot call the three.
-- ═══════════════════════════════════════════════════════════════════

revoke execute on function public.reporting_summary(text)             from anon, authenticated;
revoke execute on function public.complete_community(uuid, text, integer, jsonb)
                                                                      from anon, authenticated;
revoke execute on function public.exec_sql(text, boolean)             from anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 4. views — recreate the referenced ones with security_invoker=true,
--             drop cron_daily (no code reference).
-- ═══════════════════════════════════════════════════════════════════

drop view if exists public.advertiser_ad_stats          cascade;
drop view if exists public.cron_daily                   cascade;
drop view if exists public.v_county_expansion           cascade;
drop view if exists public.v_recent_research_activity   cascade;
drop view if exists public.v_stuck_queue                cascade;

create view public.advertiser_ad_stats
  with (security_invoker = true) as
  select advertiser_id,
    count(*) filter (where event_type = 'impression' and not coalesce(is_bot, false))                                                as impressions,
    count(*) filter (where event_type = any (array['click','website_click']) and not coalesce(is_bot, false))                        as clicks,
    count(*) filter (where event_type = 'impression' and not coalesce(is_bot, false) and created_at > now() - interval '30 days')    as impressions_30d,
    count(*) filter (where event_type = any (array['click','website_click']) and not coalesce(is_bot, false) and created_at > now() - interval '30 days') as clicks_30d,
    max(created_at) as last_event_at
  from public.ad_events
  group by advertiser_id;

create view public.v_county_expansion
  with (security_invoker = true) as
  select county,
    count(*) as total,
    count(*) filter (where status = 'live')                            as live,
    count(*) filter (where status = 'needs_review')                    as needs_review,
    count(*) filter (where status = 'draft')                           as draft,
    count(*) filter (where verification_status = 'verified')           as verified,
    count(*) filter (where verification_status = 'pending')            as pending_verification,
    max(updated_at)                                                    as last_activity
  from public.communities
  where county is not null
  group by county
  order by case when county = 'Palm Beach' then 0 else 1 end, count(*) desc;

create view public.v_recent_research_activity
  with (security_invoker = true) as
  select id, canonical_name, slug, city, county, status, verification_status,
    updated_at, created_at,
    case when created_at = updated_at then 'created' else 'updated' end as activity_type
  from public.communities
  where updated_at > now() - interval '30 days'
  order by updated_at desc
  limit 100;

create view public.v_stuck_queue
  with (security_invoker = true) as
  select id, canonical_name, slug, city, county, status, verification_status,
    management_company, created_at, updated_at,
    (extract(day from (now() - updated_at)))::int as days_stuck
  from public.communities
  where status = 'needs_review'
    and updated_at < now() - interval '7 days'
  order by updated_at
  limit 50;

-- cron_daily: not referenced anywhere in the code tree. Dropped above
-- and not recreated. Grep as of 2026-09-12: 0 hits in app/, scripts/,
-- lib/, or supabase/. If a future reader adds a caller, recreate then.

commit;

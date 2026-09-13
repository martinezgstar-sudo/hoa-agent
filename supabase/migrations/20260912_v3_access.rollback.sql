-- 20260912_v3_access.rollback.sql
-- Reverses 20260912_v3_access.sql. Restores the anon/authenticated
-- policies this migration dropped, restores the anon SELECT on
-- suggestions and fee_observations, restores the loose community_comments
-- anon SELECT, drops the "_service_role_all" policies this migration
-- added to previously-unpoliced tables, recreates the four views
-- WITHOUT security_invoker (Postgres default), and recreates cron_daily.
--
-- The revoked function EXECUTE grants are RE-GRANTED to anon and
-- authenticated. Safe to re-run (all statements are idempotent).

begin;

-- 1. communities — restore the loose policies (pre-migration state).
drop policy if exists communities_anon_select_published on public.communities;
drop policy if exists communities_service_role_all      on public.communities;
create policy "Public can read published communities"
  on public.communities for select to anon
  using (status = 'published');
create policy "Public communities are viewable by everyone"
  on public.communities for select
  using (status = 'published');
create policy "Public read communities"
  on public.communities for select
  using (true);
create policy "Service role all communities"
  on public.communities for all
  using (true) with check (true);
create policy "Service role insert communities"
  on public.communities for insert
  with check (auth.role() = 'service_role');
create policy "Service role update communities"
  on public.communities for update
  using (auth.role() = 'service_role');

-- 2. community_comments — restore loose anon SELECT.
drop policy if exists community_comments_anon_select on public.community_comments;
create policy community_comments_anon_select
  on public.community_comments for select to anon
  using (true);

-- 3. suggestions / fee_observations — restore anon SELECT.
create policy suggestions_anon_select
  on public.suggestions for select to anon using (true);
create policy fee_observations_anon_select
  on public.fee_observations for select to anon using (true);

-- 4. Restore the anon/auth/public policies we dropped elsewhere.
create policy "Public insert analytics"
  on public.ad_analytics for insert to anon with check (true);
create policy "advertiser reads own ad_events"
  on public.ad_events for select to authenticated using (true);
create policy "Users see own sessions"
  on public.ad_generation_sessions for all using (true);
create policy "Users manage own ads"
  on public.advertiser_ads for all using (true);
create policy "Users create own profile"
  on public.advertiser_profiles for insert to authenticated with check (true);
create policy "Users read own profile"
  on public.advertiser_profiles for select using (true);
create policy "Users update own profile"
  on public.advertiser_profiles for update using (true);
create policy "Users manage own zip categories"
  on public.advertiser_zip_categories for all to authenticated using (true);
create policy anon_read_active_advertisers
  on public.advertisers for select to anon using (status = 'active');
create policy assessment_signals_anon_select
  on public.assessment_signals for select to anon using (true);
create policy "Anyone can submit suggestion"
  on public.community_suggestions_deprecated for insert with check (true);
create policy "Public insert community_suggestions"
  on public.community_suggestions_deprecated for insert with check (true);
create policy "Public read approved suggestions"
  on public.community_suggestions_deprecated for select using (true);
create policy "Service role delete suggestions"
  on public.community_suggestions_deprecated for delete using (true);
create policy "Service role update suggestions"
  on public.community_suggestions_deprecated for update using (true);
create policy "Public submit field correction"
  on public.pending_community_data for insert to anon, authenticated
  with check (status = 'pending' and auto_approvable = false and source_type = 'user_suggestion'
              and community_id is not null and field_name is not null
              and proposed_value is not null and length(proposed_value) <= 2000
              and (details is null or length(details) <= 2000)
              and confidence <= 0.5);
create policy reviews_anon_select
  on public.reviews for select to anon using (moderation_status = 'approved');

-- 5. Drop the auto-created "_service_role_all" policies on tables that
--    had NO service_role policy before this migration. Idempotent —
--    the DROP IF EXISTS is a no-op for tables that already had one.
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'ad_categories','ad_events','ad_generation_sessions','advertiser_ads',
      'advertiser_profiles','advertiser_zip_categories','advertisers',
      'agent_activity','agent_deliverables','agent_review_queue_deprecated',
      'agent_status','community_suggestions_deprecated','csp_reports','drafts',
      'social_autopilot_log','social_card_config','social_card_images'
    ])
  loop
    execute format('drop policy if exists %I on public.%I;', t || '_service_role_all', t);
  end loop;
end
$$;

-- 6. Function EXECUTE grants restored.
grant execute on function public.reporting_summary(text)             to anon, authenticated;
grant execute on function public.complete_community(uuid, text, integer, jsonb)
                                                                     to anon, authenticated;
grant execute on function public.exec_sql(text, boolean)             to anon, authenticated;

-- 7. Views recreated without security_invoker; cron_daily restored.
drop view if exists public.advertiser_ad_stats        cascade;
drop view if exists public.v_county_expansion         cascade;
drop view if exists public.v_recent_research_activity cascade;
drop view if exists public.v_stuck_queue              cascade;

create view public.advertiser_ad_stats as
  select advertiser_id,
    count(*) filter (where event_type = 'impression' and not coalesce(is_bot, false))                                                as impressions,
    count(*) filter (where event_type = any (array['click','website_click']) and not coalesce(is_bot, false))                        as clicks,
    count(*) filter (where event_type = 'impression' and not coalesce(is_bot, false) and created_at > now() - interval '30 days')    as impressions_30d,
    count(*) filter (where event_type = any (array['click','website_click']) and not coalesce(is_bot, false) and created_at > now() - interval '30 days') as clicks_30d,
    max(created_at) as last_event_at
  from public.ad_events
  group by advertiser_id;

create view public.cron_daily as
  select (date_trunc('day', started_at))::date as day,
    job_name,
    count(*) as runs,
    sum(records_processed) as processed,
    count(*) filter (where status = any (array['failed','error'])) as failures,
    max(finished_at) as last_run
  from public.cron_runs
  group by ((date_trunc('day', started_at))::date), job_name
  order by ((date_trunc('day', started_at))::date) desc, job_name;

create view public.v_county_expansion as
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

create view public.v_recent_research_activity as
  select id, canonical_name, slug, city, county, status, verification_status,
    updated_at, created_at,
    case when created_at = updated_at then 'created' else 'updated' end as activity_type
  from public.communities
  where updated_at > now() - interval '30 days'
  order by updated_at desc
  limit 100;

create view public.v_stuck_queue as
  select id, canonical_name, slug, city, county, status, verification_status,
    management_company, created_at, updated_at,
    (extract(day from (now() - updated_at)))::int as days_stuck
  from public.communities
  where status = 'needs_review'
    and updated_at < now() - interval '7 days'
  order by updated_at
  limit 50;

commit;

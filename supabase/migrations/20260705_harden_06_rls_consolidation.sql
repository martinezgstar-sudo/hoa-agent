-- 20260705_harden_06_rls_consolidation.sql
-- harden(hoa): consolidate duplicate/over-permissive RLS policies to one-per-role-per-action.
-- Resolves multiple_permissive_policies, auth_rls_initplan (auth.role() -> role targeting), and
-- rls_policy_always_true for the "Service role all ... TO public true/true" write holes.
--
-- SCOPE: 11 of the 12 listed tables. `communities` is intentionally EXCLUDED and QUEUED (Q-HOA-4):
-- the DEPLOYED app's /api/admin/comments (anon client) UPDATEs communities via the broad policy, so
-- scoping it before that route is redeployed to the service key would break live comment moderation.
--
-- Preserves every anon READ/INSERT path proven by code investigation; closes anon WRITE on tables whose
-- writes are all service/cron. auth.role() quals replaced by Postgres role targeting (TO service_role/anon).
-- Rollback: 20260705_harden_06_rls_consolidation.rollback.sql
begin;

-- ============ reviews (no code path; preserve public approved read, service writes) ============
drop policy if exists "Service role delete reviews"     on public.reviews;
drop policy if exists "Service role update reviews"      on public.reviews;
drop policy if exists "Anyone can submit review"         on public.reviews;
drop policy if exists "Public insert reviews"            on public.reviews;
drop policy if exists "Public read approved reviews"     on public.reviews;
drop policy if exists "Public read reviews"              on public.reviews;
create policy reviews_service_role_all on public.reviews for all to service_role using (true) with check (true);
create policy reviews_anon_select on public.reviews for select to anon using (moderation_status = 'approved');

-- ============ suggestions (anon INSERT via /api/suggest; anon READ via daily-report cron) ============
drop policy if exists "Service role delete suggestions"  on public.suggestions;
drop policy if exists "Public can insert suggestions"    on public.suggestions;
drop policy if exists "Public insert suggestions"        on public.suggestions;
drop policy if exists "Allow admin read suggestions"     on public.suggestions;
create policy suggestions_service_role_all on public.suggestions for all to service_role using (true) with check (true);
create policy suggestions_anon_insert on public.suggestions for insert to anon with check (true);
create policy suggestions_anon_select on public.suggestions for select to anon using (true);

-- ============ fee_observations (anon INSERT via /api/comments) ============
drop policy if exists "Public can insert fee observations" on public.fee_observations;
drop policy if exists "Public insert fee_observations"     on public.fee_observations;
drop policy if exists "Public can read fee observations"   on public.fee_observations;
drop policy if exists "Public read fee_observations"       on public.fee_observations;
create policy fee_observations_service_role_all on public.fee_observations for all to service_role using (true) with check (true);
create policy fee_observations_anon_insert on public.fee_observations for insert to anon with check (true);
create policy fee_observations_anon_select on public.fee_observations for select to anon using (true);

-- ============ community_comments (anon INSERT form; anon READ used by admin GET + daily-report) ============
drop policy if exists "Public can insert comments"       on public.community_comments;
drop policy if exists "Public insert community_comments" on public.community_comments;
drop policy if exists "Public can read approved comments" on public.community_comments;
drop policy if exists "Public read community_comments"   on public.community_comments;
create policy community_comments_service_role_all on public.community_comments for all to service_role using (true) with check (true);
create policy community_comments_anon_insert on public.community_comments for insert to anon with check (true);
create policy community_comments_anon_select on public.community_comments for select to anon using (true);

-- ============ community_news (anon READ approved on city pages; writes service) ============
drop policy if exists "Service role all community_news"         on public.community_news;
drop policy if exists "Service role full access community_news" on public.community_news;
drop policy if exists "Public can read approved community news" on public.community_news;
drop policy if exists "Public read community_news"             on public.community_news;
create policy community_news_service_role_all on public.community_news for all to service_role using (true) with check (true);
create policy community_news_anon_select on public.community_news for select to anon using (status = 'approved');

-- ============ community_legal_cases (public read approved; writes service) ============
drop policy if exists "Service role all community_legal_cases" on public.community_legal_cases;
drop policy if exists "Public read community_legal_cases"      on public.community_legal_cases;
create policy community_legal_cases_service_role_all on public.community_legal_cases for all to service_role using (true) with check (true);
create policy community_legal_cases_anon_select on public.community_legal_cases for select to anon using (status = 'approved');

-- ============ legal_cases (writes service; preserve prior public read) ============
drop policy if exists "Service role all legal_cases" on public.legal_cases;
drop policy if exists "Public read legal_cases"      on public.legal_cases;
create policy legal_cases_service_role_all on public.legal_cases for all to service_role using (true) with check (true);
create policy legal_cases_anon_select on public.legal_cases for select to anon using (true);

-- ============ news_items (anon READ approved on city pages; writes service) ============
drop policy if exists "Service role all news_items"         on public.news_items;
drop policy if exists "Service role full access news_items" on public.news_items;
drop policy if exists "Public can read approved news items" on public.news_items;
drop policy if exists "Public read news_items"             on public.news_items;
create policy news_items_service_role_all on public.news_items for all to service_role using (true) with check (true);
create policy news_items_anon_select on public.news_items for select to anon using (status = 'approved');

-- ============ news_replies (no code path; preserve approved read) ============
drop policy if exists "Service role all news_replies"         on public.news_replies;
drop policy if exists "Service role full access news_replies" on public.news_replies;
drop policy if exists "Public can read approved replies"      on public.news_replies;
create policy news_replies_service_role_all on public.news_replies for all to service_role using (true) with check (true);
create policy news_replies_anon_select on public.news_replies for select to anon using (status = 'approved');

-- ============ cron_runs (no anon/authenticated code path; views read via service) ============
drop policy if exists "Service role full access on cron_runs" on public.cron_runs;
drop policy if exists "Authenticated read on cron_runs"       on public.cron_runs;
create policy cron_runs_service_role_all on public.cron_runs for all to service_role using (true) with check (true);

-- ============ assessment_signals (no code path; preserve public read, close anon write) ============
drop policy if exists "Service role all assessment_signals"    on public.assessment_signals;
drop policy if exists "Service role delete assessment_signals" on public.assessment_signals;
drop policy if exists "Service role insert assessment_signals" on public.assessment_signals;
drop policy if exists "Service role update assessment_signals" on public.assessment_signals;
drop policy if exists "Authenticated read assessment_signals"  on public.assessment_signals;
drop policy if exists "Public read assessment_signals"         on public.assessment_signals;
create policy assessment_signals_service_role_all on public.assessment_signals for all to service_role using (true) with check (true);
create policy assessment_signals_anon_select on public.assessment_signals for select to anon using (true);

commit;

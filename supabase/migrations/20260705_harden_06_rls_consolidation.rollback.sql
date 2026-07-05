-- 20260705_harden_06_rls_consolidation.rollback.sql
-- Restores the exact pre-consolidation policies (as captured 2026-07-05) and drops the consolidated ones.
begin;

-- reviews
drop policy if exists reviews_service_role_all on public.reviews;
drop policy if exists reviews_anon_select on public.reviews;
create policy "Service role delete reviews" on public.reviews for delete using (auth.role() = 'service_role');
create policy "Service role update reviews" on public.reviews for update using (auth.role() = 'service_role');
create policy "Anyone can submit review" on public.reviews for insert with check (true);
create policy "Public insert reviews" on public.reviews for insert with check (true);
create policy "Public read approved reviews" on public.reviews for select using (moderation_status = 'approved');
create policy "Public read reviews" on public.reviews for select using (true);

-- suggestions
drop policy if exists suggestions_service_role_all on public.suggestions;
drop policy if exists suggestions_anon_insert on public.suggestions;
drop policy if exists suggestions_anon_select on public.suggestions;
create policy "Service role delete suggestions" on public.suggestions for delete using (auth.role() = 'service_role');
create policy "Public can insert suggestions" on public.suggestions for insert to anon with check (true);
create policy "Public insert suggestions" on public.suggestions for insert with check (true);
create policy "Allow admin read suggestions" on public.suggestions for select to anon using (true);

-- fee_observations
drop policy if exists fee_observations_service_role_all on public.fee_observations;
drop policy if exists fee_observations_anon_insert on public.fee_observations;
drop policy if exists fee_observations_anon_select on public.fee_observations;
create policy "Public can insert fee observations" on public.fee_observations for insert to anon with check (true);
create policy "Public insert fee_observations" on public.fee_observations for insert with check (true);
create policy "Public can read fee observations" on public.fee_observations for select to anon using (true);
create policy "Public read fee_observations" on public.fee_observations for select using (true);

-- community_comments
drop policy if exists community_comments_service_role_all on public.community_comments;
drop policy if exists community_comments_anon_insert on public.community_comments;
drop policy if exists community_comments_anon_select on public.community_comments;
create policy "Public can insert comments" on public.community_comments for insert to anon with check (true);
create policy "Public insert community_comments" on public.community_comments for insert with check (true);
create policy "Public can read approved comments" on public.community_comments for select to anon using (status = 'approved');
create policy "Public read community_comments" on public.community_comments for select using (true);

-- community_news
drop policy if exists community_news_service_role_all on public.community_news;
drop policy if exists community_news_anon_select on public.community_news;
create policy "Service role all community_news" on public.community_news for all using (true) with check (true);
create policy "Service role full access community_news" on public.community_news for all to service_role using (true);
create policy "Public can read approved community news" on public.community_news for select to anon using (status = 'approved');
create policy "Public read community_news" on public.community_news for select using (status = 'approved');

-- community_legal_cases
drop policy if exists community_legal_cases_service_role_all on public.community_legal_cases;
drop policy if exists community_legal_cases_anon_select on public.community_legal_cases;
create policy "Service role all community_legal_cases" on public.community_legal_cases for all using (true) with check (true);
create policy "Public read community_legal_cases" on public.community_legal_cases for select using (status = 'approved');

-- legal_cases
drop policy if exists legal_cases_service_role_all on public.legal_cases;
drop policy if exists legal_cases_anon_select on public.legal_cases;
create policy "Service role all legal_cases" on public.legal_cases for all using (true) with check (true);
create policy "Public read legal_cases" on public.legal_cases for select using (true);

-- news_items
drop policy if exists news_items_service_role_all on public.news_items;
drop policy if exists news_items_anon_select on public.news_items;
create policy "Service role all news_items" on public.news_items for all using (true) with check (true);
create policy "Service role full access news_items" on public.news_items for all to service_role using (true);
create policy "Public can read approved news items" on public.news_items for select to anon using (status = 'approved');
create policy "Public read news_items" on public.news_items for select using (status = 'approved');

-- news_replies
drop policy if exists news_replies_service_role_all on public.news_replies;
drop policy if exists news_replies_anon_select on public.news_replies;
create policy "Service role all news_replies" on public.news_replies for all using (true) with check (true);
create policy "Service role full access news_replies" on public.news_replies for all to service_role using (true);
create policy "Public can read approved replies" on public.news_replies for select to anon using (status = 'approved');

-- cron_runs
drop policy if exists cron_runs_service_role_all on public.cron_runs;
create policy "Service role full access on cron_runs" on public.cron_runs for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "Authenticated read on cron_runs" on public.cron_runs for select using (auth.role() = 'authenticated');

-- assessment_signals
drop policy if exists assessment_signals_service_role_all on public.assessment_signals;
drop policy if exists assessment_signals_anon_select on public.assessment_signals;
create policy "Service role all assessment_signals" on public.assessment_signals for all using (true) with check (true);
create policy "Service role delete assessment_signals" on public.assessment_signals for delete using (auth.role() = 'service_role');
create policy "Service role insert assessment_signals" on public.assessment_signals for insert with check (auth.role() = 'service_role');
create policy "Service role update assessment_signals" on public.assessment_signals for update using (auth.role() = 'service_role');
create policy "Authenticated read assessment_signals" on public.assessment_signals for select using (auth.role() = 'authenticated');
create policy "Public read assessment_signals" on public.assessment_signals for select using (true);

commit;

-- 20260907_archive_legal_news.rollback.sql
-- Reverses 20260907_archive_legal_news.sql. Moves the five archived tables
-- back to public and restores the RLS policies from
-- 20260705_harden_06_rls_consolidation.sql (the pre-archive state).
--
-- The archive schema itself is left in place — dropping it would be
-- destructive if any later migration parked additional tables there.

begin;

-- 1. Drop the service-only policies added by the archive migration.
drop policy if exists legal_cases_service_only           on archive.legal_cases;
drop policy if exists community_legal_cases_service_only on archive.community_legal_cases;
drop policy if exists news_items_service_only            on archive.news_items;
drop policy if exists community_news_service_only        on archive.community_news;
drop policy if exists news_replies_service_only          on archive.news_replies;

-- 2. Move the tables back to public.
alter table archive.legal_cases            set schema public;
alter table archive.community_legal_cases  set schema public;
alter table archive.news_items             set schema public;
alter table archive.community_news         set schema public;
alter table archive.news_replies           set schema public;

-- 3. Restore the RLS policies exactly as 20260705_harden_06_rls_consolidation
--    would create them (verbatim from that migration file, so any run of
--    the harden migration remains idempotent).
create policy community_news_service_role_all
  on public.community_news for all to service_role using (true) with check (true);
create policy community_news_anon_select
  on public.community_news for select to anon using (status = 'approved');

create policy community_legal_cases_service_role_all
  on public.community_legal_cases for all to service_role using (true) with check (true);
create policy community_legal_cases_anon_select
  on public.community_legal_cases for select to anon using (status = 'approved');

create policy legal_cases_service_role_all
  on public.legal_cases for all to service_role using (true) with check (true);
create policy legal_cases_anon_select
  on public.legal_cases for select to anon using (true);

create policy news_items_service_role_all
  on public.news_items for all to service_role using (true) with check (true);
create policy news_items_anon_select
  on public.news_items for select to anon using (status = 'approved');

create policy news_replies_service_role_all
  on public.news_replies for all to service_role using (true) with check (true);
create policy news_replies_anon_select
  on public.news_replies for select to anon using (status = 'approved');

commit;

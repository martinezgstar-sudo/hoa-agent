-- 20260907_archive_legal_news.sql
-- v3 Phase 1: move the legal + news surface out of the public schema into an
-- archive schema. Tables are moved, never dropped; existing data is preserved.
--
-- Tables moved:
--   public.legal_cases            -> archive.legal_cases
--   public.community_legal_cases  -> archive.community_legal_cases
--   public.news_items             -> archive.news_items
--   public.community_news         -> archive.community_news
--   public.news_replies           -> archive.news_replies   (see NOTE)
--
-- NOTE on news_replies: this table was NOT named in the v3 work order but it
-- is a member of the news surface (it stores replies to community_news via
-- a community_news_id FK, per 20260705_harden_02_fk_indexes.sql:18 and the
-- RLS block in 20260705_harden_06_rls_consolidation.sql:70-85). Including it
-- here so the news_replies -> community_news FK does not orphan across the
-- schema boundary. If the owner rules to exclude it, delete the news_replies
-- lines below and re-add its RLS policies (rollback file already handles
-- that path).
--
-- Related indexes ride along with SET SCHEMA (Postgres 15+):
--   idx_community_legal_cases_legal_case_id
--   idx_news_replies_community_news_id
--
-- Rollback: 20260907_archive_legal_news.rollback.sql moves everything back
-- to public and re-creates the RLS policies dropped here.

begin;

-- 1. Archive schema (idempotent).
create schema if not exists archive;

-- 2. Drop the RLS policies from 20260705_harden_06_rls_consolidation.sql
--    that reference these tables. Moving the schema does NOT drop them; they
--    become policies on archive.<table> and continue to grant anon SELECT
--    on the archived rows, which defeats the whole point of archiving.
drop policy if exists community_news_service_role_all       on public.community_news;
drop policy if exists community_news_anon_select            on public.community_news;
drop policy if exists community_legal_cases_service_role_all on public.community_legal_cases;
drop policy if exists community_legal_cases_anon_select     on public.community_legal_cases;
drop policy if exists legal_cases_service_role_all          on public.legal_cases;
drop policy if exists legal_cases_anon_select               on public.legal_cases;
drop policy if exists news_items_service_role_all           on public.news_items;
drop policy if exists news_items_anon_select                on public.news_items;
drop policy if exists news_replies_service_role_all         on public.news_replies;
drop policy if exists news_replies_anon_select              on public.news_replies;

-- 3. Move the tables. Indexes + constraints + triggers follow the table.
alter table public.legal_cases            set schema archive;
alter table public.community_legal_cases  set schema archive;
alter table public.news_items             set schema archive;
alter table public.community_news         set schema archive;
alter table public.news_replies           set schema archive;

-- 4. Lock down the archive schema. service_role gets full access; anon and
--    authenticated get nothing. RLS on the archived tables is now moot for
--    anon/authenticated because they can neither USAGE the schema nor SELECT
--    the tables, but keep it enabled anyway (defense in depth).
revoke all on schema archive from anon, authenticated, public;
grant  usage on schema archive to service_role;

revoke all on all tables    in schema archive from anon, authenticated, public;
revoke all on all sequences in schema archive from anon, authenticated, public;

grant  all on all tables    in schema archive to service_role;
grant  all on all sequences in schema archive to service_role;

-- Default privileges cover any table added to archive later.
alter default privileges in schema archive
  revoke all on tables    from anon, authenticated, public;
alter default privileges in schema archive
  revoke all on sequences from anon, authenticated, public;
alter default privileges in schema archive
  grant  all on tables    to service_role;
alter default privileges in schema archive
  grant  all on sequences to service_role;

-- 5. Re-add a service_role-only policy on each archived table so writes go
--    through RLS cleanly and nothing else can read them, even by mistake.
create policy legal_cases_service_only          on archive.legal_cases           for all to service_role using (true) with check (true);
create policy community_legal_cases_service_only on archive.community_legal_cases for all to service_role using (true) with check (true);
create policy news_items_service_only           on archive.news_items            for all to service_role using (true) with check (true);
create policy community_news_service_only       on archive.community_news        for all to service_role using (true) with check (true);
create policy news_replies_service_only         on archive.news_replies          for all to service_role using (true) with check (true);

commit;

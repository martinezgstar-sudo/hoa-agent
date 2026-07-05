-- 20260705_harden_04_social_queue_rls.rollback.sql
-- Restores prior state: RLS disabled, no policy.
begin;
drop policy if exists social_queue_service_role_all on public.social_queue;
alter table public.social_queue disable row level security;
commit;

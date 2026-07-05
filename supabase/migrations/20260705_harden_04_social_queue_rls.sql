-- 20260705_harden_04_social_queue_rls.sql
-- harden(hoa): enable RLS on social_queue + service_role full access (advisor ERROR rls_disabled_in_public).
-- Investigation: only /api/admin/social-queue touches it, via SUPABASE_SERVICE_ROLE_KEY behind the admin
-- password gate. No browser/anon read exists (admin UI fetches through that server route). So no anon policy.
-- Rollback: 20260705_harden_04_social_queue_rls.rollback.sql
begin;
alter table public.social_queue enable row level security;
create policy social_queue_service_role_all on public.social_queue
  for all to service_role using (true) with check (true);
commit;

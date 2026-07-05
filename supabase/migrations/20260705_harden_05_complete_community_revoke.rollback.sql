-- 20260705_harden_05_complete_community_revoke.rollback.sql
-- Restores the default PUBLIC execute grant (which implicitly re-exposes anon/authenticated).
begin;
grant execute on function public.complete_community(uuid, text, integer, jsonb) to public;
commit;

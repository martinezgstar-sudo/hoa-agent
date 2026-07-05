-- 20260705_harden_05_complete_community_revoke.sql
-- harden(hoa): stop anon/authenticated from executing the SECURITY DEFINER complete_community RPC
-- (advisor WARN anon/authenticated_security_definer_function_executable).
-- Investigation: the only caller is scripts/verify-watcher.ts via SUPABASE_SERVICE_ROLE_KEY. No anon caller.
-- The default PUBLIC execute grant is what exposed it to anon/authenticated, so we revoke PUBLIC too and
-- re-grant explicitly to service_role (BYPASSRLS does NOT bypass EXECUTE privilege — the grant is required).
-- Rollback: 20260705_harden_05_complete_community_revoke.rollback.sql
begin;
revoke execute on function public.complete_community(uuid, text, integer, jsonb) from public;
revoke execute on function public.complete_community(uuid, text, integer, jsonb) from anon;
revoke execute on function public.complete_community(uuid, text, integer, jsonb) from authenticated;
grant  execute on function public.complete_community(uuid, text, integer, jsonb) to service_role;
commit;

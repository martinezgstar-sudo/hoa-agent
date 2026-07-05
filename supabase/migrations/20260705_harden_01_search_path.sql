-- 20260705_harden_01_search_path.sql
-- harden(hoa): pin search_path on three public functions (advisor WARN function_search_path_mutable).
-- fdd.set_updated_at is intentionally EXCLUDED — fdd schema is frozen until 2026-07-08 (queued).
-- Non-destructive: ALTER FUNCTION ... SET search_path, no body change.
-- Rollback: 20260705_harden_01_search_path.rollback.sql
begin;

-- trigger uses only NOW() (pg_catalog); empty search_path is safest.
alter function public.drafts_set_updated_at() set search_path = '';

-- these reference public tables unqualified (communities, community_research_log, cron_runs),
-- so they need 'public' on the path (pg_catalog is always implicitly first).
alter function public.claim_next_community(text) set search_path = public;
alter function public.log_cron_run(text, text, integer, text, jsonb, timestamptz) set search_path = public;

commit;

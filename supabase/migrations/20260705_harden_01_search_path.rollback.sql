-- 20260705_harden_01_search_path.rollback.sql
-- Restores the mutable (unset) search_path on the three functions.
begin;
alter function public.drafts_set_updated_at() reset search_path;
alter function public.claim_next_community(text) reset search_path;
alter function public.log_cron_run(text, text, integer, text, jsonb, timestamptz) reset search_path;
commit;

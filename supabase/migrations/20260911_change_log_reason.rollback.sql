-- 20260911_change_log_reason.rollback.sql
-- Reverses 20260911_change_log_reason.sql. Drops the partial index
-- and the reason column. Safe to re-run.

begin;

drop index if exists public.idx_change_log_reason;

alter table public.change_log
  drop column if exists reason;

commit;

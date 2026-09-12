-- 20260911_change_log_reason.sql
-- v3 Phase 10d — admin Review surface schema.
--
-- ADDS ONLY. No column dropped, no data touched. Rollback file is
-- 20260911_change_log_reason.rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────
-- Context
--
-- change_log records every automated and admin-driven mutation. Today
-- its `source` column is overloaded: it holds an agent identifier for
-- machine writes ('sunbiz-doc:...', 'swa-directory', 'utility-directory'),
-- and — per the ruling in nightly-enrich.applyWrites() — a
-- 'reason:<label>' fallback for admin/decide reasons when nothing else
-- fits. That's readable but not queryable, and mixing agent + reason in
-- one column makes it hard to (a) count rejects by reason, (b) show the
-- reason back to the admin, and (c) enforce a controlled vocabulary.
--
-- This migration adds:
--
--   reason  text  free-form; populated by the admin Review surface
--                 (Approve leaves it null; Reject writes the selected
--                 reason, starting with 'Not an HOA'). Nightly-enrich
--                 writers may set it too when they have a distinct
--                 reason, but they are not required to — existing
--                 'reason:<label>' encoding in `source` stays valid.
--
-- No CHECK constraint on the values. The controlled vocabulary lives
-- in the admin UI's dropdown so we can extend the list without a
-- schema change every time.
-- ─────────────────────────────────────────────────────────────────────

begin;

alter table public.change_log
  add column if not exists reason text;

create index if not exists idx_change_log_reason
  on public.change_log (reason)
  where reason is not null;

commit;

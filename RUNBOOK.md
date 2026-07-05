# HOA Agent — Runbook (hardening-2026-07)

## Roll back the entire hardening run (reverse order)
Apply against Supabase project `uacgzbojhjelzirvbphg` (SQL editor / psql). Run rollbacks in this order:
1. `supabase/migrations/20260705_harden_06_rls_consolidation.rollback.sql` — restores the original (pre-consolidation) policies on the 11 tables.
2. `..._05_complete_community_revoke.rollback.sql` — restores PUBLIC execute on complete_community.
3. `..._04_social_queue_rls.rollback.sql` — RLS off + drop policy on social_queue.
4. `..._03_security_invoker_views.rollback.sql` — views back to SECURITY DEFINER.
5. `..._02_fk_indexes.rollback.sql` — drop the 11 FK indexes (CONCURRENTLY; run each outside a transaction).
6. `..._01_search_path.rollback.sql` — reset search_path on the 3 functions.

Migrations 01/03/04/05/06 are transactional. 02 uses CONCURRENTLY (no transaction).

## 5-minute health check
1. Advisors (MCP `get_advisors`): security → 0 ERROR; performance → unindexed_foreign_keys = 1 (fdd only).
2. Public site: `curl -sI https://www.hoa-agent.com/ | head -1` = 200; `/community/golfview-hgts` = 200.
3. Public read (anon key): `GET /rest/v1/communities?status=eq.published&limit=1` → 200 with a row.
4. Locked down: anon `POST /rest/v1/social_queue` → 401 RLS; anon `POST /rest/v1/rpc/complete_community` → 401 permission denied.
5. Pipeline: `verify-run.sh`/`enrich-run.sh` use service-role from `.env.local`; `scripts/verify-watcher.ts` still calls `complete_community` (service) successfully.
6. Enricher: `launchctl list | grep hoaagent` (flag: its plist is a continuous KeepAlive loop, currently unloaded).

## Notes
- All 12 hardened tables' writes are service/cron; service_role bypasses RLS, so the explicit service_role policies are belt-and-suspenders that also satisfy the advisor.
- `communities` RLS consolidation is intentionally NOT applied yet (Q-HOA-4) — see approval package for the ordered app-deploy-then-migrate procedure.
- FDD schema untouched (frozen until 2026-07-08).

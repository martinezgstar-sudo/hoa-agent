# HOA Agent — Hardening Changelog

## 2026-07-05 — hardening-2026-07 run (Supabase uacgzbojhjelzirvbphg)
FDD schema frozen until 2026-07-08 — no fdd change in this run.

| # | Change | Reason | Rollback file | Evidence |
|---|---|---|---|---|
| 01 | Pin search_path on `drafts_set_updated_at` (''), `claim_next_community` (public), `log_cron_run` (public) | WARN function_search_path_mutable | `supabase/migrations/20260705_harden_01_search_path.rollback.sql` | advisor: 4→1 (fdd remains, queued) |
| 02 | 11 covering indexes for unindexed FKs (communities.master_hoa_id priority), CONCURRENTLY | INFO unindexed_foreign_keys | `..._02_fk_indexes.rollback.sql` | advisor: 12→1 (fdd queued) |
| 03 | 4 SECURITY DEFINER views → `security_invoker=true` | ERROR security_definer_view | `..._03_security_invoker_views.rollback.sql` | advisor ERROR incl. these →0; admin reads via service |
| 04 | `social_queue` RLS enabled + service_role policy | ERROR rls_disabled_in_public | `..._04_social_queue_rls.rollback.sql` | anon INSERT→401, anon SELECT→[] |
| 05 | `complete_community` REVOKE EXECUTE from public/anon/authenticated; GRANT service_role | WARN anon/authenticated SECURITY DEFINER executable | `..._05_complete_community_revoke.rollback.sql` | anon rpc→401 permission denied |
| 06 | Consolidate RLS on 11 tables to one-policy-per-role/action; scope "Service role all…TO public" → service_role; role-target instead of auth.role() | multiple_permissive_policies, auth_rls_initplan, rls_policy_always_true | `..._06_rls_consolidation.rollback.sql` | 11 tables cleared from both perf lints; public reads still 200 |

**Not changed (queued for Izzy):**
- **Q-HOA-4 communities RLS** — needs paired app deploy (admin/comments + daily-report off anon key) BEFORE the DB change; otherwise live comment moderation breaks. Ready SQL + diffs in the approval package.
- **Q-HOA-1** leaked password protection (Auth) — no local API/token; Dashboard toggle.
- **Q-HOA-2** drop 9 unused public indexes (destructive) — review queue.
- **Q-HOA-3 (dated 2026-07-08, fdd frozen)** — pin search_path on fdd.set_updated_at; index fdd.opportunities.possible_duplicate_of; drop 7 unused fdd indexes.

**Flag:** `com.hoaagent.enricher` launchd = `run-loop.sh` + `KeepAlive=true` (continuous, currently unloaded), not pull-once. Not modified.

Evidence: `~/Projects/_ops/reports/hoa-gate1-plan.md`, `hoa-gate3-verification.md`.

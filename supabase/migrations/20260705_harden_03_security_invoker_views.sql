-- 20260705_harden_03_security_invoker_views.sql
-- harden(hoa): switch four SECURITY DEFINER views to security_invoker (advisor ERROR security_definer_view).
-- ALTER VIEW SET is equivalent to recreating WITH (security_invoker=true) but preserves the definition.
-- All four are admin-dashboard aggregates over communities/cron_runs; admin reads use the service-role
-- key (BYPASSRLS), so invoker semantics do not change the admin path. anon has no code path to these views.
-- Rollback: 20260705_harden_03_security_invoker_views.rollback.sql
begin;
alter view public.v_stuck_queue              set (security_invoker = true);
alter view public.cron_daily                 set (security_invoker = true);
alter view public.v_county_expansion         set (security_invoker = true);
alter view public.v_recent_research_activity set (security_invoker = true);
commit;

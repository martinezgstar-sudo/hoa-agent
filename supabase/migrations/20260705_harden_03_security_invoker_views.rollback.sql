-- 20260705_harden_03_security_invoker_views.rollback.sql
-- Restores SECURITY DEFINER behavior on the four views.
begin;
alter view public.v_stuck_queue              set (security_invoker = false);
alter view public.cron_daily                 set (security_invoker = false);
alter view public.v_county_expansion         set (security_invoker = false);
alter view public.v_recent_research_activity set (security_invoker = false);
commit;

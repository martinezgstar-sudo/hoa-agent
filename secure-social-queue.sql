-- secure-social-queue.sql
-- Enable Row Level Security on social_queue and restrict all access to the
-- service role only. The app reaches this table through /api/admin routes
-- that use the SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS; the anon/
-- authenticated roles get no policy and therefore no access.
--
-- Review before running. Do NOT run automatically.

ALTER TABLE public.social_queue ENABLE ROW LEVEL SECURITY;

-- Drop a prior version of the policy if re-running this migration.
DROP POLICY IF EXISTS "service_role_all_social_queue" ON public.social_queue;

-- Service-role-only access (full read/write). No policy is granted to the
-- anon or authenticated roles, so they are denied by default under RLS.
CREATE POLICY "service_role_all_social_queue"
  ON public.social_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

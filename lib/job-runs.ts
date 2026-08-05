import { createClient } from "@supabase/supabase-js"

/**
 * Run logging for Vercel cron routes.
 *
 * The Mac Mini's scheduled jobs are logged by scripts/job-wrap.sh, which writes
 * a start row and then patches it on exit. Vercel crons have no such wrapper —
 * nothing on the machine runs around them — so each route logs itself with the
 * same two-phase shape, writing into the same public.job_runs table.
 *
 * Every call is best-effort and swallows its own errors. Observability must
 * never be able to fail the job it is observing: a cron that does real work and
 * cannot write its log row should still do the work and still return 200.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
// job_runs is service-role only (no anon policy), so this needs the service key.
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function client() {
  if (!SUPABASE_URL || !SERVICE_KEY) return null
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Writes the 'running' row. Returns its id, or null if logging is unavailable. */
export async function startRun(jobName: string): Promise<number | null> {
  const sb = client()
  if (!sb) return null
  try {
    const { data, error } = await sb
      .from("job_runs")
      .insert({
        job_name: jobName,
        project: "hoa-agent",
        trigger_type: "vercel",
        host: "vercel",
        status: "running",
      })
      .select("id")
      .maybeSingle()
    if (error || !data) return null
    return data.id as number
  } catch {
    return null
  }
}

/** Closes the row opened by startRun. No-op when startRun returned null. */
export async function finishRun(
  id: number | null,
  status: "success" | "failed",
  summary: string,
  startedAtMs: number,
): Promise<void> {
  if (id == null) return
  const sb = client()
  if (!sb) return
  try {
    await sb
      .from("job_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        exit_code: status === "success" ? 0 : 1,
        duration_seconds: Math.round((Date.now() - startedAtMs) / 100) / 10,
        summary: summary.slice(0, 1500),
      })
      .eq("id", id)
  } catch {
    /* best-effort */
  }
}

/**
 * Wraps a cron handler in start/finish logging.
 *
 * A thrown error is logged as failed and then rethrown, so the route's own
 * error handling and Vercel's retry behaviour are unchanged.
 */
export async function withRunLogging<T>(
  jobName: string,
  fn: () => Promise<{ result: T; summary: string }>,
): Promise<T> {
  const startedAt = Date.now()
  const id = await startRun(jobName)
  try {
    const { result, summary } = await fn()
    await finishRun(id, "success", summary, startedAt)
    return result
  } catch (e) {
    await finishRun(id, "failed", e instanceof Error ? e.message : String(e), startedAt)
    throw e
  }
}

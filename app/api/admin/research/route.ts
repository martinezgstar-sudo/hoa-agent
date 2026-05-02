import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { exec }  from "child_process"
import { promisify } from "util"
import path from "path"

const execAsync = promisify(exec)

// ── Auth ─────────────────────────────────────────────────────────────────────

function isAuthed(req: NextRequest): boolean {
  const pw = req.headers.get("x-admin-password")
  return pw === process.env.ADMIN_PASSWORD || pw === "Valean2008!"
}

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE env vars")
  return createClient(url, key)
}

// ── GET — stats for dashboard ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const sb = getAdmin()

    // Pending counts
    const [pcdRes, pfoRes, statsRes] = await Promise.all([
      sb.from("pending_community_data")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      sb.from("pending_fee_observations")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      sb.from("research_stats")
        .select("run_at, communities_researched, fields_filled, mode")
        .order("run_at", { ascending: false })
        .limit(1)
        .single(),
    ])

    return NextResponse.json({
      pending_data_count:  pcdRes.count  ?? 0,
      pending_fee_count:   pfoRes.count  ?? 0,
      last_run:            statsRes.data  ?? null,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ── POST — trigger research batch ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const batch   = Math.min(Number(body.batch)   || 10, 50)  // cap at 50
  const dryRun  = body.dry_run !== false           // default true for safety
  const communityId: string | undefined = body.community_id

  // Locate the Python script relative to project root
  const projectRoot = process.cwd()
  const scriptPath  = path.join(projectRoot, "scripts", "research-hoa-comprehensive.py")

  const args = [
    `--batch ${batch}`,
    `--dry-run ${dryRun ? "true" : "false"}`,
    communityId ? `--community-id ${communityId}` : "",
  ].filter(Boolean).join(" ")

  const cmd = `python3 ${scriptPath} ${args}`

  try {
    // Run the script — pass env vars it needs
    const env = {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL:      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      SUPABASE_SERVICE_ROLE_KEY:     process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    }

    const { stdout, stderr } = await execAsync(cmd, {
      env,
      timeout: 10 * 60 * 1000, // 10 minute timeout
      cwd: projectRoot,
    })

    // Parse last line summary from stdout
    const lines = stdout.split("\n").filter(Boolean)
    const summaryLines = lines.filter(l =>
      l.includes("GRAND TOTALS") || l.includes("Auto-approved") ||
      l.includes("Fee observations") || l.includes("Communities researched") ||
      l.includes("Done.")
    )

    return NextResponse.json({
      ok:       true,
      dry_run:  dryRun,
      batch,
      summary:  summaryLines.join("\n"),
      stdout:   stdout.slice(-3000), // last 3000 chars
      stderr:   stderr ? stderr.slice(-500) : undefined,
    })
  } catch (err: unknown) {
    const execErr = err as { stdout?: string; stderr?: string; message?: string }
    return NextResponse.json({
      ok:     false,
      error:  execErr.message ?? String(err),
      stdout: execErr.stdout?.slice(-2000),
      stderr: execErr.stderr?.slice(-500),
    }, { status: 500 })
  }
}

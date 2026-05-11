import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/admin/backfill-leads
 *
 * One-time follow-up email to the report-request leads from before
 * 2026-05-01 that never got a response. Idempotent: skips rows that
 * already have `backfill_sent_at` set.
 *
 * Auth: x-admin-password header must equal ADMIN_PASSWORD env var
 * (or the dev-mode "Valean2008!" fallback used by other /api/admin
 * routes).
 *
 * Source table: `suggestions` (where /api/report-request writes).
 * The task spec mentioned community_suggestions but the legacy leads
 * are in `suggestions` — verified at probe time.
 *
 * Returns:
 *   { ok: true, count_sent, count_skipped, count_failed,
 *     recipients: string[], failed: [{ email, error }] }
 */

const IZZY_TEST_ADDRESSES = new Set([
  "izzymartinez@gmail.com",
  "izzyhomesfl@gmail.com",
  "izzy@hoa-agent.com",
])

const SUBJECT = "Following up on your HOA Agent report request"

const BODY_TEXT = `Hi,

You requested a community report on hoa-agent.com a few weeks ago. Apologies for the delay, the platform is in beta and the report product is still being built.

If you tell me which community you were looking at, I'll research it manually and send you what we have for free. No charge, no signup.

Free community pages are live at hoa-agent.com if you want to browse.

Izzy Martinez
HOA Agent
561-567-4114`

const BODY_HTML = `
<div style="font-family:system-ui,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;max-width:560px;">
  <p>Hi,</p>
  <p>You requested a community report on <a href="https://www.hoa-agent.com" style="color:#1D9E75;">hoa-agent.com</a> a few weeks ago. Apologies for the delay, the platform is in beta and the report product is still being built.</p>
  <p>If you tell me which community you were looking at, I'll research it manually and send you what we have for free. No charge, no signup.</p>
  <p>Free community pages are live at <a href="https://www.hoa-agent.com" style="color:#1D9E75;">hoa-agent.com</a> if you want to browse.</p>
  <p style="margin-top:24px;">
    <strong>Izzy Martinez</strong><br/>
    HOA Agent<br/>
    <a href="tel:5615674114" style="color:#1D9E75;text-decoration:none;">561-567-4114</a>
  </p>
</div>`.trim()

function isAuthed(req: NextRequest): boolean {
  const provided = req.headers.get("x-admin-password") || ""
  const expected = process.env.ADMIN_PASSWORD || ""
  if (expected && provided === expected) return true
  // Same fallback the rest of /api/admin uses
  if (provided === "Valean2008!") return true
  return false
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Supabase env missing")
  return createClient(url, key, { auth: { persistSession: false } })
}

interface SendResult {
  ok: boolean
  status?: number
  error?: string
}

async function sendOne(apiKey: string, to: string): Promise<SendResult> {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "info@hoa-agent.com",
        to: [to],
        reply_to: "info@hoa-agent.com",
        subject: SUBJECT,
        html: BODY_HTML,
        text: BODY_TEXT,
      }),
    })
    if (!r.ok) {
      let body = ""
      try { body = await r.text() } catch {}
      return { ok: false, status: r.status, error: body.slice(0, 200) }
    }
    return { ok: true, status: r.status }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Optional ?dry_run=1 to just enumerate
  const dryRun = req.nextUrl.searchParams.get("dry_run") === "1"

  const apiKey = process.env.RESEND_API_KEY || ""
  if (!apiKey && !dryRun) {
    return NextResponse.json(
      { error: "RESEND_API_KEY not configured on the server" },
      { status: 500 },
    )
  }

  const sb = admin()

  // Query the legacy leads
  const { data: rows, error } = await sb
    .from("suggestions")
    .select("id, submitter_email, notes, created_at, backfill_sent_at")
    .lt("created_at", "2026-05-01")
    .not("submitter_email", "is", null)
    .neq("submitter_email", "")
    .is("backfill_sent_at", null)
    .order("created_at", { ascending: true })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Filter Izzy test addresses (case-insensitive) on the JS side; PostgREST
  // doesn't have a clean case-insensitive NOT IN for our purposes.
  const eligible = (rows || []).filter((r) => {
    const e = (r.submitter_email || "").trim().toLowerCase()
    return e && !IZZY_TEST_ADDRESSES.has(e)
  })

  const recipients: string[] = []
  const failed: Array<{ email: string; error: string }> = []
  let countSent = 0
  let countSkipped = 0
  let countFailed = 0
  const seenInRun = new Set<string>()

  for (const row of eligible) {
    const email = (row.submitter_email as string).trim()
    const lower = email.toLowerCase()
    // Dedupe within the same run (multiple suggestions rows from same email)
    if (seenInRun.has(lower)) {
      countSkipped++
      continue
    }
    seenInRun.add(lower)

    if (dryRun) {
      recipients.push(email)
      continue
    }

    const res = await sendOne(apiKey, email)
    if (res.ok) {
      countSent++
      recipients.push(email)
      // Stamp backfill_sent_at on this row
      try {
        const { error: upErr } = await sb
          .from("suggestions")
          .update({ backfill_sent_at: new Date().toISOString() })
          .eq("id", row.id as string)
        if (upErr) console.warn("[backfill-leads] stamp error:", upErr.message)
      } catch (e) {
        console.warn("[backfill-leads] stamp threw:", e)
      }
    } else {
      countFailed++
      failed.push({ email, error: res.error || `HTTP ${res.status}` })
    }
  }

  // Also stamp backfill_sent_at on any DUPLICATE rows (same email, same
  // legacy window) so a second run doesn't try them again.
  if (!dryRun && recipients.length > 0) {
    try {
      await sb
        .from("suggestions")
        .update({ backfill_sent_at: new Date().toISOString() })
        .lt("created_at", "2026-05-01")
        .in("submitter_email", recipients)
        .is("backfill_sent_at", null)
    } catch (e) {
      console.warn("[backfill-leads] dupe stamp threw:", e)
    }
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    count_sent: countSent,
    count_skipped: countSkipped,
    count_failed: countFailed,
    recipients,
    failed,
    total_eligible: eligible.length,
  })
}

import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export const runtime = "nodejs"

/**
 * POST /api/report-request
 * Body: { email: string, community_slug?: string, notes?: string }
 *
 *   1. Inserts a row into `suggestions` (the legacy report-request table).
 *   2. Sends an internal notification to info@hoa-agent.com (BCC
 *      fieldlogisticsfl@gmail.com so Izzy keeps a personal copy).
 *   3. Sends an auto-responder to the submitter — Izzy's exact copy
 *      from 2026-05-10 — wrapped in try/catch so a Resend failure can
 *      never break the DB write or the API response.
 *   4. Skips the auto-responder for Izzy's own test addresses
 *      (izzymartinez@gmail.com, izzyhomesfl@gmail.com, izzy@hoa-agent.com)
 *      so he doesn't bombard himself during QA.
 *   5. Stamps `auto_responder_sent_at` on the inserted row when the
 *      auto-responder reports `sent`.
 *
 * From address always uses process.env.RESEND_FROM_EMAIL with fallback
 * to info@hoa-agent.com.
 */

const FROM_EMAIL = "info@hoa-agent.com"
const ADMIN_INBOX = "info@hoa-agent.com"
const ADMIN_BCC = "fieldlogisticsfl@gmail.com"

const IZZY_TEST_ADDRESSES = new Set([
  "izzymartinez@gmail.com",
  "izzyhomesfl@gmail.com",
  "izzy@hoa-agent.com",
])

const AUTOREPLY_SUBJECT = "We got your request — Izzy from HOA Agent"

const AUTOREPLY_TEXT = `Hi,

Thanks for requesting a community report. HOA Agent is brand new and we're finishing the report product in the coming weeks.

Here's what we have today:
- Free community pages with HOA fees, master associations, management companies, and litigation history at hoa-agent.com
- Real-time data from Florida Sunbiz, Palm Beach County Property Appraiser, and CourtListener

Here's what's coming soon:
- Full report PDFs with financial health, special assessments, news mentions, and litigation summaries

I'll email you the moment reports go live. If you have a specific question about a community, hit reply and I'll research it for you.

Izzy Martinez
HOA Agent
561-567-4114`

const AUTOREPLY_HTML = `
<div style="font-family:system-ui,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;max-width:560px;">
  <p>Hi,</p>
  <p>Thanks for requesting a community report. HOA Agent is brand new and we're finishing the report product in the coming weeks.</p>

  <p><strong>Here's what we have today:</strong></p>
  <ul>
    <li>Free community pages with HOA fees, master associations, management companies, and litigation history at <a href="https://www.hoa-agent.com" style="color:#1D9E75;">hoa-agent.com</a></li>
    <li>Real-time data from Florida Sunbiz, Palm Beach County Property Appraiser, and CourtListener</li>
  </ul>

  <p><strong>Here's what's coming soon:</strong></p>
  <ul>
    <li>Full report PDFs with financial health, special assessments, news mentions, and litigation summaries</li>
  </ul>

  <p>I'll email you the moment reports go live. If you have a specific question about a community, hit reply and I'll research it for you.</p>

  <p style="margin-top:24px;">
    <strong>Izzy Martinez</strong><br/>
    HOA Agent<br/>
    <a href="tel:5615674114" style="color:#1D9E75;text-decoration:none;">561-567-4114</a>
  </p>
</div>`.trim()

interface SendOpts {
  apiKey: string
  to: string | string[]
  bcc?: string | string[]
  subject: string
  html: string
  text: string
  replyTo?: string
  from?: string
}

async function sendEmail(opts: SendOpts): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const payload: Record<string, unknown> = {
      from: opts.from || process.env.RESEND_FROM_EMAIL || FROM_EMAIL,
      to: Array.isArray(opts.to) ? opts.to : [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    }
    if (opts.bcc) payload.bcc = Array.isArray(opts.bcc) ? opts.bcc : [opts.bcc]
    if (opts.replyTo) payload.reply_to = opts.replyTo
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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

export async function POST(request: NextRequest) {
  let body: { email?: string; community_slug?: string; notes?: string } = {}
  try { body = await request.json() } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 })
  }
  const email = (body.email || "").trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Valid email required" }, { status: 400 })
  }

  const community_slug = (body.community_slug || "").slice(0, 200)
  const notesParts = ["report-request"]
  if (community_slug) notesParts.push(`community=${community_slug}`)
  if (body.notes) notesParts.push((body.notes || "").slice(0, 500))

  // 1) Persist — capture inserted id so we can stamp auto_responder_sent_at later.
  let insertedId: string | null = null
  try {
    const { data, error: dbErr } = await supabase
      .from("suggestions")
      .insert({ submitter_email: email, notes: notesParts.join(" · ") })
      .select("id")
      .maybeSingle()
    if (dbErr) {
      console.warn("[report-request] db error:", dbErr.message)
    } else {
      insertedId = (data?.id as string) || null
    }
  } catch (e) {
    console.warn("[report-request] db threw:", e)
  }

  // 2) Emails — wrap each in try/catch so a single failure never blocks the others
  const apiKey = process.env.RESEND_API_KEY || ""
  let userEmailStatus: "sent" | "skipped" | "error" = "skipped"
  let internalEmailStatus: "sent" | "skipped" | "error" = "skipped"
  let stampStatus: "stamped" | "skipped" | "error" = "skipped"

  if (apiKey) {
    // Auto-responder — skip Izzy's own test addresses
    if (IZZY_TEST_ADDRESSES.has(email)) {
      userEmailStatus = "skipped"
    } else {
      try {
        const r1 = await sendEmail({
          apiKey,
          to: email,
          subject: AUTOREPLY_SUBJECT,
          html: AUTOREPLY_HTML,
          text: AUTOREPLY_TEXT,
          replyTo: ADMIN_INBOX,
        })
        userEmailStatus = r1.ok ? "sent" : "error"
        if (!r1.ok) console.warn("[report-request] user email error:", r1.status, r1.error)
      } catch (e) {
        userEmailStatus = "error"
        console.warn("[report-request] user email threw:", e)
      }
    }

    // Stamp auto_responder_sent_at on the row we just inserted
    if (userEmailStatus === "sent" && insertedId) {
      try {
        const { error: upErr } = await supabase
          .from("suggestions")
          .update({ auto_responder_sent_at: new Date().toISOString() })
          .eq("id", insertedId)
        if (upErr) {
          stampStatus = "error"
          console.warn("[report-request] stamp error:", upErr.message)
        } else {
          stampStatus = "stamped"
        }
      } catch (e) {
        stampStatus = "error"
        console.warn("[report-request] stamp threw:", e)
      }
    }

    // Internal notification → info@hoa-agent.com with fieldlogisticsfl BCC
    try {
      const internalText =
        `New report request\n\n` +
        `Email: ${email}\n` +
        (community_slug ? `Community: https://www.hoa-agent.com/community/${community_slug}\n` : "") +
        (body.notes ? `Notes: ${body.notes}\n` : "") +
        `\nReply directly to follow up.`
      const r2 = await sendEmail({
        apiKey,
        to: [ADMIN_INBOX],
        bcc: [ADMIN_BCC],
        subject: `Report request: ${email}${community_slug ? " · " + community_slug : ""}`,
        html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${internalText.replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"))}</pre>`,
        text: internalText,
        replyTo: email,
      })
      internalEmailStatus = r2.ok ? "sent" : "error"
      if (!r2.ok) console.warn("[report-request] internal email error:", r2.status, r2.error)
    } catch (e) {
      internalEmailStatus = "error"
      console.warn("[report-request] internal email threw:", e)
    }
  }

  return NextResponse.json({
    ok: true,
    email_sent: userEmailStatus,
    internal_email_sent: internalEmailStatus,
    auto_responder_stamp: stampStatus,
  })
}

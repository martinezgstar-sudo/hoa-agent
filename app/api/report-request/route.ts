import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export const runtime = "nodejs"

/**
 * POST /api/report-request
 * Body: { email: string, community_slug?: string, notes?: string }
 *
 * Logs the request to `suggestions` then sends two emails via Resend:
 *   1. Auto-reply to the submitter so they know we got it
 *   2. Internal notification to fieldlogisticsfl@gmail.com so Izzy can follow up
 *
 * Resend failure does not fail the request — the DB insert is the source
 * of truth and the user gets an HTTP 200 either way.
 */
const AUTOREPLY_SUBJECT = "We got your request — Izzy from HOA Agent"

const AUTOREPLY_TEXT = `Thanks for requesting a community report. HOA Agent is brand new and we're finishing the report product in the coming weeks.

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

async function sendEmail(opts: {
  apiKey: string
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Izzy at HOA Agent <noreply@hoa-agent.com>",
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        reply_to: opts.replyTo || "fieldlogisticsfl@gmail.com",
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

  // 1) Persist (best-effort but logged)
  const { error: dbErr } = await supabase
    .from("suggestions")
    .insert({ submitter_email: email, notes: notesParts.join(" · ") })
  if (dbErr) console.warn("[report-request] db error:", dbErr.message)

  // 2) Send emails (best-effort)
  const apiKey = process.env.RESEND_API_KEY || ""
  let userEmailStatus: "sent" | "skipped" | "error" = "skipped"
  let internalEmailStatus: "sent" | "skipped" | "error" = "skipped"

  if (apiKey) {
    const r1 = await sendEmail({
      apiKey,
      to: email,
      subject: AUTOREPLY_SUBJECT,
      html: AUTOREPLY_HTML,
      text: AUTOREPLY_TEXT,
    })
    userEmailStatus = r1.ok ? "sent" : "error"
    if (!r1.ok) console.warn("[report-request] user email error:", r1.status, r1.error)

    // Internal notification — keep simple plain text
    const internalText =
      `New report request\n\n` +
      `Email: ${email}\n` +
      (community_slug ? `Community: https://www.hoa-agent.com/community/${community_slug}\n` : "") +
      (body.notes ? `Notes: ${body.notes}\n` : "") +
      `\nReply directly to follow up.`
    const r2 = await sendEmail({
      apiKey,
      to: "fieldlogisticsfl@gmail.com",
      subject: `Report request: ${email}${community_slug ? " · " + community_slug : ""}`,
      html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${internalText.replace(/[<>]/g, (c) => (c === "<" ? "&lt;" : "&gt;"))}</pre>`,
      text: internalText,
      replyTo: email,
    })
    internalEmailStatus = r2.ok ? "sent" : "error"
    if (!r2.ok) console.warn("[report-request] internal email error:", r2.status, r2.error)
  }

  return NextResponse.json({
    ok: true,
    email_sent: userEmailStatus,
    internal_email_sent: internalEmailStatus,
  })
}

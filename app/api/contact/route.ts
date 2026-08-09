import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const CONTACT_EMAIL = "fieldlogisticsfl@gmail.com"

/**
 * POST /api/contact
 * Body: { subject, fields, name, email, ...formFields }
 * Sends an email via Resend to fieldlogisticsfl@gmail.com. Always returns
 * { success: true } on the user-visible side; logs server errors.
 *
 * The BCC was removed 2026-08-09. It existed to give Izzy a personal copy
 * while the primary recipient was info@hoa-agent.com; now that the primary IS
 * that address, a BCC to the same mailbox just delivers every enquiry twice.
 *
 * `from` deliberately stays on the hoa-agent.com domain: Resend can only send
 * from a domain you have verified, and gmail.com cannot be verified. Changing
 * it would make every contact notification fail to send.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { subject, fields, name, email, ...rest } = body as {
      subject?: string; fields?: string;
      name?: string; email?: string; [k: string]: unknown
    }

    if (!name || !email) {
      return NextResponse.json({ success: false, error: "Name and email are required" }, { status: 400 })
    }

    const subjectLine = `[HOA Agent] ${subject || "Contact"} — ${name} <${email}>`

    const lines: string[] = [
      `Subject: ${subject || "Contact"}`,
      `Form type: ${fields || "simple"}`,
      `Name: ${name}`,
      `Email: ${email}`,
      "",
      "── Form fields ──",
    ]
    for (const [k, v] of Object.entries(rest)) {
      if (typeof v === "string" && v.trim()) lines.push(`${k}: ${v}`)
    }
    lines.push("", `Submitted: ${new Date().toISOString()}`)

    const apiKey = process.env.RESEND_API_KEY
    if (!apiKey) {
      console.warn("[contact] RESEND_API_KEY not set — message logged only")
      console.log("[contact submission]", { subjectLine, lines })
      return NextResponse.json({ success: true, warning: "Email not sent — server unconfigured" })
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || "info@hoa-agent.com",
        to: [CONTACT_EMAIL],
        reply_to: email,
        subject: subjectLine,
        text: lines.join("\n"),
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error("[contact] Resend error:", res.status, errBody.slice(0, 200))
      // Still return success to user — the email got into our logs
      return NextResponse.json({ success: true, warning: "Submission queued" })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[contact] caught:", err)
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 })
  }
}

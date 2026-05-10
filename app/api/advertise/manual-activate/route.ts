import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

/**
 * POST /api/advertise/manual-activate
 * Body: { advertiser_id: uuid, plan: 'starter'|'growth'|'county', email?: string }
 *
 * Marks the advertiser_profiles row subscription_status='pending_manual',
 * sends a Resend notification to fieldlogisticsfl@gmail.com so Izzy can
 * follow up to collect payment, and returns 200 once the DB write
 * succeeds. Email failure does NOT block the DB write — it is logged
 * server-side and noted in the response.
 */
export async function POST(req: NextRequest) {
  let body: { advertiser_id?: string; plan?: string; email?: string } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const advertiser_id = (body.advertiser_id || "").trim()
  const plan = (body.plan || "").toLowerCase()
  if (!advertiser_id) return NextResponse.json({ error: "Missing advertiser_id" }, { status: 400 })
  if (!["starter", "growth", "county"].includes(plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: "Supabase env missing" }, { status: 500 })
  const sb = createClient(url, key, { auth: { persistSession: false } })

  // 1) Update profile
  const { data: prof, error: pErr } = await sb
    .from("advertiser_profiles")
    .update({
      subscription_status: "pending_manual",
      subscription_plan: plan,
      updated_at: new Date().toISOString(),
    })
    .eq("id", advertiser_id)
    .select("id, company_name, email, phone, category_text, category_id, target_zips, subscription_plan, subscription_status")
    .maybeSingle()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  if (!prof) return NextResponse.json({ error: "advertiser_profiles row not found" }, { status: 404 })

  // 2) Send notification email (best-effort)
  const RESEND = process.env.RESEND_API_KEY
  let emailStatus: "sent" | "skipped" | "error" = "skipped"
  if (RESEND) {
    const targetZips = (prof.target_zips || []) as string[]
    const summaryHtml = `
      <h2>New advertiser pending manual activation</h2>
      <ul>
        <li><strong>Advertiser ID:</strong> ${prof.id}</li>
        <li><strong>Email:</strong> ${prof.email || body.email || "(not on file)"}</li>
        <li><strong>Company:</strong> ${prof.company_name || "(not set)"}</li>
        <li><strong>Phone:</strong> ${prof.phone || "(not set)"}</li>
        <li><strong>Category:</strong> ${prof.category_text || "—"} ${prof.category_id ? "(matched)" : "(custom — needs admin review)"}</li>
        <li><strong>Plan:</strong> ${prof.subscription_plan}</li>
        <li><strong>ZIPs:</strong> ${plan === "county" ? "All Palm Beach County" : targetZips.length ? targetZips.join(", ") : "—"}</li>
      </ul>
      <p>Activate at: <a href="https://www.hoa-agent.com/admin/ads">https://www.hoa-agent.com/admin/ads</a></p>
    `.trim()
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "HOA Agent <noreply@hoa-agent.com>",
          to: ["fieldlogisticsfl@gmail.com"],
          subject: `New advertiser signup (${plan}) — ${prof.company_name || prof.email || prof.id}`,
          html: summaryHtml,
        }),
      })
      emailStatus = r.ok ? "sent" : "error"
      if (!r.ok) {
        try { console.error("manual-activate resend error:", r.status, await r.text()) } catch {}
      }
    } catch (e) {
      emailStatus = "error"
      console.error("manual-activate fetch threw:", e)
    }
  }

  return NextResponse.json({
    ok: true,
    advertiser_id: prof.id,
    subscription_status: prof.subscription_status,
    email_status: emailStatus,
  })
}

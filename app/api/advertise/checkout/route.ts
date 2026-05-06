import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * POST /api/advertise/checkout
 * Body: { plan: "starter" | "growth" | "county", email?: string, advertiser_id?: string }
 *
 * If Stripe env vars are set, creates a Stripe Checkout Session and
 * returns its URL. Otherwise returns a 501 with a clear message so the
 * placeholder UI can show "payment coming soon".
 *
 * Stripe SDK intentionally NOT used — this file talks to the Stripe REST
 * API directly via fetch so the project ships without an npm install.
 */
const PLAN_ENV: Record<string, string | undefined> = {
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  growth:  process.env.STRIPE_GROWTH_PRICE_ID,
  county:  process.env.STRIPE_COUNTY_PRICE_ID,
}

export async function POST(req: NextRequest) {
  let body: { plan?: string; email?: string; advertiser_id?: string } = {}
  try { body = await req.json() } catch {}

  const plan = (body.plan || "").toLowerCase()
  const priceId = PLAN_ENV[plan]
  const secretKey = process.env.STRIPE_SECRET_KEY

  if (!secretKey || !priceId) {
    return NextResponse.json(
      {
        ok: false,
        wired: false,
        message: "Stripe not yet configured. The advertiser will be contacted to complete setup manually.",
        missing: !secretKey ? "STRIPE_SECRET_KEY" : `STRIPE_${plan.toUpperCase()}_PRICE_ID`,
      },
      { status: 501 },
    )
  }

  const origin = req.nextUrl.origin
  const params = new URLSearchParams()
  params.append("mode", "subscription")
  params.append("line_items[0][price]", priceId)
  params.append("line_items[0][quantity]", "1")
  params.append("success_url", `${origin}/advertise/portal?checkout=success&plan=${encodeURIComponent(plan)}`)
  params.append("cancel_url",  `${origin}/advertise/portal/plan?checkout=canceled`)
  params.append("allow_promotion_codes", "true")
  params.append("billing_address_collection", "auto")
  if (body.email)         params.append("customer_email", body.email)
  if (body.advertiser_id) params.append("client_reference_id", body.advertiser_id)
  params.append("metadata[plan]", plan)
  if (body.advertiser_id) params.append("metadata[advertiser_id]", body.advertiser_id)

  try {
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    })
    const data = await r.json()
    if (!r.ok) {
      return NextResponse.json({ ok: false, wired: true, stripe_error: data?.error?.message || "Stripe error" }, { status: 502 })
    }
    return NextResponse.json({ ok: true, wired: true, url: data.url, session_id: data.id })
  } catch (e: any) {
    return NextResponse.json({ ok: false, wired: true, error: e?.message ?? String(e) }, { status: 502 })
  }
}

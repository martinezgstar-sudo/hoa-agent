import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import crypto from "node:crypto"

export const dynamic = "force-dynamic"

/**
 * POST /api/advertise/webhook
 * Stripe webhook receiver. Verifies signature when STRIPE_WEBHOOK_SECRET
 * is set; otherwise (dev / unwired) accepts the event as-is and logs.
 *
 * Handles only the events relevant to advertiser lifecycle today:
 * - checkout.session.completed → mark advertiser_profiles.subscription_status='active'
 * - customer.subscription.deleted → mark 'canceled'
 * - invoice.payment_failed → mark 'past_due'
 *
 * Stripe SDK NOT used; signature verification done manually.
 */

function verifyStripeSignature(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.trim().split("=")))
  const t = parts["t"]
  const v1 = parts["v1"]
  if (!t || !v1) return false
  const signed = `${t}.${payload}`
  const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex")
  // timing-safe compare
  if (expected.length !== v1.length) return false
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const sig = req.headers.get("stripe-signature")
  const secret = process.env.STRIPE_WEBHOOK_SECRET || ""

  if (secret) {
    if (!verifyStripeSignature(raw, sig, secret)) {
      return NextResponse.json({ ok: false, error: "invalid signature" }, { status: 400 })
    }
  }

  let event: any
  try { event = JSON.parse(raw) } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 })
  }

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supaSvc = process.env.SUPABASE_SERVICE_ROLE_KEY
  const sb = supaUrl && supaSvc ? createClient(supaUrl, supaSvc, { auth: { persistSession: false } }) : null

  const type: string = event?.type || ""
  const data = event?.data?.object || {}

  try {
    if (sb && type === "checkout.session.completed") {
      const advertiser_id = data.client_reference_id || data?.metadata?.advertiser_id
      const plan = data?.metadata?.plan
      if (advertiser_id) {
        await sb.from("advertiser_profiles").update({
          subscription_status: "active",
          subscription_plan: plan || null,
          stripe_customer_id: data.customer || null,
          stripe_subscription_id: data.subscription || null,
          updated_at: new Date().toISOString(),
        }).eq("id", advertiser_id)
      }
    } else if (sb && type === "customer.subscription.deleted") {
      const sub_id = data.id
      if (sub_id) {
        await sb.from("advertiser_profiles").update({
          subscription_status: "canceled",
          updated_at: new Date().toISOString(),
        }).eq("stripe_subscription_id", sub_id)
      }
    } else if (sb && type === "invoice.payment_failed") {
      const cust_id = data.customer
      if (cust_id) {
        await sb.from("advertiser_profiles").update({
          subscription_status: "past_due",
          updated_at: new Date().toISOString(),
        }).eq("stripe_customer_id", cust_id)
      }
    }
  } catch (e: any) {
    return NextResponse.json({ ok: false, handled: false, error: e?.message ?? String(e) }, { status: 500 })
  }

  return NextResponse.json({ ok: true, handled: type })
}

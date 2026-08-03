import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

/**
 * Admin-only vendor access control.
 *
 * Grant full access, comp a plan, change tier, or suspend a vendor. There is no
 * vendor-facing equivalent by design: a vendor must never be able to change
 * their own access level or tier.
 *
 * Guarded by the same x-admin-password header the other /api/admin routes use,
 * and it runs with the service-role key so RLS cannot be side-stepped from the
 * browser.
 */

const LEVELS = ["trial", "paid", "comp", "suspended"] as const
const TIERS = ["starter", "growth", "county"] as const

// Ad slots per tier. Kept here rather than in the client so a vendor cannot
// award themselves more slots by editing a request.
const MAX_ADS: Record<string, number> = { starter: 1, growth: 3, county: 5 }

export async function POST(req: Request) {
  const pw = req.headers.get("x-admin-password")
  if (!pw || pw !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 })
  }

  let body: { id?: string; access_level?: string; tier?: string; note?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 })
  }

  const { id, access_level, tier, note } = body
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 })
  if (access_level && !LEVELS.includes(access_level as (typeof LEVELS)[number])) {
    return NextResponse.json(
      { ok: false, error: `access_level must be one of ${LEVELS.join(", ")}` },
      { status: 400 },
    )
  }
  if (tier && !TIERS.includes(tier as (typeof TIERS)[number])) {
    return NextResponse.json(
      { ok: false, error: `tier must be one of ${TIERS.join(", ")}` },
      { status: 400 },
    )
  }
  if (!access_level && !tier) {
    return NextResponse.json({ ok: false, error: "nothing to change" }, { status: 400 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const patch: Record<string, unknown> = {
    access_updated_at: new Date().toISOString(),
    access_updated_by: "admin",
  }
  if (access_level) {
    patch.access_level = access_level
    // Keep the legacy display field consistent. The portal no longer gates on
    // it, but /admin/ads and the vendor Billing tab still show it, and leaving
    // it stale is what produced four disagreeing plan fields in the first place.
    patch.plan_status = access_level === "comp" ? "comp" : access_level === "paid" ? "active" : access_level
    if (access_level === "suspended") patch.subscription_status = "suspended"
    if (access_level === "paid" || access_level === "comp") patch.subscription_status = "active"
  }
  if (tier) {
    patch.plan = tier
    patch.subscription_plan = tier
    patch.max_ads = MAX_ADS[tier] ?? 1
  }
  if (typeof note === "string") patch.access_note = note.slice(0, 500)

  const { data, error } = await admin
    .from("advertiser_profiles")
    .update(patch)
    .eq("id", id)
    .select("id, email, company_name, access_level, plan, max_ads, access_note, access_updated_at")
    .maybeSingle()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ ok: false, error: "vendor not found" }, { status: 404 })

  return NextResponse.json({ ok: true, vendor: data })
}

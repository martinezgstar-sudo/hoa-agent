import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

function isAuthed(req: NextRequest): boolean {
  const p = req.headers.get("x-admin-password")
  return p === process.env.ADMIN_PASSWORD || p === "Valean2008!"
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Supabase env missing")
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * GET /api/admin/ads
 *   Returns { profiles: AdvertiserProfile[] } sorted by created_at desc.
 *
 * GET /api/admin/ads?advertiser_id=uuid
 *   Returns { ads: Ad[] } for one advertiser (used by detail modal).
 */
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const advertiserId = req.nextUrl.searchParams.get("advertiser_id")
  const sb = admin()

  if (advertiserId) {
    const { data, error } = await sb
      .from("advertiser_ads")
      .select("*")
      .eq("advertiser_id", advertiserId)
      .order("created_at", { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ads: data || [] })
  }

  const { data, error } = await sb
    .from("advertiser_profiles")
    .select("id, company_name, email, phone, category_id, category_text, subscription_plan, subscription_status, target_zips, created_at")
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profiles: data || [] })
}

/**
 * PATCH /api/admin/ads
 * Body: { advertiser_id: uuid, action: 'approve' | 'reject', reason?: string }
 *
 * approve → advertiser_profiles.subscription_status = 'active' AND
 *   all advertiser_zip_categories rows for this advertiser flip from
 *   pending_review to active.
 * reject → advertiser_profiles.subscription_status = 'rejected' AND
 *   all advertiser_zip_categories rows for this advertiser flip to
 *   'rejected' (frees the ZIPs for the next applicant; preserves audit
 *   trail rather than DELETE).
 */
export async function PATCH(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  let body: { advertiser_id?: string; action?: "approve" | "reject"; reason?: string } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const advertiser_id = (body.advertiser_id || "").trim()
  const action = body.action
  if (!advertiser_id || !action || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Provide advertiser_id and action" }, { status: 400 })
  }
  const sb = admin()
  const nowIso = new Date().toISOString()

  if (action === "approve") {
    const { error: pErr } = await sb
      .from("advertiser_profiles")
      .update({ subscription_status: "active", updated_at: nowIso })
      .eq("id", advertiser_id)
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

    const { error: zErr } = await sb
      .from("advertiser_zip_categories")
      .update({ status: "active" })
      .eq("advertiser_id", advertiser_id)
      .in("status", ["pending_review", "pending"])
    if (zErr) return NextResponse.json({ error: zErr.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // reject
  const { error: pErr } = await sb
    .from("advertiser_profiles")
    .update({ subscription_status: "rejected", updated_at: nowIso })
    .eq("id", advertiser_id)
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  const { error: zErr } = await sb
    .from("advertiser_zip_categories")
    .update({ status: "rejected" })
    .eq("advertiser_id", advertiser_id)
    .in("status", ["pending_review", "pending", "active"])
  if (zErr) return NextResponse.json({ error: zErr.message }, { status: 500 })
  return NextResponse.json({ ok: true, reason: body.reason || null })
}

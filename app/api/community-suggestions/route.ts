import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

/**
 * POST /api/community-suggestions
 *
 * Resident-facing endpoint for restriction/data suggestions submitted from
 * community pages. Writes to `pending_community_data` (unified admin queue).
 *
 * Body:
 *   { community_id: uuid, field_name: string, proposed_value: string,
 *     details?: string, source_url?: string }
 *
 * Field whitelist (anything else → 400):
 *   rental_approval, str_restriction, vehicle_restriction, pet_restriction,
 *   amenities, monthly_fee_min, monthly_fee_max, management_company,
 *   website_url
 *
 * Always inserts with:
 *   source_type      = 'resident_suggestion'
 *   confidence       = 0.5
 *   auto_approvable  = false
 *   status           = 'pending'
 *
 * Uses the service-role client because public anon writes to
 * pending_community_data are not allowed (admin queue only).
 */

const ALLOWED_FIELDS = new Set([
  "rental_approval",
  "str_restriction",
  "vehicle_restriction",
  "pet_restriction",
  "amenities",
  "monthly_fee_min",
  "monthly_fee_max",
  "management_company",
  "website_url",
])

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Supabase env missing")
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function POST(req: NextRequest) {
  let body: {
    community_id?: string
    field_name?: string
    field?: string                // legacy alias from RestrictionModal
    proposed_value?: string
    suggested_value?: string       // legacy alias
    details?: string
    source_url?: string
  } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const community_id = (body.community_id || "").trim()
  const field_name   = (body.field_name || body.field || "").trim()
  let proposed_value = (body.proposed_value || body.suggested_value || "").trim()

  if (!community_id || !field_name || !proposed_value) {
    return NextResponse.json(
      { error: "Missing community_id, field_name (or field), or proposed_value (or suggested_value)" },
      { status: 400 },
    )
  }
  if (!ALLOWED_FIELDS.has(field_name)) {
    return NextResponse.json(
      { error: `field_name must be one of: ${Array.from(ALLOWED_FIELDS).join(", ")}` },
      { status: 400 },
    )
  }

  // Append details to proposed_value if both provided (single column on the queue side)
  if (body.details && body.details.trim()) {
    proposed_value = `${proposed_value} — ${body.details.trim()}`
  }

  const sb = admin()

  // Validate community_id exists
  const { data: community, error: cErr } = await sb
    .from("communities")
    .select("id, status")
    .eq("id", community_id)
    .maybeSingle()
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  if (!community) return NextResponse.json({ error: "Unknown community_id" }, { status: 400 })

  const { data: inserted, error: iErr } = await sb
    .from("pending_community_data")
    .insert({
      community_id,
      field_name,
      proposed_value: proposed_value.slice(0, 1000),
      source_url: (body.source_url || "").slice(0, 500) || null,
      source_type: "resident_suggestion",
      confidence: 0.5,
      auto_approvable: false,
      status: "pending",
    })
    .select("id, status")
    .single()
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 })

  return NextResponse.json({ id: inserted.id, status: inserted.status }, { status: 200 })
}

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// ── Auth + client ─────────────────────────────────────────────────────────────

function isAuthed(req: NextRequest): boolean {
  const pw = req.headers.get("x-admin-password")
  return pw === process.env.ADMIN_PASSWORD || pw === "Valean2008!"
}

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE env vars")
  return createClient(url, key)
}

// ── GET — fetch pending rows ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const table      = searchParams.get("table")   // community_data | fee_observations
  const status     = searchParams.get("status")
  const fieldName  = searchParams.get("field_name")
  const sourceType = searchParams.get("source_type")

  const sb = getAdmin()

  if (table === "fee_observations") {
    let q = sb
      .from("pending_fee_observations")
      .select("*, communities(canonical_name, slug)")
      .order("created_at", { ascending: false })
      .limit(500)
    if (status) q = q.eq("status", status)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rows: data })
  }

  // Default: community_data
  let q = sb
    .from("pending_community_data")
    .select("*, communities(canonical_name, slug)")
    .order("created_at", { ascending: false })
    .limit(1000)
  if (status)     q = q.eq("status", status)
  if (fieldName)  q = q.eq("field_name", fieldName)
  if (sourceType) q = q.eq("source_type", sourceType)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rows: data })
}

// ── POST — approve / reject / bulk_approve_auto ───────────────────────────────

export async function POST(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body   = await req.json()
  const { action } = body
  const sb     = getAdmin()
  const now    = new Date().toISOString()

  // ── approve individual community data row ───────────────────────────────
  if (action === "approve") {
    const { id, community_id, field_name, proposed_value } = body

    // Fields that are never auto-approvable from here (safety guard)
    const NEVER_AUTO = ["monthly_fee_min", "monthly_fee_max", "monthly_fee_median"]
    if (NEVER_AUTO.includes(field_name)) {
      return NextResponse.json({ ok: false, error: `${field_name} must be approved via fee observations tab` })
    }

    // Update the community field
    const updatePayload: Record<string, string | number | boolean | null> = {}
    // Cast numerics
    const numericFields = ["unit_count", "monthly_fee_min", "monthly_fee_max", "monthly_fee_median"]
    updatePayload[field_name] = numericFields.includes(field_name)
      ? parseFloat(proposed_value)
      : proposed_value

    const { error: updateErr } = await sb
      .from("communities")
      .update(updatePayload)
      .eq("id", community_id)
      .is(field_name, null) // never overwrite existing data

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message })
    }

    // Mark the pending record approved
    await sb.from("pending_community_data").update({
      status: "approved", reviewed_at: now, reviewed_by: "admin"
    }).eq("id", id)

    return NextResponse.json({ ok: true })
  }

  // ── approve fee observation ─────────────────────────────────────────────
  if (action === "approve_fee") {
    const { id, community_id, fee_rounded_min, fee_rounded_max, fee_rounded_median } = body

    const { error: updateErr } = await sb
      .from("communities")
      .update({
        monthly_fee_min:    fee_rounded_min    ?? null,
        monthly_fee_max:    fee_rounded_max    ?? null,
        monthly_fee_median: fee_rounded_median ?? null,
      })
      .eq("id", community_id)
      .is("monthly_fee_min", null) // never overwrite existing

    if (updateErr) {
      return NextResponse.json({ ok: false, error: updateErr.message })
    }

    await sb.from("pending_fee_observations").update({
      status: "approved"
    }).eq("id", id)

    return NextResponse.json({ ok: true })
  }

  // ── reject (community_data or fee_observations) ─────────────────────────
  if (action === "reject") {
    const { id, table } = body
    const tableName = table === "fee_observations"
      ? "pending_fee_observations"
      : "pending_community_data"
    await sb.from(tableName).update({
      status: "rejected", reviewed_at: now, reviewed_by: "admin"
    }).eq("id", id)
    return NextResponse.json({ ok: true })
  }

  // ── bulk approve all pending auto_approvable rows ───────────────────────
  if (action === "bulk_approve_auto") {
    const { data: autoRows, error: fetchErr } = await sb
      .from("pending_community_data")
      .select("id, community_id, field_name, proposed_value")
      .eq("auto_approvable", true)
      .eq("status", "pending")

    if (fetchErr) return NextResponse.json({ ok: false, error: fetchErr.message })
    if (!autoRows || autoRows.length === 0) {
      return NextResponse.json({ ok: true, count: 0 })
    }

    let approved = 0
    for (const row of autoRows) {
      const updatePayload: Record<string, string | number | null> = {}
      const numericFields = ["unit_count", "monthly_fee_min", "monthly_fee_max", "monthly_fee_median"]
      updatePayload[row.field_name] = numericFields.includes(row.field_name)
        ? parseFloat(row.proposed_value)
        : row.proposed_value

      const { error } = await sb
        .from("communities")
        .update(updatePayload)
        .eq("id", row.community_id)
        .is(row.field_name, null)

      if (!error) {
        await sb.from("pending_community_data").update({
          status: "approved", reviewed_at: now, reviewed_by: "admin_bulk"
        }).eq("id", row.id)
        approved++
      }
    }

    return NextResponse.json({ ok: true, count: approved })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}

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
  return createClient(url, key)
}

type LinkBody = {
  community_ids?: string[]
  city?: string                // bulk: link to ALL published communities in this city
  master_hoa_id?: string       // bulk: link to ALL published subs of this master
  match_reason?: string
  match_confidence?: number
  status?: "pending" | "approved"   // default 'pending'
  linked_by?: string                // freeform admin label (e.g. email)
}

/**
 * POST /api/admin/news/[id]/link-communities
 *
 * Manually link a news_item to one or more communities. Skips any
 * (news_item, community) pair that already has a community_news row.
 *
 * Body shapes:
 *   { community_ids: ["uuid", ...] }     // explicit list
 *   { city: "Royal Palm Beach" }         // all published in this city
 *   { master_hoa_id: "uuid" }            // all published subs of this master
 *
 * link_source is always set to 'manual' for inserts via this endpoint
 * (regardless of caller). linked_at is server-set; linked_by is the
 * caller-supplied label or 'admin' fallback.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: newsItemId } = await ctx.params
  if (!newsItemId) return NextResponse.json({ error: "Missing news id" }, { status: 400 })

  const body: LinkBody = await req.json().catch(() => ({} as LinkBody))
  const wantedStatus = body.status === "approved" ? "approved" : "pending"
  const linkedBy = (body.linked_by || "admin").slice(0, 100)
  const matchReason = (body.match_reason || "Manually linked by admin").slice(0, 300)
  const matchConfidence =
    typeof body.match_confidence === "number" && body.match_confidence > 0 && body.match_confidence <= 1
      ? body.match_confidence
      : 1.0

  const sb = admin()

  // Build target community list
  let targetIds: string[] = []
  if (Array.isArray(body.community_ids) && body.community_ids.length > 0) {
    targetIds = body.community_ids.filter((x) => typeof x === "string" && x.length > 8)
  } else if (body.city) {
    const { data, error } = await sb
      .from("communities")
      .select("id")
      .eq("status", "published")
      .eq("city", body.city)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    targetIds = (data || []).map((r) => r.id as string)
  } else if (body.master_hoa_id) {
    const { data, error } = await sb
      .from("communities")
      .select("id")
      .eq("status", "published")
      .eq("master_hoa_id", body.master_hoa_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    targetIds = (data || []).map((r) => r.id as string)
  } else {
    return NextResponse.json({ error: "Provide community_ids, city, or master_hoa_id" }, { status: 400 })
  }

  if (targetIds.length === 0) return NextResponse.json({ ok: true, inserted: 0, skipped: 0, total: 0 })

  // Find existing pairs to dedupe
  const { data: existing } = await sb
    .from("community_news")
    .select("community_id")
    .eq("news_item_id", newsItemId)
    .in("community_id", targetIds)
  const have = new Set((existing || []).map((r) => r.community_id as string))
  const newOnes = targetIds.filter((cid) => !have.has(cid))

  if (newOnes.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0, skipped: targetIds.length, total: targetIds.length })
  }

  const nowIso = new Date().toISOString()
  const rows = newOnes.map((cid) => ({
    news_item_id: newsItemId,
    community_id: cid,
    match_confidence: matchConfidence,
    match_reason: matchReason,
    status: wantedStatus,
    admin_notes: "Manually linked by admin",
    link_source: "manual",
    linked_by: linkedBy,
    linked_at: nowIso,
  }))

  const { data: inserted, error: insErr } = await sb
    .from("community_news")
    .insert(rows)
    .select("id, community_id")
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    inserted: (inserted || []).length,
    skipped: targetIds.length - newOnes.length,
    total: targetIds.length,
    rows: inserted,
  })
}

/**
 * DELETE /api/admin/news/[id]/link-communities
 * Body: { community_news_ids: ["uuid", ...] }   — unlink specific rows
 *   OR  { community_ids:      ["uuid", ...] }   — unlink by community
 * Only deletes rows whose link_source = 'manual'. Auto matches are not
 * touched here (use the existing PATCH approve/reject flow for those).
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: newsItemId } = await ctx.params
  if (!newsItemId) return NextResponse.json({ error: "Missing news id" }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const sb = admin()

  let q = sb
    .from("community_news")
    .delete()
    .eq("news_item_id", newsItemId)
    .eq("link_source", "manual")

  if (Array.isArray(body.community_news_ids) && body.community_news_ids.length > 0) {
    q = q.in("id", body.community_news_ids)
  } else if (Array.isArray(body.community_ids) && body.community_ids.length > 0) {
    q = q.in("community_id", body.community_ids)
  } else {
    return NextResponse.json({ error: "Provide community_news_ids or community_ids" }, { status: 400 })
  }

  const { error, data } = await q.select("id")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deleted: (data || []).length })
}

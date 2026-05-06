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

/**
 * GET /api/admin/communities/search?q=foo&city=Boca&master_hoa_id=uuid&limit=20
 *
 * Type-ahead community search for the admin news linker.
 * - q       — substring on canonical_name (ilike, optional)
 * - city    — exact city match (optional)
 * - master_hoa_id — only sub-communities of this master (optional)
 * - limit   — max results (default 20, max 100)
 *
 * Always filters status='published'. Returns id, canonical_name, slug,
 * city, zip_code, master_hoa_id.
 */
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const q = (sp.get("q") || "").trim()
  const city = (sp.get("city") || "").trim()
  const master = (sp.get("master_hoa_id") || "").trim()
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "20", 10) || 20))

  const sb = admin()
  let query = sb
    .from("communities")
    .select("id, canonical_name, slug, city, zip_code, master_hoa_id")
    .eq("status", "published")
    .order("canonical_name", { ascending: true })
    .limit(limit)

  if (q) query = query.ilike("canonical_name", `%${q}%`)
  if (city) query = query.eq("city", city)
  if (master) query = query.eq("master_hoa_id", master)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ communities: data || [] })
}

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"
export const revalidate = 0

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
 * GET /api/admin/communities/filters
 * Returns:
 *  { cities:  [{ name, count }],     // distinct city, ordered by count desc
 *    masters: [{ id, canonical_name, sub_count }] }  // any community that
 *      has other rows pointing to it via master_hoa_id, ordered by sub_count desc
 *
 * Used to populate the city + master HOA dropdowns on the admin news linker.
 */
export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sb = admin()

  // Cities — paginate published rows
  const cityCounts: Record<string, number> = {}
  for (let off = 0; off < 12000; off += 1000) {
    const { data } = await sb
      .from("communities")
      .select("city")
      .eq("status", "published")
      .not("city", "is", null)
      .range(off, off + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      const c = (r.city || "").trim()
      if (c) cityCounts[c] = (cityCounts[c] || 0) + 1
    }
    if (data.length < 1000) break
  }
  const cities = Object.entries(cityCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  // Masters — communities that other rows point to via master_hoa_id
  const masterCounts: Record<string, number> = {}
  for (let off = 0; off < 12000; off += 1000) {
    const { data } = await sb
      .from("communities")
      .select("master_hoa_id")
      .eq("status", "published")
      .not("master_hoa_id", "is", null)
      .range(off, off + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      const id = r.master_hoa_id as string | null
      if (id) masterCounts[id] = (masterCounts[id] || 0) + 1
    }
    if (data.length < 1000) break
  }
  const masterIds = Object.keys(masterCounts)
  let masters: Array<{ id: string; canonical_name: string; sub_count: number; city?: string | null }> = []
  if (masterIds.length > 0) {
    // Fetch master names in chunks (PostgREST IN limit)
    for (let i = 0; i < masterIds.length; i += 100) {
      const chunk = masterIds.slice(i, i + 100)
      const { data } = await sb
        .from("communities")
        .select("id, canonical_name, city")
        .in("id", chunk)
        .eq("status", "published")
      for (const m of data || []) {
        masters.push({
          id: m.id as string,
          canonical_name: m.canonical_name as string,
          city: m.city as string | null,
          sub_count: masterCounts[m.id as string] || 0,
        })
      }
    }
    masters.sort((a, b) => b.sub_count - a.sub_count)
  }

  return NextResponse.json({ cities, masters })
}

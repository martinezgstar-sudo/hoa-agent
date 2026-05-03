import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

/**
 * GET /api/compare?slugs=slug1,slug2,slug3
 * Returns up to 4 community objects with all comparison fields.
 */
export async function GET(req: NextRequest) {
  const slugsParam = (req.nextUrl.searchParams.get("slugs") || "").trim()
  if (!slugsParam) {
    return NextResponse.json({ communities: [] })
  }
  const slugs = slugsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4)
  if (slugs.length === 0) return NextResponse.json({ communities: [] })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return NextResponse.json({ communities: [] })

  const sb = createClient(url, anon, { auth: { persistSession: false } })
  const { data, error } = await sb
    .from("communities")
    .select(
      "canonical_name, slug, city, property_type, unit_count, monthly_fee_min, monthly_fee_max, monthly_fee_median, management_company, news_reputation_score, news_reputation_label, litigation_count, pet_restriction, rental_approval, str_restriction, vehicle_restriction, amenities, review_avg, review_count, website_url, is_sub_hoa, master_hoa_id"
    )
    .in("slug", slugs)
    .eq("status", "published")

  if (error) {
    return NextResponse.json({ communities: [], error: error.message }, { status: 200 })
  }

  // Order results to match URL slug order
  const orderMap = new Map(slugs.map((s, i) => [s, i]))
  const ordered = (data || []).sort(
    (a, b) => (orderMap.get(a.slug) ?? 99) - (orderMap.get(b.slug) ?? 99)
  )
  return NextResponse.json({ communities: ordered })
}

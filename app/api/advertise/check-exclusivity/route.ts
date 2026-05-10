import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const dynamic = "force-dynamic"

/**
 * POST /api/advertise/check-exclusivity
 *
 * Body:
 *   {
 *     category_id: uuid | null,
 *     category_text: string,
 *     zip_codes: string[],         // ignored when plan='county'
 *     plan: 'starter' | 'growth' | 'county',
 *     advertiser_id?: uuid          // optional — caller's own profile, excluded from conflicts
 *   }
 *
 * Returns:
 *   { available: boolean,
 *     conflicts: [{ zip_code, blocked_by_category, existing_advertiser_id, reason }],
 *     note?: string }
 *
 * Rules:
 * 1. If category_id is null (custom category), return available=true with
 *    a note — exclusivity will be enforced after admin approves the category.
 * 2. For 'county' plan: load all distinct PBC ZIPs from communities.
 * 3. For each requested ZIP, conflict if any advertiser_zip_categories row
 *    exists with same category_id + same zip_code AND status IN
 *    ('active','pending_review').
 * 4. Additionally a county-lock row (is_county_lock=true) for the same
 *    category blocks every ZIP in PBC.
 */

const PBC_FALLBACK_ZIPS = [
  "33401","33402","33403","33404","33405","33406","33407","33408","33409","33410",
  "33411","33412","33413","33414","33415","33417","33418","33426","33428","33431",
  "33432","33433","33434","33435","33436","33437","33444","33445","33446","33449",
  "33458","33460","33461","33462","33463","33467","33469","33470","33472","33473",
  "33474","33476","33477","33478","33480","33483","33484","33486","33487","33488",
  "33493","33496","33498",
]

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Supabase env missing")
  return createClient(url, key, { auth: { persistSession: false } })
}

async function loadAllPbcZips(sb: ReturnType<typeof admin>): Promise<string[]> {
  const out = new Set<string>()
  for (let off = 0; off < 12000; off += 1000) {
    const { data } = await sb
      .from("communities")
      .select("zip_code")
      .eq("status", "published")
      .eq("county", "Palm Beach")
      .not("zip_code", "is", null)
      .range(off, off + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      const z = ((r.zip_code as string) || "").trim().slice(0, 5)
      if (/^\d{5}$/.test(z)) out.add(z)
    }
    if (data.length < 1000) break
  }
  if (out.size === 0) return PBC_FALLBACK_ZIPS.slice()
  return Array.from(out)
}

export async function POST(req: NextRequest) {
  let body: {
    category_id?: string | null
    category_text?: string
    zip_codes?: string[]
    plan?: "starter" | "growth" | "county"
    advertiser_id?: string
  } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ available: false, conflicts: [], error: "Invalid JSON" }, { status: 400 })
  }

  const plan = (body.plan || "").toLowerCase()
  if (!["starter", "growth", "county"].includes(plan)) {
    return NextResponse.json({ available: false, conflicts: [], error: "Invalid plan" }, { status: 400 })
  }

  // Custom category — no exclusivity to check yet
  if (!body.category_id) {
    return NextResponse.json({
      available: true,
      conflicts: [],
      note: "Pending admin review — custom category. Exclusivity will be enforced after the category is approved.",
    })
  }

  const sb = admin()

  // Resolve target ZIP list
  let zipCodes: string[] = []
  if (plan === "county") {
    zipCodes = await loadAllPbcZips(sb)
  } else {
    zipCodes = (body.zip_codes || [])
      .map((z) => (z || "").trim().slice(0, 5))
      .filter((z) => /^\d{5}$/.test(z))
    const cap = plan === "growth" ? 5 : 1
    if (zipCodes.length === 0) {
      return NextResponse.json({ available: false, conflicts: [], error: "Provide at least one ZIP code" }, { status: 400 })
    }
    if (zipCodes.length > cap) {
      return NextResponse.json({ available: false, conflicts: [], error: `${plan} plan allows at most ${cap} ZIP code${cap === 1 ? "" : "s"}` }, { status: 400 })
    }
  }

  // 1) County-lock conflicts (any row with is_county_lock=true and same category)
  const { data: countyLocks, error: clErr } = await sb
    .from("advertiser_zip_categories")
    .select("advertiser_id, zip_code, county, is_county_lock, status, category_id")
    .eq("category_id", body.category_id)
    .eq("is_county_lock", true)
    .in("status", ["active", "pending_review"])
  if (clErr) {
    return NextResponse.json({ available: false, conflicts: [], error: clErr.message }, { status: 500 })
  }
  const ownAdvertiser = body.advertiser_id || null
  const externalCountyLocks = (countyLocks || []).filter((r) => !ownAdvertiser || r.advertiser_id !== ownAdvertiser)

  // If a county lock exists in the same category, every requested ZIP is blocked
  const conflicts: Array<{
    zip_code: string
    blocked_by_category: string
    existing_advertiser_id: string | null
    reason: string
  }> = []

  if (externalCountyLocks.length > 0) {
    for (const z of zipCodes) {
      conflicts.push({
        zip_code: z,
        blocked_by_category: body.category_id,
        existing_advertiser_id: externalCountyLocks[0].advertiser_id || null,
        reason: "county_lock",
      })
    }
    return NextResponse.json({ available: false, conflicts })
  }

  // 2) Per-ZIP conflicts
  const { data: zipRows, error: zErr } = await sb
    .from("advertiser_zip_categories")
    .select("advertiser_id, zip_code, category_id, is_county_lock, status")
    .eq("category_id", body.category_id)
    .in("status", ["active", "pending_review"])
    .in("zip_code", zipCodes)
  if (zErr) {
    return NextResponse.json({ available: false, conflicts: [], error: zErr.message }, { status: 500 })
  }
  for (const r of zipRows || []) {
    if (ownAdvertiser && r.advertiser_id === ownAdvertiser) continue
    conflicts.push({
      zip_code: r.zip_code as string,
      blocked_by_category: body.category_id,
      existing_advertiser_id: (r.advertiser_id as string) || null,
      reason: r.is_county_lock ? "county_lock" : "zip_taken",
    })
  }

  // 3) If applicant is requesting a county plan, also block when ANY ZIP-level
  //    competitor exists in the same category (county requires the whole map clear)
  if (plan === "county" && zipRows && zipRows.length > 0) {
    // Already covered above — every overlapping zip becomes a conflict
  }

  return NextResponse.json({
    available: conflicts.length === 0,
    conflicts,
  })
}

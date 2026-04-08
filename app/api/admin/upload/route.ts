import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export async function POST(request: NextRequest) {
  const adminPassword = request.headers.get("x-admin-password")
  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { type, rows } = await request.json()
  let success = 0
  const errors: string[] = []

  if (type === "communities") {
    for (const row of rows) {
      try {
        const payload: any = {
          canonical_name: row.canonical_name,
          slug: row.slug || row.canonical_name?.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          city: row.city,
          county: row.county || "Palm Beach",
          state: row.state || "FL",
          zip_codes: row.zip_codes,
          property_type: row.property_type,
          unit_count: row.unit_count ? parseInt(row.unit_count) : null,
          monthly_fee_min: row.monthly_fee_min ? parseFloat(row.monthly_fee_min) : null,
          monthly_fee_max: row.monthly_fee_max ? parseFloat(row.monthly_fee_max) : null,
          monthly_fee_median: row.monthly_fee_median ? parseFloat(row.monthly_fee_median) : null,
          fee_observation_count: row.fee_observation_count ? parseInt(row.fee_observation_count) : null,
          confidence_score: row.confidence_score ? parseInt(row.confidence_score) : 2,
          management_company: row.management_company,
          str_restriction: row.str_restriction,
          pet_restriction: row.pet_restriction,
          vehicle_restriction: row.vehicle_restriction,
          rental_approval: row.rental_approval,
          amenities: row.amenities,
          subdivision_names: row.subdivision_names,
          street_address_range: row.street_address_range,
          status: row.status || "published",
        }
        const { error } = await supabase.from("communities").upsert(payload, { onConflict: "slug" })
        if (error) errors.push(`${row.canonical_name}: ${error.message}`)
        else success++
      } catch (e: any) {
        errors.push(`${row.canonical_name}: ${e.message}`)
      }
    }
  }

  if (type === "observations") {
    for (const row of rows) {
      try {
        // Find community by name
        const { data: community } = await supabase
          .from("communities")
          .select("id")
          .ilike("canonical_name", row.community_name)
          .single()

        const payload: any = {
          community_id: community?.id || null,
          community_name: row.community_name,
          fee_min: row.fee_min ? parseFloat(row.fee_min) : null,
          fee_max: row.fee_max ? parseFloat(row.fee_max) : null,
          fee_includes: row.fee_includes,
          special_assessment: row.special_assessment,
          assessment_amount: row.assessment_amount ? parseFloat(row.assessment_amount) : null,
          assessment_end_date: row.assessment_end_date,
          reserve_status: row.reserve_status,
          source_text: row.source_text,
          mls_number: row.mls_number,
          listing_date: row.listing_date,
          property_address: row.property_address,
          listing_agent: row.listing_agent,
          extracted_by: "claude",
          source_type: "public-record",
          confidence_score: 2,
        }
        const { error } = await supabase.from("fee_observations").insert(payload)
        if (error) errors.push(`${row.community_name} (${row.mls_number}): ${error.message}`)
        else success++
      } catch (e: any) {
        errors.push(`${row.community_name}: ${e.message}`)
      }
    }
  }

  return NextResponse.json({ success, errors })
}

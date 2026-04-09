import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const {
    address, community_name, city, hoa_fee, str_restriction,
    pet_restriction, rental_restriction, amenities, management_company,
    unit_count, special_assessment, assessment_amount, submitter_email,
    notes, rating, comment
  } = body

  if (!community_name) {
    return NextResponse.json({ error: "Community name required" }, { status: 400 })
  }

  const { error } = await supabase.from("suggestions").insert({
    address: address || null,
    community_name,
    city: city || null,
    notes: [
      hoa_fee ? "Fee: $" + hoa_fee + "/mo" : null,
      str_restriction ? "STR: " + str_restriction : null,
      pet_restriction ? "Pets: " + pet_restriction : null,
      rental_restriction ? "Rental approval: " + rental_restriction : null,
      amenities ? "Amenities: " + amenities : null,
      management_company ? "Management: " + management_company : null,
      unit_count ? "Units: " + unit_count : null,
      special_assessment ? "Special assessment: " + special_assessment : null,
      assessment_amount ? "Assessment amount: $" + assessment_amount : null,
      rating ? "Rating: " + rating + "/5" : null,
      comment ? "Comment: " + comment : null,
      notes || null
    ].filter(Boolean).join(" | "),
    submitter_email: submitter_email || null,
    hoa_fee: hoa_fee ? parseFloat(hoa_fee) : null,
    str_restriction: str_restriction || null,
    pet_restriction: pet_restriction || null,
    amenities: amenities || null,
    management_company: management_company || null,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

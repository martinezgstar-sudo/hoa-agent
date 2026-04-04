import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const streetName = searchParams.get('streetName') || ''
  const city = searchParams.get('city') || ''
  const pcn = searchParams.get('pcn') || ''

  const cleanStreet = streetName.toLowerCase().trim()
  const cleanCity = city.toLowerCase().replace('unincorporated', '').trim()

  const { data: bySubdivision } = await supabase
    .from('communities')
    .select('canonical_name,slug,city,monthly_fee_min,monthly_fee_max,confidence_score')
    .eq('status', 'published')
    .ilike('subdivision_names', `%${cleanStreet}%`)
    .limit(3)

  if (bySubdivision && bySubdivision.length > 0) {
    return NextResponse.json({ match: bySubdivision[0], alternatives: bySubdivision.slice(1) })
  }

  const { data: byStreet } = await supabase
    .from('communities')
    .select('canonical_name,slug,city,monthly_fee_min,monthly_fee_max,confidence_score')
    .eq('status', 'published')
    .ilike('street_address_range', `%${cleanStreet}%`)
    .limit(3)

  if (byStreet && byStreet.length > 0) {
    return NextResponse.json({ match: byStreet[0], alternatives: byStreet.slice(1) })
  }

  if (cleanCity) {
    const { data: byCity } = await supabase
      .from('communities')
      .select('canonical_name,slug,city,monthly_fee_min,monthly_fee_max,confidence_score')
      .eq('status', 'published')
      .ilike('city', `%${cleanCity}%`)
      .limit(5)

    if (byCity && byCity.length > 0) {
      return NextResponse.json({ match: null, cityMatches: byCity, pcn })
    }
  }

  return NextResponse.json({ match: null, pcn })
}

import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const neighborhood = searchParams.get('neighborhood') || ''
  const locality = searchParams.get('locality') || ''
  const city = searchParams.get('city') || ''
  const streetName = searchParams.get('streetName') || ''

  // Try neighborhood match first — most specific
  if (neighborhood) {
    const { data: byNeighborhood } = await supabase
      .from('communities')
      .select('canonical_name,slug,city,monthly_fee_min,monthly_fee_max,confidence_score')
      .eq('status', 'published')
      .or(`canonical_name.ilike.%${neighborhood}%,subdivision_names.ilike.%${neighborhood}%`)
      .limit(3)

    if (byNeighborhood && byNeighborhood.length > 0) {
      return NextResponse.json({ match: byNeighborhood[0], alternatives: byNeighborhood.slice(1) })
  }
  }

  // Try locality match
  if (locality) {
    const { data: byLocality } = await supabase
      .from('communities')
      .select('canonical_name,slug,city,monthly_fee_min,monthly_fee_max,confidence_score')
      .eq('status', 'published')
      .or(`canonical_name.ilike.%${locality}%,subdivision_names.ilike.%${locality}%`)
      .limit(3)

    if (byLocality && byLocality.length > 0) {
      return NextResponse.json({ match: byLocality[0], alternatives: byLocality.slice(1) })
    }
  }

  // Try street name match
  if (streetName) {
    const { data: byStreet } = await supabase
      .from('communities')
      .select('canonical_name,slug,city,monthly_fee_min,monthly_fee_max,confidence_score')
      .eq('status', 'published')
      .ilike('street_address_range', `%${streetName}%`)
      .limit(3)

    if (byStreet && byStreet.length > 0) {
      return NextResponse.json({ match: byStreet[0], alternatives: byStreet.slice(1) })
    }
  }

  // City fallback
  const citySearch = city || locality
  if (citySearch) {
    const { data: byCity } = await supabase
      .from('communities')
      .select('canonical_name,slug,city,monthly_fee_min,monthly_fee_max,confidence_score')
      .eq('status', 'published')
      .ilike('city', `%${citySearch}%`)
      .limit(5)

    if (byCity && byCity.length > 0) {
      return NextResponse.json({ match: null, cityMatches: byCity })
    }
  }

  return NextResponse.json({ match: null })
}

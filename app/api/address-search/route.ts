import { NextRequest, NextResponse } from 'next/server'

const BBOX = '-80.9,26.3,-80.0,26.97'

function directZipMatch(q: string) {
  return q.trim().match(/^(\d{5})(?:-\d{4})?$/)
}

function mapboxFeatureToAddressSuggestion(f: any) {
  const context = f.context || []
  const locality = context.find((c: any) => c.id?.startsWith('locality'))?.text || ''
  const place = context.find((c: any) => c.id?.startsWith('place'))?.text || ''
  const postcodeCtx = context.find(
    (c: any) => typeof c.id === 'string' && c.id.startsWith('postcode'),
  )
  const postcodeMatch = (postcodeCtx?.text || '').trim().match(/\b(\d{5})\b/)
  const postcode = postcodeMatch ? postcodeMatch[1] : ''
  const [lng, lat] = Array.isArray(f.center) ? f.center : [0, 0]
  return {
    label: f.place_name as string,
    address: f.place_name as string,
    city: locality || place,
    postcode,
    lat,
    lng,
    type: 'address' as const,
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()

  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] })
  }

  const zipMatch = directZipMatch(q)
  if (zipMatch) {
    const zip = zipMatch[1]
    return NextResponse.json({
      suggestions: [
        {
          type: 'zip' as const,
          label: `Associations in ZIP ${zip}`,
          place_name: `ZIP ${zip}`,
          postcode: zip,
        },
      ],
      postcode: zip,
    })
  }

  if (/^\d/.test(q)) {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) {
      return NextResponse.json({ suggestions: [] })
    }

    const mapboxUrl =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
      `?country=US` +
      `&bbox=${BBOX}` +
      `&types=address` +
      `&limit=6` +
      `&access_token=${encodeURIComponent(token)}`

    try {
      const res = await fetch(mapboxUrl)
      if (!res.ok) {
        return NextResponse.json({ suggestions: [] })
      }
      const data = await res.json()
      const features = Array.isArray(data.features) ? data.features : []
      const suggestions = features.map(mapboxFeatureToAddressSuggestion)
      return NextResponse.json({ suggestions })
    } catch {
      return NextResponse.json({ suggestions: [] })
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ suggestions: [] })
  }

  const ilikePattern = encodeURIComponent(`*${q}*`)
  const res = await fetch(
    `${supabaseUrl}/rest/v1/communities?select=canonical_name,slug,city&canonical_name=ilike.${ilikePattern}&limit=6`,
    { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } },
  )
  const data = await res.json()
  const suggestions = (Array.isArray(data) ? data : []).map((c: any) => ({
    label: `${c.canonical_name} — ${c.city}`,
    slug: c.slug,
    type: 'community' as const,
  }))
  return NextResponse.json({ suggestions })
}

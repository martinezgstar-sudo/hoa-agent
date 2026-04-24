import { NextRequest, NextResponse } from 'next/server'

function normalizeZip5(text: string) {
  const m = text.trim().match(/\b(\d{5})\b/)
  return m ? m[1] : ''
}

function isLikelyStreetAddress(input: string) {
  const q = input.trim()
  if (/^\d{5}(-\d{4})?$/.test(q)) return false
  return /\d/.test(q) && /[a-zA-Z]/.test(q)
}

function mapboxFeatureToSuggestion(f: any) {
  const context = f.context || []
  const postcodeCtx = context.find(
    (c: any) => typeof c.id === 'string' && c.id.startsWith('postcode'),
  )
  const postcode = normalizeZip5(postcodeCtx?.text || '') || normalizeZip5(f.properties?.address || '')
  return {
    type: 'address' as const,
    label: f.place_name as string,
    place_name: f.place_name as string,
    postcode,
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()

  if (q === 'debug') {
    return NextResponse.json({
      hasMapboxToken: !!process.env.MAPBOX_TOKEN,
      hasNextPublicToken: !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
      tokenPrefix: (process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || 'none').substring(0, 15),
    })
  }

  if (q.length < 2) {
    return NextResponse.json({ suggestions: [] })
  }

  // Direct 5-digit (or ZIP+4) — skip geocoding; client redirects to /search?zip=
  const directZip = q.trim().match(/^(\d{5})(?:-\d{4})?$/)
  if (directZip) {
    const zip = directZip[1]
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

  if (isLikelyStreetAddress(q)) {
    if (q.length < 3) {
      return NextResponse.json({ suggestions: [] })
    }
    const token =
      process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || ''
    if (!token) {
      return NextResponse.json({ suggestions: [], error: 'no_token' })
    }

    const proximity = '-80.1918,26.7153'
    const mapboxUrl =
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
      `?access_token=${encodeURIComponent(token)}` +
      `&autocomplete=true` +
      `&country=US` +
      `&types=address` +
      `&proximity=${proximity}` +
      `&limit=5`

    try {
      const res = await fetch(mapboxUrl)
      if (!res.ok) {
        console.warn('[address-search] Mapbox HTTP', res.status, await res.text().catch(() => ''))
        return NextResponse.json({ suggestions: [] })
      }
      const data = await res.json()
      const features = Array.isArray(data.features) ? data.features : []
      const suggestions = features.map(mapboxFeatureToSuggestion)
      console.log('[address-search] Mapbox address suggestions', q, suggestions.length)
      return NextResponse.json({ suggestions })
    } catch (e) {
      console.warn('[address-search] Mapbox fetch error', e)
      return NextResponse.json({ suggestions: [] })
    }
  }

  // Community name search
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

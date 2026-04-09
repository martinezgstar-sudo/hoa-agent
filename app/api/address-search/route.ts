import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''

  if (q.length < 2) return NextResponse.json({ suggestions: [] })

  const isAddress = /^\d/.test(q)

  if (isAddress) {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    // Bounding box for Palm Beach County
    const bbox = '-80.9,26.3,-80.0,26.97'
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?country=US&bbox=${bbox}&types=address&limit=6&access_token=${token}`

    try {
      const res = await fetch(url)
      const data = await res.json()
      const suggestions = (data.features || []).map((f: any) => {
        const [lng, lat] = f.center
        const context = f.context || []
        const neighborhood = context.find((c: any) => c.id.startsWith('neighborhood'))?.text || ''
        const locality = context.find((c: any) => c.id.startsWith('locality'))?.text || ''
        const place = context.find((c: any) => c.id.startsWith('place'))?.text || ''
        const postcode = context.find((c: any) => c.id.startsWith('postcode'))?.text || ''
        return {
          label: f.place_name,
          address: f.place_name,
          streetName: f.text,
          neighborhood,
          locality,
          city: locality || place,
          postcode,
          lat,
          lng,
          type: 'address'
        }
      })
      return NextResponse.json({ suggestions })
    } catch {
      return NextResponse.json({ suggestions: [] })
    }
  }

  // Community name search
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const res = await fetch(
    `${supabaseUrl}/rest/v1/communities?select=canonical_name,slug,city&canonical_name=ilike.*${q}*&limit=6`,
    { headers: { apikey: supabaseKey!, Authorization: `Bearer ${supabaseKey}` } }
  )
  const data = await res.json()
  const suggestions = (data || []).map((c: any) => ({
    label: `${c.canonical_name} — ${c.city}`,
    slug: c.slug,
    type: 'community'
  }))
  return NextResponse.json({ suggestions })
}

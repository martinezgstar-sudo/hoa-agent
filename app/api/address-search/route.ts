import { NextRequest, NextResponse } from 'next/server'

function normalizeZip(input: string) {
  const match = input.trim().match(/\b(\d{5})(?:-\d{4})?\b/)
  return match ? match[1] : ''
}

function isLikelyAddress(input: string) {
  const q = input.trim()
  if (normalizeZip(q)) return true
  return /\d/.test(q) && /[a-zA-Z]/.test(q)
}

async function fetchCommunitiesByZip(zip: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.log('[address-search] Missing Supabase env vars')
    return []
  }

  const query = `${supabaseUrl}/rest/v1/communities?select=canonical_name,slug,city,zip_code,unit_count&zip_code=eq.${encodeURIComponent(zip)}&order=unit_count.desc.nullslast&limit=10`
  const commRes = await fetch(query, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  })

  if (!commRes.ok) {
    console.log('[address-search] Supabase query failed', commRes.status, zip)
    return []
  }

  const commData = await commRes.json()
  const suggestions = (Array.isArray(commData) ? commData : []).map((c: any) => ({
    label: `${c.canonical_name} — ${c.city}`,
    slug: c.slug,
    zip_code: c.zip_code,
    unit_count: c.unit_count || null,
    type: 'community',
  }))
  console.log('[address-search] communities for zip', zip, suggestions.length)
  return suggestions
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') || '').trim()

  console.log('[address-search] query received', q)
  if (q.length < 3) return NextResponse.json({ suggestions: [] })

  const zip = normalizeZip(q)
  if (zip) {
    console.log('[address-search] direct ZIP path', zip)
    const suggestions = await fetchCommunitiesByZip(zip)
    return NextResponse.json({ suggestions, postcode: zip })
  }

  const looksAddressLike = isLikelyAddress(q)
  console.log('[address-search] looksAddressLike', looksAddressLike)
  if (looksAddressLike) {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5&countrycodes=us`

    try {
      console.log('[address-search] geocoding with Nominatim')
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'hoa-agent/1.0 (address search)',
          Accept: 'application/json',
        },
      })
      if (!res.ok) {
        console.log('[address-search] Nominatim request failed', res.status)
        return NextResponse.json({ suggestions: [] })
      }
      const data = await res.json()
      const entries = Array.isArray(data) ? data : []
      console.log('[address-search] Nominatim results', entries.length)
      const topPostcode = normalizeZip(entries.find((e: any) => e?.address?.postcode)?.address?.postcode || '')
      if (!topPostcode) return NextResponse.json({ suggestions: [] })
      const suggestions = await fetchCommunitiesByZip(topPostcode)
      return NextResponse.json({ suggestions, postcode: topPostcode })
    } catch (err) {
      console.log('[address-search] address path error', err)
      return NextResponse.json({ suggestions: [] })
    }
  }

  // Community name search
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.log('[address-search] Missing Supabase env vars for name search')
    return NextResponse.json({ suggestions: [] })
  }
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

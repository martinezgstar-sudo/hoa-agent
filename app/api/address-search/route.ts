import { NextRequest, NextResponse } from 'next/server'

function directZipMatch(q: string) {
  return q.trim().match(/^(\d{5})(?:-\d{4})?$/)
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

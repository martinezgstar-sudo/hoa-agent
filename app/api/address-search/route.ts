import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') || ''

  if (q.length < 2) return NextResponse.json({ suggestions: [] })

  const isAddress = /^\d/.test(q)

  if (isAddress) {
    const parts = q.trim().split(' ')
    const streetNo = parts[0]
    // Strip city/state/zip — take only words before city indicators
    const rawStreet = parts.slice(1).join(' ')
    // Remove anything after FL, Florida, or a zip code
    const streetClean = rawStreet
      .replace(/\s+(west palm beach|boynton beach|boca raton|delray beach|lake worth|palm beach gardens|wellington|jupiter|greenacres|royal palm beach|riviera beach|north palm beach|palm springs|belle glade|lantana|hypoluxo|manalapan|ocean ridge|briny breezes|south palm beach|tequesta|juno ach|palm beach|unincorporated).*$/i, '')
      .replace(/\s+fl\s+\d{5}.*/i, '')
      .replace(/\s+florida.*/i, '')
      .replace(/\s+\d{5}$/, '')
      .trim()
    const streetName = streetClean || rawStreet.split(' ').slice(0, 2).join(' ')
    if (!streetName) return NextResponse.json({ suggestions: [] })

    const where = `STREET_NO = '${streetNo}' AND STREET_NAME LIKE '%${streetName}%'`
    const url = `https://maps.co.palm-beach.fl.us/arcgis/rest/services/OpenData/open_data_v2/FeatureServer/0/query?where=${encodeURIComponent(where)}&outFields=PCN,STREET_NO,STREET_NAME,STREET_SUFFIX,CITY,ZIP_CODE&resultRecordCount=8&f=json`

    try {
      const res = await fetch(url)
      const data = await res.json()
      const suggestions = (data.features || []).map((f: any) => {
        const a = f.attributes
        const label = `${a.STREET_NO} ${a.STREET_NAME} ${a.STREET_SUFFIX || ''}, ${a.CITY}, FL ${a.ZIP_CODE}`.trim()
        return { label, pcn: a.PCN, streetName: a.STREET_NAME, city: a.CITY, type: 'address' }
      })
      return NextResponse.json({ suggestions })
    } catch {
      return NextResponse.json({ suggestions: [] })
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const res = await fetch(
    `${supabaseUrl}/rest/v1/communities?select=canonical_name,slug,city&status=eq.published&canonical_name=ilike.*${q}*&limit=6`,
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

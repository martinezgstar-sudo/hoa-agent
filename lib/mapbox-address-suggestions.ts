/**
 * Client-side Mapbox Geocoding (browser only — URL-restricted tokens).
 */
const MAPBOX_BBOX = '-80.9,26.3,-80.0,26.97'

export type MapboxAddressSuggestion = {
  label: string
  address: string
  city: string
  postcode: string
  lat: number
  lng: number
  type: 'address'
}

function featureToSuggestion(f: any): MapboxAddressSuggestion {
  const context = f.context || []
  const locality = context.find((c) => c.id?.startsWith('locality'))?.text || ''
  const place = context.find((c) => c.id?.startsWith('place'))?.text || ''
  const postcodeCtx = context.find(
    (c) => typeof c.id === 'string' && c.id.startsWith('postcode'),
  )
  const postcodeMatch = (postcodeCtx?.text || '').trim().match(/\b(\d{5})\b/)
  const postcode = postcodeMatch ? postcodeMatch[1] : ''
  const [lng, lat] = Array.isArray(f.center) ? f.center : [0, 0]
  return {
    label: f.place_name || '',
    address: f.place_name || '',
    city: locality || place,
    postcode,
    lat,
    lng,
    type: 'address',
  }
}

export async function fetchMapboxAddressSuggestions(query: string): Promise<MapboxAddressSuggestion[]> {
  const q = query.trim()
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token || q.length < 2) return []

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
    `?country=US` +
    `&bbox=${MAPBOX_BBOX}` +
    `&types=address` +
    `&limit=6` +
    `&access_token=${encodeURIComponent(token)}`

  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = (await res.json()) as { features?: unknown[] }
    const features = Array.isArray(data.features) ? data.features : []
    return features.map((f) => featureToSuggestion(f))
  } catch {
    return []
  }
}

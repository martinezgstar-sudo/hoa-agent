// Palm Beach County matching helpers.

export const PBC_CITIES = new Set([
  'west palm beach', 'palm beach gardens', 'jupiter', 'juno beach', 'boca raton',
  'delray beach', 'boynton beach', 'lake worth', 'lake worth beach', 'wellington',
  'royal palm beach', 'riviera beach', 'palm beach', 'north palm beach',
  'lantana', 'greenacres', 'palm springs', 'tequesta', 'loxahatchee',
  'the acreage', 'jupiter farms', 'hobe sound', 'manalapan', 'gulf stream',
  'highland beach', 'ocean ridge', 'south palm beach', 'atlantis', 'haverhill',
  'pahokee', 'belle glade', 'south bay', 'westlake', 'palm beach shores',
]);

// Approximate Palm Beach County bounding box.
const PBC_BBOX = { minLat: 26.30, maxLat: 26.98, minLng: -80.92, maxLng: -80.03 };

export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .toLowerCase()
    .replace(/\b(hoa|homeowners?|home owners?|association|assn|condo(minium)?|coa|poa|inc|llc|ltd|corp)\b/g, '')
    .replace(/\bphase\s+\w+\b/g, '')
    .replace(/\bprcl\b/g, 'parcel')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isInPalmBeachCounty(lat?: number | null, lng?: number | null): boolean {
  if (lat == null || lng == null) return false;
  return lat >= PBC_BBOX.minLat && lat <= PBC_BBOX.maxLat &&
         lng >= PBC_BBOX.minLng && lng <= PBC_BBOX.maxLng;
}

export function isPbcCity(city: string | null | undefined): boolean {
  if (!city) return false;
  return PBC_CITIES.has(city.toLowerCase().trim());
}

// Token overlap similarity, 0..1.
export function scoreNameSimilarity(a: string, b: string): number {
  const at = new Set(normalizeName(a).split(' ').filter(Boolean));
  const bt = new Set(normalizeName(b).split(' ').filter(Boolean));
  if (at.size === 0 || bt.size === 0) return 0;
  let shared = 0;
  for (const t of at) if (bt.has(t)) shared++;
  return shared / Math.max(at.size, bt.size);
}

import { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'

// City slugs that have a dedicated rich landing page in app/city/[slug]/page.tsx
const CITY_SLUGS = [
  'west-palm-beach', 'boca-raton', 'jupiter', 'palm-beach-gardens',
  'lake-worth', 'delray-beach', 'boynton-beach', 'royal-palm-beach',
  'wellington',
]

// Legacy/alternate city pages served by app/cities/[city]/page.tsx (kept for back-compat)
const LEGACY_CITY_SLUGS = [
  'west-palm-beach', 'boca-raton', 'boynton-beach', 'delray-beach', 'jupiter',
  'palm-beach-gardens', 'wellington', 'lake-worth', 'riviera-beach', 'north-palm-beach',
  'royal-palm-beach', 'greenacres', 'tequesta', 'lantana', 'lake-park', 'palm-springs',
  'belle-glade', 'pahokee', 'south-bay', 'loxahatchee', 'acreage', 'westlake',
]

const FILTERS = [
  'pet-friendly', 'no-short-term-rentals', 'short-term-rental-allowed',
  'low-hoa-fees', 'condos', 'single-family', 'no-rental-approval', 'master-hoa',
]

// Filter sub-pages for /city/[slug]/[filter] (10 filters × 9 city slugs = 90)
const CITY_FILTERS = [
  'condos', 'single-family', 'townhomes', 'pet-friendly',
  'affordable', 'high-fee', 'with-litigation', 'good-standing',
  '55-plus', 'gated',
]

const GUIDE_SLUGS = [
  'how-to-read-hoa-documents',
  'what-is-a-special-assessment',
  'florida-hoa-vs-condo-association',
  'how-to-evaluate-hoa-before-buying',
  'palm-beach-county-hoa-fees',
]

const COUNTIES = ['palm-beach-county']

const SITE = 'https://www.hoa-agent.com'

/**
 * Fetch ALL published community slugs. Supabase JS defaults to a 1000-row
 * limit, so we paginate using .range() until exhausted.
 */
async function fetchAllCommunitySlugs(): Promise<Array<{ slug: string; lm: string }>> {
  const all: Array<{ slug: string; lm: string }> = []
  const PAGE = 1000
  let offset = 0
  for (let i = 0; i < 25; i++) {
    const { data, error } = await supabase
      .from('communities')
      .select('slug, data_freshness_date, updated_at')
      .eq('status', 'published')
      .order('canonical_name', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error || !data || data.length === 0) break
    for (const row of data) {
      if (!row.slug) continue
      all.push({
        slug: row.slug,
        lm: row.data_freshness_date || row.updated_at || new Date().toISOString(),
      })
    }
    if (data.length < PAGE) break
    offset += PAGE
  }
  return all
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString()
  const communities = await fetchAllCommunitySlugs()

  const communityUrls = communities.map((c) => ({
    url: `${SITE}/community/${c.slug}`,
    lastModified: c.lm,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  // /city/[slug] — primary city pages with hero + stats + sort
  const cityUrls = CITY_SLUGS.map((slug) => ({
    url: `${SITE}/city/${slug}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.85,
  }))

  // Legacy /cities/[slug] + /best-hoa/[city] kept for back-compat
  const legacyCityUrls = LEGACY_CITY_SLUGS.flatMap((city) => [
    { url: `${SITE}/cities/${city}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.6 },
    { url: `${SITE}/best-hoa/${city}`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.7 },
  ])

  const filterUrls = COUNTIES.flatMap((county) =>
    FILTERS.map((filter) => ({
      url: `${SITE}/florida/${county}/${filter}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.85,
    })),
  )

  // City × filter sub-pages
  const cityFilterUrls = CITY_SLUGS.flatMap((slug) =>
    CITY_FILTERS.map((f) => ({
      url: `${SITE}/city/${slug}/${f}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  )

  // Guides + content hubs
  const guideUrls = GUIDE_SLUGS.map((s) => ({
    url: `${SITE}/guides/${s}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }))

  // Management directory (top-level only — per-company pages added by
  // a separate fetch below)
  const managementIndexUrls = [
    { url: `${SITE}/management`, lastModified: now, changeFrequency: 'weekly' as const, priority: 0.85 },
  ]

  // Per-management-company sitemap entries — fetch all distinct management_company
  // values across published communities, slugify them.
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
  const mgmtSlugs = new Set<string>()
  let mgmtOffset = 0
  for (let i = 0; i < 5; i++) {
    const { data } = await supabase
      .from('communities')
      .select('management_company')
      .eq('status', 'published')
      .not('management_company', 'is', null)
      .range(mgmtOffset, mgmtOffset + 999)
    if (!data || data.length === 0) break
    for (const r of data) {
      const s = slugify((r.management_company ?? '') as string)
      if (s) mgmtSlugs.add(s)
    }
    if (data.length < 1000) break
    mgmtOffset += 1000
  }
  const managementUrls = Array.from(mgmtSlugs).map((s) => ({
    url: `${SITE}/management/${s}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.75,
  }))

  return [
    { url: SITE,                                lastModified: now, changeFrequency: 'daily' as const,   priority: 1.0 },
    { url: `${SITE}/search`,                    lastModified: now, changeFrequency: 'daily' as const,   priority: 0.9 },
    { url: `${SITE}/city`,                      lastModified: now, changeFrequency: 'weekly' as const,  priority: 0.9 },
    { url: `${SITE}/reports`,                   lastModified: now, changeFrequency: 'monthly' as const, priority: 0.7 },
    { url: `${SITE}/reports/hoa-fee-report-2026`, lastModified: now, changeFrequency: 'monthly' as const, priority: 0.7 },
    { url: `${SITE}/about`,                     lastModified: now, changeFrequency: 'monthly' as const, priority: 0.6 },
    { url: `${SITE}/about/team`,                lastModified: now, changeFrequency: 'monthly' as const, priority: 0.5 },
    { url: `${SITE}/for-agents`,                lastModified: now, changeFrequency: 'monthly' as const, priority: 0.7 },
    { url: `${SITE}/pricing`,                   lastModified: now, changeFrequency: 'monthly' as const, priority: 0.8 },
    { url: `${SITE}/press`,                     lastModified: now, changeFrequency: 'monthly' as const, priority: 0.4 },
    { url: `${SITE}/advertise`,                 lastModified: now, changeFrequency: 'monthly' as const, priority: 0.7 },
    { url: `${SITE}/terms`,                     lastModified: now, changeFrequency: 'monthly' as const, priority: 0.3 },
    { url: `${SITE}/privacy`,                   lastModified: now, changeFrequency: 'monthly' as const, priority: 0.3 },
    { url: `${SITE}/guides`,                    lastModified: now, changeFrequency: 'weekly' as const,  priority: 0.85 },
    { url: `${SITE}/florida-hoa-law`,           lastModified: now, changeFrequency: 'monthly' as const, priority: 0.8 },
    { url: `${SITE}/methodology`,               lastModified: now, changeFrequency: 'monthly' as const, priority: 0.6 },
    { url: `${SITE}/editorial-standards`,       lastModified: now, changeFrequency: 'monthly' as const, priority: 0.5 },
    { url: `${SITE}/corrections`,               lastModified: now, changeFrequency: 'monthly' as const, priority: 0.4 },
    ...guideUrls,
    ...managementIndexUrls,
    ...managementUrls,
    ...cityUrls,
    ...cityFilterUrls,
    ...legacyCityUrls,
    ...filterUrls,
    ...communityUrls,
  ]
}

import { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'

const CITIES = [
  'west-palm-beach','boca-raton','boynton-beach','delray-beach','jupiter',
  'palm-beach-gardens','wellington','lake-worth','riviera-beach','north-palm-beach',
  'royal-palm-beach','greenacres','tequesta','lantana','lake-park','palm-springs',
  'belle-glade','pahokee','south-bay','loxahatchee','acreage','westlake'
]

const FILTERS = [
  'pet-friendly','no-short-term-rentals','short-term-rental-allowed',
  'low-hoa-fees','condos','single-family','no-rental-approval','master-hoa'
]

const COUNTIES = ['palm-beach-county']

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { data: communities } = await supabase
    .from('communities')
    .select('slug, data_freshness_date')
    .eq('status', 'published')

  const communityUrls = (communities || []).map((c) => ({
    url: `https://hoa-agent.com/community/${c.slug}`,
    lastModified: c.data_freshness_date || new Date().toISOString(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  const cityUrls = CITIES.flatMap(city => [
    { url: `https://hoa-agent.com/cities/${city}`, lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.85 },
    { url: `https://hoa-agent.com/best-hoa/${city}`, lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.85 },
  ])

  const filterUrls = COUNTIES.flatMap(county =>
    FILTERS.map(filter => ({
      url: `https://hoa-agent.com/florida/${county}/${filter}`,
      lastModified: new Date().toISOString(),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    }))
  )

  return [
    { url: 'https://hoa-agent.com', lastModified: new Date().toISOString(), changeFrequency: 'daily' as const, priority: 1 },
    { url: 'https://hoa-agent.com/search', lastModified: new Date().toISOString(), changeFrequency: 'daily' as const, priority: 0.9 },
    { url: 'https://hoa-agent.com/reports', lastModified: new Date().toISOString(), changeFrequency: 'monthly' as const, priority: 0.7 },
    { url: 'https://hoa-agent.com/florida/palm-beach-county/pet-friendly', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.95 },
    { url: 'https://hoa-agent.com/florida/palm-beach-county/low-hoa-fees', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.95 },
    { url: 'https://hoa-agent.com/florida/palm-beach-county/condos', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.95 },
    { url: 'https://hoa-agent.com/florida/palm-beach-county/no-short-term-rentals', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.95 },
    { url: 'https://hoa-agent.com/terms', lastModified: new Date().toISOString(), changeFrequency: 'monthly' as const, priority: 0.3 },
    { url: 'https://hoa-agent.com/privacy', lastModified: new Date().toISOString(), changeFrequency: 'monthly' as const, priority: 0.3 },
    ...filterUrls,
    ...cityUrls,
    ...communityUrls,
  ]
}

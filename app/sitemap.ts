import { MetadataRoute } from 'next'
import { supabase } from '@/lib/supabase'

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

  return [
    { url: 'https://hoa-agent.com', lastModified: new Date().toISOString(), changeFrequency: 'daily', priority: 1 },
    { url: 'https://hoa-agent.com/search', lastModified: new Date().toISOString(), changeFrequency: 'daily', priority: 0.9 },
    { url: 'https://hoa-agent.com/terms', lastModified: new Date().toISOString(), changeFrequency: 'monthly', priority: 0.3 },
    { url: 'https://hoa-agent.com/privacy', lastModified: new Date().toISOString(), changeFrequency: 'monthly', priority: 0.3 },
    { url: 'https://hoa-agent.com/reports', lastModified: new Date().toISOString(), changeFrequency: 'monthly' as const, priority: 0.7 },
    { url: 'https://hoa-agent.com/cities/west-palm-beach', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.85 },
    { url: 'https://hoa-agent.com/cities/boca-raton', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.85 },
    { url: 'https://hoa-agent.com/cities/boynton-beach', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.85 },
    { url: 'https://hoa-agent.com/cities/delray-beach', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.85 },
    { url: 'https://hoa-agent.com/cities/jupiter', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.85 },
    { url: 'https://hoa-agent.com/cities/palm-beach-gardens', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.85 },
    { url: 'https://hoa-agent.com/cities/wellington', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.85 },
    { url: 'https://hoa-agent.com/cities/lake-worth', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.8 },
    { url: 'https://hoa-agent.com/cities/riviera-beach', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.8 },
    { url: 'https://hoa-agent.com/cities/north-palm-beach', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.8 },
    { url: 'https://hoa-agent.com/cities/royal-palm-beach', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.8 },
    { url: 'https://hoa-agent.com/cities/greenacres', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.8 },
    { url: 'https://hoa-agent.com/cities/tequesta', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.8 },
    { url: 'https://hoa-agent.com/cities/lantana', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.8 },
    { url: 'https://hoa-agent.com/cities/lake-park', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.8 },
    { url: 'https://hoa-agent.com/cities/palm-springs', lastModified: new Date().toISOString(), changeFrequency: 'weekly' as const, priority: 0.8 },
    ...communityUrls,
  ]
}

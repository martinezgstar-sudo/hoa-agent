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
    ...communityUrls,
  ]
}

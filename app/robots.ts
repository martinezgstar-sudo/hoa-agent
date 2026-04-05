import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/pitch', '/advertise'],
    },
    sitemap: 'https://hoa-agent.com/sitemap.xml',
  }
}

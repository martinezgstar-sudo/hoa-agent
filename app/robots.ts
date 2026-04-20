import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/pitch', '/api/'],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: ['/admin/', '/pitch', '/api/'],
      },
    ],
    sitemap: 'https://hoa-agent.com/sitemap.xml',
    host: 'https://hoa-agent.com',
  }
}

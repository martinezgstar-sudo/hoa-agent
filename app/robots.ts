import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/pitch', '/api/', '/advertise/portal/', '/api/advertise/'],
      },
      {
        userAgent: 'Googlebot',
        allow: '/',
        disallow: ['/admin/', '/pitch', '/api/', '/advertise/portal/', '/api/advertise/'],
      },
      // Block aggressive bots from /claim/* (causing 500s on the form route)
      { userAgent: 'MJ12bot',    disallow: ['/claim/', '/api/claim/'] },
      { userAgent: 'GPTBot',     disallow: ['/claim/', '/api/claim/'] },
      { userAgent: 'AhrefsBot',  disallow: ['/claim/', '/api/claim/'] },
      { userAgent: 'SemrushBot', disallow: ['/claim/', '/api/claim/'] },
      { userAgent: 'DotBot',     disallow: ['/claim/', '/api/claim/'] },
      { userAgent: 'PetalBot',   disallow: ['/claim/', '/api/claim/'] },
      { userAgent: 'Bytespider', disallow: ['/claim/', '/api/claim/'] },
      { userAgent: 'CCBot',      disallow: ['/claim/', '/api/claim/'] },
      { userAgent: 'ClaudeBot',  disallow: ['/claim/', '/api/claim/'] },
    ],
    sitemap: 'https://hoa-agent.com/sitemap.xml',
    host: 'https://hoa-agent.com',
  }
}

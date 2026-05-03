import { MetadataRoute } from 'next'

/**
 * Robots policy.
 *
 * Default: block /admin/, /api/, and /advertise/portal/ for all crawlers.
 *
 * AI crawlers are explicitly allow-listed. HOA Agent's distribution
 * strategy assumes being cited by ChatGPT, Claude, Perplexity, Gemini,
 * Copilot etc. is more valuable than blocking them. Major search bots
 * (Googlebot, Bingbot) are also explicitly allow-listed for clarity.
 *
 * The aggressive bots that historically caused 500s on /claim/ are still
 * blocked from those routes specifically.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/advertise/portal/', '/pitch'],
      },

      // ── Allow-listed AI crawlers ──────────────────────────────────────
      { userAgent: 'GPTBot',           allow: '/' },
      { userAgent: 'ChatGPT-User',     allow: '/' },
      { userAgent: 'OAI-SearchBot',    allow: '/' },
      { userAgent: 'ClaudeBot',        allow: '/' },
      { userAgent: 'Claude-Web',       allow: '/' },
      { userAgent: 'PerplexityBot',    allow: '/' },
      { userAgent: 'Perplexity-User',  allow: '/' },
      { userAgent: 'Google-Extended',  allow: '/' },
      { userAgent: 'Applebot-Extended',allow: '/' },
      { userAgent: 'CCBot',            allow: '/' },

      // ── Allow-listed search bots ──────────────────────────────────────
      { userAgent: 'Googlebot',        allow: '/' },
      { userAgent: 'Bingbot',          allow: '/' },

      // ── Bots that abuse /claim/* — keep them blocked from claim only ──
      { userAgent: 'MJ12bot',     disallow: ['/claim/', '/api/claim/'] },
      { userAgent: 'AhrefsBot',   disallow: ['/claim/', '/api/claim/'] },
      { userAgent: 'SemrushBot',  disallow: ['/claim/', '/api/claim/'] },
      { userAgent: 'DotBot',      disallow: ['/claim/', '/api/claim/'] },
      { userAgent: 'PetalBot',    disallow: ['/claim/', '/api/claim/'] },
      { userAgent: 'Bytespider',  disallow: ['/claim/', '/api/claim/'] },
    ],
    sitemap: 'https://www.hoa-agent.com/sitemap.xml',
    host: 'https://www.hoa-agent.com',
  }
}

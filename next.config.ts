import type { NextConfig } from "next"

// CSP is deployed in report-only mode first (owner directive 2026-08-05):
// violations POST to /api/csp-report, get logged to public.csp_reports for
// review, and we tighten the policy before flipping to enforcement. Known
// legitimate third parties: Mapbox tiles/API, Supabase, Vercel analytics &
// live-preview. 'unsafe-inline' on script-src stays until we identify every
// inline block (Next.js emits some for hydration and preload hints); reports
// will tell us which nonces or hashes to substitute in.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.vercel-scripts.com https://vercel.live https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline' https://api.mapbox.com",
  "img-src 'self' data: blob: https://*.mapbox.com https://api.mapbox.com",
  "font-src 'self' data:",
  "connect-src 'self' https://api.mapbox.com https://events.mapbox.com https://*.mapbox.com https://*.supabase.co https://vitals.vercel-insights.com https://vercel.live wss://vercel.live",
  "worker-src 'self' blob:",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "report-uri /api/csp-report",
].join("; ")

const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security",    value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options",       value: "nosniff" },
  { key: "X-Frame-Options",              value: "SAMEORIGIN" },
  { key: "Referrer-Policy",              value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",           value: "geolocation=(), camera=(), microphone=(), payment=(), interest-cohort=()" },
  { key: "X-DNS-Prefetch-Control",       value: "on" },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
]

const nextConfig: NextConfig = {
  // Force www canonical — 301 any non-www traffic to https://www.hoa-agent.com.
  // Vercel serves both apex and www; SEO benefits from a single canonical host.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "hoa-agent.com" }],
        destination: "https://www.hoa-agent.com/:path*",
        permanent: true,
      },
    ]
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ]
  },
}

export default nextConfig

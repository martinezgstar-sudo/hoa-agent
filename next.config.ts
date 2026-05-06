import type { NextConfig } from "next"

const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options",    value: "nosniff" },
  { key: "X-Frame-Options",           value: "SAMEORIGIN" },
  { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",        value: "geolocation=(), camera=(), microphone=(), payment=(), interest-cohort=()" },
  { key: "X-DNS-Prefetch-Control",    value: "on" },
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

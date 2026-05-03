import type { NextConfig } from "next"

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
}

export default nextConfig

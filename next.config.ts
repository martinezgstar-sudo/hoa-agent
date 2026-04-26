import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/:path*',
        destination: 'https://www.hoa-agent.com/:path*',
        permanent: true,
        has: [{ type: 'host', value: 'hoa-agent.com' }],
      },
    ]
  },
};

export default nextConfig;

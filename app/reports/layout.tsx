import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Reports | HOA Agent',
  description: 'HOA intelligence reports for Palm Beach County. Fee trends, litigation activity, and community data for homebuyers and agents.',
  openGraph: {
    title: 'Reports | HOA Agent',
    description: 'HOA fee trends, litigation data, and community intelligence reports for Palm Beach County.',
    url: 'https://hoa-agent.com/reports',
    siteName: 'HOA Agent',
    type: 'website',
    images: [{ url: 'https://hoa-agent.com/logo.png', width: 400, height: 400, alt: 'HOA Agent' }],
  },
  twitter: {
    card: 'summary',
    title: 'Reports | HOA Agent',
    description: 'HOA intelligence reports for Palm Beach County.',
  },
}

export default function ReportsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

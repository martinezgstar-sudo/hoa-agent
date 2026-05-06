import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Advertiser Signup | HOA Agent',
  description: 'Create your advertiser account on HOA Agent. Reach Palm Beach County HOA residents with targeted, opt-in placements.',
  alternates: { canonical: 'https://www.hoa-agent.com/advertise/signup' },
  openGraph: {
    title: 'Advertiser Signup | HOA Agent',
    description: 'Reach Palm Beach County HOA residents with targeted, opt-in placements.',
    url: 'https://www.hoa-agent.com/advertise/signup',
    siteName: 'HOA Agent',
    type: 'website',
    images: [{ url: 'https://www.hoa-agent.com/logo.png', width: 400, height: 400, alt: 'HOA Agent' }],
  },
  twitter: { card: 'summary', title: 'Advertiser Signup | HOA Agent' },
}

export default function AdvertiseSignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

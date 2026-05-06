import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Compare HOA Communities — Side by Side | HOA Agent',
  description: 'Compare up to 4 Palm Beach County HOA and condo communities side by side. Fees, management, restrictions, litigation history, reviews.',
  alternates: { canonical: 'https://www.hoa-agent.com/compare' },
  openGraph: {
    title: 'Compare HOA Communities — Side by Side',
    description: 'Compare up to 4 Palm Beach County HOA communities. Fees, restrictions, litigation, reviews.',
    url: 'https://www.hoa-agent.com/compare',
    siteName: 'HOA Agent',
    type: 'website',
    images: [{ url: 'https://www.hoa-agent.com/logo.png', width: 400, height: 400, alt: 'HOA Agent' }],
  },
  twitter: { card: 'summary', title: 'Compare HOA Communities | HOA Agent' },
}

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

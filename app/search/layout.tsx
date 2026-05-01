import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Search HOA Communities | Palm Beach County | HOA Agent',
  description: 'Search 7,000+ HOA and condo communities in Palm Beach County, FL. Filter by city, fee range, property type. Free.',
  openGraph: {
    title: 'Search HOA Communities | Palm Beach County | HOA Agent',
    description: 'Search 7,000+ Palm Beach County HOA communities. Find fees, restrictions, management company and reviews.',
    url: 'https://hoa-agent.com/search',
    siteName: 'HOA Agent',
    type: 'website',
    images: [{ url: 'https://hoa-agent.com/logo.png', width: 400, height: 400, alt: 'HOA Agent' }],
  },
  twitter: {
    card: 'summary',
    title: 'Search HOA Communities | HOA Agent',
    description: 'Search Palm Beach County HOA communities — fees, restrictions, reviews.',
  },
}

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

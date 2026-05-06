import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Search HOA Communities | Palm Beach County | HOA Agent',
  description: 'Search 8,000+ HOA and condo communities in Palm Beach County, FL. Filter by city, fee range, property type. Free.',
  alternates: { canonical: 'https://www.hoa-agent.com/search' },
  openGraph: {
    title: 'Search HOA Communities | Palm Beach County | HOA Agent',
    description: 'Search 8,000+ Palm Beach County HOA communities. Find fees, restrictions, management company and reviews.',
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

const searchSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "HOA Agent",
  url: "https://www.hoa-agent.com",
  potentialAction: {
    "@type": "SearchAction",
    target: { "@type": "EntryPoint", urlTemplate: "https://www.hoa-agent.com/search?q={search_term_string}" },
    "query-input": "required name=search_term_string",
  },
}

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "HOA Agent", item: "https://www.hoa-agent.com" },
    { "@type": "ListItem", position: 2, name: "Search", item: "https://www.hoa-agent.com/search" },
  ],
}

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(searchSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      {children}
    </>
  )
}

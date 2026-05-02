import NavBar from '@/app/components/NavBar'
import Link from 'next/link'
import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'HOA Communities by City | Palm Beach County | HOA Agent',
  description:
    'Browse HOA and condo communities by city in Palm Beach County, FL. West Palm Beach, Boca Raton, Jupiter, Palm Beach Gardens, Lake Worth, Delray Beach, Boynton Beach and more.',
  openGraph: {
    title: 'HOA Communities by City | Palm Beach County | HOA Agent',
    description: 'Find HOA communities in every Palm Beach County city. Fees, restrictions, reviews and more.',
    url: 'https://hoa-agent.com/city',
    siteName: 'HOA Agent',
    type: 'website',
    images: [{ url: 'https://hoa-agent.com/logo.png', width: 400, height: 400, alt: 'HOA Agent' }],
  },
  twitter: {
    card: 'summary',
    title: 'HOA Communities by City | Palm Beach County | HOA Agent',
    description: 'Browse Palm Beach County HOA communities by city.',
  },
}

const CITIES = [
  { slug: 'west-palm-beach', name: 'West Palm Beach', tagline: 'Waterfront condos, gated estates, urban townhomes' },
  { slug: 'boca-raton', name: 'Boca Raton', tagline: 'Country clubs, golf enclaves, luxury high-rises' },
  { slug: 'jupiter', name: 'Jupiter', tagline: 'Coastal condos, equestrian communities, beach access' },
  { slug: 'palm-beach-gardens', name: 'Palm Beach Gardens', tagline: 'Master-planned, golf communities, new construction' },
  { slug: 'lake-worth', name: 'Lake Worth', tagline: 'Affordable condos, older buildings, beach proximity' },
  { slug: 'delray-beach', name: 'Delray Beach', tagline: '55+ active adult communities, coastal neighborhoods' },
  { slug: 'boynton-beach', name: 'Boynton Beach', tagline: 'Value-oriented 55+ communities, self-managed HOAs' },
  { slug: 'royal-palm-beach', name: 'Royal Palm Beach', tagline: 'Master-planned townhomes, family neighborhoods, central county' },
  { slug: 'wellington', name: 'Wellington', tagline: 'Equestrian estates, golf communities, family HOAs' },
]

async function getCityCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  await Promise.all(
    CITIES.map(async (c) => {
      const { count } = await supabase
        .from('communities')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'published')
        .ilike('city', c.name)
      counts[c.slug] = count ?? 0
    })
  )
  return counts
}

export default async function CityIndexPage() {
  const counts = await getCityCounts()
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f9f9f9', minHeight: '100vh' }}>
      <NavBar
        desktopLinks={[
          { href: '/search', label: 'Search' },
          { href: '/city', label: 'Cities' },
          { href: '/about', label: 'About' },
        ]}
        shareHref="/search"
        shareLabel="Find my HOA"
      />

      <div style={{ maxWidth: '780px', margin: '0 auto', padding: '40px 20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
          Palm Beach County
        </div>

        <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#1B2B6B', marginBottom: '12px', letterSpacing: '-0.02em' }}>
          Browse HOA Communities by City
        </h1>

        <p style={{ fontSize: '14px', color: '#555', lineHeight: 1.7, marginBottom: '36px', maxWidth: '600px' }}>
          Palm Beach County has over 7,000 HOA and condo communities spread across dozens of cities. Each city
          has its own mix of property types, fee ranges, and governance styles. Start with your target city to
          narrow your search.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
          {CITIES.map((city) => (
            <Link key={city.slug} href={'/city/' + city.slug} style={{ textDecoration: 'none' }}>
              <div style={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px', height: '100%', transition: 'border-color 0.15s' }}>
                <div style={{ fontSize: '16px', fontWeight: 600, color: '#1B2B6B', marginBottom: '6px' }}>{city.name}</div>
                <div style={{ fontSize: '12px', color: '#888' }}>{city.tagline}</div>
                <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#1D9E75', fontWeight: 500 }}>Browse communities →</span>
                  {counts[city.slug] > 0 && (
                    <span style={{ fontSize: '11px', color: '#888' }}>{counts[city.slug]} listed</span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e5e5', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: '#555', marginBottom: '12px' }}>
            Looking for a specific community? Use the full search across all cities.
          </div>
          <Link href="/search" style={{ fontSize: '13px', backgroundColor: '#1B2B6B', color: '#fff', padding: '8px 20px', borderRadius: '8px', textDecoration: 'none', display: 'inline-block' }}>
            Search all Palm Beach County communities
          </Link>
        </div>
      </div>
    </main>
  )
}

import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import NavBar from '@/app/components/NavBar'
import Link from 'next/link'
import type { Metadata } from 'next'

const CITIES: Record<string, { name: string; blurb: string }> = {
  'west-palm-beach': {
    name: 'West Palm Beach',
    blurb:
      'West Palm Beach is one of Palm Beach County\'s most dynamic cities, with a diverse mix of waterfront condominiums, gated single-family communities, and urban townhomes. HOA fees vary widely — from under $200/month in established neighborhoods to over $800/month in luxury high-rises along the Intracoastal. Many communities here have active boards, formal architectural review processes, and rental restrictions worth knowing before you sign.',
  },
  'boca-raton': {
    name: 'Boca Raton',
    blurb:
      'Boca Raton is home to some of the most prestigious HOA-governed communities in South Florida, including country club enclaves with six-figure initiation fees and meticulously maintained golf course estates. Expect strict covenant enforcement, detailed architectural guidelines, and monthly dues that often bundle amenities like tennis, pools, and private security. Buyers should review financials and reserve fund status carefully before committing.',
  },
  'jupiter': {
    name: 'Jupiter',
    blurb:
      'Jupiter offers a relaxed coastal lifestyle with HOA communities ranging from beachside condo complexes to equestrian estates further west. Many communities are smaller — under 200 units — giving homeowners more direct access to board decisions. Special assessments have become more common as communities built in the 1980s and 1990s tackle deferred maintenance and structural reserve requirements under newer Florida law.',
  },
  'palm-beach-gardens': {
    name: 'Palm Beach Gardens',
    blurb:
      'Palm Beach Gardens is known for master-planned communities with comprehensive amenities: golf, tennis, resort pools, and staffed entry gates. The city sits in a growth corridor and new construction communities are still forming their associations. HOA governance quality varies significantly — some communities have decades of stable board history, others are still working through developer-to-homeowner control transitions.',
  },
  'lake-worth': {
    name: 'Lake Worth',
    blurb:
      'Lake Worth Beach (formerly Lake Worth) features a mix of older condominium complexes, small HOA communities, and unincorporated neighborhoods. Fees tend to be lower here than in neighboring cities, but reserve funding can be thin in older buildings. Florida\'s Condo Safety laws passed after the Surfside collapse have triggered new inspection and reserve requirements affecting many buildings in this area.',
  },
  'delray-beach': {
    name: 'Delray Beach',
    blurb:
      'Delray Beach spans a wide spectrum — from active adult 55+ communities like Kings Point and Hunters Run to newer coastal developments commanding premium HOA fees. The active adult segment is particularly significant here; buyers should confirm age-restriction status and understand the amenity packages bundled into dues. Rental restrictions in age-restricted communities are often more stringent than the broader market.',
  },
  'boynton-beach': {
    name: 'Boynton Beach',
    blurb:
      'Boynton Beach is one of Palm Beach County\'s most affordable HOA markets, with a large inventory of 55+ communities originally built in the 1970s and 1980s. Many are self-managed, with all-volunteer boards and lower professional oversight. Buyers should pay close attention to reserve adequacy and deferred maintenance disclosures, particularly for older condo associations navigating the new Florida milestone inspection requirements.',
  },
}

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const city = CITIES[slug]
  if (!city) return { title: 'City Not Found — HOA Agent' }
  return {
    title: city.name + ' HOA Communities | HOA Agent',
    description:
      'Browse HOA and condo communities in ' +
      city.name +
      ', FL. Find fees, management company, restrictions, litigation history, and resident reviews. Free on HOA Agent.',
    openGraph: {
      title: city.name + ' HOA Communities | HOA Agent',
      description:
        'Browse HOA and condo communities in ' + city.name + ', Palm Beach County, FL.',
      url: 'https://hoa-agent.com/city/' + slug,
      siteName: 'HOA Agent',
      type: 'website',
      images: [{ url: 'https://hoa-agent.com/logo.png', width: 400, height: 400, alt: 'HOA Agent' }],
    },
    twitter: {
      card: 'summary',
      title: city.name + ' HOA Communities | HOA Agent',
      description: 'Browse HOA and condo communities in ' + city.name + ', FL.',
    },
  }
}

export async function generateStaticParams() {
  return Object.keys(CITIES).map((slug) => ({ slug }))
}

export default async function CityPage({ params }: Props) {
  const { slug } = await params
  const city = CITIES[slug]
  if (!city) notFound()

  // Try exact ilike first; if zero results (e.g. city stored with different
  // formatting), fall back to a wildcard match anchored to the city name.
  let { data: communities } = await supabase
    .from('communities')
    .select(
      'id, slug, canonical_name, city, property_type, monthly_fee_min, monthly_fee_max, monthly_fee_median, unit_count, management_company, review_avg, review_count, amenities, website_url'
    )
    .eq('status', 'published')
    .ilike('city', city.name)
    .order('canonical_name', { ascending: true })

  if (!communities || communities.length === 0) {
    const fallback = await supabase
      .from('communities')
      .select(
        'id, slug, canonical_name, city, property_type, monthly_fee_min, monthly_fee_max, monthly_fee_median, unit_count, management_company, review_avg, review_count, amenities, website_url'
      )
      .eq('status', 'published')
      .ilike('city', '%' + city.name + '%')
      .order('canonical_name', { ascending: true })
    communities = fallback.data ?? null
  }

  const list = communities || []

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
          <Link href="/city" style={{ color: '#1D9E75', textDecoration: 'none' }}>Cities</Link>
          {' › '}
          {city.name}
        </div>

        <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#1B2B6B', marginBottom: '12px', letterSpacing: '-0.02em' }}>
          HOA Communities in {city.name}
        </h1>

        <p style={{ fontSize: '14px', color: '#555', lineHeight: 1.7, marginBottom: '32px', maxWidth: '640px' }}>
          {city.blurb}
        </p>

        <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>
          {list.length} {list.length === 1 ? 'community' : 'communities'} found in {city.name}
        </div>

        {list.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e5e5', color: '#888' }}>
            No communities listed yet for {city.name}. <Link href="/search" style={{ color: '#1D9E75' }}>Try the full search.</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {list.map((c) => (
              <Link
                key={c.id}
                href={'/community/' + c.slug}
                style={{ textDecoration: 'none' }}
              >
                <div style={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a' }}>{c.canonical_name}</div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '3px' }}>
                      {[c.property_type, c.management_company].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {c.monthly_fee_min ? (
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#1B2B6B' }}>
                        {'$' + c.monthly_fee_min + (c.monthly_fee_max && c.monthly_fee_max !== c.monthly_fee_min ? '–$' + c.monthly_fee_max : '') + '/mo'}
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: '#bbb' }}>Fee unknown</div>
                    )}
                    {c.unit_count ? <div style={{ fontSize: '11px', color: '#aaa' }}>{c.unit_count} units</div> : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div style={{ marginTop: '40px', padding: '20px', backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e5e5e5', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: '#555', marginBottom: '12px' }}>Can't find your community? Try the full search.</div>
          <Link href={'/search?q=' + encodeURIComponent(city.name)} style={{ fontSize: '13px', backgroundColor: '#1B2B6B', color: '#fff', padding: '8px 20px', borderRadius: '8px', textDecoration: 'none', display: 'inline-block' }}>
            Search {city.name} communities
          </Link>
        </div>
      </div>
    </main>
  )
}

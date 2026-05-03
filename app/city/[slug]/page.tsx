import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import NavBar from '@/app/components/NavBar'
import Link from 'next/link'
import type { Metadata } from 'next'

export const revalidate = 3600 // refresh hero image + news once per hour

type WikiSummary = { thumbnail?: { source?: string }; description?: string; extract?: string }

async function getCityImage(cityName: string): Promise<{ url: string; attribution: string } | null> {
  try {
    const url =
      'https://en.wikipedia.org/api/rest_v1/page/summary/' +
      encodeURIComponent(cityName + ', Florida')
    const res = await fetch(url, {
      headers: { 'User-Agent': 'HOA-Agent/1.0' },
      next: { revalidate: 86400 }, // cache image URL for 24h
    })
    if (!res.ok) return null
    const data: WikiSummary = await res.json()
    if (data.thumbnail?.source) {
      return { url: data.thumbnail.source, attribution: 'Wikipedia' }
    }
  } catch {
    // network error, fall through to gradient
  }
  return null
}

type CityStats = {
  total: number
  condos: number
  hoas: number
  avg_fee: number | null
  min_fee: number | null
  max_fee: number | null
  avg_score: number | null
  with_litigation: number
}

async function getCityStats(cityName: string): Promise<CityStats> {
  const { data } = await supabase
    .from('communities')
    .select('property_type, monthly_fee_min, monthly_fee_max, monthly_fee_median, news_reputation_score, litigation_count')
    .eq('status', 'published')
    .ilike('city', cityName)

  const rows = data || []
  const condos = rows.filter((r) => /condo/i.test(r.property_type ?? '')).length
  const hoas = rows.length - condos
  const fees: number[] = rows
    .map((r) => r.monthly_fee_median ?? r.monthly_fee_min)
    .filter((v): v is number => typeof v === 'number' && v > 0)
  const scores: number[] = rows
    .map((r) => r.news_reputation_score)
    .filter((v): v is number => typeof v === 'number' && v > 0)
  const minFees = rows.map((r) => r.monthly_fee_min).filter((v): v is number => typeof v === 'number' && v > 0)
  const maxFees = rows.map((r) => r.monthly_fee_max).filter((v): v is number => typeof v === 'number' && v > 0)

  return {
    total: rows.length,
    condos,
    hoas,
    avg_fee: fees.length >= 3 ? Math.round(fees.reduce((a, b) => a + b, 0) / fees.length) : null,
    min_fee: minFees.length ? Math.min(...minFees) : null,
    max_fee: maxFees.length ? Math.max(...maxFees) : null,
    avg_score: scores.length >= 3
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null,
    with_litigation: rows.filter((r) => (r.litigation_count ?? 0) > 0).length,
  }
}

type RecentArticle = { title: string; url: string; published_date: string | null; source: string | null }

async function getCityPositiveNews(cityName: string): Promise<RecentArticle[]> {
  // news_items linked to communities in this city, status=approved, no negative keywords
  const { data: links } = await supabase
    .from('community_news')
    .select('news_item_id, communities!inner(city)')
    .ilike('communities.city', cityName)
    .limit(50)
  const ids = Array.from(new Set((links || []).map((l) => (l as { news_item_id: string }).news_item_id))).slice(0, 30)
  if (ids.length === 0) return []
  const { data: items } = await supabase
    .from('news_items')
    .select('title, url, published_date, source')
    .in('id', ids)
    .eq('status', 'approved')
    .order('published_date', { ascending: false, nullsFirst: false })
    .limit(20)
  const NEG = /(lawsuit|fraud|fine|violation|charges|arrested|embezzle|criminal|sued|stole|theft)/i
  return (items || [])
    .filter((it) => !NEG.test(it.title || ''))
    .slice(0, 3)
    .map((it) => ({
      title: it.title,
      url: it.url,
      published_date: it.published_date,
      source: it.source,
    }))
}

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
  'royal-palm-beach': {
    name: 'Royal Palm Beach',
    blurb:
      'Royal Palm Beach is a master-planned village in central Palm Beach County built largely in the 1980s and 1990s. Communities here lean heavily toward single-family homes and townhomes inside HOA-governed subdivisions, with monthly fees that are typically modest compared with coastal cities. The Shoma Homes developments and other townhome enclaves dominate the market — most share a single master association that handles common-area maintenance and gates.',
  },
  'wellington': {
    name: 'Wellington',
    blurb:
      'Wellington is a planned community known for equestrian neighborhoods, golf course estates, and family-oriented HOAs. Property values trend upward with proximity to Wellington International (the international polo and equestrian venue). HOA fees vary widely — from under $200/month in older townhome communities to over $1,000/month in equestrian estates with shared barn and arena access. Buyers should review covenant restrictions on horse keeping, fencing, and outbuildings carefully.',
  },
}

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const city = CITIES[slug]
  if (!city) return { title: 'City Not Found — HOA Agent' }
  const title = `${city.name} HOA Communities — Fees, Reviews & Litigation | HOA Agent Palm Beach County`
  const description = `Browse HOA and condo communities in ${city.name}, Florida. Find litigation history, news reputation scores, monthly fees, and resident reviews. Free on HOA Agent.`
  const canonical = `https://www.hoa-agent.com/city/${slug}`
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'HOA Agent',
      type: 'website',
      images: [{ url: 'https://www.hoa-agent.com/logo.png', width: 400, height: 400, alt: 'HOA Agent' }],
    },
    twitter: { card: 'summary', title, description },
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
  const SELECT_COLS =
    'id, slug, canonical_name, city, property_type, monthly_fee_min, monthly_fee_max, monthly_fee_median, unit_count, management_company, review_avg, review_count, amenities, website_url, news_reputation_score, news_reputation_label, litigation_count'

  let { data: communities } = await supabase
    .from('communities')
    .select(SELECT_COLS)
    .eq('status', 'published')
    .ilike('city', city.name)
    .order('canonical_name', { ascending: true })

  if (!communities || communities.length === 0) {
    const fallback = await supabase
      .from('communities')
      .select(SELECT_COLS)
      .eq('status', 'published')
      .ilike('city', '%' + city.name + '%')
      .order('canonical_name', { ascending: true })
    communities = fallback.data ?? null
  }

  // Richness sort — data-rich communities first
  function richness(c: Record<string, unknown>): number {
    let s = 0
    if (c.management_company) s += 15
    if (c.monthly_fee_median) s += 20
    if (c.unit_count) s += 10
    if (c.amenities) s += 10
    if (c.website_url) s += 10
    if (c.news_reputation_score) s += 15
    if (c.litigation_count !== null && c.litigation_count !== undefined) s += 5
    if (typeof c.review_count === 'number' && (c.review_count as number) > 0) s += 10
    if (c.review_avg) s += 5
    return s
  }

  type Row = {
    id: string; slug: string; canonical_name: string; city: string | null;
    property_type: string | null; monthly_fee_min: number | null; monthly_fee_max: number | null;
    monthly_fee_median: number | null; unit_count: number | null;
    management_company: string | null; review_avg: number | null; review_count: number | null;
    amenities: string | null; website_url: string | null;
    news_reputation_score: number | null; news_reputation_label: string | null;
    litigation_count: number | null; richness_score: number;
  }
  const list: Row[] = (communities || []).map((c) => ({
    ...(c as unknown as Row),
    richness_score: richness(c as unknown as Record<string, unknown>),
  })).sort((a, b) => (b.richness_score - a.richness_score) || a.canonical_name.localeCompare(b.canonical_name))

  // Parallel: hero image + stats + positive news
  const [hero, stats, positiveNews] = await Promise.all([
    getCityImage(city.name),
    getCityStats(city.name),
    getCityPositiveNews(city.name),
  ])

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f9f9f9', minHeight: '100vh' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: `HOA Communities in ${city.name}, Florida`,
        description: `Browse ${stats.total} HOA and condo communities in ${city.name}, Palm Beach County, FL`,
        url: `https://www.hoa-agent.com/city/${slug}`,
        numberOfItems: stats.total,
      })}} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'HOA Agent', item: 'https://www.hoa-agent.com' },
          { '@type': 'ListItem', position: 2, name: 'Cities', item: 'https://www.hoa-agent.com/city' },
          { '@type': 'ListItem', position: 3, name: city.name, item: `https://www.hoa-agent.com/city/${slug}` },
        ],
      })}} />
      <NavBar
        shareHref="/search"
        shareLabel="Find my HOA"
      />

      {/* Full-width hero (Wikipedia thumbnail or navy gradient) */}
      <div style={{
        position: 'relative', width: '100%', height: '250px',
        backgroundImage: hero
          ? `linear-gradient(rgba(27,43,107,0.55), rgba(27,43,107,0.55)), url("${hero.url}")`
          : 'linear-gradient(135deg, #1B2B6B 0%, #534AB7 100%)',
        backgroundSize: 'cover', backgroundPosition: 'center',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <h1 style={{ fontSize: '40px', fontWeight: 700, margin: 0, letterSpacing: '-0.02em', textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}>
            {city.name}
          </h1>
          <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.9)', marginTop: '6px' }}>
            Palm Beach County, Florida
          </div>
        </div>
        {hero && (
          <div style={{ position: 'absolute', bottom: '6px', right: '10px', fontSize: '10px', color: 'rgba(255,255,255,0.7)' }}>
            Image: {hero.attribution}
          </div>
        )}
      </div>

      <div style={{ maxWidth: '780px', margin: '0 auto', padding: '32px 20px' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '20px' }}>
          <Link href="/city" style={{ color: '#1D9E75', textDecoration: 'none' }}>Cities</Link>
          {' › '}
          {city.name}
        </div>

        {/* Stats grid (live from Supabase) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '28px' }}>
          {[
            { label: 'Total Communities', value: stats.total.toLocaleString() },
            { label: 'HOA Communities', value: stats.hoas > 0 ? stats.hoas.toLocaleString() : 'N/A' },
            { label: 'Condos', value: stats.condos > 0 ? stats.condos.toLocaleString() : 'N/A' },
            { label: 'Avg Monthly Fee', value: stats.avg_fee ? `$${stats.avg_fee}` : 'N/A' },
            { label: 'Fee Range', value: stats.min_fee && stats.max_fee ? `$${stats.min_fee}–$${stats.max_fee}` : 'N/A' },
            { label: 'Avg Reputation', value: stats.avg_score ? `${stats.avg_score}/10` : 'N/A' },
          ].map((s) => (
            <div key={s.label} style={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '14px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 700, color: '#1B2B6B', marginBottom: '2px' }}>{s.value}</div>
              <div style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Positive recent news (only if found) */}
        {positiveNews.length > 0 && (
          <div style={{ marginBottom: '28px', backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '18px 20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
              Recent News in {city.name}
            </div>
            {positiveNews.map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noopener" style={{ display: 'block', textDecoration: 'none', padding: '8px 0', borderTop: i === 0 ? 'none' : '1px solid #f0f0f0' }}>
                <div style={{ fontSize: '14px', color: '#1a1a1a', lineHeight: 1.4 }}>{a.title}</div>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '3px' }}>
                  {a.source ?? 'News'}
                  {a.published_date ? ` · ${new Date(a.published_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                </div>
              </a>
            ))}
          </div>
        )}

        <p style={{ fontSize: '14px', color: '#555', lineHeight: 1.7, marginBottom: '24px', maxWidth: '640px' }}>
          {city.blurb}
        </p>

        {/* Dynamic SEO paragraph */}
        <p style={{ fontSize: '13px', color: '#666', lineHeight: 1.6, marginBottom: '32px', maxWidth: '640px' }}>
          {city.name} is home to {stats.total} HOA and condo communities in Palm Beach County, Florida.
          {stats.avg_fee && stats.min_fee && stats.max_fee && (
            ` Monthly HOA fees in ${city.name} average $${stats.avg_fee}, ranging from $${stats.min_fee} to $${stats.max_fee}.`
          )}
          {' '}Use HOA Agent to research any community before buying or renting in {city.name}.
        </p>

        {/* Filter chips → sub-pages */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '16px' }}>
          {[
            { key: '', label: 'All' },
            { key: 'condos', label: 'Condos' },
            { key: 'single-family', label: 'Single-Family' },
            { key: 'townhomes', label: 'Townhomes' },
            { key: 'pet-friendly', label: 'Pet-Friendly' },
            { key: 'affordable', label: 'Affordable' },
            { key: 'high-fee', label: 'Premium' },
            { key: 'with-litigation', label: 'With Litigation' },
            { key: 'good-standing', label: 'Good Standing' },
          ].map((f) => (
            <Link
              key={f.label}
              href={f.key ? `/city/${slug}/${f.key}` : `/city/${slug}`}
              style={{
                padding: '5px 12px', borderRadius: '20px',
                border: '1px solid ' + (f.key === '' ? '#1B2B6B' : '#e0e0e0'),
                backgroundColor: f.key === '' ? '#1B2B6B' : '#fff',
                color: f.key === '' ? '#fff' : '#555',
                fontSize: '12px', textDecoration: 'none', fontWeight: f.key === '' ? 600 : 400,
              }}
            >{f.label}</Link>
          ))}
        </div>

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
                    <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {c.richness_score >= 50 && (
                        <span title="Data-rich profile" style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#1D9E75' }} />
                      )}
                      {c.canonical_name}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888', marginTop: '3px' }}>
                      {[c.property_type, c.management_company].filter(Boolean).join(' · ')}
                      {c.richness_score === 0 && (
                        <span style={{ marginLeft: '6px', fontSize: '11px', color: '#bbb', fontStyle: 'italic' }}>· Limited information available</span>
                      )}
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

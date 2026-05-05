import { supabase } from '@/lib/supabase'
import CommentForm from '@/app/components/CommentForm'
import { notFound } from 'next/navigation'
import ReportModal from '@/app/components/ReportModal'
import RestrictionModal from '@/app/components/RestrictionModal'
import MasterHoaQuestion from '@/app/components/MasterHoaQuestion'
import FirstReviewToast from '@/app/components/FirstReviewToast'
import NavBar from '@/app/components/NavBar'
import NewsFeed from '@/app/components/NewsFeed'
import LegalCases from '@/app/components/LegalCases'
import SponsoredCard from '@/app/components/SponsoredCard'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { data: community } = await supabase
    .from('communities')
    .select('canonical_name,city,monthly_fee_min,monthly_fee_max,management_company,property_type,unit_count')
    .eq('slug', slug)
    .single()

  if (!community) return { title: 'Community Not Found — HOA Agent' }

  const title = `${community.canonical_name} HOA Fees, Reviews & Restrictions — ${community.city}, FL | HOA Agent`
  const description =
    `${community.canonical_name} is a ${community.unit_count ? community.unit_count + '-unit ' : ''}` +
    `${community.property_type || 'HOA'} community in ${community.city}, Florida. ` +
    `View fees, restrictions, management info, and resident reviews. Free at HOA Agent.`
  const canonical = `https://www.hoa-agent.com/community/${slug}`

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

interface Community {
  id: string
  slug: string
  canonical_name: string
  city: string
  county: string
  state: string
  property_type: string
  unit_count: number
  street_address: string
  zip_code: string
  monthly_fee_min: number
  monthly_fee_max: number
  monthly_fee_median: number
  fee_observation_count: number
  confidence_score: number
  management_company: string
  entity_status: string
  legal_name: string
  state_entity_number: string
  incorporation_date: string
  registered_agent: string
  str_restriction: string
  pet_restriction: string
  vehicle_restriction: string
  rental_approval: string
  assessment_signal_count: number
  litigation_count: number | null
  amenities: string
  review_count: number | null
  review_avg: number
  data_freshness_date: string
  news_reputation_score: number | null
  news_reputation_label: string | null
  news_reputation_updated_at: string | null
  city_verified?: boolean
  website_url?: string
  // master/sub HOA columns
  is_master?: boolean
  // legacy columns kept for backward compatibility
  is_sub_hoa?: boolean
  master_hoa_id?: string | null
  // gated / age-restricted flags
  is_55_plus?: boolean
  is_gated?: boolean
  is_age_restricted?: boolean
}

async function getCommunity(slug: string) {
  const { data, error } = await supabase
    .from('communities')
    .select('*, city_verified, news_reputation_score, news_reputation_label, litigation_count')
    .eq('slug', slug)
    .single()
  if (error || !data) return null
  return data as Community
}

function getCompletenessScore(community: Community) {
  const fields = [
    !!community.monthly_fee_min,
    !!community.monthly_fee_max,
    !!community.management_company,
    !!community.property_type,
    !!community.unit_count,
    !!community.website_url,
    !!community.str_restriction && community.str_restriction !== 'Unknown',
    !!community.pet_restriction && community.pet_restriction !== 'Unknown',
    !!community.vehicle_restriction && community.vehicle_restriction !== 'Unknown',
    !!community.amenities,
    (community.review_count || 0) > 0,
  ]
  const filled = fields.filter(Boolean).length
  return { filled, total: fields.length, pct: Math.round((filled / fields.length) * 100) }
}

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const community = await getCommunity(slug)
  if (!community) notFound()

  const { data: comments } = await supabase
    .from('community_comments')
    .select('id,commenter_name,comment_text,rating,created_at,resident_type,is_resident')
    .eq('community_id', community.id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(10)

  // Live count + average from community_comments. The communities.review_count
  // and communities.review_avg cached fields can fall out of sync when comments
  // are inserted/approved without a trigger updating them — read live to avoid
  // showing 0 reviews when an approved comment exists.
  const { count: liveCommentCount } = await supabase
    .from('community_comments')
    .select('id', { count: 'exact', head: true })
    .eq('community_id', community.id)
    .eq('status', 'approved')

  const { data: ratingRows } = await supabase
    .from('community_comments')
    .select('rating')
    .eq('community_id', community.id)
    .eq('status', 'approved')
    .not('rating', 'is', null)

  const liveReviewCount = liveCommentCount ?? (comments?.length ?? 0)
  const ratings: number[] = (ratingRows ?? []).map((r: { rating: number | null }) => r.rating!).filter((n) => typeof n === 'number')
  const liveReviewAvg = ratings.length > 0
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : (community.review_avg ?? null)

  const amenitiesList = community.amenities ? community.amenities.split('|').map((a: string) => a.trim()) : []

  // Sponsored ads — fetch advertisers targeting this community's city.
  // Uses the service-role client (server component only — key never reaches
  // the browser) so RLS doesn't hide active campaigns. Until the public
  // anon-read policy in migration 20260503_advertiser_system.sql is applied
  // in production, the public anon client returns 0 rows from `advertisers`.
  // Service-role bypasses RLS and works either way.
  let pageAdvertisers: Array<{ id: string; company_name: string; tagline: string|null; phone: string|null; cta_text: string|null; cta_url: string|null; category: string|null; logo_url: string|null }> = []
  if (community.city) {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supaSvc = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (supaUrl && supaSvc) {
        const adminSb = createClient(supaUrl, supaSvc, { auth: { persistSession: false } })
        const { data: ads } = await adminSb
          .from('advertisers')
          .select('id, company_name, tagline, phone, cta_text, cta_url, category, logo_url, plan, target_cities, target_counties, status')
          .eq('status', 'active')
          .contains('target_cities', [community.city])
          .order('plan', { ascending: false })
          .limit(3)
        if (ads) pageAdvertisers = ads
      }
    } catch {
      // Table missing or env unset — gracefully no ads
    }
  }

  const cityForSearch = community.city_verified ? community.city : null
  const { data: relatedCommunities } = cityForSearch ? await supabase
    .from('communities')
    .select('id,canonical_name,slug,monthly_fee_min,property_type')
    .ilike('city', `%${cityForSearch}%`)
    .eq('status', 'published')
    .neq('slug', slug)
    .limit(4) : { data: [] }

  // Similar-by-property-type for the "Similar Communities" section.
  // Uses property_type match where possible. Picks 6 random matches.
  let similarCommunities: Array<{ canonical_name: string; slug: string; city: string; monthly_fee_median: number | null; unit_count: number | null; news_reputation_score: number | null }> = []
  let cityAvgFee: number | null = null
  if (community.city) {
    const ptFilter = community.property_type
      ? supabase.from('communities')
          .select('canonical_name, slug, city, monthly_fee_median, unit_count, news_reputation_score')
          .ilike('city', community.city)
          .ilike('property_type', `%${community.property_type}%`)
          .neq('id', community.id).eq('status', 'published').limit(50)
      : supabase.from('communities')
          .select('canonical_name, slug, city, monthly_fee_median, unit_count, news_reputation_score')
          .ilike('city', community.city)
          .neq('id', community.id).eq('status', 'published').limit(50)
    const { data: candidates } = await ptFilter
    const shuffled = (candidates || []).sort(() => Math.random() - 0.5).slice(0, 6)
    similarCommunities = shuffled

    const { data: avgRow } = await supabase
      .from('communities')
      .select('monthly_fee_median')
      .ilike('city', community.city)
      .eq('status', 'published')
      .not('monthly_fee_median', 'is', null)
    const fees = (avgRow || []).map((r) => r.monthly_fee_median).filter((f): f is number => typeof f === 'number' && f > 0)
    if (fees.length >= 3) cityAvgFee = Math.round(fees.reduce((a, b) => a + b, 0) / fees.length)
  }

  const commentFormId = 'leave-review'

  // Resolve the effective parent id (production schema uses master_hoa_id)
  const effectiveParentId = community.master_hoa_id ?? null
  const isSub = !!(community.is_sub_hoa || effectiveParentId)

  // Master HOA data (shown on sub-community pages)
  let masterHoa: any = null
  if (isSub && effectiveParentId) {
    const { data } = await supabase
      .from('communities')
      .select('id,canonical_name,slug,monthly_fee_min,monthly_fee_max,city')
      .eq('id', effectiveParentId)
      .single()
    masterHoa = data
  }

  // Sub-communities (shown on master pages) — published only
  const subQuery = await supabase
    .from('communities')
    .select('id,canonical_name,slug,monthly_fee_min,monthly_fee_max,property_type,unit_count,status')
    .eq('master_hoa_id', community.id)
    .eq('status', 'published')
    .order('canonical_name', { ascending: true })

  const subCommunities = (subQuery.data ?? [])

  // ── Schema.org JSON-LD bundle ──────────────────────────────────────────
  const citySlug = (community.city || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const communityUrl = `https://www.hoa-agent.com/community/${community.slug}`
  const isCondo = /condo/i.test(community.property_type ?? '')

  const communitySchema = {
    '@context': 'https://schema.org',
    '@type': 'ResidentialComplex',
    name: community.canonical_name,
    description: `${community.property_type || 'HOA'} community${community.unit_count ? ` with ${community.unit_count} units` : ''} in ${community.city}, FL.`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: community.street_address || '',
      addressLocality: community.city,
      addressRegion: 'FL',
      postalCode: community.zip_code || '',
      addressCountry: 'US',
    },
    url: communityUrl,
    containedInPlace: {
      '@type': 'City',
      name: community.city,
      containedInPlace: { '@type': 'AdministrativeArea', name: 'Palm Beach County' },
    },
    ...(community.unit_count ? { numberOfRooms: community.unit_count } : {}),
    dateModified: community.data_freshness_date || new Date().toISOString(),
  }

  const datasetSchema = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${community.canonical_name} HOA Profile`,
    description: `Public HOA community data for ${community.canonical_name} in ${community.city}, Palm Beach County, Florida`,
    url: communityUrl,
    creator: { '@type': 'Organization', name: 'HOA Agent', url: 'https://www.hoa-agent.com' },
    license: 'https://creativecommons.org/licenses/by/4.0/',
    dateModified: community.data_freshness_date || new Date().toISOString(),
    variableMeasured: ['Monthly HOA fee', 'Litigation count', 'News reputation score', 'Unit count'],
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'HOA Agent', item: 'https://www.hoa-agent.com' },
      { '@type': 'ListItem', position: 2, name: community.city, item: `https://www.hoa-agent.com/city/${citySlug}` },
      { '@type': 'ListItem', position: 3, name: community.canonical_name, item: communityUrl },
    ],
  }

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `What is the monthly HOA fee at ${community.canonical_name}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: community.monthly_fee_median
            ? `The monthly HOA fee at ${community.canonical_name} is approximately $${community.monthly_fee_min}–$${community.monthly_fee_max} per month based on available data.`
            : `The monthly HOA fee at ${community.canonical_name} has not yet been verified. Submit what you know to help other residents.`,
        },
      },
      {
        '@type': 'Question',
        name: `Who manages ${community.canonical_name}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: community.management_company
            ? `${community.canonical_name} is managed by ${community.management_company}.`
            : `The management company for ${community.canonical_name} is not yet on file.`,
        },
      },
      {
        '@type': 'Question',
        name: `How many units does ${community.canonical_name} have?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: community.unit_count
            ? `${community.canonical_name} has ${community.unit_count} units.`
            : `The unit count for ${community.canonical_name} is not confirmed.`,
        },
      },
      {
        '@type': 'Question',
        name: `Are pets allowed at ${community.canonical_name}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: community.pet_restriction || `Pet policy for ${community.canonical_name} has not been confirmed. Contact the management company for current rules.`,
        },
      },
      {
        '@type': 'Question',
        name: `Are rentals allowed at ${community.canonical_name}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: community.rental_approval || `Rental restrictions for ${community.canonical_name} have not been confirmed. Check with the association directly before purchasing as an investor.`,
        },
      },
      ...(community.is_55_plus ? [{
        '@type': 'Question',
        name: `Is ${community.canonical_name} a 55+ community?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Yes, ${community.canonical_name} is an age-restricted 55+ community in ${community.city}, Florida. At least 80% of occupied units must be occupied by at least one person 55 or older under the Housing for Older Persons Act (HOPA).`,
        },
      }] : []),
      ...(community.is_gated ? [{
        '@type': 'Question',
        name: `Is ${community.canonical_name} a gated community?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Yes, ${community.canonical_name} is a gated community with controlled access in ${community.city}, Florida.`,
        },
      }] : []),
    ],
  }

  const ratingSchema = liveReviewAvg && liveReviewCount > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'AggregateRating',
    itemReviewed: { '@type': 'ResidentialComplex', name: community.canonical_name },
    ratingValue: liveReviewAvg,
    reviewCount: liveReviewCount,
    bestRating: 5,
    worstRating: 1,
  } : null

  return (
    <main style={{fontFamily: 'system-ui, sans-serif', margin: 0, padding: 0, backgroundColor: '#f9f9f9'}}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(communitySchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      {ratingSchema && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ratingSchema) }} />
      )}
      <NavBar
        shareHref="/search"
        shareLabel="Share your association"
      />

      <div style={{maxWidth: '720px', margin: '0 auto', padding: '24px 32px'}}>
        <a href="/search" style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'13px',color:'#888',textDecoration:'none',marginBottom:'16px'}}>← Back to search</a>
        <div style={{fontSize: '12px', color: '#888', marginBottom: '16px'}}>
          <a href="/" style={{color: '#888', textDecoration: 'none'}}>HOA Agent</a>
          <span style={{margin: '0 6px'}}>›</span>
          <span>{community.county} County</span>
          <span style={{margin: '0 6px'}}>›</span>
          <span>{community.city}</span>
          <span style={{margin: '0 6px'}}>›</span>
          <span style={{color: '#1a1a1a', fontWeight: '500'}}>{community.canonical_name}</span>
        </div>

        {/* PART-OF BANNER — shown on sub-community pages */}
        {isSub && masterHoa && (
          <div style={{backgroundColor: '#E1F5EE', borderLeft: '3px solid #1D9E75', borderTop: '1px solid #b8e5d4', borderBottom: '1px solid #b8e5d4', borderRadius: 0, padding: '8px 12px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}>
            <div style={{fontSize: '12px', color: '#1B2B6B', lineHeight: '1.45'}}>
              <span style={{fontWeight: 600, color: '#1D9E75', marginRight: '6px'}}>Part of {masterHoa.canonical_name}.</span>
              Verify both association fee structures before purchasing.
            </div>
            <a href={'/community/' + masterHoa.slug} style={{fontSize: '12px', color: '#1D9E75', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '2px', whiteSpace: 'nowrap', flexShrink: 0}}>
              View master HOA →
            </a>
          </div>
        )}
        {/* Legacy fallback: parent known but not fetched */}
        {isSub && !masterHoa && effectiveParentId && (
          <div style={{backgroundColor: '#E1F5EE', borderLeft: '3px solid #1D9E75', padding: '8px 12px', marginBottom: '12px', fontSize: '12px', color: '#1B2B6B'}}>
            <span style={{fontWeight: 600, color: '#1D9E75', marginRight: '6px'}}>Sub-community.</span>
            This community is part of a master HOA. Verify both fee structures before purchasing.
          </div>
        )}

        {/* HEADER CARD */}
        <div style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px'}}>
            <div style={{flex: 1, minWidth: '220px'}}>
              {isSub && (
                <div style={{display:'inline-block',fontSize:'10px',padding:'2px 8px',borderRadius:'999px',backgroundColor:'#FAEEDA',color:'#854F0B',marginBottom:'6px',maxWidth:'100%'}}>Sub-association</div>
              )}
              <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap',marginBottom:'6px'}}>
                <h1 style={{fontSize: '24px', fontWeight: '600', color: '#1a1a1a', margin: 0}}>{community.canonical_name} — {community.city}, FL</h1>
                <a
                  href={`/compare?communities=${community.slug}`}
                  style={{fontSize:'11px',padding:'4px 10px',borderRadius:'999px',backgroundColor:'#fff',color:'#1B2B6B',border:'1px solid #1B2B6B',textDecoration:'none',fontWeight:600,whiteSpace:'nowrap'}}
                  title="Compare with other communities"
                >+ Compare</a>
                {String(community.entity_status || '').toLowerCase() === 'active' && (
                  <span style={{display:'inline-flex',alignItems:'center',gap:'6px',fontSize:'11px',padding:'4px 10px',borderRadius:'999px',backgroundColor:'#E1F5EE',color:'#1D9E75',fontWeight:600}}>
                    <span style={{width:'6px',height:'6px',backgroundColor:'#1D9E75',borderRadius:'999px'}}></span>
                    Active
                  </span>
                )}
              </div>
              <div style={{fontSize: '13px', color: '#888', marginBottom: '12px'}}>
                {community.city}, FL{community.zip_code ? ' ' + community.zip_code : ''} · {community.county} County
              </div>
              <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
             {community.property_type && <span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#E6F1FB', color: '#0C447C'}}>{community.property_type}</span>}
                {community.unit_count && <span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#f0f0f0', color: '#555'}}>{community.unit_count} units</span>}
                {(community.is_master || subCommunities.length > 0) && <span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#1B2B6B', color: '#fff'}}>Master HOA</span>}
                {isSub && <span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#FAEEDA', color: '#854F0B'}}>Sub-community</span>}
                {community.is_55_plus && <span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '999px', backgroundColor: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', fontWeight: 600}}>55+ Community</span>}
                {community.is_gated && <span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '999px', backgroundColor: '#DBEAFE', color: '#1E40AF', border: '1px solid #BFDBFE', fontWeight: 600}}>Gated</span>}
                {community.is_age_restricted && !community.is_55_plus && <span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '999px', backgroundColor: '#F3E8FF', color: '#6B21A8', border: '1px solid #E9D5FF', fontWeight: 600}}>Age Restricted</span>}
              </div>
            </div>
            <div style={{textAlign: 'right', minWidth: '130px', width:'100%', maxWidth:'220px'}}>
              <div style={{fontSize:'18px',color:'#EF9F27',lineHeight:'1.2'}}>
                {'★'.repeat(Math.round(liveReviewAvg || 0)).padEnd(5, '☆')}
              </div>
              <a href="#leave-review" style={{display: 'inline-block', marginTop: '4px', fontSize:'12px',color:'#1D9E75',textDecoration:'none',fontWeight:600}}>{liveReviewCount} reviews</a>
            </div>
          </div>
        </div>

        <div style={{backgroundColor: '#FAEEDA', border: '1px solid #EF9F27', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '12px', color: '#633806', lineHeight: '1.5'}}>
          <strong>Data transparency:</strong> This profile combines public records and resident-submitted data. Each field is labeled by source. Unverified data is clearly marked.
        </div>
        {!isSub && !community.is_master && subCommunities.length === 0 && (
          <MasterHoaQuestion communityId={community.id} communityName={community.canonical_name} />
        )}

        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px', marginBottom: '12px'}}>
          {[
            {val: liveReviewAvg ? liveReviewAvg + '★' : (liveReviewCount > 0 ? liveReviewCount + ' reviews' : 'No reviews'), label: liveReviewCount + ' reviews', src: 'user-submitted', link: null, color: null},
            {val: (community.assessment_signal_count || 0) + ' signals', label: 'Assessments', src: 'public + resident', link: null, color: null},
            {val: community.news_reputation_score ? community.news_reputation_score + '/10' : 'No data', label: community.news_reputation_label || 'News reputation', src: 'AI-analyzed', link: `/community/${community.slug}/news`, color: community.news_reputation_score ? community.news_reputation_score <= 3 ? '#dc2626' : community.news_reputation_score <= 5 ? '#d97706' : community.news_reputation_score <= 7 ? '#2563eb' : '#16a34a' : null},
            {val: community.litigation_count ? community.litigation_count + ' cases' : 'Search record', label: 'Litigation', src: 'CourtListener', link: `/community/${community.slug}/legal`, color: (community.litigation_count || 0) > 0 ? '#7c3aed' : null},
          ].map((stat) => (
            <div key={stat.label} style={{backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '12px', textAlign: 'center', position: 'relative'}}>
              <div style={{fontSize: '13px', fontWeight: '500', color: stat.color || (stat.val === 'Not listed' || stat.val === 'Unknown' || stat.val === 'No data' || stat.val === 'Search record' ? '#aaa' : '#1a1a1a'), marginBottom: '2px', wordBreak: 'break-word'}}>{stat.val}</div>
              <div style={{fontSize: '10px', color: '#888', marginBottom: '1px'}}>{stat.label}</div>
              <div style={{fontSize: '9px', color: '#aaa'}}>{stat.src}</div>
              {stat.link && <a href={stat.link} style={{fontSize: '9px', color: '#1B2B6B', fontWeight: 600, textDecoration: 'none', display: 'block', marginTop: '4px'}}>View →</a>}
            </div>
          ))}
        </div>

        <div style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px'}}>
            <div style={{fontSize: '15px', fontWeight: '500', color: '#1a1a1a'}}>HOA fee summary</div>
            <span style={{fontSize: '10px', padding: '2px 8px', borderRadius: '3px', backgroundColor: '#f0f0f0', color: '#666'}}>resident-verified</span>
          </div>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '14px'}}>
            <div>
              <div style={{fontSize: '16px', fontWeight: '500', color: '#1a1a1a'}}>{community.monthly_fee_min && community.monthly_fee_max ? '$' + community.monthly_fee_min + ' – $' + community.monthly_fee_max + '/mo' : '—'}</div>
              <div style={{fontSize: '11px', color: '#888', marginTop: '2px'}}>Observed range</div>
            </div>
            <div>
              <div style={{fontSize: '16px', fontWeight: '500', color: '#1a1a1a'}}>{community.monthly_fee_median ? '$' + community.monthly_fee_median + '/mo' : '—'}</div>
              <div style={{fontSize: '11px', color: '#888', marginTop: '2px'}}>Normalized median</div>
            </div>
            <div>
              <div style={{fontSize: '16px', fontWeight: '500', color: '#1a1a1a'}}>{community.fee_observation_count || '—'}{community.fee_observation_count ? ' data points' : ''}</div>
              <div style={{fontSize: '11px', color: '#888', marginTop: '2px'}}>Fee reports</div>
            </div>
          </div>
          <div style={{fontSize: '11px', color: '#aaa'}}>Based on resident submissions and public records. Not a guaranteed fee. Always verify with the association directly.</div>
        </div>

        {/* Sponsored card (only shows if advertisers configured for this city) */}
        {pageAdvertisers.length > 0 && (
          <div style={{marginBottom: '12px'}}>
            <div style={{fontSize: '11px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px'}}>
              Support local businesses
            </div>
            <SponsoredCard
              advertisers={pageAdvertisers}
              communitySlug={community.slug}
              city={community.city}
            />
          </div>
        )}

        <div style={{backgroundColor: '#fff', border: `1px solid ${community.assessment_signal_count > 0 ? '#EF9F27' : '#e5e5e5'}`, borderRadius: '12px', padding: '20px 24px', marginBottom: '12px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
            <div style={{fontSize: '15px', fontWeight: '500', color: '#1a1a1a'}}>Special assessment signals</div>
            {community.assessment_signal_count > 0 && (
              <span style={{fontSize: '10px', padding: '2px 8px', borderRadius: '3px', backgroundColor: '#FAEEDA', color: '#854F0B'}}>{community.assessment_signal_count} signals found</span>
            )}
          </div>
          {community.assessment_signal_count > 0 ? (
            <div style={{fontSize: '13px', color: '#666', lineHeight: '1.5'}}>Assessment signals detected. Get the full report for complete details.</div>
          ) : (
            <div style={{fontSize: '13px', color: '#888', lineHeight: '1.5'}}>
              No assessment signals reported yet for this community.
            </div>
          )}
        </div>

        <div style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px'}}>
          <div style={{fontSize: '15px', fontWeight: '500', color: '#1a1a1a', marginBottom: '12px'}}>Association details</div>
          <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
            <div style={{display:'flex',justifyContent:'space-between',gap:'12px',flexWrap:'wrap'}}><span style={{color:'#888',fontSize:'12px'}}>Property type</span><span style={{color:'#1a1a1a',fontSize:'13px'}}>{community.property_type || 'Unknown'}</span></div>
            <div style={{display:'flex',justifyContent:'space-between',gap:'12px',flexWrap:'wrap'}}><span style={{color:'#888',fontSize:'12px'}}>Units</span><span style={{color:'#1a1a1a',fontSize:'13px'}}>{community.unit_count || 'Unknown'}</span></div>
            <div style={{display:'flex',justifyContent:'space-between',gap:'12px',flexWrap:'wrap'}}>
              <span style={{color:'#888',fontSize:'12px'}}>Management company</span>
              <span style={{color:'#1a1a1a',fontSize:'13px',textAlign:'right',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'60%'}}>{community.management_company || 'Not listed'}</span>
            </div>
          </div>
        </div>

        {amenitiesList.length > 0 && (
          <div style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px'}}>
              <div style={{fontSize: '15px', fontWeight: '500', color: '#1a1a1a'}}>Amenities</div>
              <span style={{fontSize: '10px', padding: '2px 8px', borderRadius: '3px', backgroundColor: '#f0f0f0', color: '#666'}}>resident-verified</span>
            </div>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px'}}>
              {amenitiesList.map((amenity: string) => (
                <span key={amenity} style={{fontSize: '12px', padding: '4px 10px', borderRadius: '20px', backgroundColor: '#f0f0f0', color: '#444', display: 'flex', alignItems: 'center', gap: '4px'}}>
                  <span style={{color: '#1D9E75'}}>✓</span> {amenity}
              </span>
              ))}
            </div>
          </div>
        )}

        <div style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px'}}>
            <div style={{fontSize: '15px', fontWeight: '500', color: '#1a1a1a'}}>Restrictions</div>
            <span style={{fontSize: '10px', padding: '2px 8px', borderRadius: '3px', backgroundColor: '#f0f0f0', color: '#666'}}>public + resident</span>
          </div>
          <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
            {([
              {label: 'Short-term rentals', val: community.str_restriction, field: 'str_restriction' as const},
              {label: 'Pets', val: community.pet_restriction, field: 'pet_restriction' as const},
              {label: 'Commercial vehicles', val: community.vehicle_restriction, field: 'vehicle_restriction' as const},
              {label: 'Rental approval', val: community.rental_approval, field: 'rental_approval' as const},
            ] as const).map((r) => {
              const isUnknown = !r.val || r.val === 'Unknown'
              return (
                <div key={r.label} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: '8px', padding: '10px 12px', gap: '8px'}}>
                  <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                    <span style={{fontSize: '13px', color: isUnknown ? '#aaa' : (r.val || '').toLowerCase().includes('no') || (r.val || '').toLowerCase().includes('prohibit') ? '#E24B4A' : '#1D9E75', flexShrink: 0}}>
                      {isUnknown ? '?' : (r.val || '').toLowerCase().includes('no') || (r.val || '').toLowerCase().includes('prohibit') ? '✕' : '✓'}
                    </span>
                    <div>
                      <div style={{fontSize: '12px', color: '#1a1a1a'}}>{r.label}</div>
                      <div style={{fontSize: '11px', color: isUnknown ? '#aaa' : '#888'}}>{isUnknown ? 'Unknown' : r.val}</div>
                </div>
                  </div>
                  {isUnknown && (
                    <RestrictionModal communityId={community.id} field={r.field as any} communityName={community.canonical_name} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {community.legal_name && (
          <div style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px'}}>
            <div style={{fontSize: '15px', fontWeight: '500', color: '#1a1a1a', marginBottom: '12px'}}>Association entity</div>
            <div style={{display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px'}}>
              <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{color: '#888'}}>Legal name</span><span style={{color: '#1a1a1a'}}>{community.legal_name}</span></div>
              {community.state_entity_number && community.state_entity_number !== 'Unknown' && <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{color: '#888'}}>Entity number</span><span style={{color: '#1a1a1a'}}>{community.state_entity_number}</span></div>}
              {community.registered_agent && community.registered_agent !== 'Unknown' && <div style={{display: 'flex', justifyContent: 'space-between'}}><span style={{color: '#888'}}>Registered agent</span><span style={{color: '#1a1a1a'}}>{community.registered_agent}</span></div>}
            </div>
          </div>
        )}

        {/* SUB-COMMUNITIES HUB SECTION — shown on master HOA pages */}
        {subCommunities.length > 0 && (
          <div style={{backgroundColor: '#fff', border: '1px solid #1B2B6B', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
              <div>
                <div style={{fontSize: '15px', fontWeight: '500', color: '#1a1a1a'}}>Communities within {community.canonical_name}</div>
                <div style={{fontSize: '12px', color: '#888', marginTop: '2px'}}>{subCommunities.length} sub-communit{subCommunities.length === 1 ? 'y' : 'ies'}</div>
              </div>
              <span style={{fontSize: '11px', padding: '3px 10px', borderRadius: '20px', backgroundColor: '#1B2B6B', color: '#fff'}}>Master HOA</span>
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
              {subCommunities.map((sub: any) => (
                <a key={sub.id} href={'/community/' + sub.slug} style={{textDecoration: 'none'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: '8px', padding: '10px 14px', cursor: 'pointer'}}>
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px'}}>
                        <div style={{fontSize: '13px', fontWeight: '500', color: '#1a1a1a'}}>{sub.canonical_name}</div>
                        {sub.status === 'draft' && (
                          <span style={{fontSize: '9px', padding: '1px 6px', borderRadius: '3px', backgroundColor: '#f0f0f0', color: '#888', flexShrink: 0}}>draft</span>
                        )}
                      </div>
                      <div style={{fontSize: '11px', color: '#888'}}>{sub.property_type || 'HOA'}{sub.unit_count ? ' · ' + sub.unit_count + ' units' : ''}</div>
                    </div>
                    <div style={{textAlign: 'right', flexShrink: 0, marginLeft: '12px'}}>
                      <div style={{fontSize: '13px', fontWeight: '500', color: '#1a1a1a'}}>{sub.monthly_fee_min && sub.monthly_fee_max ? '$' + sub.monthly_fee_min + '–$' + sub.monthly_fee_max + '/mo' : 'Fee unknown'}</div>
                      <div style={{fontSize: '11px', color: '#1D9E75'}}>View profile →</div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}


        {comments && comments.length > 0 && (
          <div style={{backgroundColor:'#fff',border:'1px solid #e5e5e5',borderRadius:'12px',padding:'20px 24px',marginBottom:'12px'}}>
            <div style={{fontSize:'15px',fontWeight:'500',color:'#1a1a1a',marginBottom:'16px'}}>
              Resident reviews <span style={{fontSize:'13px',fontWeight:'400',color:'#888'}}>({comments.length})</span>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
              {comments.map((c) => (
                <div key={c.id} style={{borderBottom:'1px solid #f0f0f0',paddingBottom:'14px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      <span style={{fontSize:'13px',fontWeight:'500',color:'#1a1a1a'}}>{c.commenter_name || 'Anonymous'}</span>
                      {c.is_resident && (
                        <span style={{fontSize:'10px',padding:'2px 8px',borderRadius:'20px',backgroundColor:'#E1F5EE',color:'#1B2B6B',fontWeight:'600'}}>
                          {c.resident_type === 'renter' ? 'Verified Renter' : c.resident_type === 'former' ? 'Former Resident' : 'Verified Resident'}
                        </span>
                      )}
                      {c.rating && (
                        <span style={{fontSize:'12px',color:'#EF9F27'}}>
                          {'★'.repeat(c.rating)}{'☆'.repeat(5 - c.rating)}
                        </span>
                  )}
                    </div>
                    <span style={{fontSize:'11px',color:'#aaa'}}>
                      {new Date(c.created_at).toLocaleDateString('en-US',{month:'short',year:'numeric'})}
                    </span>
                  </div>
                  <div style={{fontSize:'13px',color:'#555',lineHeight:'1.6'}}>{c.comment_text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div id={commentFormId}>
          <CommentForm communityId={community.id} />
        </div>

        <div style={{backgroundColor: '#E1F5EE', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap'}}>
          <div>
            <div style={{fontSize: '15px', fontWeight: '500', color: '#1B2B6B', marginBottom: '4px'}}>Get the full HOA Agent report</div>
            <div style={{fontSize: '12px', color: '#1B2B6B'}}>Fee trend PDF · Full source trail · All assessment signals · Restriction detail · Management history</div>
          </div>
          <ReportModal />
        </div>

        <div style={{backgroundColor: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '14px 20px', marginBottom: '12px', fontSize: '12px', color: '#888', lineHeight: '1.6'}}>
          <strong style={{color: '#555', fontWeight: '500'}}>Data accuracy notice:</strong> Data is sourced from public records and resident submissions. HOA Agent does not guarantee accuracy. Verify all fees and restrictions directly with the association before making any real estate decision.
        </div>

        <div style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px', position: 'relative', overflow: 'hidden'}}>
          <div style={{fontSize: '15px', fontWeight: '500', color: '#1a1a1a', marginBottom: '12px'}}>Source trail</div>
          <div style={{display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', filter: 'blur(4px)', userSelect: 'none', pointerEvents: 'none'}}>
            <div><strong style={{fontWeight: '500'}}>Florida Division of Corporations</strong> <span style={{color: '#888'}}>— Entity, registered agent, status.</span></div>
            <div><strong style={{fontWeight: '500'}}>Resident submissions</strong> <span style={{color: '#888'}}>— Fee range, restrictions, assessment mentions.</span></div>
            <div><strong style={{fontWeight: '500'}}>User submissions</strong> <span style={{color: '#888'}}>— Additional data points with citation links.</span></div>
            <div><strong style={{fontWeight: '500'}}>Public records</strong> <span style={{color: '#888'}}>— County property appraiser, clerk of courts.</span></div>
          </div>
          <div style={{position: 'absolute', top: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: '12px'}}>
            <div style={{fontSize: '20px', marginBottom: '8px'}}>🔒</div>
            <div style={{fontSize: '14px', fontWeight: '600', color: '#1a1a1a', marginBottom: '4px'}}>Full source trail included in report</div>
            <div style={{fontSize: '12px', color: '#888', marginBottom: '16px', textAlign: 'center', maxWidth: '260px'}}>See every data point and when it was last verified.</div>
            <ReportModal />
          </div>
        </div>

        <NewsFeed communityId={community.id} communityName={community.canonical_name} />
        <LegalCases communityId={community.id} communityName={community.canonical_name} />

        {/* About — auto-generated neighborhood context */}
        <div style={{backgroundColor:'#fff', border:'1px solid #e5e5e5', borderRadius:'12px', padding:'20px 24px', marginTop:'20px', marginBottom:'12px'}}>
          <h2 style={{fontSize:'15px', fontWeight:600, color:'#1a1a1a', marginTop:0, marginBottom:'10px'}}>About {community.canonical_name}</h2>
          <p style={{fontSize:'13px', color:'#555', lineHeight:1.7, margin:0}}>
            {community.canonical_name} is a {community.property_type ? community.property_type.toLowerCase() : 'residential'} community
            {community.unit_count ? ` with ${community.unit_count} units` : ''} located in {community.city}, Palm Beach County, Florida{community.zip_code ? ` (ZIP ${community.zip_code})` : ''}.
            {community.incorporation_date && ` It was incorporated on ${new Date(community.incorporation_date).toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})} under Florida ${isCondo ? 'Statute Chapter 718 (Condominium Act)' : 'Statute Chapter 720 (Homeowners Association Act)'}.`}
            {cityAvgFee && community.monthly_fee_median ? ` The average monthly HOA fee in ${community.city} is approximately $${cityAvgFee}. ${community.canonical_name}'s fee is approximately $${community.monthly_fee_median} per month.` : ''}
            {cityAvgFee && !community.monthly_fee_median ? ` The average monthly HOA fee in ${community.city} is approximately $${cityAvgFee}. ${community.canonical_name}'s fee has not yet been verified by residents.` : ''}
            {community.management_company && ` The community is managed by ${community.management_company}.`}
            {community.is_55_plus && ` ${community.canonical_name} is an age-restricted community for adults 55 and older, governed by the Housing for Older Persons Act (HOPA).`}
            {community.is_gated && ` ${community.canonical_name} is a gated community with controlled access.`}
            {(community.litigation_count ?? 0) > 0 ? ` Public court records show ${community.litigation_count} legal case${community.litigation_count === 1 ? '' : 's'} associated with this community in the CourtListener database.` : ' No active legal cases were found in public court records for this community.'}
            {' '}Residents and prospective buyers can submit verified information to help keep this profile accurate.
          </p>
        </div>

        {/* Florida HOA Law context */}
        <div style={{backgroundColor:'#fff', border:'1px solid #e5e5e5', borderRadius:'12px', padding:'20px 24px', marginBottom:'12px'}}>
          <h2 style={{fontSize:'15px', fontWeight:600, color:'#1a1a1a', marginTop:0, marginBottom:'10px'}}>Florida HOA Law</h2>
          <p style={{fontSize:'13px', color:'#555', lineHeight:1.7, margin:0}}>
            {isCondo ? (
              <>
                {community.canonical_name} is a condominium association governed by <strong>Florida Statute Chapter 718</strong>.
                Florida condo law requires associations to maintain reserves for major repairs, conduct structural inspections (Milestone Inspections) for buildings three stories or taller, and provide owners with annual budget disclosures.
                Following the 2021 Surfside collapse, Florida passed SB 4-D requiring condos to fund reserves based on structural integrity reports.{' '}
                <a href="/florida-hoa-law" style={{color:'#1D9E75'}}>Read the full Chapter 718 explainer →</a>
              </>
            ) : (
              <>
                {community.canonical_name} is a homeowners association governed by <strong>Florida Statute Chapter 720</strong>.
                Florida HOA law gives owners the right to inspect records, attend board meetings, and vote on major budget items.
                HOAs must provide 48 hours notice for board meetings and 14 days notice for membership meetings. Special assessments over a certain threshold require a membership vote.{' '}
                <a href="/florida-hoa-law" style={{color:'#1D9E75'}}>Read the full Chapter 720 explainer →</a>
              </>
            )}
          </p>
        </div>

        {/* Similar Communities */}
        {similarCommunities.length > 0 && (
          <div style={{backgroundColor:'#fff', border:'1px solid #e5e5e5', borderRadius:'12px', padding:'20px 24px', marginBottom:'12px'}}>
            <h2 style={{fontSize:'15px', fontWeight:600, color:'#1a1a1a', marginTop:0, marginBottom:'12px'}}>Similar Communities in {community.city}</h2>
            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:'10px'}}>
              {similarCommunities.map((s) => (
                <a key={s.slug} href={`/community/${s.slug}`} style={{textDecoration:'none', backgroundColor:'#f9f9f9', border:'1px solid #eee', borderRadius:'10px', padding:'12px 14px'}}>
                  <div style={{fontSize:'13px', fontWeight:600, color:'#1a1a1a', lineHeight:1.3}}>{s.canonical_name}</div>
                  <div style={{fontSize:'11px', color:'#888', marginTop:'4px'}}>
                    {s.unit_count ? `${s.unit_count} units` : ''}
                    {s.unit_count && s.monthly_fee_median ? ' · ' : ''}
                    {s.monthly_fee_median ? `$${s.monthly_fee_median}/mo` : ''}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Last updated */}
        <div style={{fontSize:'11px', color:'#aaa', textAlign:'center', padding:'10px 0'}}>
          Profile last updated: {new Date(community.data_freshness_date || new Date()).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}
        </div>
      </div>

      <FirstReviewToast
        communityId={community.id}
        reviewSectionId={commentFormId}
        monthlyFeeMin={community.monthly_fee_min ?? null}
        managementCompany={community.management_company ?? null}
        reviewCount={liveReviewCount}
        assessmentSignalCount={community.assessment_signal_count ?? null}
      />

      {relatedCommunities && relatedCommunities.length > 0 && (
        <div style={{maxWidth:'720px',margin:'0 auto',padding:'0 32px 32px'}}>
          <div style={{fontSize:'13px',fontWeight:'600',color:'#888',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'12px'}}>
            More HOA communities in {community.city_verified ? community.city : 'Palm Beach County'}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'10px',marginBottom:'12px'}}>
            {relatedCommunities.map((r: any) => (
              <a key={r.id} href={'/community/' + r.slug} style={{textDecoration:'none'}}>
                <div style={{backgroundColor:'#fff',border:'1px solid #e5e5e5',borderRadius:'10px',padding:'14px 16px'}}>
                  <div style={{fontSize:'13px',fontWeight:'500',color:'#1a1a1a',marginBottom:'3px'}}>{r.canonical_name}</div>
                  <div style={{fontSize:'11px',color:'#888'}}>
                    {r.property_type || 'HOA'}
                    {r.monthly_fee_min ? ' · $' + r.monthly_fee_min + '/mo' : ''}
                  </div>
                </div>
             </a>
            ))}
          </div>
          {community.city_verified && (
            <a href={'/cities/' + community.city.toLowerCase().replace(/ /g, '-')} style={{fontSize:'12px',color:'#1D9E75',textDecoration:'none'}}>
              View all HOA communities in {community.city} →
            </a>
          )}
        </div>
      )}

      <footer style={{borderTop: '1px solid #e5e5e5', padding: '24px 16px', textAlign: 'center', fontSize: '12px', color: '#888', marginTop: '20px', lineHeight:'1.6'}}>
        <div>© {new Date().getFullYear()} HOA Agent LLC · All rights reserved · hoa-agent.com</div>
        <div style={{marginTop: '12px'}}>
          <a href={`/claim/${community.slug}`} style={{fontSize: '11px', color: '#bbb', textDecoration: 'none'}}>
            Are you an HOA representative? Claim this page →
          </a>
        </div>
      </footer>
    </main>
  )
}

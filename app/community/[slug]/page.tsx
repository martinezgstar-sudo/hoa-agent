import { supabase } from '@/lib/supabase'
import CommentForm from '@/app/components/CommentForm'
import { notFound } from 'next/navigation'
import ReportModal from '@/app/components/ReportModal'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const { data: community } = await supabase
    .from('communities')
    .select('canonical_name,city,monthly_fee_min,monthly_fee_max,management_company,property_type')
    .eq('slug', slug)
    .single()

  if (!community) return { title: 'Community Not Found — HOA Agent' }

  const feeStr = community.monthly_fee_min && community.monthly_fee_max
    ? 'HOA fees $' + community.monthly_fee_min + '-$' + community.monthly_fee_max + '/mo.'
    : 'HOA fee data available.'

  const title = community.canonical_name + ' — ' + community.city + ' HOA | HOA Agent'
  const description = community.canonical_name + ' is a ' + (community.property_type || 'residential') + ' community in ' + community.city + ', FL. ' + feeStr + ' View fees, assessments, restrictions and management company details.'

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: 'https://hoa-agent.com/community/' + slug,
      siteName: 'HOA Agent',
      type: 'website',
      images: [{ url: 'https://hoa-agent.com/logo.png', width: 400, height: 400, alt: 'HOA Agent' }],
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
  amenities: string
  review_count: number
  review_avg: number
  data_freshness_date: string
  city_verified?: boolean
  website_url?: string
  is_sub_hoa?: boolean
  master_hoa_id?: string
}

async function getCommunity(slug: string) {
  const { data, error } = await supabase
    .from('communities')
    .select('*, city_verified')
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

function getCompletenessLabel(pct: number) {
  if (pct >= 80) return { label: 'Complete', color: '#1D9E75', bg: '#E1F5EE' }
  if (pct >= 50) return { label: 'Partial', color: '#EF9F27', bg: '#FAEEDA' }
  return { label: 'Incomplete', color: '#E24B4A', bg: '#FEE9E9' }
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

  const completeness = getCompletenessScore(community)
  const completenessLabel = getCompletenessLabel(completeness.pct)
  const amenitiesList = community.amenities ? community.amenities.split('|').map((a: string) => a.trim()) : []

  const cityForSearch = community.city_verified ? community.city : null
  const { data: relatedCommunities } = cityForSearch ? await supabase
    .from('communities')
    .select('id,canonical_name,slug,monthly_fee_min,property_type')
    .ilike('city', `%${cityForSearch}%`)
    .eq('status', 'published')
    .neq('slug', slug)
    .limit(4) : { data: [] }

  const commentFormId = 'leave-review'

  // Master HOA data
  let masterHoa: any = null
  if (community.is_sub_hoa && community.master_hoa_id) {
    const { data } = await supabase
      .from('communities')
      .select('id,canonical_name,slug,monthly_fee_min,monthly_fee_max,city')
      .eq('id', community.master_hoa_id)
      .single()
    masterHoa = data
  }

  // Sub-communities data (if this is a master HOA)
  const { data: subCommunities } = await supabase
    .from('communities')
    .select('id,canonical_name,slug,monthly_fee_min,monthly_fee_max,property_type,unit_count')
    .eq('master_hoa_id', community.id)
    .eq('status', 'published')
    .order('canonical_name', { ascending: true })

  return (
    <main style={{fontFamily: 'system-ui, sans-serif', margin: 0, padding: 0, backgroundColor: '#f9f9f9'}}>
      <nav style={{backgroundColor: '#fff', borderBottom: '1px solid #e5e5e5', padding: '0 32px', height: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <a href="/" style={{display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none'}}>
          <span style={{fontSize:"22px",fontWeight:"700",color:"#1B2B6B",letterSpacing:"-0.02em"}}>HOA<span style={{color:"#1D9E75"}}>Agent</span></span>
        </a>
        <div style={{display: 'flex', gap: '12px', alignItems: 'center'}}>
          <a href="/search" style={{fontSize: '13px', color: '#666', textDecoration: 'none'}}>Browse</a>
          <a href="/reports" style={{fontSize: '13px', color: '#666', textDecoration: 'none'}}>Reports</a>
          <a href="/search" style={{fontSize: '13px', backgroundColor: '#1D9E75', color: '#fff', padding: '6px 12px', borderRadius: '6px', whiteSpace: 'nowrap', textDecoration: 'none'}}>Share your HOA</a>
        </div>
      </nav>

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

        {/* SUB-HOA MASTER BANNER */}
        {community.is_sub_hoa && masterHoa && (
          <div style={{backgroundColor: '#FAEEDA', border: '1px solid #EF9F27', borderRadius: '10px', padding: '14px 18px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap'}}>
            <div>
              <div style={{fontSize: '12px', fontWeight: '600', color: '#854F0B', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Sub-community</div>
              <div style={{fontSize: '13px', color: '#633806', lineHeight: '1.5'}}>
                This community is part of <strong>{masterHoa.canonical_name}</strong>. A master HOA fee may apply in addition to this community fee. Always verify total fees with both associations before purchasing.
              </div>
            </div>
            <a href={'/community/' + masterHoa.slug} style={{fontSize: '12px', backgroundColor: '#EF9F27', color: '#fff', padding: '7px 14px', borderRadius: '6px', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0}}>
              View master HOA →
            </a>
          </div>
        )}

        {/* HEADER CARD */}
        <div style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px'}}>
            <div>
              <h1 style={{fontSize: '24px', fontWeight: '600', color: '#1a1a1a', margin: '0 0 6px 0'}}>{community.canonical_name}</h1>
              <div style={{fontSize: '13px', color: '#888', marginBottom: '12px'}}>
                {community.city}, FL{community.zip_code ? ' ' + community.zip_code : ''} · {community.county} County
              </div>
              <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
             {community.property_type && <span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#E6F1FB', color: '#0C447C'}}>{community.property_type}</span>}
                <span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#E1F5EE', color: '#1B2B6B'}}>{community.entity_status || 'Active'} entity</span>
                {community.unit_count && <span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#f0f0f0', color: '#555'}}>{community.unit_count} units</span>}
                {subCommunities && subCommunities.length > 0 && <span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#1B2B6B', color: '#fff'}}>Master HOA</span>}
                {community.is_sub_hoa && <span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#FAEEDA', color: '#854F0B'}}>Sub-community</span>}
              </div>
            </div>
            <div style={{textAlign: 'right', minWidth: '130px'}}>
              <div style={{fontSize: '11px', color: '#888', marginBottom: '6px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px'}}>
                Profile completeness
                <span title="Based on how many fields in this profile are verified vs missing. More resident data raises this score." style={{width: '14px', height: '14px', borderRadius: '50%', backgroundColor: '#f0f0f0', color: '#888', fontSize: '9px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'help', flexShrink: 0}}>?</span>
              </div>
              <div style={{display: 'inline-block', padding: '5px 12px', borderRadius: '20px', backgroundColor: completenessLabel.bg, color: completenessLabel.color, fontSize: '12px', fontWeight: '600', marginBottom: '6px'}}>
                {completenessLabel.label}
              </div>
              <div style={{backgroundColor: '#f0f0f0', borderRadius: '4px', height: '5px', overflow: 'hidden', marginBottom: '4px'}}>
                <div style={{width: completeness.pct + '%', height: '100%', backgroundColor: completenessLabel.color, borderRadius: '4px'}}></div>
              </div>
              <div style={{fontSize: '10px', color: '#aaa'}}>{completeness.filled} of {completeness.total} fields complete</div>
              <div style={{fontSize: '10px', color: '#aaa', marginTop: '2px'}}>Fee reliability: {community.confidence_score || 1}/5</div>
            </div>
          </div>
        </div>

        <div style={{backgroundColor: '#FAEEDA', border: '1px solid #EF9F27', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '12px', color: '#633806', lineHeight: '1.5'}}>
          <strong>Data transparency:</strong> This profile combines public records and resident-submitted data. Each field is labeled by source. Unverified data is clearly marked.
        </div>

        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '12px'}}>
          {[
            {val: community.monthly_fee_min && community.monthly_fee_max ? '$' + community.monthly_fee_min + '–$' + community.monthly_fee_max + '/mo' : 'Unknown', label: 'Monthly fee', src: 'public record'},
            {val: community.review_avg ? community.review_avg + '★' : 'No reviews', label: (community.review_count || 0) + ' reviews', src: 'user-submitted'},
            {val: (community.assessment_signal_count || 0) + ' signals', label: 'Assessments', src: 'public + resident'},
            {val: community.management_company || 'Not listed', label: 'Management', src: 'public record'},
          ].map((stat) => (
            <div key={stat.label} style={{backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '12px', textAlign: 'center'}}>
              <div style={{fontSize: '13px', fontWeight: '500', color: stat.val === 'Not listed' || stat.val === 'Unknown' ? '#aaa' : '#1a1a1a', marginBottom: '2px', wordBreak: 'break-word'}}>{stat.val}</div>
              <div style={{fontSize: '10px', color: '#888', marginBottom: '1px'}}>{stat.label}</div>
              <div style={{fontSize: '9px', color: '#aaa'}}>{stat.src}</div>
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
          <div style={{fontSize: '11px', color: '#aaa'}}>Based on resident submissions and public records. Not a guaranteed fee. Always verify with the HOA directly.</div>
        </div>

        {community.assessment_signal_count > 0 && (
          <div style={{backgroundColor: '#fff', border: '1px solid #EF9F27', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px'}}>
              <div style={{fontSize: '15px', fontWeight: '500', color: '#1a1a1a'}}>Special assessment signals</div>
              <span style={{fontSize: '10px', padding: '2px 8px', borderRadius: '3px', backgroundColor: '#FAEEDA', color: '#854F0B'}}>{community.assessment_signal_count} signals found</span>
            </div>
            <div style={{fontSize: '13px', color: '#666', lineHeight: '1.5'}}>Assessment signals detected. Get the full report for complete details.</div>
          </div>
        )}

        <div style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px'}}>
          <div style={{fontSize: '15px', fontWeight: '500', color: '#1a1a1a', marginBottom: '12px'}}>Management company</div>
          {community.management_company ? (
            <>
              <div style={{fontSize: '15px', fontWeight: '500', color: '#1a1a1a'}}>{community.management_company}</div>
              <div style={{fontSize: '12px', color: '#1D9E75', marginTop: '2px'}}>Public record verified</div>
            </>
          ) : (
            <>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <div style={{fontSize: '14px', color: '#aaa'}}>Not on record</div>
                <a href={'#' + commentFormId} style={{fontSize: '11px', color: '#1D9E75', border: '1px solid #1D9E75', borderRadius: '20px', padding: '3px 10px', textDecoration: 'none', whiteSpace: 'nowrap'}}>+ Know this? Add it</a>
              </div>
              <div style={{fontSize: '11px', color: '#aaa', marginTop: '6px'}}>Management company is one of the most searched fields. Your info helps other residents.</div>
            </>
          )}
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
            {[
              {label: 'Short-term rentals', val: community.str_restriction},
              {label: 'Pets', val: community.pet_restriction},
              {label: 'Commercial vehicles', val: community.vehicle_restriction},
              {label: 'Rental approval', val: community.rental_approval},
            ].map((r) => {
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
                    <a href={'#' + commentFormId} style={{fontSize: '11px', color: '#1D9E75', border: '1px solid #1D9E75', borderRadius: '20px', padding: '2px 9px', textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0}}>+ Add</a>
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
        {subCommunities && subCommunities.length > 0 && (
          <div style={{backgroundColor: '#fff', border: '1px solid #1B2B6B', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px'}}>
            <div>
                <div style={{fontSize: '15px', fontWeight: '500', color: '#1a1a1a'}}>Communities within {community.canonical_name}</div>
                <div style={{fontSize: '12px', color: '#888', marginTop: '2px'}}>{subCommunities.length} sub-communities</div>
              </div>
              <span style={{fontSize: '11px', padding: '3px 10px', borderRadius: '20px', backgroundColor: '#1B2B6B', color: '#fff'}}>Master HOA</span>
            </div>
            <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
              {subCommunities.map((sub: any) => (
                <a key={sub.id} href={'/community/' + sub.slug} style={{textDecoration: 'none'}}>
                  <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: '8px', padding: '10px 14px', cursor: 'pointer'}}>
                    <div>
                      <div style={{fontSize: '13px', fontWeight: '500', color: '#1a1a1a', marginBottom: '2px'}}>{sub.canonical_name}</div>
                      <div style={{fontSize: '11px', color: '#888'}}>{sub.property_type || 'HOA'}{sub.unit_count ? ' · ' + sub.unit_count + ' units' : ''}</div>
                    </div>
                    <div style={{textAlign: 'right', flexShrink: 0}}>
                      <div style={{fontSize: '13px', fontWeight: '500', color: '#1a1a1a'}}>{sub.monthly_fee_min && sub.monthly_fee_max ? '$' + sub.monthly_fee_min + '–$' + sub.monthly_fee_max + '/mo' : 'Fee unknown'}</div>
                      <div style={{fontSize: '11px', color: '#1D9E75'}}>View profile →</div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        <div style={{backgroundColor: '#E1F5EE', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap'}}>
          <div>
            <div style={{fontSize: '15px', fontWeight: '500', color: '#1B2B6B', marginBottom: '4px'}}>Get the full HOA Agent report</div>
            <div style={{fontSize: '12px', color: '#1B2B6B'}}>Fee trend PDF · Full source trail · All assessment signals · Restriction detail · Management history</div>
          </div>
          <ReportModal />
        </div>

        <div style={{backgroundColor: '#1B2B6B', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px'}}>
          <div style={{fontSize: '15px', fontWeight: '500', color: '#fff', marginBottom: '6px'}}>
            Do you live in {community.canonical_name}?
          </div>
          <div style={{fontSize: '12px', color: 'rgba(255,255,255,0.65)', marginBottom: '14px', lineHeight: '1.6'}}>
            This profile is {completeness.pct}% complete. Residents who add missing info help buyers, renters, and neighbors make better decisions. It takes 2 minutes.
          </div>
          <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
            <a href={'#' + commentFormId} style={{fontSize: '12px', backgroundColor: '#1D9E75', color: '#fff', padding: '8px 16px', borderRadius: '6px', textDecoration: 'none', whiteSpace: 'nowrap'}}>Leave a review</a>
            <a href={'#' + commentFormId} style={{fontSize: '12px', backgroundColor: 'rgba(255,255,255,0.12)', color: '#fff', padding: '8px 16px', borderRadius: '6px', textDecoration: 'none', whiteSpace: 'nowrap'}}>Add missing info</a>
          </div>
        </div>

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
      </div>

      {relatedCommunities && relatedCommunities.length > 0 && (
        <div style={{maxWidth:'720px',margin:'0 auto',pad:'0 32px 32px'}}>
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

      <footer style={{borderTop: '1px solid #e5e5e5', padding: '24px 32px', textAlign: 'center', fontSize: '12px', color: '#888', marginTop: '20px'}}>
        <div style={{marginBottom: '8px', fontWeight: '500', color: '#1a1a1a'}}>HOA Agent</div>
        <div>HOA Intelligence Platform · Palm Beach County · © 2026</div>
        <div style={{marginTop:"8px",fontSize:"11px",color:"#aaa",lineHeight:"1.6"}}>HOA Agent provides informational data only. Content is not verified for accuracy and should not be relied upon for legal, financial, or real estate decisions. We are not affiliated with any HOA, management company, or government agency.</div>
      </footer>
    n>
  )
}

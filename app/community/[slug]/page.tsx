import { supabase } from '@/lib/supabase'
import CommentForm from '@/app/components/CommentForm'
import { notFound } from 'next/navigation'

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
}

async function getCommunity(slug: string) {
  const { data, error } = await supabase
    .from('communities')
    .select('*')
    .eq('slug', slug)
    .single()

  if (error || !data) return null
  return data as Community
}

function getConfidenceLabel(score: number) {
  if (score >= 3) return { label: 'High', color: '#1D9E75', bg: '#E1F5EE', stars: '★★★' }
  if (score >= 2) return { label: 'Medium', color: '#EF9F27', bg: '#FAEEDA', stars: '★★☆' }
  return { label: 'Low', color: '#E24B4A', bg: '#FEE9E9', stars: '★☆☆' }
}

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const community = await getCommunity(slug)

  if (!community) notFound()

  const confidence = getConfidenceLabel(community.confidence_score)
  const amenitiesList = community.amenities ? community.amenities.split(',').map((a: string) => a.trim()) : []

  return (
    <main style={{fontFamily: 'system-ui, sans-serif', margin: 0, padding: 0, backgroundColor: '#f9f9f9'}}>
      <nav style={{backgroundColor: '#fff', borderBottom: '1px solid #e5e5e5', padding: '0 32px', height: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <a href="/" style={{display: 'flex', alignItems: 'center', gap: '8px', textDecoration: 'none'}}>
          <img src="/logo.png" alt="HOA Agent" style={{height: '48px', width: 'auto'}}/>
        </a>
        <div style={{display: 'flex', gap: '24px', alignItems: 'center'}}>
          <a href="/" style={{fontSize: '13px', color: '#666', textDecoration: 'none'}}>Search</a>
          <a href="#" style={{fontSize: '13px', color: '#666', textDecoration: 'none'}}>Cities</a>
          <a href="#" style={{fontSize: '13px', color: '#666', textDecoration: 'none'}}>Pricing</a>
          <a href="#" style={{fontSize: '13px', backgroundColor: '#1B2B6B', color: '#fff', padding: '8px 16px', borderRadius: '6px', textDecoration: 'none'}}>Sign in</a>
        </div>
      </nav>

      <div style={{maxWidth: '720px', margin: '0 auto', padding: '24px 32px'}}>
        <div style={{fontSize: '12px', color: '#888', marginBottom: '16px'}}>
          <a href="/" style={{color: '#888', textDecoration: 'none'}}>Florida</a>
          <span style={{margin: '0 6px'}}>›</span>
          <span>{community.county} County</span>
          <span style={{margin: '0 6px'}}>›</span>
          <span>{community.city}</span>
          <span style={{margin: '0 6px'}}>›</span>
          <span style={{color: '#1a1a1a', fontWeight: '500'}}>{community.canonical_name}</span>
        </div>

        <div style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px'}}>
            <div>
              <h1 style={{fontSize: '24px', fontWeight: '600', color: '#1a1a1a', margin: '0 0 6px 0'}}>{community.canonical_name}</h1>
              <div style={{fontSize: '13px', color: '#888', marginBottom: '12px'}}>
                {community.street_address ? `${community.street_address}, ` : ''}{community.city}, FL{community.zip_code ? ` ${community.zip_code}` : ''} · {community.county} County
              </div>
              <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                {community.property_type && <span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#E6F1FB', color: '#0C447C'}}>{community.property_type}</span>}
                <span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#E1F5EE', color: '#1B2B6B'}}>{community.entity_status || 'Active'} entity</span>
                {community.unit_count && <span style={{fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: '#f0f0f0', color: '#555'}}>{community.unit_count} units</span>}
              </div>
            </div>
            <div style={{textAlign: 'right'}}>
              <div style={{fontSize: '12px', color: '#888', marginBottom: '6px'}}>Data confidence</div>
              <div style={{display: 'inline-block', padding: '6px 14px', borderRadius: '20px', backgroundColor: confidence.bg, color: confidence.color, fontSize: '13px', fontWeight: '600', marginBottom: '4px'}}>
                {confidence.stars} {confidence.label}
              </div>
              <div style={{fontSize: '11px', color: '#888', marginTop: '4px'}}>Updated {community.data_freshness_date ? community.data_freshness_date.split('T')[0] : '—'}</div>
            </div>
          </div>
        </div>

        <div style={{backgroundColor: '#FAEEDA', border: '1px solid #EF9F27', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '12px', color: '#633806', lineHeight: '1.5'}}>
          <strong>Data transparency:</strong> This profile combines public records, listing observations, and user-submitted reports. Each field is labeled by source. Unverified data is clearly marked.
        </div>

        <div style={{display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '12px'}}>
          {[
            {val: community.monthly_fee_min && community.monthly_fee_max ? `$${community.monthly_fee_min}–$${community.monthly_fee_max}/mo` : 'Unknown', label: 'Monthly fee', src: 'listing-derived'},
            {val: community.review_avg ? `${community.review_avg}★` : 'No reviews', label: `${community.review_count || 0} reviews`, src: 'user-submitted'},
            {val: `${community.assessment_signal_count || 0} signals`, label: 'Assessments', src: 'listing + user'},
            {val: community.management_company || 'Unknown', label: 'Management', src: 'public record'},
          ].map((stat) => (
            <div key={stat.label} style={{backgroundColor: '#f5f5f5', borderRadius: '8px', padding: '12px', textAlign: 'center'}}>
              <div style={{fontSize: '13px', fontWeight: '500', color: '#1a1a1a', marginBottom: '2px', wordBreak: 'break-word'}}>{stat.val}</div>
              <div style={{fontSize: '10px', color: '#888', marginBottom: '1px'}}>{stat.label}</div>
              <div style={{fontSize: '9px', color: '#aaa'}}>{stat.src}</div>
            </div>
          ))}
        </div>

        <div style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px'}}>
            <div style={{fontSize: '15px', fontWeight: '500', color: '#1a1a1a'}}>HOA fee summary</div>
            <span style={{fontSize: '10px', padding: '2px 8px', borderRadius: '3px', backgroundColor: '#f0f0f0', color: '#666'}}>listing-derived</span>
          </div>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '14px'}}>
            <div>
              <div style={{fontSize: '16px', fontWeight: '500', color: '#1a1a1a'}}>{community.monthly_fee_min && community.monthly_fee_max ? `$${community.monthly_fee_min} – $${community.monthly_fee_max}/mo` : '—'}</div>
              <div style={{fontSize: '11px', color: '#888', marginTop: '2px'}}>Observed range</div>
            </div>
            <div>
              <div style={{fontSize: '16px', fontWeight: '500', color: '#1a1a1a'}}>{community.monthly_fee_median ? `$${community.monthly_fee_median}/mo` : '—'}</div>
              <div style={{fontSize: '11px', color: '#888', marginTop: '2px'}}>Normalized median</div>
            </div>
            <div>
              <div style={{fontSize: '16px', fontWeight: '500', color: '#1a1a1a'}}>{community.fee_observation_count || '—'}{community.fee_observation_count ? ' listings' : ''}</div>
              <div style={{fontSize: '11px', color: '#888', marginTop: '2px'}}>Observations</div>
            </div>
          </div>
          <div style={{fontSize: '11px', color: '#aaa'}}>Based on MLS listing observations. Not a guaranteed fee. Always verify with the HOA directly.</div>
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
          <div style={{fontSize: '15px', fontWeight: '500', color: '#1a1a1a'}}>{community.management_company || 'Unknown'}</div>
          <div style={{fontSize: '12px', color: '#1D9E75', marginTop: '2px'}}>Public record verified</div>
        </div>

        {amenitiesList.length > 0 && (
          <div style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px'}}>
              <div style={{fontSize: '15px', fontWeight: '500', color: '#1a1a1a'}}>Amenities</div>
              <span style={{fontSize: '10px', padding: '2px 8px', borderRadius: '3px', backgroundColor: '#f0f0f0', color: '#666'}}>listing-derived</span>
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
            <span style={{fontSize: '10px', padding: '2px 8px', borderRadius: '3px', backgroundColor: '#f0f0f0', color: '#666'}}>listing + user</span>
          </div>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px'}}>
            {[
              {label: 'Short-term rentals', val: community.str_restriction || 'Unknown'},
              {label: 'Pets', val: community.pet_restriction || 'Unknown'},
              {label: 'Commercial vehicles', val: community.vehicle_restriction || 'Unknown'},
              {label: 'Rental approval', val: community.rental_approval || 'Unknown'},
            ].map((r) => (
              <div key={r.label} style={{display: 'flex', gap: '8px', alignItems: 'flex-start', backgroundColor: '#f9f9f9', borderRadius: '8px', padding: '8px 10px'}}>
                <span style={{fontSize: '13px', color: r.val.toLowerCase().includes('prohibit') ? '#E24B4A' : r.val === 'Unknown' ? '#EF9F27' : '#1D9E75', flexShrink: 0}}>
                  {r.val.toLowerCase().includes('prohibit') ? '✕' : r.val === 'Unknown' ? '?' : '✓'}
                </span>
                <div>
                  <div style={{fontSize: '12px', color: '#1a1a1a'}}>{r.label}</div>
                  <div style={{fontSize: '11px', color: '#888'}}>{r.val}</div>
                </div>
              </div>
        ))}
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

        <div style={{backgroundColor: '#E1F5EE', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap'}}>
          <div>
            <div style={{fontSize: '15px', fontWeight: '500', color: '#1B2B6B', marginBottom: '4px'}}>Get the full HOA Agent report</div>
            <div style={{fontSize: '12px', color: '#1B2B6B'}}>Fee trend PDF · Full source trail · All assessment signals · Restriction detail · Management history</div>
          </div>
          <button style={{fontSize: '13px', padding: '10px 20px', borderRadius: '8px', backgroundColor: '#1B2B6B', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '500', whiteSpace: 'nowrap'}}>Get report — $29</button>
        </div>

        <CommentForm communityId={community.id} />

        <div style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px 24px', marginBottom: '12px'}}>
          <div style={{fontSize: '15px', fontWeight: '500', color: '#1a1a1a', marginBottom: '12px'}}>Source trail</div>
          <div style={{display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px'}}>
            <div><strong style={{fontWeight: '500'}}>Florida Division of Corporations</strong> <span style={{color: '#888'}}>— Entity, registered agent, status.</span></div>
            <div><strong style={{fontWeight: '500'}}>MLS listing data ({community.fee_observation_count || 0} observations)</strong> <span style={{color: '#888'}}>— Fee range, restrictions, assessment mentions.</span></div>
            <div><strong style={{fontWeight: '500'}}>User submissions</strong> <span style={{color: '#888'}}>— Additional data points. Unverified.</span></div>
          </div>
          <div style={{marginTop: '12px', fontSize: '12px'}}><a href="#" style={{color: '#1D9E75'}}>Submit a correction or additional source →</a>
          </div>
        </div>
      </div>

      <footer style={{borderTop: '1px solid #e5e5e5', padding: '24px 32px', textAlign: 'center', fontSize: '12px', color: '#888', marginTop: '20px'}}>
        <div style={{marginBottom: '8px', fontWeight: '500', color: '#1a1a1a'}}>HOA Agent</div>
        <div>Florida HOA intelligence platform · Palm Beach County · © 2026</div>
      </footer>
    </main>
  )
}

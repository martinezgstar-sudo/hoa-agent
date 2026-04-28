import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink, Lock, Scale, ShieldAlert } from 'lucide-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function CommunityLegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const { data: community } = await supabase
    .from('communities')
    .select('id, canonical_name, city, zip_code, property_type')
    .eq('slug', slug)
    .single()

  if (!community) notFound()

  const { data: matched } = await supabase
    .from('community_legal_cases')
    .select('legal_case_id')
    .eq('community_id', community.id)
    .eq('status', 'approved')

  let cases: any[] = []

  if (matched && matched.length > 0) {
    const ids = matched.map((m: any) => m.legal_case_id)
    const { data } = await supabase
      .from('legal_cases')
      .select('id, case_name, court, docket_number, date_filed, absolute_url, ai_summary, tags, snippet')
      .eq('status', 'published')
      .in('id', ids)
      .order('date_filed', { ascending: false })
    cases = data || []
  }

  const FREE_LIMIT = 1

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatTag = (tag: string) => {
    return tag.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 16px' }}>
      <Link href={`/community/${slug}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#1B2B6B', textDecoration: 'none', marginBottom: '20px', fontWeight: 500 }}>
        <ArrowLeft size={14} /> Back to {community.canonical_name}
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
        <Scale size={20} color="#7c3aed" />
        <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#1a1a1a' }}>Litigation Record</h1>
      </div>
      <p style={{ fontSize: '13px', color: '#888', marginBottom: '20px' }}>
        {community.canonical_name} · {community.city}
      </p>

      <div style={{ backgroundColor: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '12px', padding: '16px 20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <ShieldAlert size={16} color="#7c3aed" />
          <span style={{ fontSize: '13px', fontWeight: '600', color: '#7c3aed' }}>
            {cases.length} court record{cases.length !== 1 ? 's' : ''} found
          </span>
        </div>
        <p style={{ fontSize: '12px', color: '#666', lineHeight: '1.6' }}>
          Cases are sourced from CourtListener, a public legal database maintained by the Free Law Project. Records include Florida state and federal court opinions. Case names, docket numbers, and court citations are as filed. HOA Agent does not verify the accuracy of court records — always confirm directly with the court or a licensed attorney.
        </p>
      </div>

      {cases.length === 0 && (
        <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '20px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: '#16a34a', fontWeight: '600', marginBottom: '4px' }}>No court records found</p>
          <p style={{ fontSize: '12px', color: '#666' }}>No published court opinions were matched to this community in our database. This does not mean no litigation exists.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {cases.map((c, index) => {
          const isLocked = index >= FREE_LIMIT
          return (
            <div key={c.id} style={{ position: 'relative', backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '16px 20px', overflow: 'hidden' }}>
              {isLocked && (
                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(4px)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                  <Lock size={18} color="#7c3aed" />
                  <p style={{ fontSize: '13px', fontWeight: '600', color: '#7c3aed', margin: '8px 0 4px' }}>Unlock Full Litigation Record</p>
                  <p style={{ fontSize: '11px', color: '#888', marginBottom: '12px', textAlign: 'center', maxWidth: '200px' }}>Get all court cases, docket numbers, and full case summaries</p>
                  <button style={{ backgroundColor: '#7c3aed', color: '#fff', fontSize: '12px', fontWeight: '600', padding: '8px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>
                    Unlock for $2.99
                  </button>
                </div>
              )}
              <div style={{ filter: isLocked ? 'blur(3px)' : 'none', userSelect: isLocked ? 'none' : 'auto' }}>
                <a href={c.absolute_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a', textDecoration: 'none', lineHeight: '1.4', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                  {c.case_name}
                  <ExternalLink size={12} style={{ flexShrink: 0, marginTop: '3px', color: '#aaa' }} />
                </a>
                {c.ai_summary && (
                  <p style={{ fontSize: '12px', color: '#555', marginTop: '8px', lineHeight: '1.6', backgroundColor: '#f9f9f9', padding: '10px', borderRadius: '8px' }}>{c.ai_summary}</p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                  <span style={{ fontSize: '11px', fontWeight: '500', color: '#7c3aed', backgroundColor: '#f5f3ff', padding: '2px 8px', borderRadius: '20px' }}>{c.court}</span>
                  {c.date_filed && <span style={{ fontSize: '11px', color: '#aaa' }}>{formatDate(c.date_filed)}</span>}
                  {c.docket_number && <span style={{ fontSize: '11px', color: '#aaa' }}>Docket #{c.docket_number}</span>}
                  {(c.tags || []).map((tag: string) => (
                    <span key={tag} style={{ fontSize: '10px', backgroundColor: '#f3f4f6', color: '#555', padding: '2px 8px', borderRadius: '20px' }}>{formatTag(tag)}</span>
                  ))}
                </div>
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', color: '#aaa' }}>Source:</span>
                  <a href={c.absolute_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '10px', color: '#1B2B6B', fontWeight: 500 }}>CourtListener.com</a>
                  <span style={{ fontSize: '10px', color: '#aaa' }}>· Free Law Project · Public domain</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: '24px', padding: '16px 20px', backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px solid #e5e5e5' }}>
        <p style={{ fontSize: '11px', color: '#888', lineHeight: '1.7', margin: 0 }}>
          <strong>Disclaimer:</strong> Court records displayed on this page are sourced from CourtListener (courtlistener.com), a public legal database operated by the Free Law Project, a 501(c)(3) nonprofit. HOA Agent aggregates and displays this information as a public service. HOA Agent does not verify, interpret, or warrant the accuracy, completeness, or currentness of any court record. Case matching to specific communities is performed algorithmically and may not be exact. Users should independently verify all legal information with the relevant court, public records office, or a licensed Florida attorney before making any decisions. Nothing on this page constitutes legal advice.
        </p>
      </div>
    </div>
  )
}

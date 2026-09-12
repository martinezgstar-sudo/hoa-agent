// /admin/review — Phase 10d admin Review surface (v3).
//
// Server-rendered list of every in-market needs_review row, ordered by
// confidence_score desc so the closest-to-publish rows surface first.
// The five *_source columns are shown as read-only chips per row so the
// reviewer can judge quickly whether each block was verified or skipped.
// Approve / Reject actions live in a small client child that POSTs to
// /api/admin/review; both actions write a change_log row (approved OR
// rejected) with source='admin' and, on reject, the selected reason.
//
// Middleware gates /admin/* via the signed hoa_admin cookie.
// verification_status is set to 'verified' on approve per owner ruling
// 2026-09-12.

import { createClient } from '@supabase/supabase-js'
import ReviewClient from './ReviewClient'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface Row {
  id: string
  slug: string
  canonical_name: string
  city: string | null
  county: string
  zip_code: string | null
  confidence_score: number | null
  identity_source:   string | null
  location_source:   string | null
  management_source: string | null
  fees_source:       string | null
  pickup_source:     string | null
}

const IN_MARKET = ['Palm Beach']   // matches config/enrich.yaml in_market_counties

async function load(): Promise<Row[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return []
  const sb = createClient(url, key, { auth: { persistSession: false } })
  const { data } = await sb
    .from('communities')
    .select('id,slug,canonical_name,city,county,zip_code,confidence_score,identity_source,location_source,management_source,fees_source,pickup_source')
    .eq('status', 'needs_review')
    .in('county', IN_MARKET)
    .order('confidence_score', { ascending: false, nullsFirst: false })
    .limit(200)
  return (data ?? []) as Row[]
}

function SourceChip({ label, value }: { label: string; value: string | null }) {
  const filled = value != null && value !== ''
  const bg = filled ? '#e8f9f2' : '#f5f5f5'
  const fg = filled ? '#06875e' : '#8a8a8a'
  return (
    <span
      title={filled ? `${label}: ${value}` : `${label}: (unset)`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        padding: '3px 8px', borderRadius: '10px',
        backgroundColor: bg, color: fg,
        fontSize: '11px', fontWeight: 500, whiteSpace: 'nowrap',
      }}
    >
      {label}{filled ? `: ${value}` : ''}
    </span>
  )
}

export default async function ReviewPage() {
  const rows = await load()
  return (
    <main style={{ maxWidth: '1100px', margin: '32px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '11px', color: '#8a8a8a', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
          Admin · Phase 10d
        </div>
        <h1 style={{ fontSize: '24px', margin: 0 }}>Review — needs_review queue</h1>
        <p style={{ color: '#595959', fontSize: '13px', marginTop: '6px' }}>
          {rows.length} row{rows.length === 1 ? '' : 's'} awaiting Approve / Reject. In-market only ({IN_MARKET.join(', ')}).
          Ordered by confidence score, highest first. Every action writes a change_log row with source=&quot;admin&quot;.
        </p>
      </header>

      {rows.length === 0 && (
        <div style={{ padding: '32px', backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', color: '#595959' }}>
          The needs_review queue is empty. Nothing to do.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {rows.map((r) => (
          <div key={r.id} style={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', lineHeight: 1.3 }}>
                  {r.canonical_name || r.slug}
                </div>
                <div style={{ fontSize: '12px', color: '#595959', marginTop: '2px' }}>
                  <a href={`/community/${r.slug}`} target="_blank" rel="noopener" style={{ color: '#06875e', textDecoration: 'none' }}>
                    /community/{r.slug}
                  </a>
                  {' · '}{[r.city, r.county, r.zip_code].filter(Boolean).join(' · ')}
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: '90px' }}>
                <div style={{ fontSize: '11px', color: '#595959', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Score</div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: (r.confidence_score ?? 0) >= 70 ? '#06875e' : '#c0392b' }}>
                  {r.confidence_score ?? '—'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
              <SourceChip label="identity"   value={r.identity_source} />
              <SourceChip label="location"   value={r.location_source} />
              <SourceChip label="management" value={r.management_source} />
              <SourceChip label="fees"       value={r.fees_source} />
              <SourceChip label="pickup"     value={r.pickup_source} />
            </div>

            <div style={{ marginTop: '14px' }}>
              <ReviewClient id={r.id} slug={r.slug} />
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}

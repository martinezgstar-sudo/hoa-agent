'use client'

import { useMemo, useState } from 'react'

type Community = {
  id: string
  canonical_name: string
  slug: string
  city: string
  monthly_fee_min: number | null
  monthly_fee_max: number | null
  property_type: string | null
  review_count: number | null
  review_avg: number | null
  management_company: string | null
  entity_status: string | null
}

export default function CitySearch({
  city,
  communities,
}: {
  city: string
  communities: Community[]
}) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return communities
    return communities.filter((c) =>
      String(c.canonical_name || '').toLowerCase().includes(q),
    )
  }, [communities, query])

  return (
    <>
      <div style={{ position: 'relative', marginBottom: '12px' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search communities in ${city}...`}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            backgroundColor: '#fff',
            border: '1px solid #e5e5e5',
            borderRadius: '8px',
            padding: '10px 14px',
            fontSize: '14px',
            color: '#1a1a1a',
          }}
        />
        {query.trim().length > 0 && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            style={{
              position: 'absolute',
              right: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              border: 'none',
              background: 'transparent',
              color: '#888',
              fontSize: '18px',
              lineHeight: 1,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ×
          </button>
        )}
      </div>

      <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>
        Showing {filtered.length} of {communities.length} communities
      </div>

      {filtered.length > 0 ? (
        <div>
          {filtered.map((c) => (
            <a key={c.id} href={'/community/' + c.slug} style={{ textDecoration: 'none' }}>
              <div
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e5e5',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  marginBottom: '10px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: '15px',
                      fontWeight: '500',
                      color: '#1a1a1a',
                      marginBottom: '3px',
                    }}
                  >
                    {c.canonical_name}
                  </div>
                  <div style={{ fontSize: '12px', color: '#888' }}>
                    {c.property_type || 'HOA'}
                    {c.management_company ? ' · ' + c.management_company : ''}
                    {c.entity_status ? ' · ' + c.entity_status : ''}
                  </div>
                  {(c.review_count || 0) > 0 && (
                    <div style={{ fontSize: '11px', color: '#1D9E75', marginTop: '4px' }}>
                      {'★'.repeat(Math.round(c.review_avg || 0))} {c.review_avg} · {c.review_count}{' '}
                      review{c.review_count !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '16px' }}>
                  {c.monthly_fee_min ? (
                    <div style={{ fontSize: '15px', fontWeight: '600', color: '#1a1a1a' }}>
                      ${c.monthly_fee_min}
                      {c.monthly_fee_max && c.monthly_fee_max !== c.monthly_fee_min
                        ? '–$' + c.monthly_fee_max
                        : ''}
                      /mo
                    </div>
                  ) : (
                    <div style={{ fontSize: '12px', color: '#aaa' }}>Fee unknown</div>
                  )}
                  <div style={{ fontSize: '11px', color: '#1D9E75', marginTop: '4px' }}>
                    View profile →
                  </div>
                </div>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888', fontSize: '14px' }}>
          No communities match &quot;{query}&quot;.
        </div>
      )}
    </>
  )
}

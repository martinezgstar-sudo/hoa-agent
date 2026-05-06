'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

const ADMIN_PASSWORD = 'Valean2008!'

type CommunityMatch = {
  id: string
  community_id: string
  match_confidence: number
  match_reason: string
  status: 'pending' | 'approved' | 'rejected'
  admin_notes?: string | null
  link_source?: 'auto' | 'manual' | string | null
  linked_by?: string | null
  linked_at?: string | null
  communities?: {
    id: string
    canonical_name: string
    slug: string
    city?: string | null
  } | null
}

type CommunityLite = {
  id: string
  canonical_name: string
  slug: string
  city: string | null
  zip_code: string | null
  master_hoa_id: string | null
}

type CityFilter = { name: string; count: number }
type MasterFilter = { id: string; canonical_name: string; sub_count: number; city?: string | null }

type NewsItem = {
  id: string
  title: string
  url: string
  source: string | null
  published_date: string | null
  ai_summary: string | null
  ai_extracted_hoas: { sentiment?: string } | null
  gdelt_tone: number | null
  status: 'pending' | 'approved' | 'rejected'
  community_news: CommunityMatch[]
}

type TabKey = 'pending' | 'approved' | 'rejected'

const SENTIMENT_COLORS: Record<string, { bg: string; color: string }> = {
  positive: { bg: '#E1F5EE', color: '#1B2B6B' },
  negative: { bg: '#FEE9E9', color: '#A32D2D' },
  neutral: { bg: '#f0f0f0', color: '#555' },
}

function fmtDate(d?: string | null) {
  if (!d) return 'Unknown date'
  const dt = new Date(d)
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function NewsAdminPage() {
  const [authed, setAuthed] = useState(
    typeof window !== 'undefined' && sessionStorage.getItem('hoa_admin') === 'true',
  )
  const [password, setPassword] = useState('')
  const [tab, setTab] = useState<TabKey>('pending')
  const [items, setItems] = useState<NewsItem[]>([])
  const [counts, setCounts] = useState<Record<TabKey, number>>({
    pending: 0,
    approved: 0,
    rejected: 0,
  })
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string>('')
  const [error, setError] = useState('')
  const [cities, setCities] = useState<CityFilter[]>([])
  const [masters, setMasters] = useState<MasterFilter[]>([])

  useEffect(() => {
    if (!authed) return
    // Load filters once
    fetch('/api/admin/communities/filters', { headers: { 'x-admin-password': ADMIN_PASSWORD } })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.cities)) setCities(d.cities)
        if (Array.isArray(d.masters)) setMasters(d.masters)
      })
      .catch(() => {})
  }, [authed])

  const tabs = useMemo(
    () => [
      { key: 'pending' as const, label: 'Pending' },
      { key: 'approved' as const, label: 'Approved' },
      { key: 'rejected' as const, label: 'Rejected' },
    ],
    [],
  )

  async function load(status: TabKey) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/news?status=${status}`, {
        headers: { 'x-admin-password': ADMIN_PASSWORD },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load')
      setItems((data.items || []) as NewsItem[])
      setCounts(
        (data.counts || {
          pending: 0,
          approved: 0,
          rejected: 0,
        }) as Record<TabKey, number>,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authed) return
    load(tab)
  }, [authed, tab])

  async function patchStatus(
    payload: { type: 'news_item' | 'community_news'; id: string; status: string; admin_notes?: string },
    noReload?: boolean,
  ) {
    setBusyId(payload.id)
    try {
      const res = await fetch('/api/admin/news', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-password': ADMIN_PASSWORD,
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Update failed')
      if (!noReload) await load(tab)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusyId('')
    }
  }

  async function approveAllMatches(item: NewsItem) {
    setBusyId(item.id)
    try {
      // Approve every still-pending community_news row regardless of source
      // (auto matches from the AI extractor and manual links added by admin
      // both flow through the same approval workflow).
      const pendingMatches = (item.community_news || []).filter((m) => m.status === 'pending')
      for (const m of pendingMatches) {
        await patchStatus(
          {
            type: 'community_news',
            id: m.id,
            status: 'approved',
            admin_notes: m.link_source === 'manual'
              ? 'Approved with article (manual link)'
              : 'Approved via bulk action',
          },
          true,
        )
      }
      await patchStatus({
        type: 'news_item',
        id: item.id,
        status: 'approved',
        admin_notes: `Approved · ${pendingMatches.length} community link${pendingMatches.length === 1 ? '' : 's'} approved`,
      })
    } finally {
      setBusyId('')
    }
  }

  async function linkCommunities(itemId: string, payload: Record<string, unknown>) {
    const res = await fetch(`/api/admin/news/${itemId}/link-communities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': ADMIN_PASSWORD,
      },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Link failed')
    return data
  }

  async function unlinkCommunityNews(itemId: string, communityNewsId: string) {
    const res = await fetch(`/api/admin/news/${itemId}/link-communities`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': ADMIN_PASSWORD,
      },
      body: JSON.stringify({ community_news_ids: [communityNewsId] }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Unlink failed')
    return data
  }

  async function rejectEntireArticle(item: NewsItem) {
    setBusyId(item.id)
    try {
      for (const m of item.community_news || []) {
        if (m.status !== 'rejected') {
          await patchStatus(
            {
              type: 'community_news',
              id: m.id,
              status: 'rejected',
              admin_notes: 'Rejected with article',
            },
            true,
          )
        }
      }
      await patchStatus({
        type: 'news_item',
        id: item.id,
        status: 'rejected',
        admin_notes: 'Article rejected',
      })
    } finally {
      setBusyId('')
    }
  }

  if (!authed) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#f9f9f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui,sans-serif',
        }}
      >
        <div
          style={{
            backgroundColor: '#fff',
            border: '1px solid #e5e5e5',
            borderRadius: '16px',
            padding: '40px',
            width: '340px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#1B2B6B', marginBottom: '4px' }}>
            HOA<span style={{ color: '#1D9E75' }}>Agent</span>
          </div>
          <div style={{ fontSize: '13px', color: '#888', marginBottom: '28px' }}>Admin News</div>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && password === ADMIN_PASSWORD) {
                setAuthed(true)
                sessionStorage.setItem('hoa_admin', 'true')
              }
            }}
            style={{
              width: '100%',
              padding: '11px 14px',
              borderRadius: '8px',
              border: '1.5px solid #e5e5e5',
              fontSize: '14px',
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: '12px',
            }}
          />
          <button
            onClick={() => {
              if (password === ADMIN_PASSWORD) {
                setAuthed(true)
                sessionStorage.setItem('hoa_admin', 'true')
              } else {
                alert('Wrong password')
              }
            }}
            style={{
              width: '100%',
              padding: '11px',
              borderRadius: '8px',
              backgroundColor: '#1B2B6B',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            Sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <main style={{ fontFamily: 'system-ui,sans-serif', backgroundColor: '#f9f9f9', minHeight: '100vh' }}>
      <nav
        style={{
          backgroundColor: '#fff',
          borderBottom: '1px solid #e5e5e5',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: '64px',
        }}
      >
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: '20px', fontWeight: '700', color: '#1B2B6B' }}>
            HOA<span style={{ color: '#1D9E75' }}>Agent</span>
          </span>
        </Link>
        <Link href="/admin" style={{ fontSize: '12px', color: '#888', textDecoration: 'none' }}>
          Back to admin
        </Link>
      </nav>

      <div style={{ backgroundColor: '#fff', borderBottom: '1px solid #e5e5e5', padding: '0 24px', display: 'flex' }}>
        <a
          href="/admin"
          style={{
            padding: '16px 20px',
            borderBottom: '3px solid transparent',
            backgroundColor: 'transparent',
            color: '#666',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '400',
            textDecoration: 'none',
          }}
        >
          Comments
        </a>
        <a
          href="/admin"
          style={{
            padding: '16px 20px',
            borderBottom: '3px solid transparent',
            backgroundColor: 'transparent',
            color: '#666',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '400',
            textDecoration: 'none',
          }}
        >
          Add Community
        </a>
        <a
          href="/admin"
          style={{
            padding: '16px 20px',
            borderBottom: '3px solid transparent',
            backgroundColor: 'transparent',
            color: '#666',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '400',
            textDecoration: 'none',
          }}
        >
          CSV Upload
        </a>
        <a
          href="/admin"
          style={{
            padding: '16px 20px',
            borderBottom: '3px solid transparent',
            backgroundColor: 'transparent',
            color: '#666',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '400',
            textDecoration: 'none',
          }}
        >
          Suggestions
        </a>
        <a
          href="/admin"
          style={{
            padding: '16px 20px',
            borderBottom: '3px solid transparent',
            backgroundColor: 'transparent',
            color: '#666',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '400',
            textDecoration: 'none',
          }}
        >
          Field Updates
        </a>
        <a
          href="/admin/news"
          style={{
            padding: '16px 20px',
            borderBottom: '3px solid #1B2B6B',
            backgroundColor: 'transparent',
            color: '#1B2B6B',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '600',
            textDecoration: 'none',
          }}
        >
          News
        </a>
      </div>

      <div style={{ maxWidth: '980px', margin: '0 auto', padding: '28px 20px' }}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                border: '1px solid #e5e5e5',
                borderRadius: '999px',
                backgroundColor: tab === t.key ? '#1B2B6B' : '#fff',
                color: tab === t.key ? '#fff' : '#555',
                padding: '7px 14px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {t.label}
              <span
                style={{
                  fontSize: '11px',
                  borderRadius: '999px',
                  padding: '2px 8px',
                  backgroundColor: tab === t.key ? 'rgba(255,255,255,0.2)' : '#f0f0f0',
                  color: tab === t.key ? '#fff' : '#555',
                }}
              >
                {counts[t.key] || 0}
              </span>
            </button>
          ))}
        </div>

        {error && (
          <div
            style={{
              padding: '12px 14px',
              backgroundColor: '#FEE9E9',
              color: '#A32D2D',
              borderRadius: '8px',
              marginBottom: '14px',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        {loading && <div style={{ color: '#888', fontSize: '14px' }}>Loading...</div>}
        {!loading && items.length === 0 && (
          <div style={{ color: '#888', fontSize: '14px' }}>No {tab} news items.</div>
        )}

        {!loading &&
          items.map((item) => {
            const sentiment = String(item.ai_extracted_hoas?.sentiment || 'neutral').toLowerCase()
            const sentimentStyle = SENTIMENT_COLORS[sentiment] || SENTIMENT_COLORS.neutral
            const visibleMatches =
              tab === 'pending'
                ? (item.community_news || []).filter((m) => m.status === 'pending')
                : tab === 'approved'
                  ? (item.community_news || []).filter((m) => m.status === 'approved')
                  : (item.community_news || []).filter((m) => m.status === 'rejected')

            return (
              <div
                key={item.id}
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #e5e5e5',
                  borderRadius: '12px',
                  padding: '18px 20px',
                  marginBottom: '14px',
                }}
              >
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: '17px', fontWeight: 600, color: '#1a1a1a', textDecoration: 'none' }}
                >
                  {item.title}
                </a>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '6px' }}>
                  {item.source || 'Unknown source'} · {fmtDate(item.published_date)}
                </div>

                <div style={{ marginTop: '10px', fontSize: '13px', color: '#444', lineHeight: 1.6 }}>
                  {item.ai_summary || 'No summary'}
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '11px',
                      borderRadius: '999px',
                      padding: '3px 10px',
                      backgroundColor: sentimentStyle.bg,
                      color: sentimentStyle.color,
                      textTransform: 'capitalize',
                    }}
                  >
                    {sentiment}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      borderRadius: '999px',
                      padding: '3px 10px',
                      backgroundColor: '#f0f0f0',
                      color: '#555',
                    }}
                  >
                    GDELT tone: {item.gdelt_tone ?? 0}
                  </span>
                </div>

                <div style={{ marginTop: '16px', fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>
                  Matched communities
                </div>

                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {visibleMatches.length === 0 && (
                    <div style={{ fontSize: '12px', color: '#888' }}>No matches in this state.</div>
                  )}
                  {visibleMatches.map((m) => (
                    <div
                      key={m.id}
                      style={{ border: '1px solid #f0f0f0', borderRadius: '10px', padding: '12px 14px' }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                        <div>
                          {m.communities?.slug ? (
                            <a
                              href={`/community/${m.communities.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                fontSize: '13px',
                                fontWeight: 600,
                                color: '#1B2B6B',
                                textDecoration: 'none',
                              }}
                            >
                              {m.communities.canonical_name || 'Unknown community'}
                            </a>
                          ) : (
                            <div style={{ fontSize: '13px', fontWeight: 600, color: '#1B2B6B' }}>
                              Unknown community
                            </div>
                          )}
                          <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                            Confidence: {Math.round((m.match_confidence || 0) * 100)}%
                          </div>
                          <div style={{ fontSize: '11px', color: '#666', marginTop: '3px' }}>
                            {m.match_reason || 'No reason'}
                          </div>
                        </div>
                      </div>

                      {tab === 'pending' && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                          <button
                            onClick={() =>
                              patchStatus({
                                type: 'community_news',
                                id: m.id,
                                status: 'approved',
                                admin_notes: 'Approved match',
                              })
                            }
                            disabled={busyId === m.id || busyId === item.id}
                            style={{
                              fontSize: '12px',
                              border: 'none',
                              borderRadius: '7px',
                              backgroundColor: '#1D9E75',
                              color: '#fff',
                              padding: '6px 12px',
                              cursor: 'pointer',
                            }}
                          >
                            Approve match
                          </button>
                          <button
                            onClick={() =>
                              patchStatus({
                                type: 'community_news',
                                id: m.id,
                                status: 'rejected',
                                admin_notes: 'Rejected match',
                              })
                            }
                            disabled={busyId === m.id || busyId === item.id}
                            style={{
                              fontSize: '12px',
                              border: '1px solid #E24B4A',
                              borderRadius: '7px',
                              backgroundColor: '#fff',
                              color: '#E24B4A',
                              padding: '6px 12px',
                              cursor: 'pointer',
                            }}
                          >
                            Reject match
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {tab === 'pending' && (
                  <ManualLinker
                    newsItemId={item.id}
                    cities={cities}
                    masters={masters}
                    existing={item.community_news || []}
                    onChanged={() => load(tab)}
                  />
                )}

                <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {tab === 'pending' && (
                    <>
                      <button
                        onClick={() => approveAllMatches(item)}
                        disabled={busyId === item.id}
                        style={{
                          fontSize: '12px',
                          border: 'none',
                          borderRadius: '7px',
                          backgroundColor: '#1B2B6B',
                          color: '#fff',
                          padding: '7px 12px',
                          cursor: 'pointer',
                        }}
                      >
                        Approve all matches
                      </button>
                      <button
                        onClick={() => rejectEntireArticle(item)}
                        disabled={busyId === item.id}
                        style={{
                          fontSize: '12px',
                          border: '1px solid #E24B4A',
                          borderRadius: '7px',
                          backgroundColor: '#fff',
                          color: '#E24B4A',
                          padding: '7px 12px',
                          cursor: 'pointer',
                        }}
                      >
                        Reject article entirely
                      </button>
                    </>
                  )}

                  {tab === 'approved' && (
                    <button
                      onClick={() =>
                        patchStatus({
                          type: 'news_item',
                          id: item.id,
                          status: 'pending',
                          admin_notes: 'Revoked to pending',
                        })
                      }
                      disabled={busyId === item.id}
                      style={{
                        fontSize: '12px',
                        border: '1px solid #ddd',
                        borderRadius: '7px',
                        backgroundColor: '#fff',
                        color: '#555',
                        padding: '7px 12px',
                        cursor: 'pointer',
                      }}
                    >
                      Revoke
                    </button>
                  )}

                  {tab === 'rejected' && (
                    <button
                      onClick={() =>
                        patchStatus({
                          type: 'news_item',
                          id: item.id,
                          status: 'pending',
                          admin_notes: 'Restored to pending',
                        })
                      }
                      disabled={busyId === item.id}
                      style={{
                        fontSize: '12px',
                        border: '1px solid #ddd',
                        borderRadius: '7px',
                        backgroundColor: '#fff',
                        color: '#555',
                        padding: '7px 12px',
                        cursor: 'pointer',
                      }}
                    >
                      Restore
                    </button>
                  )}
                </div>
              </div>
            )
          })}
      </div>
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ManualLinker — inline component used per news article
// ─────────────────────────────────────────────────────────────────────────────

function ManualLinker(props: {
  newsItemId: string
  cities: CityFilter[]
  masters: MasterFilter[]
  existing: CommunityMatch[]
  onChanged: () => void
}) {
  const { newsItemId, cities, masters, existing, onChanged } = props
  const [city, setCity] = useState<string>('')
  const [masterId, setMasterId] = useState<string>('')
  const [q, setQ] = useState<string>('')
  const [results, setResults] = useState<CommunityLite[]>([])
  const [picked, setPicked] = useState<CommunityLite[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string>('')

  const existingIds = new Set((existing || []).map((m) => m.community_id))

  // Throttled type-ahead
  useEffect(() => {
    const ctrl = new AbortController()
    const t = setTimeout(async () => {
      // Don't search unless one of: q (>=2 chars), city, or masterId
      if (!q && !city && !masterId) {
        setResults([])
        return
      }
      if (q && q.length < 2 && !city && !masterId) {
        setResults([])
        return
      }
      try {
        const params = new URLSearchParams()
        if (q) params.set('q', q)
        if (city) params.set('city', city)
        if (masterId) params.set('master_hoa_id', masterId)
        params.set('limit', '20')
        const r = await fetch('/api/admin/communities/search?' + params.toString(), {
          headers: { 'x-admin-password': ADMIN_PASSWORD },
          signal: ctrl.signal,
        })
        const data = await r.json()
        setResults((data.communities || []) as CommunityLite[])
      } catch {
        // swallow
      }
    }, 220)
    return () => {
      clearTimeout(t)
      ctrl.abort()
    }
  }, [q, city, masterId])

  function add(c: CommunityLite) {
    if (existingIds.has(c.id)) return
    if (picked.find((p) => p.id === c.id)) return
    setPicked([...picked, c])
  }
  function remove(id: string) {
    setPicked(picked.filter((p) => p.id !== id))
  }

  async function saveLinks() {
    if (picked.length === 0) return
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch(`/api/admin/news/${newsItemId}/link-communities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': ADMIN_PASSWORD },
        body: JSON.stringify({
          community_ids: picked.map((p) => p.id),
          status: 'pending',
          linked_by: 'admin',
          match_reason: 'Manually linked by admin',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Link failed')
      setMsg(`Linked ${data.inserted} (skipped ${data.skipped} already linked)`)
      setPicked([])
      onChanged()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Link failed')
    } finally {
      setBusy(false)
    }
  }

  async function bulkLinkCity() {
    if (!city) return
    const cnt = cities.find((c) => c.name === city)?.count ?? 0
    const ok = window.confirm(
      `Link this article to ALL ${cnt} published communities in ${city}? This is hard to undo.`,
    )
    if (!ok) return
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch(`/api/admin/news/${newsItemId}/link-communities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': ADMIN_PASSWORD },
        body: JSON.stringify({ city, status: 'pending', linked_by: 'admin', match_reason: `Bulk-linked: all in ${city}` }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Bulk link failed')
      setMsg(`Bulk linked ${data.inserted} (skipped ${data.skipped} already linked)`)
      onChanged()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Bulk link failed')
    } finally {
      setBusy(false)
    }
  }

  async function unlinkRow(community_news_id: string) {
    if (!window.confirm('Unlink this manual community? Auto-matched links cannot be unlinked here.')) return
    setBusy(true)
    setMsg('')
    try {
      const res = await fetch(`/api/admin/news/${newsItemId}/link-communities`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-admin-password': ADMIN_PASSWORD },
        body: JSON.stringify({ community_news_ids: [community_news_id] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unlink failed')
      setMsg(`Unlinked ${data.deleted}`)
      onChanged()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Unlink failed')
    } finally {
      setBusy(false)
    }
  }

  const manualExisting = (existing || []).filter((m) => m.link_source === 'manual')

  return (
    <div
      style={{
        marginTop: '16px',
        padding: '14px 16px',
        backgroundColor: '#FAFBFD',
        border: '1px dashed #c8d3e6',
        borderRadius: '10px',
      }}
    >
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#1B2B6B', marginBottom: '10px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        Manually link communities
      </div>

      {/* Already-linked manual chips */}
      {manualExisting.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
          {manualExisting.map((m) => (
            <span
              key={m.id}
              style={{
                fontSize: '11px',
                padding: '4px 8px 4px 10px',
                borderRadius: '999px',
                backgroundColor: '#E1F5EE',
                color: '#155A3F',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                border: '1px solid #c1ddd0',
              }}
            >
              {m.communities?.canonical_name || 'Unknown'}
              {m.communities?.city ? <span style={{ opacity: 0.7 }}>· {m.communities.city}</span> : null}
              <button
                type="button"
                onClick={() => unlinkRow(m.id)}
                disabled={busy}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: '#155A3F',
                  cursor: 'pointer',
                  fontSize: '13px',
                  padding: 0,
                  lineHeight: 1,
                }}
                title="Unlink"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Filter row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          style={{ fontSize: '12px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d8dde7' }}
        >
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name} ({c.count})
            </option>
          ))}
        </select>

        <select
          value={masterId}
          onChange={(e) => setMasterId(e.target.value)}
          style={{ fontSize: '12px', padding: '6px 8px', borderRadius: '6px', border: '1px solid #d8dde7', maxWidth: '260px' }}
        >
          <option value="">No master HOA filter</option>
          {masters.slice(0, 40).map((m) => (
            <option key={m.id} value={m.id}>
              {m.canonical_name} ({m.sub_count})
            </option>
          ))}
        </select>

        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type to search by name…"
          style={{
            flex: '1 1 200px',
            fontSize: '12px',
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid #d8dde7',
            minWidth: '160px',
          }}
        />

        <button
          type="button"
          onClick={bulkLinkCity}
          disabled={!city || busy}
          title={city ? `Link ALL communities in ${city}` : 'Select a city first'}
          style={{
            fontSize: '12px',
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid #1B2B6B',
            backgroundColor: city && !busy ? '#1B2B6B' : '#bbb',
            color: '#fff',
            cursor: city && !busy ? 'pointer' : 'not-allowed',
            fontWeight: 600,
          }}
        >
          Link to all in city
        </button>
      </div>

      {/* Type-ahead results */}
      {results.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
          {results.map((c) => {
            const already = existingIds.has(c.id) || !!picked.find((p) => p.id === c.id)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => add(c)}
                disabled={already}
                style={{
                  fontSize: '11px',
                  padding: '5px 10px',
                  borderRadius: '999px',
                  border: '1px solid #c8d3e6',
                  backgroundColor: already ? '#eef0f5' : '#fff',
                  color: already ? '#999' : '#1B2B6B',
                  cursor: already ? 'default' : 'pointer',
                }}
                title={already ? 'Already linked' : 'Add to selection'}
              >
                {c.canonical_name}
                {c.city ? <span style={{ opacity: 0.6 }}> · {c.city}</span> : null}
              </button>
            )
          })}
        </div>
      )}

      {/* Picked chips (pending save) */}
      {picked.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
          {picked.map((c) => (
            <span
              key={c.id}
              style={{
                fontSize: '11px',
                padding: '4px 8px 4px 10px',
                borderRadius: '999px',
                backgroundColor: '#1B2B6B',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {c.canonical_name}
              <button
                type="button"
                onClick={() => remove(c.id)}
                style={{ border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', fontSize: '13px', padding: 0, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={saveLinks}
          disabled={busy || picked.length === 0}
          style={{
            fontSize: '12px',
            padding: '7px 14px',
            borderRadius: '7px',
            border: 'none',
            backgroundColor: picked.length > 0 && !busy ? '#1D9E75' : '#bbb',
            color: '#fff',
            cursor: picked.length > 0 && !busy ? 'pointer' : 'not-allowed',
            fontWeight: 700,
          }}
        >
          Save links{picked.length > 0 ? ` (${picked.length})` : ''}
        </button>
        {msg && <span style={{ fontSize: '11px', color: '#555' }}>{msg}</span>}
      </div>
    </div>
  )
}

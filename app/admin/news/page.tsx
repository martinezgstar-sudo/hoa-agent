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
  communities?: {
    id: string
    canonical_name: string
    slug: string
  } | null
}

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
      const pendingMatches = (item.community_news || []).filter((m) => m.status === 'pending')
      for (const m of pendingMatches) {
        await patchStatus(
          {
            type: 'community_news',
            id: m.id,
            status: 'approved',
            admin_notes: 'Approved via bulk action',
          },
          true,
        )
      }
      await patchStatus({
        type: 'news_item',
        id: item.id,
        status: 'approved',
        admin_notes: 'Approved all matches',
      })
    } finally {
      setBusyId('')
    }
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

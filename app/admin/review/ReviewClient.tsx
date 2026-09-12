'use client'

// Per-row Approve / Reject controls. POSTs to /api/admin/review with the
// signed hoa_admin cookie (credentials:'include'). No password handling
// in the browser — the server verifies via isAdminRequest.

import { useState } from 'react'

const REJECT_REASONS = ['Not an HOA', 'Out of market', 'Inactive', 'Duplicate', 'Other'] as const
type Reason = (typeof REJECT_REASONS)[number]

interface Props { id: string; slug: string }

export default function ReviewClient({ id, slug }: Props) {
  const [busy,   setBusy]   = useState(false)
  const [status, setStatus] = useState<'idle' | 'done' | 'error'>('idle')
  const [msg,    setMsg]    = useState<string>('')
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState<Reason>('Not an HOA')
  const [note,   setNote]   = useState('')

  async function submit(action: 'approve' | 'reject', payload?: { reason: Reason; note?: string }) {
    setBusy(true); setStatus('idle'); setMsg('')
    try {
      const res = await fetch('/api/admin/review', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'content-type': 'application/json' },
        body:        JSON.stringify({ community_id: id, action, ...payload }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setStatus('error')
        setMsg(json?.error ?? `HTTP ${res.status}`)
      } else {
        setStatus('done')
        setMsg(action === 'approve' ? 'Approved → published' : `Rejected → removed (${payload?.reason})`)
      }
    } catch (err) {
      setStatus('error')
      setMsg((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (status === 'done') {
    return (
      <div style={{ fontSize: '13px', color: '#06875e', fontWeight: 500 }}>
        ✓ {msg}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          disabled={busy}
          onClick={() => submit('approve')}
          style={btn('primary', busy)}
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setShowReject((v) => !v)}
          style={btn('danger', busy)}
        >
          Reject…
        </button>
        <a
          href={`/community/${slug}`}
          target="_blank"
          rel="noopener"
          style={{ color: '#06875e', fontSize: '12px', textDecoration: 'none' }}
        >
          Open page →
        </a>
        {status === 'error' && (
          <span style={{ fontSize: '12px', color: '#c0392b' }}>error: {msg}</span>
        )}
      </div>

      {showReject && (
        <div style={{ marginTop: '10px', padding: '10px 12px', border: '1px solid #f5c8c8', borderRadius: '8px', backgroundColor: '#fff8f8' }}>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <label style={{ fontSize: '12px', color: '#595959' }}>Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as Reason)}
              style={{ padding: '4px 8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #d5d5d5' }}
            >
              {REJECT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            {reason === 'Other' && (
              <input
                type="text"
                placeholder="Required note (why?)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                style={{ flex: '1 1 200px', padding: '4px 8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #d5d5d5' }}
              />
            )}
            <button
              type="button"
              disabled={busy || (reason === 'Other' && note.trim() === '')}
              onClick={() => submit('reject', { reason, note: note.trim() || undefined })}
              style={btn('danger', busy || (reason === 'Other' && note.trim() === ''))}
            >
              Confirm reject
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function btn(kind: 'primary' | 'danger', disabled: boolean): React.CSSProperties {
  const bg = kind === 'primary' ? '#06875e' : '#c0392b'
  return {
    padding:         '6px 14px',
    fontSize:        '13px',
    fontWeight:      500,
    color:           '#fff',
    backgroundColor: bg,
    border:          'none',
    borderRadius:    '6px',
    cursor:          disabled ? 'not-allowed' : 'pointer',
    opacity:         disabled ? 0.55 : 1,
  }
}

'use client'

import { useState } from 'react'

const SIGNAL_TYPES = ['Special Assessment', 'Fee Increase', 'Fee Decrease']

export default function AssessmentSignalForm({ communityId }: { communityId: string }) {
  const [form, setForm] = useState({ fee_amount: '', signal_date: '', signal_type: '', notes: '' })
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error' | 'ratelimit'>('idle')

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.signal_type) return
    setStatus('submitting')
    try {
      const res = await fetch('/api/assessment-signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ community_id: communityId, ...form }),
      })
      if (res.status === 429) { setStatus('ratelimit'); return }
      setStatus(res.ok ? 'success' : 'error')
    } catch {
      setStatus('error')
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: '13px',
    border: '1px solid #d0d0d0', borderRadius: '6px',
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }

  if (status === 'success') {
    return (
      <div style={{ fontSize: '13px', color: '#1D9E75', padding: '12px 14px', backgroundColor: '#E1F5EE', borderRadius: '8px', marginTop: '12px' }}>
        Signal submitted — thank you. Our team will review it shortly.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#888', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Type *
          </label>
          <select required value={form.signal_type} onChange={set('signal_type')} style={fieldStyle}>
            <option value="">Select type</option>
            {SIGNAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#888', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Amount ($)
          </label>
          <input type="number" min="0" step="0.01" placeholder="e.g. 1200" value={form.fee_amount} onChange={set('fee_amount')} style={fieldStyle} />
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#888', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Date (approximate)
        </label>
        <input type="date" value={form.signal_date} onChange={set('signal_date')} style={fieldStyle} />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#888', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Notes (optional)
        </label>
        <textarea
          value={form.notes}
          onChange={set('notes')}
          placeholder="Any context about this assessment or fee change…"
          rows={2}
          maxLength={500}
          style={{ ...fieldStyle, resize: 'vertical', lineHeight: '1.5' }}
        />
      </div>

      {status === 'error' && (
        <div style={{ fontSize: '12px', color: '#E24B4A' }}>Something went wrong. Please try again.</div>
      )}
      {status === 'ratelimit' && (
        <div style={{ fontSize: '12px', color: '#854F0B' }}>You've reached the submission limit for today. Try again tomorrow.</div>
      )}

      <button
        type="submit"
        disabled={status === 'submitting' || !form.signal_type}
        style={{
          alignSelf: 'flex-start', padding: '8px 18px', fontSize: '13px', fontWeight: 600,
          backgroundColor: '#1B2B6B', color: '#fff', border: 'none', borderRadius: '7px',
          cursor: status === 'submitting' || !form.signal_type ? 'not-allowed' : 'pointer',
          opacity: !form.signal_type ? 0.5 : 1,
        }}
      >
        {status === 'submitting' ? 'Submitting…' : 'Submit signal'}
      </button>
    </form>
  )
}

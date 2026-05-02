'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const TITLES = ['Board Member', 'Property Manager', 'Community Manager', 'Board President', 'Other']
const CONTACT_PREFS = ['Email', 'Phone', 'Either']

function slugToName(slug: string): string {
  if (!slug || typeof slug !== 'string') return 'this community'
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function ClaimPage({ params }: { params: Promise<{ slug: string }> | { slug: string } }) {
  // params may be a plain object (older Next) or a Promise (Next 15/16). Handle both.
  const [slug, setSlug] = useState<string>('')
  useEffect(() => {
    Promise.resolve(params)
      .then((p) => setSlug(p?.slug ?? ''))
      .catch(() => setSlug(''))
  }, [params])

  const communityName = slugToName(slug)

  const [form, setForm] = useState({
    name: '',
    title: '',
    email: '',
    phone: '',
    communityName,
    preferredContact: '',
  })
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')

  // Keep form.communityName in sync once the async slug resolves
  useEffect(() => {
    if (communityName && communityName !== 'this community') {
      setForm((f) => (f.communityName ? f : { ...f, communityName }))
    }
  }, [communityName])

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('submitting')
    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      setStatus(res.ok ? 'success' : 'error')
    } catch {
      setStatus('error')
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    fontSize: '14px',
    border: '1px solid #d0d0d0',
    borderRadius: '8px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: '#444',
    marginBottom: '6px',
  }

  if (status === 'success') {
    return (
      <main style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f9f9f9', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ maxWidth: '480px', padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', backgroundColor: '#E1F5EE', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '24px' }}>
            ✓
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1B2B6B', marginBottom: '12px' }}>
            Request received
          </h1>
          <p style={{ fontSize: '15px', color: '#555', lineHeight: 1.7, marginBottom: '28px' }}>
            We received your claim request for <strong>{form.communityName}</strong>.
            Our team will review it and follow up with you at <strong>{form.email}</strong>.
          </p>
          <Link
            href={`/community/${slug}`}
            style={{ fontSize: '14px', color: '#1D9E75', fontWeight: 600, textDecoration: 'none' }}
          >
            ← Back to community page
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f9f9f9', minHeight: '100vh' }}>
      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '52px 24px 80px' }}>

        <Link href={`/community/${slug}`} style={{ fontSize: '13px', color: '#888', textDecoration: 'none', display: 'inline-block', marginBottom: '32px' }}>
          ← Back to community page
        </Link>

        <div style={{ fontSize: '11px', fontWeight: 600, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
          HOA Representative
        </div>

        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1B2B6B', lineHeight: 1.2, marginBottom: '10px' }}>
          Claim this community page
        </h1>
        <p style={{ fontSize: '15px', color: '#555', lineHeight: 1.7, marginBottom: '36px' }}>
          Verify your role as a representative of <strong>{communityName}</strong> and
          we'll follow up to discuss what you can update on your community profile.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          <div>
            <label style={labelStyle}>Full name *</label>
            <input
              required
              type="text"
              value={form.name}
              onChange={set('name')}
              placeholder="Jane Smith"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Your title *</label>
            <select required value={form.title} onChange={set('title')} style={inputStyle}>
              <option value="">Select your role</option>
              {TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Community name</label>
            <input
              type="text"
              value={form.communityName}
              onChange={set('communityName')}
              style={{ ...inputStyle, backgroundColor: '#f5f5f5', color: '#666' }}
            />
          </div>

          <div>
            <label style={labelStyle}>Email address *</label>
            <input
              required
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="jane@example.com"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Phone number</label>
            <input
              type="tel"
              value={form.phone}
              onChange={set('phone')}
              placeholder="(561) 555-0100"
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Preferred contact method</label>
            <select value={form.preferredContact} onChange={set('preferredContact')} style={inputStyle}>
              <option value="">Select preference</option>
              {CONTACT_PREFS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {status === 'error' && (
            <div style={{ fontSize: '13px', color: '#E24B4A', padding: '10px 14px', backgroundColor: '#FEF2F2', borderRadius: '8px' }}>
              Something went wrong. Please try again or email us at hello@hoa-agent.com.
            </div>
          )}

          <button
            type="submit"
            disabled={status === 'submitting'}
            style={{ padding: '12px', fontSize: '15px', fontWeight: 600, backgroundColor: '#1B2B6B', color: '#fff', border: 'none', borderRadius: '10px', cursor: status === 'submitting' ? 'not-allowed' : 'pointer', opacity: status === 'submitting' ? 0.7 : 1 }}
          >
            {status === 'submitting' ? 'Submitting…' : 'Submit claim request'}
          </button>

        </form>

        <p style={{ marginTop: '24px', fontSize: '12px', color: '#aaa', lineHeight: 1.6, textAlign: 'center' }}>
          We verify all claims before granting access. HOA Agent will never share your contact
          information without permission.
        </p>

      </div>
    </main>
  )
}

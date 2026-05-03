import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'HOA Agent — For BNI Members',
  description: 'HOA Agent: free HOA intelligence for Palm Beach County real estate professionals.',
  robots: { index: false, follow: false },
}

export default function BniPage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#fff', minHeight: '100vh' }}>

      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '60px 24px 80px' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '48px' }}>
          <div style={{ width: '40px', height: '40px', backgroundColor: '#1B2B6B', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#fff', fontSize: '18px', fontWeight: 700 }}>H</span>
          </div>
          <span style={{ fontSize: '16px', fontWeight: 600, color: '#1B2B6B' }}>HOA Agent</span>
        </div>

        <div style={{ fontSize: '11px', fontWeight: 600, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
          Welcome, BNI Members
        </div>

        <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#1B2B6B', lineHeight: 1.2, marginBottom: '20px', letterSpacing: '-0.02em' }}>
          Know the HOA Before<br />Your Client Does
        </h1>

        <p style={{ fontSize: '16px', color: '#444', lineHeight: 1.8, marginBottom: '36px' }}>
          HOA Agent is a free platform for researching any HOA or condo community in Palm Beach County.
          Before your next showing, pull up the community profile — fees, pet restrictions, vehicle rules,
          rental approval requirements, litigation history, and news reputation, all in one place.
          No account. No subscription. Free.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '48px' }}>
          {[
            {
              step: '1',
              title: 'Search any community',
              body: 'Type a community name, address, city, or ZIP code. Results include HOA and condo associations across all of Palm Beach County.',
            },
            {
              step: '2',
              title: 'Review the profile',
              body: 'See monthly fee ranges, pet and vehicle restrictions, rental approval rules, short-term rental bans, litigation count, and news reputation score.',
            },
            {
              step: '3',
              title: 'Walk in prepared',
              body: 'Answer buyer questions before they ask. Know which communities have active lawsuits, pending special assessments, or restrictive rules that could affect a deal.',
            },
          ].map((s) => (
            <div key={s.step} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#1D9E75', color: '#fff', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {s.step}
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', marginBottom: '4px' }}>{s.title}</div>
                <div style={{ fontSize: '13px', color: '#666', lineHeight: 1.6 }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ backgroundColor: '#1B2B6B', borderRadius: '16px', padding: '32px', color: '#fff', marginBottom: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '10px' }}>
            8,000+ communities. Completely free.
          </div>
          <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)', marginBottom: '24px', lineHeight: 1.7 }}>
            Start with any Palm Beach County community — no login required.
          </p>
          <Link
            href="/search"
            style={{ fontSize: '14px', backgroundColor: '#1D9E75', color: '#fff', padding: '12px 28px', borderRadius: '8px', textDecoration: 'none', display: 'inline-block', fontWeight: 600 }}
          >
            Search communities now →
          </Link>
        </div>

        <div style={{ borderTop: '1px solid #e5e5e5', paddingTop: '28px', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: '#888', marginBottom: '8px' }}>Questions or referrals?</div>
          <a href="/contact">contact us</a>
        </div>

      </div>
    </main>
  )
}

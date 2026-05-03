import NavBar from '@/app/components/NavBar'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About HOA Agent | Florida HOA Intelligence Platform',
  description: 'HOA Agent was built after a work truck got towed because of a buried HOA rule nobody knew about. We make HOA data public, searchable, and free for Palm Beach County.',
  openGraph: {
    title: 'About HOA Agent | Florida HOA Intelligence Platform',
    description: 'The story behind HOA Agent and why we built a free public database of Palm Beach County HOA communities.',
    url: 'https://hoa-agent.com/about',
    siteName: 'HOA Agent',
    type: 'website',
    images: [{ url: 'https://hoa-agent.com/logo.png', width: 400, height: 400, alt: 'HOA Agent' }],
  },
  twitter: {
    card: 'summary',
    title: 'About HOA Agent | Florida HOA Intelligence Platform',
    description: 'The story behind HOA Agent — free HOA intelligence for Palm Beach County buyers and residents.',
  },
}

export default function AboutPage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f9f9f9', minHeight: '100vh' }}>
      <NavBar
        shareHref="/search"
        shareLabel="Find my HOA"
      />

      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '52px 24px 80px' }}>

        <div style={{ fontSize: '11px', fontWeight: 600, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
          About
        </div>

        <h1 style={{ fontSize: '36px', fontWeight: 700, color: '#1B2B6B', lineHeight: 1.15, marginBottom: '24px', letterSpacing: '-0.02em' }}>
          Know the HOA Before You Commit
        </h1>

        <p style={{ fontSize: '16px', color: '#444', lineHeight: 1.8, marginBottom: '32px' }}>
          HOA Agent is a free public database of homeowners association and condo community
          information for Palm Beach County, Florida. We make it easy to look up fees, restrictions,
          management company details, litigation history, news reputation, and resident reviews — all
          in one place, before you buy, rent, or move in.
        </p>

        <div style={{ borderLeft: '3px solid #1D9E75', paddingLeft: '20px', marginBottom: '40px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>
            Why we built this
          </div>
          <p style={{ fontSize: '15px', color: '#333', lineHeight: 1.8, margin: 0 }}>
            A work truck got towed from a driveway because of a vehicle restriction buried in an
            HOA document that the owner had never seen. The truck wasn't illegally parked. It
            wasn't blocking anyone. But the HOA had a rule — page 47 of a 90-page covenant
            document — that prohibited commercial vehicles from being visible from the street
            overnight. $280 tow fee. No warning.
          </p>
          <p style={{ fontSize: '15px', color: '#333', lineHeight: 1.8, marginTop: '14px', marginBottom: 0 }}>
            That kind of thing happens every day in HOA communities throughout Florida. Vehicle
            restrictions, pet limits, short-term rental bans, special assessment histories,
            ongoing lawsuits — this information is technically public but practically inaccessible.
            HOA Agent exists to change that.
          </p>
        </div>

        <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#1B2B6B', marginBottom: '14px', letterSpacing: '-0.01em' }}>
          What HOA Agent does
        </h2>
        <p style={{ fontSize: '15px', color: '#444', lineHeight: 1.8, marginBottom: '28px' }}>
          We aggregate structured data on over 8,000 HOA and condo communities across Palm Beach
          County. For each community you can find:
        </p>

        <ul style={{ paddingLeft: '20px', marginBottom: '36px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[
            'Monthly HOA fees — minimum, maximum, and median based on observed data',
            'Restrictions — short-term rentals, pets, vehicles, and rental approval requirements',
            'Management company name and contact',
            'Entity status and registration details',
            'Litigation history and active court cases',
            'News reputation scoring from aggregated media coverage',
            'Special assessment signals',
            'Resident reviews and ratings from verified community members',
          ].map((item) => (
            <li key={item} style={{ fontSize: '14px', color: '#444', lineHeight: 1.7 }}>{item}</li>
          ))}
        </ul>

        <p style={{ fontSize: '15px', color: '#444', lineHeight: 1.8, marginBottom: '36px' }}>
          HOA Agent aggregates publicly available information to give you a clear picture of any community before you commit.
          We update our data regularly so you can research with confidence.
        </p>

        <div style={{ backgroundColor: '#FFFBF0', border: '1px solid #F5E6C8', borderRadius: '12px', padding: '20px 24px', marginBottom: '40px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: '#854F0B', marginBottom: '8px' }}>Disclaimer</div>
          <p style={{ fontSize: '13px', color: '#5a3a00', lineHeight: 1.7, margin: 0 }}>
            HOA Agent is provided for informational purposes only and does not constitute legal,
            financial, or real estate advice. Data may be incomplete, outdated, or inaccurate. Always
            verify fees, restrictions, and association documents directly with the HOA or your
            attorney before making any real estate decision. HOA Agent LLC is not affiliated with any
            HOA, condominium association, management company, or government agency.
          </p>
        </div>

        <div style={{ textAlign: 'center', padding: '32px', backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '16px' }}>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#1B2B6B', marginBottom: '10px' }}>
            Start your HOA research
          </div>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '20px' }}>
            Search over 8,000 Palm Beach County communities — free, no account required.
          </p>
          <Link href="/search" style={{ fontSize: '14px', backgroundColor: '#1B2B6B', color: '#fff', padding: '10px 28px', borderRadius: '8px', textDecoration: 'none', display: 'inline-block' }}>
            Search communities
          </Link>
        </div>

      </div>
    </main>
  )
}

import NavBar from '@/app/components/NavBar'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'For Real Estate Agents | HOA Agent',
  description: 'Real estate agents use HOA Agent to research HOA litigation history, fees, assessments, and restrictions before showing listings in Palm Beach County.',
  openGraph: {
    title: 'For Real Estate Agents | HOA Agent',
    description: 'Due diligence for every Palm Beach County listing. HOA fees, litigation history, special assessments, and restrictions — all in one free tool.',
    url: 'https://hoa-agent.com/for-agents',
    siteName: 'HOA Agent',
    type: 'website',
    images: [{ url: 'https://hoa-agent.com/logo.png', width: 400, height: 400, alt: 'HOA Agent' }],
  },
  twitter: {
    card: 'summary',
    title: 'For Real Estate Agents | HOA Agent',
    description: 'HOA due diligence for Palm Beach County listings. Free.',
  },
}

const USE_CASES = [
  {
    title: 'Before the showing',
    body: 'Pull up the community profile before you walk in. Know the fee range, pet restrictions, vehicle rules, and rental approval requirements so you can answer buyer questions on the spot instead of saying "I\'ll find out."',
  },
  {
    title: 'During buyer education',
    body: 'Show your buyer the litigation count and news reputation score. If a community has three active court cases and a string of negative news coverage, that\'s a conversation to have before the offer — not after the inspection.',
  },
  {
    title: 'Listing research',
    body: 'Before you list a property, check whether the community has any pending or recent special assessments on record. Buyers\' agents will find it. Better to know first.',
  },
  {
    title: 'Comparing communities',
    body: 'Buyers often compare multiple communities. Use HOA Agent to pull side-by-side fee ranges, amenity lists, and restriction summaries in seconds instead of hunting through documents.',
  },
]

const DATA_POINTS = [
  { label: 'Monthly fees', desc: 'Min, max, median based on observed data' },
  { label: 'Litigation count', desc: 'Cases from CourtListener court records' },
  { label: 'News reputation', desc: 'Score 1–10 from aggregated media coverage' },
  { label: 'Special assessment signals', desc: 'From news and public records' },
  { label: 'STR restrictions', desc: 'Short-term rental ban or approval requirements' },
  { label: 'Pet restrictions', desc: 'Size limits, breed restrictions, number caps' },
  { label: 'Vehicle restrictions', desc: 'Commercial vehicle and parking rules' },
  { label: 'Rental approval', desc: 'Board approval and tenant screening requirements' },
  { label: 'Management company', desc: 'Current property manager name' },
  { label: 'Entity status', desc: 'Active/dissolved from FL Division of Corporations' },
]

export default function ForAgentsPage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f9f9f9', minHeight: '100vh' }}>
      <NavBar
        shareHref="/search"
        shareLabel="Find my HOA"
      />

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '52px 24px 80px' }}>

        <div style={{ fontSize: '11px', fontWeight: 600, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
          For Real Estate Agents
        </div>

        <h1 style={{ fontSize: '34px', fontWeight: 700, color: '#1B2B6B', lineHeight: 1.2, marginBottom: '18px', letterSpacing: '-0.02em' }}>
          HOA Due Diligence,<br />Before the Offer
        </h1>

        <p style={{ fontSize: '16px', color: '#555', lineHeight: 1.8, marginBottom: '48px', maxWidth: '600px' }}>
          Every Palm Beach County listing inside an HOA carries hidden data your buyers need to know.
          HOA Agent gives you instant access to litigation history, fee ranges, restriction details,
          and news reputation — free, no account required.
        </p>

        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1B2B6B', marginBottom: '20px' }}>
          How agents use HOA Agent
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '52px' }}>
          {USE_CASES.map((uc) => (
            <div key={uc.title} style={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px 24px' }}>
              <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', marginBottom: '8px' }}>{uc.title}</div>
              <div style={{ fontSize: '14px', color: '#555', lineHeight: 1.7 }}>{uc.body}</div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1B2B6B', marginBottom: '16px' }}>
          What you get on every community profile
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', marginBottom: '52px' }}>
          {DATA_POINTS.map((dp) => (
            <div key={dp.label} style={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '10px', padding: '14px 16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#1D9E75', marginBottom: '4px' }}>{dp.label}</div>
              <div style={{ fontSize: '12px', color: '#888' }}>{dp.desc}</div>
            </div>
          ))}
        </div>

        <div style={{ backgroundColor: '#1B2B6B', borderRadius: '16px', padding: '36px 32px', color: '#fff', marginBottom: '40px' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, marginBottom: '12px', letterSpacing: '-0.01em' }}>
            7,000+ communities. Free.
          </div>
          <p style={{ fontSize: '14px', lineHeight: 1.8, marginBottom: '24px', color: 'rgba(255,255,255,0.8)', maxWidth: '500px' }}>
            Search any Palm Beach County HOA or condo community. No login, no subscription,
            no paywall. Use it on every listing, every showing, every buyer consultation.
          </p>
          <Link href="/search" style={{ fontSize: '14px', backgroundColor: '#1D9E75', color: '#fff', padding: '10px 24px', borderRadius: '8px', textDecoration: 'none', display: 'inline-block', fontWeight: 600 }}>
            Search communities now
          </Link>
        </div>

        <div style={{ padding: '20px', backgroundColor: '#f5f5f5', borderRadius: '12px', fontSize: '12px', color: '#888', lineHeight: 1.7 }}>
          HOA Agent is provided for informational purposes only and does not constitute legal, financial,
          or real estate advice. Always direct buyers to review official HOA documents, financials, and
          consult with their attorney before closing.
        </div>

      </div>
    </main>
  )
}

import NavBar from '@/app/components/NavBar'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Advertise | HOA Agent',
  description: 'Reach homebuyers, renters, real estate agents, and property managers in Palm Beach County through HOA Agent advertising opportunities.',
  openGraph: {
    title: 'Advertise | HOA Agent',
    description: 'Advertising opportunities on HOA Agent — reach homebuyers, agents, and property managers in Palm Beach County.',
    url: 'https://hoa-agent.com/advertise',
    siteName: 'HOA Agent',
    type: 'website',
    images: [{ url: 'https://hoa-agent.com/logo.png', width: 400, height: 400, alt: 'HOA Agent' }],
  },
  twitter: {
    card: 'summary',
    title: 'Advertise | HOA Agent',
    description: 'Reach Palm Beach County homebuyers and real estate professionals through HOA Agent.',
  },
}

const AUDIENCE = [
  {
    segment: 'Homebuyers',
    desc: 'Active buyers researching HOA communities before making an offer. High purchase intent.',
  },
  {
    segment: 'Renters',
    desc: 'Prospective residents looking into fees and restrictions before signing a lease.',
  },
  {
    segment: 'Real estate agents',
    desc: 'Licensed agents using HOA Agent for pre-listing research and buyer due diligence.',
  },
  {
    segment: 'Property managers',
    desc: 'Community and property management professionals researching local markets.',
  },
]

const PLACEMENTS = [
  {
    type: 'Sponsored community profiles',
    desc: 'Feature your management company, services, or brand on community profile pages across Palm Beach County.',
  },
  {
    type: 'Featured listings',
    desc: 'Promote a community, development, or property at the top of city and search result pages.',
  },
  {
    type: 'Banner placements',
    desc: 'Display advertising on high-traffic community and search pages.',
  },
  {
    type: 'City page sponsorships',
    desc: 'Sponsor a city landing page (e.g., Boca Raton, Jupiter) and reach buyers focused on specific markets.',
  },
]

export default function AdvertisePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f9f9f9', minHeight: '100vh' }}>
      <NavBar
        shareHref="/search"
        shareLabel="Find my HOA"
      />

      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '52px 24px 80px' }}>

        <div style={{ fontSize: '11px', fontWeight: 600, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
          Advertise
        </div>

        <h1 style={{ fontSize: '34px', fontWeight: 700, color: '#1B2B6B', lineHeight: 1.2, marginBottom: '18px', letterSpacing: '-0.02em' }}>
          Reach Palm Beach County's<br />HOA Research Audience
        </h1>

        <p style={{ fontSize: '16px', color: '#555', lineHeight: 1.8, marginBottom: '52px', maxWidth: '600px' }}>
          HOA Agent is where Palm Beach County buyers, renters, and real estate professionals
          go to research communities. Put your brand in front of high-intent audiences
          at the moment they're making housing decisions.
        </p>

        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1B2B6B', marginBottom: '20px' }}>
          Who visits HOA Agent
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px', marginBottom: '52px' }}>
          {AUDIENCE.map((a) => (
            <div key={a.segment} style={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px 24px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, color: '#1D9E75', marginBottom: '8px' }}>{a.segment}</div>
              <div style={{ fontSize: '13px', color: '#555', lineHeight: 1.6 }}>{a.desc}</div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1B2B6B', marginBottom: '20px' }}>
          Advertising opportunities
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '52px' }}>
          {PLACEMENTS.map((p) => (
            <div key={p.type} style={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px 24px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#1D9E75', marginTop: '6px', flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: '#1a1a1a', marginBottom: '6px' }}>{p.type}</div>
                <div style={{ fontSize: '13px', color: '#666', lineHeight: 1.6 }}>{p.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ backgroundColor: '#1B2B6B', borderRadius: '16px', padding: '36px 32px', color: '#fff' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, marginBottom: '12px', letterSpacing: '-0.01em' }}>
            Get in touch
          </div>
          <p style={{ fontSize: '14px', lineHeight: 1.8, marginBottom: '24px', color: 'rgba(255,255,255,0.8)', maxWidth: '480px' }}>
            Tell us about your business and what audience you want to reach. We'll put together
            options that fit your goals. No commitment required.
          </p>
          <a
            href="mailto:advertise@hoa-agent.com"
            style={{ fontSize: '14px', backgroundColor: '#1D9E75', color: '#fff', padding: '10px 24px', borderRadius: '8px', textDecoration: 'none', display: 'inline-block', fontWeight: 600 }}
          >
            advertise@hoa-agent.com
          </a>
        </div>

      </div>
    </main>
  )
}

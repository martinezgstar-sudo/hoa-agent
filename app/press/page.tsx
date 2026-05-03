import NavBar from '@/app/components/NavBar'
import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Press | HOA Agent',
  description: 'Press information and media inquiries for HOA Agent, the Florida HOA intelligence platform serving Palm Beach County.',
  openGraph: {
    title: 'Press | HOA Agent',
    description: 'Media resources and press inquiries for HOA Agent — Palm Beach County HOA intelligence platform.',
    url: 'https://hoa-agent.com/press',
    siteName: 'HOA Agent',
    type: 'website',
    images: [{ url: 'https://hoa-agent.com/logo.png', width: 400, height: 400, alt: 'HOA Agent' }],
  },
  twitter: {
    card: 'summary',
    title: 'Press | HOA Agent',
    description: 'Media resources and press inquiries for HOA Agent.',
  },
}

export default function PressPage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', backgroundColor: '#f9f9f9', minHeight: '100vh' }}>
      <NavBar
        shareHref="/search"
        shareLabel="Find my HOA"
      />

      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '52px 24px 80px' }}>

        <div style={{ fontSize: '11px', fontWeight: 600, color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
          Press
        </div>

        <h1 style={{ fontSize: '36px', fontWeight: 700, color: '#1B2B6B', lineHeight: 1.15, marginBottom: '24px', letterSpacing: '-0.02em' }}>
          Media & Press Information
        </h1>

        <p style={{ fontSize: '16px', color: '#444', lineHeight: 1.8, marginBottom: '40px' }}>
          HOA Agent is a Florida HOA intelligence platform serving Palm Beach County homebuyers,
          residents, and real estate professionals. We make it easy to research any HOA community
          before buying, renting, or moving in — fees, restrictions, litigation history, and
          resident reviews all in one free platform.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '48px' }}>
          {[
            {
              label: 'Founded',
              value: '2026',
            },
            {
              label: 'Headquarters',
              value: 'West Palm Beach, Florida',
            },
            {
              label: 'Coverage',
              value: 'Palm Beach County, Florida — 8,000+ HOA and condo communities',
            },
            {
              label: 'Mission',
              value: 'Make HOA data public, searchable, and free for homebuyers and residents.',
            },
            {
              label: 'Availability',
              value: 'Free — no account or subscription required.',
            },
          ].map((item) => (
            <div key={item.label} style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: '120px', paddingTop: '2px' }}>
                {item.label}
              </div>
              <div style={{ fontSize: '15px', color: '#333', lineHeight: 1.6 }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div style={{ backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '16px', padding: '32px', marginBottom: '40px' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#1B2B6B', marginBottom: '12px' }}>
            Press inquiries
          </div>
          <p style={{ fontSize: '14px', color: '#555', lineHeight: 1.7, marginBottom: '16px' }}>
            For media requests, interview opportunities, data inquiries, or story tips,
            please reach out directly.
          </p>
          <a
            href="mailto:press@hoa-agent.com"
            style={{ fontSize: '15px', fontWeight: 600, color: '#1D9E75', textDecoration: 'none' }}
          >
            press@hoa-agent.com
          </a>
        </div>

        <div style={{ borderLeft: '3px solid #1D9E75', paddingLeft: '20px', marginBottom: '40px' }}>
          <p style={{ fontSize: '14px', color: '#555', lineHeight: 1.8, margin: 0 }}>
            HOA Agent LLC is an independent platform not affiliated with any homeowners association,
            condominium association, management company, or government agency. Data is provided for
            informational purposes only.
          </p>
        </div>

        <div style={{ textAlign: 'center' }}>
          <Link
            href="/search"
            style={{ fontSize: '14px', backgroundColor: '#1B2B6B', color: '#fff', padding: '10px 28px', borderRadius: '8px', textDecoration: 'none', display: 'inline-block' }}
          >
            Explore the platform
          </Link>
        </div>

      </div>
    </main>
  )
}

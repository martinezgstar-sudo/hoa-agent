import { supabase } from '@/lib/supabase'
import GuideForm from '@/app/components/GuideForm'
import HomeSearch from '@/app/components/HomeSearch'
import NavBar from '@/app/components/NavBar'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'HOA Agent — Know the HOA Before You Commit',
  description:
    'Search 7,000+ Palm Beach County HOA communities. Find fees, restrictions, management company, and real resident reviews — free. Source-attributed data.',
  openGraph: {
    title: 'HOA Agent — Know the HOA Before You Commit',
    description: 'Search 7,000+ Palm Beach County HOA and condo communities. Fees, assessments, restrictions, and reviews — free.',
    url: 'https://hoa-agent.com',
    siteName: 'HOA Agent',
    type: 'website',
    images: [{ url: 'https://hoa-agent.com/logo.png', width: 400, height: 400, alt: 'HOA Agent' }],
  },
  twitter: {
    card: 'summary',
    title: 'HOA Agent — Know the HOA Before You Commit',
    description: 'Search Palm Beach County HOA communities. Fees, restrictions, litigation history, and reviews — free.',
    images: ['https://hoa-agent.com/logo.png'],
  },
}

export default async function Home() {
  const { count } = await supabase
    .from('communities')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')

  const { data: featured } = await supabase
    .from('communities')
    .select('*')
    .eq('status', 'published')
    .order('confidence_score', { ascending: false, nullsFirst: false })
    .limit(3)

  const totalCommunities = count || 0

  return (
    <main style={{fontFamily: 'system-ui, sans-serif', margin: 0, padding: 0, backgroundColor: '#f9f9f9'}}>

      <NavBar
        desktopLinks={[
          { href: '/search', label: 'Search' },
          { href: '/city', label: 'Cities' },
          { href: '/about', label: 'About' },
          { href: '/reports', label: 'Reports' },
        ]}
        shareHref="/search"
        shareLabel="Share your association"
      />

      <section style={{backgroundColor: '#fff', padding: '72px 32px 64px', textAlign: 'center', borderBottom: '1px solid #e5e5e5'}}>
        <div style={{fontSize: '11px', fontWeight: '600', color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px'}}>HOA Intelligence Platform</div>
        <h1 style={{fontSize: '44px', fontWeight: '700', color: '#1B2B6B', lineHeight: '1.15', marginBottom: '16px', maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto', letterSpacing: '-0.02em'}}>Know the HOA Before You Commit</h1>
        <p style={{fontSize: '16px', color: '#666', marginBottom: '36px', maxWidth: '440px', marginLeft: 'auto', marginRight: 'auto', lineHeight: '1.6'}}>Structured, source-attributed data on HOA and condo communities. Fees, assessments, restrictions and reviews all in one place.</p>

        <HomeSearch />

        <div style={{display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap'}}>
          {[
            { label: 'West Palm Beach', href: '/city/west-palm-beach' },
            { label: 'Boca Raton', href: '/city/boca-raton' },
            { label: 'Jupiter', href: '/city/jupiter' },
            { label: 'Delray Beach', href: '/city/delray-beach' },
            { label: 'Boynton Beach', href: '/city/boynton-beach' },
            { label: 'Wellington', href: '/search?q=Wellington' },
          ].map((hint) => (
            <a key={hint.label} href={hint.href} style={{fontSize: '12px', padding: '5px 12px', borderRadius: '20px', border: '1px solid #e0e0e0', color: '#666', cursor: 'pointer', backgroundColor: '#fff', textDecoration: 'none'}}>{hint.label}</a>
          ))}
        </div>
      </section>

      <section style={{backgroundColor: '#f5f5f5', padding: '16px 32px', display: 'flex', gap: '32px', justifyContent: 'center', flexWrap: 'wrap', borderBottom: '1px solid #e5e5e5'}}>
        {['7,000+ communities tracked', 'Source-attributed data', 'Public records verified', 'Updated weekly'].map((item) => (
          <div key={item} style={{display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#555'}}>
            <div style={{width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#1D9E75'}}></div>
            {item}
          </div>
        ))}
      </section>

      <section style={{padding: '24px 16px', maxWidth: '680px', margin: '0 auto'}}>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px'}}>
          {[
            {num: '7,000+', label: 'Communities tracked'},
            {num: 'Resident powered', label: 'Real data from real neighbors'},
            {num: 'Free forever', label: 'Basic community profiles'},
          ].map((stat) => (
            <div key={stat.label} style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px', textAlign: 'center'}}>
              <div style={{fontSize: '28px', fontWeight: '600', color: '#1a1a1a', marginBottom: '4px'}}>{stat.num}</div>
              <div style={{fontSize: '12px', color: '#888'}}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{padding: '0 32px 32px', maxWidth: '680px', margin: '0 auto'}}>
        <div style={{fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px'}}>Featured communities — Palm Beach County</div>
        {featured?.map((c) => (
          <a key={c.id} href={"/community/" + c.slug} style={{textDecoration: 'none'}}>
            <div style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '16px 20px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer'}}>
              <div>
                <div style={{fontSize: '15px', fontWeight: '500', color: '#1a1a1a', marginBottom: '3px'}}>{c.canonical_name}</div>
                <div style={{fontSize: '12px', color: '#888', marginBottom: '8px'}}>{c.city} · {c.property_type}{c.unit_count ? ' · ' + c.unit_count + ' units' : ''}</div>
                <div style={{display: 'flex', gap: '6px'}}>
                  <span style={{fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#E1F5EE', color: '#1B2B6B'}}>Active entity</span>
                  {c.assessment_signal_count > 0
                    ? <span style={{fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#FAEEDA', color: '#854F0B'}}>{c.assessment_signal_count} assessment signals</span>
                    : <span style={{fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#f0f0f0', color: '#888'}}>No signals</span>
                  }
                </div>
              </div>
              <div style={{textAlign: 'right', flexShrink: 0, marginLeft: '16px'}}>
                <div style={{fontSize: '14px', fontWeight: '500', color: '#1a1a1a'}}>
                  {c.monthly_fee_min && parseFloat(c.monthly_fee_min) < 1500 ? '$' + Math.round(parseFloat(c.monthly_fee_min)) + (c.monthly_fee_max && c.monthly_fee_max !== c.monthly_fee_min ? '-$' + Math.round(parseFloat(c.monthly_fee_max)) : '') + '/mo' : c.monthly_fee_min ? 'Fee data available' : 'Fee unknown'}
                </div>
                <div style={{fontSize: '11px', color: '#1D9E75', marginTop: '6px'}}>View profile →</div>
              </div>
            </div>
          </a>
        ))}
      </section>

      <section style={{padding: '0 32px 32px', maxWidth: '680px', margin: '0 auto'}}>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px'}}>
          {[
            {step: 'Step 1', title: 'Search your community', desc: 'Find by name, address, city or management company.'},
            {step: 'Step 2', title: 'Read real experiences', desc: 'Fees, restrictions and reviews from actual residents — all source-labeled.'},
            {step: 'Step 3', title: 'Share what you know', desc: 'Get the full report with source trail, fee history and resident intelligence.'},
          ].map((h) => (
            <div key={h.step} style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '16px'}}>
              <div style={{fontSize: '11px', fontWeight: '600', color: '#1D9E75', marginBottom: '6px'}}>{h.step}</div>
              <div style={{fontSize: '13px', fontWeight: '500', color: '#1a1a1a', marginBottom: '4px'}}>{h.title}</div>
              <div style={{fontSize: '12px', color: '#888', lineHeight: '1.5'}}>{h.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{margin: '0 32px 40px', maxWidth: '616px', marginLeft: 'auto', marginRight: 'auto'}}>
        <div style={{backgroundColor: '#E1F5EE', borderRadius: '12px', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap'}}>
          <div>
            <div style={{fontSize: '15px', fontWeight: '500', color: '#1B2B6B', marginBottom: '4px'}}>Get the HOA Fee Guide free</div>
            <div style={{fontSize: '12px', color: '#1B2B6B'}}>2026 data. Median fees by city, top management companies, assessment trends.</div>
          </div>
          <GuideForm />
        </div>
      </section>

      <footer style={{borderTop: '1px solid #e5e5e5', padding: '24px 32px', textAlign: 'center', fontSize: '12px', color: '#888'}}>
        <div style={{marginBottom: '8px', fontWeight: '500', color: '#1a1a1a'}}>HOA Agent</div>
        <div>HOA Intelligence Platform · Palm Beach County · © 2026 HOA Agent LLC</div>
        <div style={{marginTop:"8px",fontSize:"11px",color:"#aaa",lineHeight:"1.6"}}>HOA Agent aggregates public records and resident-submitted data. Always verify fees and restrictions directly with the association before closing. HOA Agent LLC is not affiliated with any HOA, management company, or government agency.</div>
      </footer>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          "mainEntity": [
            {
              "@type": "Question",
              "name": "What is HOA Agent?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "HOA Agent is a free public database of HOA and condo community information for Palm Beach County, Florida. It aggregates fees, restrictions, management company details, litigation history, news reputation, and resident reviews from public records and resident-submitted data."
              }
            },
            {
              "@type": "Question",
              "name": "How much does HOA Agent cost?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "HOA Agent is free for homeowners, buyers, and renters. Basic community profiles, fee data, restrictions, and resident reviews are all available at no cost."
              }
            },
            {
              "@type": "Question",
              "name": "Where does HOA Agent data come from?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "Data is sourced from Florida Division of Corporations public filings, CourtListener federal and state court records, NewsAPI and other news aggregators, public property records, and resident-submitted information. All sources are attributed."
              }
            },
            {
              "@type": "Question",
              "name": "Which cities in Palm Beach County does HOA Agent cover?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "HOA Agent covers all cities in Palm Beach County including West Palm Beach, Boca Raton, Jupiter, Palm Beach Gardens, Delray Beach, Boynton Beach, Lake Worth, Wellington, and more — over 7,000 communities total."
              }
            },
            {
              "@type": "Question",
              "name": "Is the HOA data on HOA Agent legally accurate?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "HOA Agent provides data for informational purposes only and is not legal advice. Fees, restrictions, and governance documents can change. Always verify current information directly with the association or your attorney before making real estate decisions."
              }
            },
            {
              "@type": "Question",
              "name": "What is a special assessment in an HOA?",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "A special assessment is a one-time charge levied by an HOA or condo association above regular dues, typically to fund unexpected repairs, capital improvements, or reserve shortfalls. Under Florida law passed after the Surfside collapse, condo associations now face stricter requirements around structural inspections and reserve funding that have triggered large special assessments in many communities."
              }
            }
          ]
        })}}
      />

    </main>
  )
}
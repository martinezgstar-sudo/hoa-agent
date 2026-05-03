import { supabase } from '@/lib/supabase'
import NavBar from '@/app/components/NavBar'
import dynamic from 'next/dynamic'
import type { Metadata } from 'next'

const HomeSearch = dynamic(() => import('@/app/components/HomeSearch'), {
  loading: () => (
    <div style={{ maxWidth: '560px', margin: '0 auto 20px', width: '100%' }}>
      <div style={{ height: '44px', backgroundColor: '#f0f0f0', borderRadius: '8px', width: '100%' }} />
    </div>
  ),
})

const GuideForm = dynamic(() => import('@/app/components/GuideForm'))

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

  // LocalBusiness JSON-LD for richer SERP appearance
  const localBusinessSchema = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    'name': 'HOA Agent',
    'description': 'Palm Beach County HOA intelligence platform serving homebuyers, renters, and real estate agents.',
    'url': 'https://www.hoa-agent.com',
    'logo': 'https://www.hoa-agent.com/logo.png',
    'image': 'https://www.hoa-agent.com/logo.png',
    'areaServed': {
      '@type': 'AdministrativeArea',
      'name': 'Palm Beach County',
      'containedInPlace': { '@type': 'State', 'name': 'Florida' },
    },
    'serviceType': 'HOA Community Research',
    'priceRange': 'Free with paid premium reports',
  }

  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    'name': 'HOA Agent',
    'url': 'https://www.hoa-agent.com',
    'potentialAction': {
      '@type': 'SearchAction',
      'target': 'https://www.hoa-agent.com/search?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  }

  const orgSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'HOA Agent',
    legalName: 'HOA Agent LLC',
    url: 'https://www.hoa-agent.com',
    logo: 'https://www.hoa-agent.com/logo.png',
    description: 'Florida HOA intelligence platform covering Palm Beach County HOA and condo communities',
    foundingDate: '2026',
    areaServed: { '@type': 'AdministrativeArea', name: 'Palm Beach County, Florida' },
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'hello@hoa-agent.com',
      contactType: 'customer service',
    },
  }

  return (
    <main style={{fontFamily: 'system-ui, sans-serif', margin: 0, padding: 0, backgroundColor: '#f9f9f9'}}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />

      <NavBar
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

      <section style={{padding: '0 32px 48px', maxWidth: '680px', margin: '0 auto'}}>
        <div style={{fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '20px'}}>Frequently asked questions</div>
        <div style={{display: 'flex', flexDirection: 'column', gap: '1px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e5e5e5'}}>
          {[
            {
              q: 'What is HOA Agent?',
              a: 'HOA Agent is a free public database of HOA and condo community information for Palm Beach County, Florida. We aggregate fees, restrictions, litigation history, and resident reviews so buyers and residents can research any community before committing.',
            },
            {
              q: 'Is HOA Agent free to use?',
              a: 'Yes — completely free for homeowners, buyers, renters, and real estate professionals. Basic community profiles, fee data, restrictions, and resident reviews are available at no cost with no account required.',
            },
            {
              q: 'How often is the data updated?',
              a: 'Public records are refreshed on a weekly basis. Resident-submitted information is reviewed and added on an ongoing basis. Some communities have more data than others depending on available records.',
            },
            {
              q: 'What counties does HOA Agent cover?',
              a: 'HOA Agent currently covers Palm Beach County, Florida — over 7,000 HOA and condo communities across every city in the county. Expansion to neighboring counties is planned.',
            },
            {
              q: 'Can I trust the litigation data?',
              a: 'Litigation data is pulled from public court records and reflects what is publicly available at the time of the last update. It may not capture all cases or the current status of ongoing proceedings. Consult an attorney for legal advice before making real estate decisions.',
            },
            {
              q: 'How do I claim my community page?',
              a: 'HOA representatives and board members can claim their community page by visiting the community profile and clicking "Claim this page" at the bottom. We verify all claims before granting management access.',
            },
            {
              q: 'What is a news reputation score?',
              a: 'The news reputation score reflects how frequently a community has appeared in local and regional news coverage, and whether that coverage skewed positive or negative. A lower score may indicate the community has been in the news for disputes, lawsuits, or financial issues.',
            },
            {
              q: 'What is a special assessment in an HOA?',
              a: 'A special assessment is a one-time charge levied by an HOA or condo association above regular dues, typically to fund unexpected repairs, capital improvements, or reserve shortfalls. Under Florida law passed after the Surfside collapse, condo associations face stricter reserve funding requirements that have triggered large special assessments in many communities.',
            },
          ].map((item, i, arr) => (
            <div key={item.q} style={{backgroundColor: '#fff', padding: '18px 20px', borderBottom: i < arr.length - 1 ? '1px solid #f0f0f0' : 'none'}}>
              <div style={{fontSize: '14px', fontWeight: '600', color: '#1B2B6B', marginBottom: '6px'}}>{item.q}</div>
              <div style={{fontSize: '13px', color: '#555', lineHeight: '1.65'}}>{item.a}</div>
            </div>
          ))}
        </div>
      </section>

      <footer style={{borderTop: '1px solid #e5e5e5', padding: '24px 32px', textAlign: 'center', fontSize: '12px', color: '#888'}}>
        <div style={{marginBottom: '8px', fontWeight: '500', color: '#1a1a1a'}}>HOA Agent</div>
        <div>HOA Intelligence Platform · Palm Beach County · © 2026 HOA Agent LLC</div>
        <div style={{marginTop: '12px', display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap'}}>
          <a href="/about" style={{color: '#888', textDecoration: 'none'}}>About</a>
          <a href="/for-agents" style={{color: '#888', textDecoration: 'none'}}>For Agents</a>
          <a href="/press" style={{color: '#888', textDecoration: 'none'}}>Press</a>
          <a href="/advertise" style={{color: '#888', textDecoration: 'none'}}>Advertise</a>
          <a href="/privacy" style={{color: '#888', textDecoration: 'none'}}>Privacy</a>
          <a href="/terms" style={{color: '#888', textDecoration: 'none'}}>Terms</a>
        </div>
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
              "acceptedAnswer": { "@type": "Answer", "text": "HOA Agent is a free public database of HOA and condo community information for Palm Beach County, Florida. We aggregate fees, restrictions, litigation history, and resident reviews so buyers and residents can research any community before committing." }
            },
            {
              "@type": "Question",
              "name": "Is HOA Agent free to use?",
              "acceptedAnswer": { "@type": "Answer", "text": "Yes — completely free for homeowners, buyers, renters, and real estate professionals. Basic community profiles, fee data, restrictions, and resident reviews are available at no cost with no account required." }
            },
            {
              "@type": "Question",
              "name": "How often is the data updated?",
              "acceptedAnswer": { "@type": "Answer", "text": "Public records are refreshed on a weekly basis. Resident-submitted information is reviewed and added on an ongoing basis. Some communities have more data than others depending on available records." }
            },
            {
              "@type": "Question",
              "name": "What counties does HOA Agent cover?",
              "acceptedAnswer": { "@type": "Answer", "text": "HOA Agent currently covers Palm Beach County, Florida — over 7,000 HOA and condo communities across every city in the county. Expansion to neighboring counties is planned." }
            },
            {
              "@type": "Question",
              "name": "Can I trust the litigation data?",
              "acceptedAnswer": { "@type": "Answer", "text": "Litigation data is pulled from public court records and reflects what is publicly available at the time of the last update. It may not capture all cases or the current status of ongoing proceedings. Consult an attorney for legal advice before making real estate decisions." }
            },
            {
              "@type": "Question",
              "name": "How do I claim my community page?",
              "acceptedAnswer": { "@type": "Answer", "text": "HOA representatives and board members can claim their community page by visiting the community profile and clicking 'Claim this page' at the bottom. We verify all claims before granting management access." }
            },
            {
              "@type": "Question",
              "name": "What is a news reputation score?",
              "acceptedAnswer": { "@type": "Answer", "text": "The news reputation score reflects how frequently a community has appeared in local and regional news coverage, and whether that coverage skewed positive or negative. A lower score may indicate the community has been in the news for disputes, lawsuits, or financial issues." }
            },
            {
              "@type": "Question",
              "name": "What is a special assessment in an HOA?",
              "acceptedAnswer": { "@type": "Answer", "text": "A special assessment is a one-time charge levied by an HOA or condo association above regular dues, typically to fund unexpected repairs, capital improvements, or reserve shortfalls. Under Florida law passed after the Surfside collapse, condo associations face stricter reserve funding requirements that have triggered large special assessments in many communities." }
            }
          ]
        })}}
      />

    </main>
  )
}
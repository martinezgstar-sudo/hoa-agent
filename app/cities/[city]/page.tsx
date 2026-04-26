export const dynamic = 'force-dynamic'
import { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import { createClient } from '@supabase/supabase-js'

const CITY_DISPLAY: Record<string, string> = {
  'west-palm-beach': 'West Palm Beach',
  'boca-raton': 'Boca Raton',
  'boynton-beach': 'Boynton Beach',
  'delray-beach': 'Delray Beach',
  'jupiter': 'Jupiter',
  'palm-beach-gardens': 'Palm Beach Gardens',
  'wellington': 'Wellington',
  'lake-worth': 'Lake Worth',
  'riviera-beach': 'Riviera Beach',
  'north-palm-beach': 'North Palm Beach',
  'tequesta': 'Tequesta',
  'greenacres': 'Greenacres',
  'royal-palm-beach': 'Royal Palm Beach',
  'palm-springs': 'Palm Springs',
  'lantana': 'Lantana',
  'lake-park': 'Lake Park',
}


export async function generateMetadata({ params }: { params: { city: string } }): Promise<Metadata> {
  const city = CITY_DISPLAY[params.city] || params.city.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  return {
    title: `${city} HOA Communities — Fees, Reviews & Restrictions | HOA Agent`,
    description: `Browse HOA communities in ${city}. Find fees, restrictions, reviews and management company details for every homeowners association in ${city}, Palm Beach County.`,
    keywords: `${city} HOA, ${city} homeowners association, ${city} HOA fees, best HOA ${city}, HOA communities ${city} FL`,
  }
}

export default async function CityPage({ params }: { params: { city: string } }) {
  console.log('[city] env check:', {
    hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    city: params.city,
  })

  try {
    const city = CITY_DISPLAY[params.city] || params.city.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())

    const serverSupabase = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        )
      : supabase

    let communities: any[] = []
    try {
      const { data, error } = await serverSupabase
        .from('communities')
        .select('id,canonical_name,slug,city,monthly_fee_min,monthly_fee_max,property_type,review_count,review_avg,management_company,entity_status')
        .ilike('city', `%${city}%`)
        .eq('status', 'published')
        .order('canonical_name', { ascending: true })
        .limit(500)

      if (error) {
        console.error('[city page] error:', error)
        communities = []
      } else {
        communities = data || []
      }
    } catch (error) {
      console.error('[city page] error:', error)
      communities = []
    }

    const total = communities.length
    const withFees = communities.filter((c: any) => c.monthly_fee_min).length
    const avgFee = communities.filter(c => c.monthly_fee_min).reduce((a: number, c: any) => a + parseFloat(String(c.monthly_fee_min || 0)), 0) / (withFees || 1)

    return (
    <main style={{fontFamily:"system-ui,sans-serif",backgroundColor:"#f9f9f9",minHeight:"100vh"}}>
      <nav style={{backgroundColor:"#fff",borderBottom:"1px solid #e5e5e5",padding:"0 16px",height:"64px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <a href="/" style={{display:"flex",alignItems:"center",gap:"8px",textDecoration:"none"}}>
          <span style={{fontSize:"22px",fontWeight:"700",color:"#1B2B6B",letterSpacing:"-0.02em"}}>HOA<span style={{color:"#1D9E75"}}>Agent</span></span>
        </a>
        <div style={{display:"flex",gap:"12px",alignItems:"center"}}>
          <a href="/search" style={{fontSize:"13px",color:"#666",textDecoration:"none"}}>Browse</a>
          <a href="/reports" style={{fontSize:"13px",color:"#666",textDecoration:"none"}}>Reports</a>
          <a href="/search" style={{fontSize:"13px",backgroundColor:"#1D9E75",color:"#fff",padding:"6px 12px",borderRadius:"6px",whiteSpace:"nowrap",textDecoration:"none"}}>Share your HOA</a>
        </div>
      </nav>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{__html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          "name": `HOA Communities in ${city}`,
          "description": `Browse all HOA and condo communities in ${city}, Palm Beach County. Compare fees, restrictions and resident reviews.`,
          "url": `https://hoa-agent.com/cities/${params.city}`,
          "breadcrumb": {
            "@type": "BreadcrumbList",
            "itemListElement": [
              {"@type": "ListItem", "position": 1, "name": "HOA Agent", "item": "https://hoa-agent.com"},
              {"@type": "ListItem", "position": 2, "name": "Communities", "item": "https://hoa-agent.com/search"},
              {"@type": "ListItem", "position": 3, "name": city}
            ]
          }
        })}}
      />
      <div style={{maxWidth:"800px",margin:"0 auto",padding:"32px"}}>

        <div style={{fontSize:"12px",color:"#888",marginBottom:"16px"}}>
          <a href="/" style={{color:"#888",textDecoration:"none"}}>HOA Agent</a>
          {" › "}
          <a href="/search" style={{color:"#888",textDecoration:"none"}}>Communities</a>
          {" › "}
          <span>{city}</span>
        </div>

        <h1 style={{fontSize:"28px",fontWeight:"700",color:"#1B2B6B",marginBottom:"8px"}}>
          HOA Communities in {city}
        </h1>
        <p style={{fontSize:"14px",color:"#666",marginBottom:"24px",lineHeight:"1.6"}}>
          Browse all {total} homeowners associations and condo communities in {city}, Palm Beach County. 
          Compare fees, restrictions and resident reviews before you commit.
        </p>

        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"12px",marginBottom:"32px"}}>
          {[
        {num: total.toString(), label: "Communities"},
            {num: withFees > 0 ? "$"+Math.round(avgFee)+"/mo" : "—", label: "Avg HOA fee"},
            {num: withFees.toString(), label: "With fee data"},
          ].map(s => (
            <div key={s.label} style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"16px",textAlign:"center"}}>
              <div style={{fontSize:"24px",fontWeight:"700",color:"#1B2B6B",marginBottom:"4px"}}>{s.num}</div>
              <div style={{fontSize:"12px",color:"#888"}}>{s.label}</div>
            </div>
          ))}
        </div>

        {communities && communities.length > 0 ? (
          <div>
            {communities.map(c => (
              <a key={c.id} href={"/community/"+c.slug} style={{textDecoration:"none"}}>
                <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"16px 20px",marginBottom:"10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                    <div style={{fontSize:"15px",fontWeight:"500",color:"#1a1a1a",marginBottom:"3px"}}>{c.canonical_name}</div>
                    <div style={{fontSize:"12px",color:"#888"}}>
                      {c.property_type || "HOA"}
                      {c.management_company ? " · " + c.management_company : ""}
                      {c.entity_status ? " · " + c.entity_status : ""}
                    </div>
                    {c.review_count > 0 && (
                      <div style={{fontSize:"11px",color:"#1D9E75",marginTop:"4px"}}>
                        {"★".repeat(Math.round(c.review_avg || 0))} {c.review_avg} · {c.review_count} review{c.review_count !== 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                  <div style={{textAlign:"right",flexShrink:0,marginLeft:"16px"}}>
                    {c.monthly_fee_min ? (
                      <div style={{fontSize:"15px",fontWeight:"600",color:"#1a1a1a"}}>
                   ${c.monthly_fee_min}{c.monthly_fee_max && c.monthly_fee_max !== c.monthly_fee_min ? "–$"+c.monthly_fee_max : ""}/mo
                      </div>
                    ) : (
                      <div style={{fontSize:"12px",color:"#aaa"}}>Fee unknown</div>
                    )}
                    <div style={{fontSize:"11px",color:"#1D9E75",marginTop:"4px"}}>View profile →</div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div style={{textAlign:"center",padding:"60px",color:"#888",fontSize:"14px"}}>
            No published communities found for {city} yet.
            <div style={{marginTop:"16px"}}>
              <a href="/search" style={{color:"#1D9E75",textDecoration:"none"}}>Search all communities →</a>
            </div>
          </div>
        )}

        <div style={{marginTop:"40px",backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"24px",textAlign:"center"}}>
          <div style={{fontSize:"15px",fontWeight:"600",color:"#1a1a1a",marginBottom:"8px"}}>Know a community in {city} not listed here?</div>
          <div style={{fontSize:"13px",color:"#888",marginBottom:"16px"}}>Help buyers by sharing what you know about your HOA.</div>
          <a href="/search" style={{display:"inline-block",padding:"10px 24px",borderRadius:"8px",backgroundColor:"#1D9E75",color:"#fff",textDecoration:"none",fontSize:"13px",fontWeight:"600"}}>Share your HOA experience</a>
        </div>

      </div>

      <footer style={{borderTop:"1px solid #e5e5e5",padding:"24px 32px",textAlign:"center",fontSize:"12px",color:"#888",marginTop:"40px"}}>
        <div style={{marginBottom:"8px",fontWeight:"500",color:"#1a1a1a"}}>HOA Agent</div>
        <div>HOA Intelligence Platform · Palm Beach County · © 2026 HOA Agent LLC</div>
      </footer>
    </main>
    )
  } catch (error) {
    console.error('[city page] error:', error)
    const fallbackCity = CITY_DISPLAY[params.city] || params.city.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
    return (
      <main style={{fontFamily:"system-ui,sans-serif",backgroundColor:"#f9f9f9",minHeight:"100vh"}}>
        <div style={{maxWidth:"720px",margin:"0 auto",padding:"48px 24px",textAlign:"center"}}>
          <h1 style={{fontSize:"26px",fontWeight:700,color:"#1B2B6B",marginBottom:"10px"}}>
            HOA Communities in {fallbackCity}
          </h1>
          <p style={{fontSize:"14px",color:"#666",lineHeight:"1.6",marginBottom:"18px"}}>
            We could not load city communities right now. Please try again in a moment.
          </p>
          <a href="/search" style={{display:"inline-block",padding:"10px 18px",borderRadius:"8px",backgroundColor:"#1D9E75",color:"#fff",textDecoration:"none",fontSize:"13px",fontWeight:600}}>
            Browse all communities
          </a>
        </div>
      </main>
    )
  }
}

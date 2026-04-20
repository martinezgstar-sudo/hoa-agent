import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'

const FILTERS: Record<string, {
  label: string
  title: string
  description: string
  query: Record<string, any>
}> = {
  'pet-friendly': {
    label: 'Pet Friendly HOA Communities',
    title: 'Pet Friendly HOA Communities in {county} — Fees & Reviews | HOA Agent',
    description: 'Find pet friendly HOA communities in {county}, Florida. Browse communities that allow dogs and cats with verified fee data, resident reviews, and restriction details.',
    query: { pet_restriction: 'ilike.%Yes%' }
  },
  'no-short-term-rentals': {
    label: 'No Short-Term Rental HOA Communities',
    title: 'HOA Communities That Prohibit Short-Term Rentals in {county} | HOA Agent',
    description: 'Find HOA communities in {county} that prohibit Airbnb and VRBO. Browse verified restriction data, fees, and resident revis.',
    query: { str_restriction: 'ilike.%No%' }
  },
  'short-term-rental-allowed': {
    label: 'Short-Term Rental Friendly HOA Communities',
    title: 'HOA Communities That Allow Airbnb & VRBO in {county} | HOA Agent',
    description: 'Find HOA communities in {county} that allow short-term rentals. Browse communities where Airbnb and VRBO are permitted with verified fee data.',
    query: { str_restriction: 'ilike.%Yes%' }
  },
  'low-hoa-fees': {
    label: 'Low HOA Fee Communities',
    title: 'Low HOA Fee Communities in {county} — Under $300/mo | HOA Agent',
    description: 'Find affordable HOA communities in {county} with low monthly fees. Browse communities with fees under $300/month with verified data and resident reviews.',
    query: { monthly_fee_max: 'lte.300' }
  },
  'condos': {
    label: 'HOA Condo Communities',
    title: 'HOA Condo Communities in {county} — Fees & Reviews | HOA Agent',
    description: 'Browse HOA condo communities in {county}, Florida. Find verified fee data, restions, management companies, and resident reviews for condos.',
    query: { property_type: 'ilike.%Condo%' }
  },
  'single-family': {
    label: 'Single Family HOA Communities',
    title: 'Single Family HOA Communities in {county} — Fees & Reviews | HOA Agent',
    description: 'Browse single family home HOA communities in {county}, Florida. Find verified fee data, restrictions, management companies, and resident reviews.',
    query: { property_type: 'ilike.%Single family%' }
  },
  'no-rental-approval': {
    label: 'No Board Approval Required for Rentals',
    title: 'HOA Communities With No Rental Approval Required in {county} | HOA Agent',
    description: 'Find HOA communities in {county} that do not require board approval to rent. Browse verified restriction data, fees, and resident reviews.',
    query: { rental_approval: 'ilike.%No%' }
  },
  'master-hoa': {
    label: 'Master HOA Communities',
    title: 'Master HOA Communities in {county} — Full Sub-Community Guide | HOA Agent',
    descrin: 'Explore master-planned HOA communities in {county}, Florida. Browse all sub-communities, combined fee totals, and resident reviews.',
    query: { is_sub_hoa: 'eq.false' }
  }
}

const COUNTIES: Record<string, string> = {
  'palm-beach-county': 'Palm Beach County',
  'broward-county': 'Broward County',
  'miami-dade-county': 'Miami-Dade County',
}

export async function generateMetadata({ params }: { params: Promise<{ county: string, filter: string }> }) {
  const { county, filter } = await params
  const filterConfig = FILTERS[filter]
  const countyName = COUNTIES[county]
  if (!filterConfig || !countyName) return { title: 'HOA Agent' }

  return {
    title: filterConfig.title.replace(/{county}/g, countyName),
    description: filterConfig.description.replace(/{county}/g, countyName),
    openGraph: {
      title: filterConfig.title.replace(/{county}/g, countyName),
      description: filterConfig.description.replace(/{county}/g, countyName),
      url: `https://hoa-agent.com/florida/${county}/${filter}`,
      siteName: 'HOA Agent',
    },
    alternates: {
      canonical: `https://hoa-agent.com/florida/${county}/${filter}`,
    }
  }
}

export default async function FilterPage({ params }: { params: Promise<{ county: string, filter: string }> }) {
  const { county, filter } = await params
  const filterConfig = FILTERS[filter]
  const countyName = COUNTIES[county]
  if (!filterConfig || !countyName) notFound()

  let query = supabase
    .from('communities')
    .select('id,canonical_name,slug,city,monthly_fee_min,monthly_fee_max,property_type,review_avg,review_count,management_company')
    .eq('status', 'published')
    .eq('county', 'Palm Beach')
    .order('confidence_score', { ascending: false })
    .limit(60)

  if (filter === 'pet-friendly') query = query.ilike('pet_restriction', '%Yes%')
  else if (filter === 'no-short-term-rentals') query = query.ilike('str_restriction', '%No%')
  else if (filter === 'short-term-rental-allowed') query = query.ilike('str_restriction', '%Yes%')
  else if (filter === 'low-hoa-fees') query = query.lte('monthly_fee_max', 300).not('monthly_fee_max', 'is', null)
  else if (filter === 'condos') query = query.ilike('property_type', '%Condo%')
  else if (filter === 'single-family') query = query.ilike('property_type', '%Single family%')
  else if (filter === 'no-rental-approval') query = query.ilike('rental_approval', '%No%')
  else if (filter === 'master-hoa') query = query.eq('is_sub_hoa', false).not('id', 'in', '(select master_hoa_id from communities where master_hoa_id is not null)')

  const { data: communities } = await query
  const label = filterConfig.label.replace(/{county}/g, countyName)
  const title = filterConfig.title.replace(/{county}/g, countyName)
  const description = filterConfig.description.replace(/{county}/g, countyName)

  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": label + " in " + countyName,
    "description": description,
    "numberOfItems": communities?.length || 0,
    "itemListElement": (communities || []).slice(0, 10).map((c, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": c.canonical_name,
      "url": `https://hoa-agent.com/community/${c.slug}`
    }))
  }

  return (
    <main style={{fontFamily:"system-ui,sans-serif",margin:0,padding:0,backgroundColor:"#f9f9f9"}}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(schema)}} />

      <nav style={{backgroundColor:"#fff",borderBottom:"1px solid #e5e5e5",padding:"0 32px",height:"64px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <a href="/" style={{textDecoration:"none"}}>
          <span style={{fontSize:"22px",fontWeight:"700",color:"#1B2B6B",letterSpacing:"-0.02em"}}>HOA<span style={{color:"#1D9E75"}}>Agent</span></span>
        </a>
        <div style={{display:"flex",gap:"12px",alignItems:"center"}}>
          <a href="/search" style={{fontSize:"13px",color:"#666",textDecoration:"none"}}>Browse</a>
          <a href="/search" style={{fontSize:"13px",backgroundColor:"#1D9E75",color:"#fff",padding:"6px 12px",borderRadius:"6px",textDecoration:"none"}}>Search HOAs</a>
        </div>
      </nav>

      <div style={{maxWidth:"800px",margin:"0 auto",padding:"32px 24px"}}>
        <div style={{fontSize:"12px",color:"#888",marginBottom:"16px"}}>
          <a href="/" style={{color:"#888",textDecoration:"none"}}>HOA Agent</a>
          <span style={{margin:"0 6px"}}>›</span>
          <a href={`/cities/${county.replace('-county','')}`} style={{color:"#888",textDecoration:"none"}}>{countyName}</a>
          <span style={{margin:"0 6px"}}>›</span>
          <span style={{color:"#1a1a1a"}}>{label}</span>
        </div>

        <h1 style={{fontSize:"28px",fontWeight:"700",color:"#1a1a1a",marginBottom:"8px",lineHeight:"1.3"}}>{label} in {countyName}</h1>
        <p style={{fontSize:"15px",color:"#555",lineHeight:"1.7",marginBottom:"8px"}}>{description}</p>
        <div style={{fontSize:"13px",color:"#888",marginBottom:"32px"}}>{communities?.length || 0} communities found</div>

        <div style={{display:"flex",flexDirection:"column",gap:"10px",marginBottom:"40px"}}>
          {(communities || []).map((c: any) => (
            <a key={c.id} href={`/community/${c.slug}`} style={{textDecoration:"none"}}>
              <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"16px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",gap:"16px"}}>
                <div>
                  <div style={{fontSize:"14px",fontWeight:"600",color:"#1a1a1a",marginBottom:"4px"}}>{c.canonical_name}</div>
                  <div style={{fontSize:"12px",color:"#888"}}>
                    {c.city}{c.property_type ? " · " + c.property_type : ""}
                    {c.management_company ? " · " + c.management_company : ""}
                  </div>
                  {(c.review_count || 0) > 0 && (
                    <div style={{fontSize:"11px",color:"#EF9F27",marginTop:"4px"}}>
                      {"★".repeat(Math.r(c.review_avg || 0))} {c.review_avg} ({c.review_count} reviews)
                    </div>
                  )}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:"14px",fontWeight:"600",color:"#1B2B6B"}}>
                    {c.monthly_fee_min && c.monthly_fee_max ? "$" + c.monthly_fee_min + "–$" + c.monthly_fee_max + "/mo" : "Fee unknown"}
                  </div>
                  <div style={{fontSize:"11px",color:"#1D9E75",marginTop:"2px"}}>View profile →</div>
                </div>
              </div>
            </a>
          ))}
        </div>

        <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"24px",marginBottom:"24px"}}>
          <div style={{fontSize:"15px",fontWeight:"600",color:"#1a1a1a",marginBottom:"12px"}}>Browse by city in {countyName}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
            {["West Palm Beach","Boca Raton","Boynton h","Delray Beach","Jupiter","Palm Beach Gardens","Wellington","Lake Worth","Riviera Beach","North Palm Beach","Royal Palm Beach","Greenacres"].map(city => (
              <a key={city} href={`/cities/${city.toLowerCase().replace(/ /g,"-")}`}
                style={{fontSize:"12px",padding:"5px 12px",borderRadius:"20px",backgroundColor:"#f0f0f0",color:"#444",textDecoration:"none"}}>
                {city}
              </a>
            ))}
          </div>
        </div>

        <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"24px",marginBottom:"24px"}}>
          <div style={{fontSize:"15px",fontWeight:"600",color:"#1a1a1a",marginBottom:"12px"}}>More HOA filters in {countyName}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:"8px"}}>
            {Object.entries(FILTERS).filter(([k]) => k !== filter).map(([k, v]) => (
              <a key={k} href={`/florida/${county}/${k}`}
                style={{fontSize:"12px",padding:"5px 12px",borderRadius:"20px",backgroundColor:"#E1F5EE",color:"#1B2B6B",textDecoration:"none"}}>
                {v.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <footer style={{borderTop:"1px solid #e5e5e5",padding:"24px 32px",textAlign:"center",fontSize:"12px",color:"#888"}}>
        <div style={{marginBottom:"8px",fontWeight:"500",color:"#1a1a1a"}}>HOA Agent</div>
        <div>HOA Intelligence Platform · Palm Beach County · © 2026 HOA Agent LLC</div>
        <div style={{marginTop:"8px",fontSize:"11px",color:"#aaa",lineHeight:"1.6"}}>HOA Agent provides informational data only. Not affiliated with any HOA, management company, or government agency.</div>
      </footer>
    </main>
  )
}

"use client"
import { useEffect, useState } from "react"
import { use } from "react"

const AREA_CONFIG: Record<string, { display: string, city?: string, description: string }> = {
  "palm-beach-county": { display: "Palm Beach County", description: "Browse the top-rated HOA communities across Palm Beach County, ranked by resident reviews and data quality." },
  "west-palm-beach": { display: "West Palm Beach", city: "West Palm Beach", description: "Find the best homeowners associations in West Palm Beach, FL — rated by real residents." },
  "boca-raton": { display: "Boca Raton", city: "Boca Raton", description: "Discover top-rated HOA communities in Boca Raton, FL. Compare fees, amenities and resident reviews." },
  "boynton-beach": { display: "Boynton Beach", city: "Boynton Beach", description: "Find the best HOA communities in Boynton Beach, FL — real reviews from real residents." },
  "delray-beach": { display: "Delray Beach", city: "Delray Beach", description: "Top-rated homeowners associations in Delray Beach, FL. See fees, restrictions and reviews." },
  "jupiter": { display: "Jupiter", city: "Jupiter", description: "Best HOA communities in Jupiter, FL — ranked by resident reviews and fee transparency." },
  "palm-beach-gardens": { display: "Palm Beach Gardens", city: "Palm Beach Gardens", description: "Find top-rated HOA communities in Palm Beach Gardens, FL." },
  "wellington": { display: "Wellington", city: "Wellington", description: "Best homeowners associations in Wellington, FL — real data from real residents." },
  "lake-worth": { display: "Lake Worth", city: "Lake Worth", description: "Top-rated HOA communities in Lake Worth, FL." },
  "royal-palm-beach": { display: "Royal Palm Beach", city: "Royal Palm Beach", description: "Find the best HOA communities in Royal Palm Beach, FL." },
  "riviera-beach": { display: "Riviera Beach", city: "Riviera Beach", description: "Top-rated homeowners associations in Riviera Beach, FL." },
  "north-palm-beach": { display: "North Palm Beach", city: "North Palm Beach", description: "Best HOA communities in North Palm Beach, FL." },
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export default function BestHOAPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = use(params)
  const config = AREA_CONFIG[area]
  const [communities, setCommunities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      let url = SUPABASE_URL + "/rest/v1/communities?select=id,canonical_name,slug,city,monthly_fee_min,monthly_fee_max,property_type,review_count,review_avg,management_company,amenities,confidence_score&status=eq.published&order=confidence_score.desc&limit=20"
      if (config?.city) url += "&city=ilike.*" + encodeURIComponent(config.city) + "*"
      const res = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } })
      const data = await res.json()
      const rated = (data || []).filter((c: any) => c.review_count > 0).sort((a: any, b: any) => (b.review_avg || 0) - (a.review_avg || 0))
      const unrated = (data || []).filter((c: any) => !c.review_count || c.review_count === 0)
      setCommunities([...rated, ...unrated])
      setLoading(false)
    }
    load()
  }, [area])

  if (!config) return <div style={{padding:"40px",textAlign:"center"}}>Area not found. <a href="/">Go home</a></div>

  return (
    <main style={{fontFamily:"system-ui,sans-serif",backgroundColor:"#f9f9f9",minHeight:"100vh"}}>
      <nav style={{backgroundColor:"#fff",borderBottom:"1px solid #e5e5e5",padding:"0 32px",height:"72px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <a href="/" style={{display:"flex",alignItems:"center",gap:"8px",textDecoration:"none"}}>
          <span style={{fontSize:"22px",fontWeight:"700",color:"#1B2B6B",letterSpacing:"-0.02em"}}>HOA<span style={{color:"#1D9E75"}}>Agent</span></span>
        </a>
        <div style={{display:"flex",gap:"24px",alignItems:"center"}}>
          <a href="/search" style={{fontSize:"13px",color:"#666",textDecoration:"none"}}>Browse</a>
          <a href="/reports" style={{fontSize:"13px",color:"#666",textDecoration:"none"}}>Reports</a>
          <a href="/search" style={{fontSize:"13px",backgroundColor:"#1D9E75",color:"#fff",padding:"8px 16px",borderRadius:"6px",textDecoration:"none"}}>Share your HOA</a>
        </div>
      </nav>

      <div style={{maxWidth:"800px",margin:"0 auto",padding:"32px"}}>
        <div style={{fontSize:"12px",color:"#888",marginBottom:"16px"}}>
          <a href="/" style={{color:"#888",textDecoration:"none"}}>HOA Agent</a>
          {" › "}
          <a href="/best-hoa/palm-beach-county" style={{color:"#888",textDecoration:"none"}}>Best HOA Communities</a>
          {" › "}
          <span>{config.display}</span>
        </div>

        <h1 style={{fontSize:"28px",fontWeight:"700",color:"#1B2B6B",marginBottom:"8px"}}>
          Best HOA Communities in {config.display}
        </h1>
        <p style={{fontSize:"14px",color:"#666",marginBottom:"24px",lineHeight:"1.6"}}>{config.description}</p>

        <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginBottom:"24px"}}>
          {Object.entries(AREA_CONFIG).filter(([k]) => k !== area).slice(0,7).map(([key, val]) => (
            <a key={key} href={"/best-hoa/"+key}
              style={{fontSize:"12px",padding:"5px 12px",borderRadius:"20px",border:"1px solid #e0e0e0",color:"#666",textDecoration:"none",backgroundColor:"#fff"}}>
              {val.display}
            </a>
          ))}
        </div>

        {loading ? (
          <div style={{textAlign:"center",padding:"40px",color:"#888"}}>Loading...</div>
        ) : communities.length === 0 ? (
          <div style={{textAlign:"center",padding:"60px",color:"#888",fontSize:"14px"}}>No communities found yet for {config.display}.</div>
        ) : (
          communities.map((c, i) => (
            <a key={c.id} href={"/community/"+c.slug} style={{textDecoration:"none"}}>
              <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"16px 20px",marginBottom:"10px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"4px"}}>
                    <div style={{fontSize:"12px",fontWeight:"700",color:"#1B2B6B",width:"24px"}}>#{i+1}</div>
                    <div style={{fontSize:"15px",fontWeight:"500",color:"#1a1a1a"}}>{c.canonical_name}</div>
                  </div>
                  <div style={{fontSize:"12px",color:"#888",marginLeft:"32px"}}>
                    {c.city} · {c.property_type || "HOA"}
                    {c.management_company ? " · " + c.management_company : ""}
                  </div>
                  {c.review_count > 0 && (
                    <div style={{fontSize:"12px",color:"#1D9E75",marginLeft:"32px",marginTop:"4px"}}>
                      {"★".repeat(Math.round(c.rw_avg || 0))} {Number(c.review_avg).toFixed(1)} · {c.review_count} review{c.review_count !== 1 ? "s" : ""}
                    </div>
                  )}
                  {c.amenities && (
                    <div style={{fontSize:"11px",color:"#888",marginLeft:"32px",marginTop:"4px"}}>
                      {c.amenities.split("|").slice(0,4).join(" · ")}
                    </div>
                  )}
                </div>
                <div style={{textAlign:"right",flexShrink:0,marginLeft:"16px"}}>
                  {c.monthly_fee_min ? (
                    <div style={{fontSize:"15px",fontWeight:"600",color:"#1a1a1a"}}>
                      ${Math.round(c.monthly_fee_min)}{c.monthly_fee_max && c.monthly_fee_max !== c.monthly_fee_min ? "–$"+Math.round(c.monthly_fee_max) : ""}/mo
                    </div>
                  ) : (
                    <div style={{fontSize:"12px",color:"#aaa"}}>Fee unknown</div>
                  )}
                  <div style={{fontSize:"11px",color:"#1D9E75",marginTop:"4px"}}>View profile →</div>
                </div>
              </div>
            </a>
          ))
        )}

        <div style={{marginTop:"32px",backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"24px",textAlign:"center"}}>
          <div style={{fontSize:"15px",fontWeight:"600",color:"#1a1a1a",marginBottom:"8px"}}>Know a great HOA in {config.display}?</div>
          <div style={{fontSize:"13px",color:"#888",marginBottom:"16px"}}>Share your experience and help future buyers make better decisions.</div>
          <a href="/search" style={{display:"inline-block",padding:"10px 24px",borderRadius:"8px",backgroundColor:"#1D9E75",color:"#fff",textDecoration:"none",fontSize:"13px",fontWeight:"600"}}>Share your HOA</a>
        </div>
      </div>

      <footer style={{borderTop:"1px solid #e5e5e5",padding:"24px 32px",textAlign:"center",fontSize:"12px",color:"#888",marginTop:"40px"}}>
        <div style={{marginBottom:"8px",fontWeight:"500",color:"#1a1a1a"}}>HOA Agent</div>
      <div>HOA Intelligence Platform · Palm Beach County · © 2026</div>
      </footer>
    </main>
  )
}

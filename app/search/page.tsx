"use client"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

function getConfidenceLabel(score: number) {
  if (score >= 3) return { label: "High", color: "#1D9E75", bg: "#E1F5EE", stars: "★★★" }
  if (score >= 2) return { label: "Medium", color: "#EF9F27", bg: "#FAEEDA", stars: "★★☆" }
  return { label: "Low", color: "#E24B4A", bg: "#FEE9E9", stars: "★☆☆" }
}

export default function SearchPage() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [communities, setCommunities] = useState<any[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [loading, setLoading] = useState(false)
  const [addressResult, setAddressResult] = useState<any>(null)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<any>(null)

  useEffect(() => {
    const params = new URLSearchParamsearch)
    const q = params.get("q") || ""
    setQuery(q)
    fetchCommunities(q)
  }, [])

  async function fetchCommunities(q: string) {
    setLoading(true)
    const res = await fetch("/api/communities-search?q=" + encodeURIComponent(q))
    const data = await res.json()
    setCommunities(data.communities || [])
    setLoading(false)
  }

  async function fetchSuggestions(q: string) {
    if (q.length < 2) { setSuggestions([]); setShowSuggestions(false); return }
    const res = await fetch("/api/address-search?q=" + encodeURIComponent(q))
    const data = await res.json()
    setSuggestions(data.suggestions || [])
    setShowSuggestions((data.suggestions || []).length > 0)
  }

  function handleInput(val: string) {
    setQuery(val)
    setAddressResult(null)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300)
  }

  async function handleSuggestionClick(s: any) {
    setShowSuggestions(false)
    if (s.type === "community") {
      router.push("/community/" + s.slug)
      return
    }
    setSearching(true)
    setQuery(s.label)
    const res = await fetch("/api/address-lookup?pcn=" + s.pcn + "&streetName=" + encodeURIComponent(s.streetName) + "&city=" + encodeURIComponent(s.city))
    const data = await res.json()
    setAddressResult(data)
    setSearching(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setShowSuggestions(false)
    const isAddress = /^\d/.test(query.trim())
    if (isAddress) {
      setSearching(true)
      const res = await fetch("/api/address-search?q=" + encodeURIComponent(query))
      const data = await res.json()
      if (data.suggestions && data.suggestions.length > 0) {
        const s = data.suggestions[0]
        const res2 = await fetch("/api/address-lookup?pcn=" + s.pcn + "&streetName=" + encodeURIComponent(s.streetName) + "&city=" + encodeURIComponent(s.city))
        const data2 = await res2.json()
        setAddressResult(data2)
      } else {
        setAddressResult({ match: null })
      }
      setSearching(false)
    } else {
      fetchCommunities(query)
    }
  }

  const isAddress = /^\d/.test(query.trim())

  return (
    <main style={{fontFamily:"system-ui,sans-serif",backgroundColor:"#f9f9f9",minHeight:"100vh"}}>
      <nav style={{backgroundColor:"#fff",borderBottom:"1px solid #e5e5e5",padding:"0 32px",height:"72px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <a href="/" style={{display:"flex",alignItems:"center",gap:"8px",textDecoration:"none"}}>
          <img src="/logo.png" alt="HOA Agent" style={{height:"48px",width:"auto"}}/>
        </a>
        <div style={{display:"flex",gap:"24px",alignItems:"center"}}>
          <a href="/search" style={{fontSize:"13px",color:"#1D9E75",textDecoration:"none",fontWeight:"500"}}>Search</a>
          <a href="#" style={{fontSize:"13px",color:"#666",textDecoration:"none"}}>Pricing</a>
          <a href="#" style={{fontSize:"13px",backgroundColor:"#1B2B6B",color:"#fff",padding:"8px 16px",borderRadius:"6px",textDecoration:"none"}}>Sign in</a>
        </div>
      </nav>

      <div style={{backgroundColor:"#fff",borderBottom:"1px solid #e5e5e5",padding:"24px 32px"}}>
        <div style={{maxWidth:"720px",margin:"0 auto"}}>
          <h1 style={{fontSize:"22px",fontWeight:"600",color:"#1a1a1a",marginBottom:"4px"}}>Search HOA communities</h1>
          <p style={{fontSize:"13px",color:"#888",marginBottom:"16px"}}>Search by community name, city, management company — or enter a property address</p>
          <form onSubmit={handleSubmit} style={{position:"relative"}}>
            <div style={{display:"flex",gap:"8px"}}>
              <div style={{position:"relative",flex:1}}>
                <input
                  type="text"
                  value={query}
                  onChange={e => handleInput(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="Community name, city, or 123 Main St..."
                  style={{width:"100%",border:"1.5px solid #1B2B6B",borderRadius:"10px",padding:"10px 16px",fontSize:"14px",outline:"none",boxSizing:"border-box"}}
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div style={{position:"absolute",top:"100%",left:0,right:0,backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"10px",boxShadow:"0 4px 12px rgba(0,0,0,0.1)",zIndex:100,marginTop:"4px",overflow:"hidden"}}>
                    {suggestions.map((s: any, i: number) => (
                      <div
                        key={i}
                        onMouseDown={() => handleSuggestionClick(s)}
                        style={{padding:"10px 16px",cursor:"pointer",fontSize:"13px",borderBottom:i < suggestions.length-1 ? "1px solid #f0f0f0" : "none",display:"flex",alignItems:"center",gap:"8px"}}
                      >
                        <span style={{fontSize:"11px",padding:"2px 6px",borderRadius:"4px",backgroundColor:s.type==="address"?"#E1F5EE":"#EEF2FF",color:s.type==="address"?"#1B2B6B":"#4338CA",flexShrink:0}}>
                          {s.type === "address" ? "Address" : "HOA"}
                        </span>
                        {s.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button type="submit" style={{fontSize:"13px",padding:"10px 20px",borderRadius:"10px",backgroundColor:"#1D9E75",color:"#fff",border:"none",cursor:"pointer",fontWeight:"500",whiteSpace:"nowrap"}}>
                {searching ? "Searching..." : "Search"}
              </button>
            </div>
          </form>
          {isAddress && !addressResult && <div style={{fontSize:"12px",color:"#888",marginTop:"10px"}}>Enter a Palm Beach County address to find its HOA</div>}
        </div>
      </div>

      <div style={{maxWidth:"720px",margin:"0 auto",padding:"20px 32px"}}>
        {addressResult && (
          <div style={{marginBottom:"24px"}}>
            {addressResult.match ? (
              <div>
                <div style={{fontSize:"13px",color:"#888",marginBottom:"12px"}}>HOA community found for this address:</div>
                <a href={"/community/" + addressResult.match.slug} style={{textDecoration:"none"}}>
                  <div style={{backgroundColor:"#fff",border:"2px solid #1D9E75",borderRadius:"12px",padding:"16px 20px",cursor:"pointer"}}>
                    <div style={{fontSize:"15px",fontWeight:"600",color:"#1a1a1a",marginBottom:"3px"}}>{addressResult.match.canonical_name}</div>
                    <div style={{fontSize:"12px",color:"#888",marginBottom:"8px"}}>{addressResult.match.city}</div>
                    <div style={{fontSize:"13px",color:"#1D9E75",fontWeight:"500"}}>View community profile →</div>
                  </div>
                </a>
              </div>
            ) : addressResult.cityMatches ? (
              <div>
                <div style={{fontSize:"13px",color#888",marginBottom:"12px"}}>No exact match found. HOA communities in this area:</div>
                {addressResult.cityMatches.map((c: any) => (
                  <a key={c.slug} href={"/community/" + c.slug} style={{textDecoration:"none"}}>
                    <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"14px 20px",marginBottom:"8px",cursor:"pointer"}}>
                      <div style={{fontSize:"14px",fontWeight:"500",color:"#1a1a1a"}}>{c.canonical_name}</div>
                      <div style={{fontSize:"12px",color:"#888"}}>{c.city}</div>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"24px",textAlign:"center"}}>
                <div style={{fontSize:"15px",fontWeight:"500",color:"#1a1a1a",marginBottom:"8px"}}>This HOA is not in our database yet</div>
                <div style={{fontSize:"13px",color:"#888",marginBottom:"16px"}}>We cover 37 communities in Palm Beach County and are adding more.</div>
                <a href="mailto:info@hoa-agent.com" style={{fontSize:"13px",padding:"8px 20px",borderRadius:"8px",backgroundColor:"#1B2B6B",color:"#fff",textDecoration:"none"}}>Suggest this community</a>
              </div>
            )}
          </div>
        )}

        {!addressResult && (
          <>
            <div style={{fontSize:"12px",color:"#888",marginBottom:"16px"}}>{loading ? "Searching..." : communities.length + " communities found in Palm Beach County"}</div>
            {communities.length === 0 && !loading && query && (
              <div style={{textAlign:"center",padding:"60px",color:"#888",fontSize:"14px"}}>No communities found. Try a different search.</div>
            )}
            {communities.map((c: any) => (
              <a key={c.id} href={"/community/" + c.slug} style={{textDecoration:"none"}}>
                <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"16px 20px",marginBottom:"10px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",cursor:"pointer"}}>
                  <div>
                    <div style={{fontSize:"15px",fontWeight:"500",color:"#1a1a1a",marginBottom:"3px"}}>{c.canonical_name}</div>
                    <div style={{fontSize:"12px",color:"#888",marginBottom:"8px"}}>{c.city}{c.property_type ? " · " + c.property_type : ""}{c.unit_count ? " · " + c.unit_count + " units" : ""}</div>
                    <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                      <span style={{fontSize:"11px",padding:"2px 8px",borderRadius:"4px",backgroundColor:"#E1F5EE",color:"#1B2B6B"}}>Active entity</span>
                      {c.assessment_signal_count > 0 && <span style={{fontSize:"11px",padding:"2px 8px",borderRadius:"4px",backgroundColor:"#FAEEDA",color:"#854F0B"}}>{c.assessment_signal_count} signals</span>}
                      {c.management_company && c.management_compan!== "Unknown" && <span style={{fontSize:"11px",padding:"2px 8px",borderRadius:"4px",backgroundColor:"#f0f0f0",color:"#555"}}>{c.management_company}</span>}
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0,marginLeft:"16px"}}>
                    <div style={{fontSize:"15px",fontWeight:"500",color:"#1a1a1a"}}>{c.monthly_fee_min && c.monthly_fee_max ? "$" + c.monthly_fee_min + "-$" + c.monthly_fee_max + "/mo" : "Fee unknown"}</div>
                    {(() => { const conf = getConfidenceLabel(c.confidence_score); return <div style={{display:"inline-block",padding:"2px 10px",borderRadius:"20px",backgroundColor:conf.bg,color:conf.color,fontSize:"11px",fontWeight:"600"}}>{conf.stars} {conf.label}</div> })()}
                    <div style={{fontSize:"11px",color:"#1D9E75",marginTop:"4px"}}>View profile →</div>
                  </div>
                </div>
              </a>
            ))}
          </>
        )}
      </div>

      <footer style=borderTop:"1px solid #e5e5e5",padding:"24px 32px",textAlign:"center",fontSize:"12px",color:"#888"}}>
        <div style={{marginBottom:"8px",fontWeight:"500",color:"#1a1a1a"}}>HOA Agent</div>
        <div>Florida HOA intelligence platform · Palm Beach County · © 2026</div>
      </footer>
    </main>
  )
}

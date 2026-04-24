"use client"
import { useState, useRef } from "react"
import { useRouter } from "next/navigation"

function isAddressLike(value: string) {
  const q = value.trim()
  if (/^\d{5}$/.test(q)) return true
  return /\d/.test(q) && /[a-zA-Z]/.test(q)
}

export default function HomeSearch() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef<any>(null)

  async function fetchSuggestions(q: string) {
    if (q.trim().length < 3) { setSuggestions([]); setShowSuggestions(false); return }
    const res = await fetch("/api/address-search?q=" + encodeURIComponent(q))
    const data = await res.json()
    setSuggestions(data.suggestions || [])
    setShowSuggestions(isAddressLike(q) || (data.suggestions || []).length > 0)
  }

  function handleInput(val: string) {
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300)
  }

  async function handleSuggestionClick(s: any) {
    setShowSuggestions(false)
    if (s.type === "community") router.push("/community/" + s.slug)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const isAddress = isAddressLike(query)
    if (isAddress) {
      await fetchSuggestions(query)
      setShowSuggestions(true)
    } else {
      setShowSuggestions(false)
      router.push("/search?q=" + encodeURIComponent(query))
    }
  }

  return (
    <div style={{position:"relative",maxWidth:"560px",margin:"0 auto 20px"}}>
      <form onSubmit={handleSubmit} style={{display:"flex",gap:"8px",backgroundColor:"#fff",border:"1.5px solid #1B2B6B",borderRadius:"12px",padding:"6px 6px 6px 16px",alignItems:"center"}}>
        <div style={{position:"relative",flex:1}}>
          <input
            type="text"
            value={query}
            onChange={e => handleInput(e.target.value)}
            onFocus={() => (suggestions.length > 0 || isAddressLike(query)) && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Search by community name, city, or address..."
            style={{width:"100%",border:"none",outline:"none",fontSize:"16px",color:"#1a1a1a",backgroundColor:"transparent",WebkitTextFillColor:"#1a1a1a",opacity:1}}
          />
          {showSuggestions && (
            <div style={{position:"absolute",top:"calc(100% + 12px)",left:"-16px",right:"-6px",backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"10px",boxShadow:"0 4px 12px rgba(0,0,0,0.1)",zIndex:100,overflow:"hidden"}}>
              {suggestions.length > 0 ? (
                suggestions.map((s: any, i: number) => (
                  <div
                    key={i}
                    onMouseDown={() => handleSuggestionClick(s)}
                    style={{padding:"12px 16px",minHeight:"44px",cursor:"pointer",fontSize:"13px",borderBottom:i < suggestions.length-1?"1px solid #f0f0f0":"none",display:"flex",alignItems:"center",gap:"8px",textAlign:"left"}}
                  >
                    <span style={{fontSize:"11px",padding:"2px 6px",borderRadius:"4px",backgroundColor:s.type==="address"?"#E1F5EE":"#EEF2FF",color:s.type==="address"?"#1B2B6B":"#4338CA",flexShrink:0}}>
                      {s.type === "address" ? "Address" : "Association"}
                    </span>
                    {s.label}
                  </div>
                ))
              ) : (
                <div style={{padding:"12px 16px",fontSize:"13px",color:"#888",minHeight:"44px"}}>
                  No associations found for this ZIP yet.
                </div>
              )}
              <div style={{padding:"10px 16px",borderTop:"1px solid #f0f0f0",fontSize:"12px",color:"#999",fontStyle:"italic"}}>
                Not seeing your association?
              </div>
              <a
                href="/search"
                style={{display:"block",padding:"12px 16px",minHeight:"44px",fontSize:"13px",color:"#1D9E75",fontWeight:600,textDecoration:"none"}}
              >
                + Submit your association
              </a>
            </div>
          )}
        </div>
        <button type="submit" style={{fontSize:"13px",padding:"10px 20px",borderRadius:"8px",backgroundColor:"#1D9E75",color:"#fff",border:"none",cursor:"pointer",fontWeight:"500",whiteSpace:"nowrap"}}>
          Search
        </button>
      </form>
    </div>
  )
}

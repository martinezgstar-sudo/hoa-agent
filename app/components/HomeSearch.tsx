"use client"
import { useState, useRef } from "react"
import { useRouter } from "next/navigation"

export default function HomeSearch() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<any>(null)

  async function fetchSuggestions(q: string) {
    if (q.length < 2) { setSuggestions([]); setShowSuggestions(false); return }
    const res = await fetch("/api/address-search?q=" + encodeURIComponent(q))
    const data = await res.json()
    setSuggestions(data.suggestions || [])
    setShowSuggestions((data.suggestions || []).length > 0)
  }

  function handleInput(val: string) {
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300)
  }

  async function handleSuggestionClick(s: any) {
    setShowSuggestions(false)
    if (s.type === "community") {
      router.push("/community/" + s.slug)
      return
    }
    // Address — go to search page with lookup
    setSearching(true)
    const params = new URLSearchParams({ streetName: s.streetName || "", neighborhood: s.neighborhood || "", locality: s.locality || "", city: s.city || "" })
    const res = await fetch("/api/address-lookup?" + params.toString())
    const data = await res.json()
    setSearching(false)
    if (data.match) {
      router.push("/community/" + data.match.slug)
    } else {
      router.push("/search?address=" + encodeURIComponent(s.label) + "&result=" + encodeURIComponent(JSON.stringify(data)))
    }
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
        setSearching(false)
        if (data2.match) {
          router.push("/community/" + data2.match.slug)
          return
        }
        const encoded = encodeURIComponent(JSON.stringify(data2))
        router.push("/search?address=" + encodeURIComponent(query) + "&result=" + encoded)
        return
      }
      setSearching(false)
      router.push("/search?address=" + encodeURIComponent(query) + "&result=" + encodeURIComponent(JSON.stringify({match:null})))
    } else {
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
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Search by community name, city, or address..."
            style={{width:"100%",border:"none",outline:"none",fontSize:"14px",color:"#1a1a1a",backgroundColor:"transparent"}}
          />
          {showSuggestions && suggestions.length > 0 && (
            <div style={{position:"absolute",top:"calc(100% + 12px)",left:"-16px",right:"-6px",backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"10px",boxShadow:"0 4px 12px rgba(0,0,0,0.1)",zIndex:100,overflow:"hidden"}}>
              {suggestions.map((s: any, i: number) => (
                <div
                  key={i}
                  onMouseDown={() => handleSuggestionClick(s)}
                  style={{padding:"10px 16px",cursor:"pointer",fontSize:"13px",borderBottom:i < suggestions.length-1?"1px solid #f0f0f0":"none",display:"flex",alignItems:"center",gap:"8px",textAlign:"left"}}
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
        <button type="submit" style={{fontSize:"13px",padding:"10px 20px",borderRadius:"8px",backgroundColor:"#1D9E75",color:"#fff",border:"none",cursor:"pointer",fontWeight:"500",whiteSpace:"nowrap"}}>
          {searching ? "Searching..." : "Search"}
        </button>
      </form>
    </div>
  )
}

"use client"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

type Suggestion = {
  type: "community" | "zip"
  label: string
  slug?: string
  postcode?: string
}

export default function HomeSearch() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [isFocused, setIsFocused] = useState(false)
  const [loading, setLoading] = useState(false)
  const fetchSeq = useRef(0)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Live suggestions from /api/address-search as user types
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setSuggestions([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      const seq = ++fetchSeq.current
      try {
        const res = await fetch("/api/address-search?q=" + encodeURIComponent(q))
        const data = await res.json()
        if (seq !== fetchSeq.current) return // out-of-order response
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : [])
      } catch {
        if (seq === fetchSeq.current) setSuggestions([])
      } finally {
        if (seq === fetchSeq.current) setLoading(false)
      }
    }, 200)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  function handleSelect(s: Suggestion) {
    setIsFocused(false)
    setSuggestions([])
    if (s.type === "community" && s.slug) {
      router.push("/community/" + s.slug)
    } else if (s.type === "zip" && s.postcode) {
      router.push("/search?zip=" + encodeURIComponent(s.postcode))
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = query.trim()
    if (!t) return
    // ZIP code → /search?zip=
    const zipMatch = t.match(/^(\d{5})(?:-\d{4})?$/)
    if (zipMatch) {
      router.push("/search?zip=" + encodeURIComponent(zipMatch[1]))
      return
    }
    // If we have a community match for the typed query, jump straight to it
    const exact = suggestions.find(
      s => s.type === "community" && s.label.toLowerCase().startsWith(t.toLowerCase())
    )
    if (exact?.slug) {
      router.push("/community/" + exact.slug)
      return
    }
    // Fallback to the search page
    router.push("/search?q=" + encodeURIComponent(t))
  }

  const showDropdown = isFocused && (suggestions.length > 0 || (loading && query.trim().length >= 2))

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto 20px", width: "100%", boxSizing: "border-box", position: "relative" }}>
      <form onSubmit={handleSubmit} style={{ width: "100%" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            gap: "8px",
            alignItems: "stretch",
            width: "100%",
          }}
        >
          <div style={{ flex: "1 1 200px", minWidth: 0, width: "100%", position: "relative" }}>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setTimeout(() => setIsFocused(false), 150)}
              placeholder="Community name, city, or ZIP..."
              autoComplete="off"
              style={{
                width: "100%",
                border: "1.5px solid #e5e5e5",
                borderRadius: "8px",
                padding: "12px 14px",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
                fontFamily: "inherit",
                minHeight: "44px",
              }}
            />
            {showDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  marginTop: "4px",
                  backgroundColor: "#fff",
                  border: "1px solid #e0e0e0",
                  borderRadius: "8px",
                  boxShadow: "0 6px 20px rgba(0,0,0,0.08)",
                  maxHeight: "320px",
                  overflowY: "auto",
                  zIndex: 50,
                }}
              >
                {loading && suggestions.length === 0 && (
                  <div style={{ padding: "12px 14px", fontSize: "13px", color: "#888" }}>
                    Searching…
                  </div>
                )}
                {suggestions.map((s, i) => (
                  <button
                    key={(s.slug || s.postcode || s.label) + ":" + i}
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleSelect(s)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 14px",
                      fontSize: "13px",
                      backgroundColor: "#fff",
                      border: "none",
                      borderBottom: "1px solid #f5f5f5",
                      cursor: "pointer",
                      color: "#1a1a1a",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "12px",
                      fontFamily: "inherit",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f9f9f9")}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#fff")}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.label}
                    </span>
                    <span style={{ fontSize: "11px", color: "#1D9E75", flexShrink: 0 }}>
                      {s.type === "zip" ? "View ZIP →" : "View profile →"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="submit"
            style={{
              fontSize: "13px",
              padding: "10px 20px",
              borderRadius: "8px",
              backgroundColor: "#1D9E75",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontWeight: 500,
              whiteSpace: "nowrap",
              alignSelf: "stretch",
              minHeight: "44px",
            }}
          >
            Search
          </button>
        </div>
      </form>
      <div
        style={{
          marginTop: "12px",
          paddingTop: "12px",
          borderTop: "1px solid #e5e5e5",
          fontSize: "12px",
          color: "#999",
          fontStyle: "italic",
        }}
      >
        Not seeing your association?
      </div>
      <a
        href="/search"
        style={{
          display: "block",
          marginTop: "4px",
          padding: "12px 0",
          minHeight: "44px",
          fontSize: "13px",
          color: "#1D9E75",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        + Submit your association
      </a>
    </div>
  )
}

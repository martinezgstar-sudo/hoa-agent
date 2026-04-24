"use client"
import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { fetchMapboxAddressSuggestions } from "@/lib/mapbox-address-suggestions"

function isPureZipInput(value: string) {
  return /^\d{5}(-\d{4})?$/.test(value.trim())
}

function startsWithDigit(value: string) {
  return /^\d/.test(value.trim())
}

/** Show Mapbox / ZIP style dropdown (includes footer) */
function isAddressLikeForDropdown(value: string) {
  const t = value.trim()
  return isPureZipInput(t) || startsWithDigit(t)
}

export default function HomeSearch() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function fetchSuggestions(q: string) {
    const t = q.trim()
    if (t.length < 3) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    if (isPureZipInput(t)) {
      const res = await fetch("/api/address-search?q=" + encodeURIComponent(t))
      const data = await res.json()
      const list = data.suggestions || []
      setSuggestions(list)
      setShowSuggestions(true)
      return
    }

    if (startsWithDigit(t)) {
      const list = await fetchMapboxAddressSuggestions(t)
      setSuggestions(list)
      setShowSuggestions(true)
      return
    }

    const res = await fetch("/api/address-search?q=" + encodeURIComponent(t))
    const data = await res.json()
    const list = data.suggestions || []
    setSuggestions(list)
    setShowSuggestions(list.length > 0)
  }

  function handleInput(val: string) {
    setQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300)
  }

  function handleSuggestionClick(s: any) {
    setShowSuggestions(false)
    if (s.type === "community") {
      router.push("/community/" + s.slug)
      return
    }
    if ((s.type === "address" || s.type === "zip") && s.postcode) {
      router.push("/search?zip=" + encodeURIComponent(s.postcode))
      return
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = query.trim()
    if (isAddressLikeForDropdown(t)) {
      const zipOnly = t.match(/^(\d{5})(?:-\d{4})?$/)
      if (zipOnly) {
        router.push("/search?zip=" + encodeURIComponent(zipOnly[1]))
        return
      }
      const list = await fetchMapboxAddressSuggestions(t)
      const first = list.find((s) => s.postcode)
      if (first?.postcode) {
        router.push("/search?zip=" + encodeURIComponent(first.postcode))
        return
      }
      await fetchSuggestions(t)
      setShowSuggestions(true)
    } else {
      setShowSuggestions(false)
      router.push("/search?q=" + encodeURIComponent(t))
    }
  }

  return (
    <div style={{ position: "relative", maxWidth: "560px", margin: "0 auto 20px" }}>
      <form
        onSubmit={handleSubmit}
        style={{
          display: "flex",
          gap: "8px",
          backgroundColor: "#fff",
          border: "1.5px solid #1B2B6B",
          borderRadius: "12px",
          padding: "6px 6px 6px 16px",
          alignItems: "center",
        }}
      >
        <div style={{ position: "relative", flex: 1 }}>
          <input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onFocus={() =>
              (suggestions.length > 0 || isAddressLikeForDropdown(query)) && setShowSuggestions(true)
            }
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Search by community name, city, or address..."
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              fontSize: "16px",
              color: "#1a1a1a",
              backgroundColor: "transparent",
              WebkitTextFillColor: "#1a1a1a",
              opacity: 1,
            }}
          />
          {showSuggestions && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 12px)",
                left: "-16px",
                right: "-6px",
                backgroundColor: "#fff",
                border: "1px solid #e5e5e5",
                borderRadius: "10px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                zIndex: 100,
                overflow: "hidden",
              }}
            >
              {suggestions.length > 0 ? (
                suggestions.map((s: any, i: number) => (
                  <div
                    key={i}
                    onMouseDown={() => handleSuggestionClick(s)}
                    style={{
                      padding: "12px 16px",
                      minHeight: "44px",
                      cursor: "pointer",
                      fontSize: "13px",
                      borderBottom: i < suggestions.length - 1 ? "1px solid #f0f0f0" : "none",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "11px",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        backgroundColor: s.type === "community" ? "#EEF2FF" : "#E1F5EE",
                        color: s.type === "community" ? "#4338CA" : "#1B2B6B",
                        flexShrink: 0,
                      }}
                    >
                      {s.type === "community" ? "Association" : s.type === "zip" ? "ZIP" : "Address"}
                    </span>
                    <span style={{ wordBreak: "break-word" }}>{s.label}</span>
                  </div>
                ))
              ) : (
                <div style={{ padding: "12px 16px", fontSize: "13px", color: "#888", minHeight: "44px" }}>
                  {isAddressLikeForDropdown(query)
                    ? "No matching addresses. Try another street or ZIP."
                    : "No matching communities yet. Try a different name."}
                </div>
              )}
              <div
                style={{
                  padding: "10px 16px",
                  borderTop: "1px solid #f0f0f0",
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
                  padding: "12px 16px",
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
            fontWeight: "500",
            whiteSpace: "nowrap",
          }}
        >
          Search
        </button>
      </form>
    </div>
  )
}

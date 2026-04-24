"use client"
import type { SearchBoxRetrieveResponse } from "@mapbox/search-js-core"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { useState } from "react"

const SearchBox = dynamic(
  () => import("@mapbox/search-js-react").then((m) => m.SearchBox),
  { ssr: false },
)

function extractZip5(postcode: string | undefined) {
  if (!postcode) return ""
  const m = String(postcode).match(/\b(\d{5})\b/)
  return m ? m[1] : ""
}

export default function HomeSearch() {
  const router = useRouter()
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const [boxValue, setBoxValue] = useState("")

  function handleRetrieve(res: SearchBoxRetrieveResponse) {
    const feature = res.features[0]
    if (!feature?.properties) return
    const postcode = feature.properties.context?.postcode?.name
    const zip5 = extractZip5(postcode)
    if (zip5) router.push("/search?zip=" + encodeURIComponent(zip5))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = boxValue.trim()
    if (/^\d{5}(-\d{4})?$/.test(t)) {
      const m = t.match(/^(\d{5})/)
      if (m) router.push("/search?zip=" + encodeURIComponent(m[1]))
      return
    }
    if (t) router.push("/search?q=" + encodeURIComponent(t))
  }

  if (!token) {
    return (
      <div style={{ maxWidth: "560px", margin: "0 auto 20px", fontSize: "14px", color: "#888" }}>
        Search is unavailable (missing NEXT_PUBLIC_MAPBOX_TOKEN).
      </div>
    )
  }

  return (
    <div style={{ maxWidth: "560px", margin: "0 auto 20px", width: "100%", boxSizing: "border-box" }}>
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
          <div style={{ flex: "1 1 200px", minWidth: 0, width: "100%" }}>
            <SearchBox
              accessToken={token}
              options={{
                country: "US",
                proximity: { lng: -80.1918, lat: 26.7153 },
                language: "en",
                types: "address",
                limit: 6,
              }}
              value={boxValue}
              onChange={setBoxValue}
              onRetrieve={handleRetrieve}
              placeholder="Enter your address or ZIP code..."
              theme={{
                variables: {
                  fontFamily: "inherit",
                  borderRadius: "8px",
                },
              }}
            />
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

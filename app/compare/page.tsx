"use client"

import { useEffect, useState, useCallback, Suspense } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import NavBar from "@/app/components/NavBar"

type Community = {
  canonical_name: string
  slug: string
  city: string | null
  property_type: string | null
  unit_count: number | null
  monthly_fee_min: number | null
  monthly_fee_max: number | null
  monthly_fee_median: number | null
  management_company: string | null
  news_reputation_score: number | null
  news_reputation_label: string | null
  litigation_count: number | null
  pet_restriction: string | null
  rental_approval: string | null
  str_restriction: string | null
  vehicle_restriction: string | null
  amenities: string | null
  review_avg: number | null
  review_count: number | null
  website_url: string | null
  is_55_plus?: boolean | null
  is_gated?: boolean | null
  is_age_restricted?: boolean | null
}

type Suggestion = { type: string; label: string; slug?: string }

const NA = <span style={{ color: "#bbb", fontStyle: "italic" }}>—</span>

function fmtFee(c: Community): React.ReactNode {
  if (c.monthly_fee_min && c.monthly_fee_max) return `$${c.monthly_fee_min}–$${c.monthly_fee_max}/mo`
  if (c.monthly_fee_median) return `$${c.monthly_fee_median}/mo`
  return NA
}

function repScore(c: Community): React.ReactNode {
  if (c.news_reputation_score == null) return NA
  const s = c.news_reputation_score
  const bg = s <= 3 ? "#FEE9E9" : s <= 5 ? "#FAEEDA" : s <= 7 ? "#E6F1FB" : "#E1F5EE"
  const color = s <= 3 ? "#A32D2D" : s <= 5 ? "#854F0B" : s <= 7 ? "#0C447C" : "#0B5239"
  return (
    <span style={{ fontSize: "12px", padding: "2px 8px", borderRadius: "4px", backgroundColor: bg, color, fontWeight: 600 }}>
      {s}/10 {c.news_reputation_label || ""}
    </span>
  )
}

function litCell(c: Community): React.ReactNode {
  if (c.litigation_count == null) return NA
  const n = c.litigation_count
  const color = n === 0 ? "#0B5239" : n <= 2 ? "#854F0B" : "#A32D2D"
  return <span style={{ color, fontWeight: 600 }}>{n}</span>
}

export default function ComparePageWrapper() {
  return (
    <Suspense fallback={<div style={{ padding: 60, textAlign: "center", color: "#888" }}>Loading…</div>}>
      <ComparePageInner />
    </Suspense>
  )
}

function ComparePageInner() {
  const router = useRouter()
  const params = useSearchParams()
  const initialSlugs = (params.get("communities") || "").split(",").map((s) => s.trim()).filter(Boolean)
  const [slugs, setSlugs] = useState<string[]>(initialSlugs)
  const [communities, setCommunities] = useState<Community[]>([])
  const [searchQ, setSearchQ] = useState("")
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)

  const fetchCommunities = useCallback(async (currentSlugs: string[]) => {
    if (currentSlugs.length === 0) { setCommunities([]); return }
    setLoading(true)
    const res = await fetch("/api/compare?slugs=" + currentSlugs.join(","))
    const data = await res.json()
    setCommunities(data.communities || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchCommunities(slugs) }, [slugs, fetchCommunities])

  // Live search dropdown
  useEffect(() => {
    if (searchQ.trim().length < 2) { setSuggestions([]); return }
    const t = setTimeout(async () => {
      const res = await fetch("/api/address-search?q=" + encodeURIComponent(searchQ))
      const data = await res.json()
      const list = (data.suggestions || []).filter((s: Suggestion) => s.type === "community" && s.slug)
      setSuggestions(list.slice(0, 6))
    }, 200)
    return () => clearTimeout(t)
  }, [searchQ])

  function addCommunity(slug: string) {
    if (slugs.length >= 4) return
    if (slugs.includes(slug)) return
    const next = [...slugs, slug]
    setSlugs(next)
    setSearchQ("")
    setSuggestions([])
    router.replace("/compare?communities=" + next.join(","))
  }

  function removeCommunity(slug: string) {
    const next = slugs.filter((s) => s !== slug)
    setSlugs(next)
    router.replace(next.length ? "/compare?communities=" + next.join(",") : "/compare")
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", backgroundColor: "#f9f9f9", minHeight: "100vh" }}>
      <NavBar shareHref="/search" shareLabel="Find my HOA" />
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "40px 20px" }}>
        <div style={{ fontSize: "11px", fontWeight: 600, color: "#1D9E75", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "10px" }}>
          Tools
        </div>
        <h1 style={{ fontSize: "32px", fontWeight: 700, color: "#1B2B6B", marginBottom: "8px", letterSpacing: "-0.02em" }}>
          Compare HOA Communities
        </h1>
        <p style={{ fontSize: "14px", color: "#666", marginBottom: "24px" }}>
          Select up to 4 communities to compare side by side.
        </p>

        {/* Selector */}
        <div style={{ position: "relative", marginBottom: "16px" }}>
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder={slugs.length >= 4 ? "Maximum 4 communities" : "Search for a community to add…"}
            disabled={slugs.length >= 4}
            style={{ width: "100%", padding: "11px 14px", fontSize: "14px", border: "1px solid #d0d0d0", borderRadius: "10px", outline: "none", boxSizing: "border-box", fontFamily: "inherit" }}
          />
          {suggestions.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: "4px", backgroundColor: "#fff", border: "1px solid #e0e0e0", borderRadius: "8px", boxShadow: "0 4px 12px rgba(0,0,0,0.08)", zIndex: 20 }}>
              {suggestions.map((s) => (
                <button key={s.slug} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => s.slug && addCommunity(s.slug)} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 14px", border: "none", background: "#fff", cursor: "pointer", fontSize: "13px", borderBottom: "1px solid #f5f5f5", color: "#1a1a1a" }}>
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "20px" }}>
          {slugs.length === 0 && (
            <div style={{ fontSize: "13px", color: "#888", fontStyle: "italic" }}>No communities selected. Search above to add.</div>
          )}
          {slugs.map((s) => {
            const c = communities.find((x) => x.slug === s)
            return (
              <span key={s} style={{ padding: "6px 10px 6px 14px", backgroundColor: "#1B2B6B", color: "#fff", borderRadius: "20px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                {c?.canonical_name || s}
                <button onClick={() => removeCommunity(s)} style={{ background: "transparent", color: "#fff", border: "none", cursor: "pointer", fontSize: "14px", padding: "0 4px" }}>×</button>
              </span>
            )
          })}
        </div>

        {loading && <div style={{ textAlign: "center", padding: "40px", color: "#888" }}>Loading…</div>}

        {/* Comparison table */}
        {!loading && communities.length >= 2 && (
          <div style={{ overflowX: "auto", backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "600px" }}>
              <thead>
                <tr>
                  <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "#888", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.04em", backgroundColor: "#f5f5f5", borderBottom: "1px solid #e5e5e5", minWidth: "160px" }}>
                    Field
                  </th>
                  {communities.map((c) => (
                    <th key={c.slug} style={{ padding: "12px 16px", textAlign: "left", fontWeight: 600, color: "#1a1a1a", fontSize: "13px", backgroundColor: "#f5f5f5", borderBottom: "1px solid #e5e5e5" }}>
                      <Link href={`/community/${c.slug}`} style={{ color: "#1B2B6B", textDecoration: "none" }}>{c.canonical_name}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "City", get: (c: Community) => c.city || NA },
                  { label: "Property Type", get: (c: Community) => c.property_type || NA },
                  { label: "Unit Count", get: (c: Community) => c.unit_count ?? NA },
                  { label: "Monthly Fee", get: fmtFee },
                  { label: "Management Company", get: (c: Community) => c.management_company || NA },
                  { label: "News Reputation", get: repScore },
                  { label: "Litigation Count", get: litCell },
                  { label: "Age Restricted", get: (c: Community) => (
                    c.is_55_plus ? <span style={{ color: "#92400E", fontWeight: 600 }}>Yes — 55+ Community</span>
                    : c.is_age_restricted ? <span style={{ color: "#6B21A8", fontWeight: 600 }}>Yes</span>
                    : <span style={{ color: "#1D9E75" }}>No</span>
                  ) },
                  { label: "Gated", get: (c: Community) => (
                    c.is_gated ? <span style={{ color: "#1E40AF", fontWeight: 600 }}>Yes</span>
                    : <span style={{ color: "#1D9E75" }}>No</span>
                  ) },
                  { label: "Pet Policy", get: (c: Community) => c.pet_restriction || NA },
                  { label: "Rental Restrictions", get: (c: Community) => c.rental_approval || NA },
                  { label: "STR Restrictions", get: (c: Community) => c.str_restriction || NA },
                  { label: "Amenities", get: (c: Community) => c.amenities || NA },
                  { label: "Reviews", get: (c: Community) => c.review_count ? `${c.review_avg ?? "—"}★ (${c.review_count})` : NA },
                  { label: "Website", get: (c: Community) => c.website_url ? <a href={c.website_url} target="_blank" rel="noopener" style={{ color: "#1D9E75" }}>Visit ↗</a> : NA },
                ].map((row, i) => (
                  <tr key={row.label} style={{ borderBottom: "1px solid #f0f0f0", backgroundColor: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "10px 16px", fontSize: "12px", color: "#666", fontWeight: 600 }}>{row.label}</td>
                    {communities.map((c) => (
                      <td key={c.slug} style={{ padding: "10px 16px", fontSize: "13px", color: "#1a1a1a" }}>
                        {row.get(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && communities.length === 1 && (
          <div style={{ padding: "24px", backgroundColor: "#FAEEDA", border: "1px solid #EF9F27", borderRadius: "10px", color: "#854F0B", fontSize: "13px" }}>
            Add at least one more community to start comparing.
          </div>
        )}

        {communities.length > 0 && (
          <div style={{ marginTop: "20px", textAlign: "center" }}>
            <Link href="/search" style={{ fontSize: "13px", color: "#1D9E75", fontWeight: 600 }}>+ Add more from search →</Link>
          </div>
        )}
      </div>
    </main>
  )
}

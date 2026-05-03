"use client"

import { useEffect, useRef } from "react"

export type Advertiser = {
  id: string
  company_name: string
  tagline?: string | null
  phone?: string | null
  cta_text?: string | null
  cta_url?: string | null
  category?: string | null
  logo_url?: string | null
}

interface SponsoredCardProps {
  advertisers: Advertiser[]
  communitySlug?: string
  city?: string
}

// Category → initials-circle background color
const CATEGORY_COLOR: Record<string, string> = {
  cleaning: "#1D9E75",
  landscaping: "#534AB7",
  insurance: "#1B2B6B",
  legal: "#534AB7",
  moving: "#BA7517",
  "real estate": "#1B2B6B",
  "property management": "#534AB7",
  other: "#1B2B6B",
}

function initials(name: string): string {
  const words = name.replace(/[^A-Za-z\s]/g, "").trim().split(/\s+/)
  return (words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")
}

/** Fire-and-forget analytics POST. Never throws. Never blocks. */
function track(event_type: "impression" | "click", a: Advertiser, communitySlug?: string, city?: string) {
  try {
    fetch("/api/ads/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        advertiser_id: a.id,
        event_type,
        community_slug: communitySlug ?? null,
        city: city ?? null,
      }),
    }).catch(() => {})
  } catch {
    // swallow
  }
}

export default function SponsoredCard({ advertisers, communitySlug, city }: SponsoredCardProps) {
  const firedRef = useRef<Set<string>>(new Set())

  // Fire one impression per advertiser per mount
  useEffect(() => {
    for (const a of advertisers) {
      const key = a.id + ":" + (communitySlug ?? city ?? "")
      if (!firedRef.current.has(key)) {
        firedRef.current.add(key)
        track("impression", a, communitySlug, city)
      }
    }
  }, [advertisers, communitySlug, city])

  if (!advertisers || advertisers.length === 0) return null

  return (
    <div
      style={{
        backgroundColor: "#fff",
        border: "0.5px solid #e0e0e0",
        borderRadius: "12px",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "10px",
          right: "12px",
          fontSize: "10px",
          fontWeight: 600,
          color: "#999",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          backgroundColor: "rgba(255,255,255,0.85)",
          padding: "2px 6px",
          borderRadius: "4px",
          zIndex: 2,
        }}
      >
        Sponsored
      </div>

      {advertisers.map((ad, idx) => {
        const cat = (ad.category ?? "other").toLowerCase()
        const bg = CATEGORY_COLOR[cat] ?? CATEGORY_COLOR.other
        const init = initials(ad.company_name) || "??"
        const cta = ad.cta_text || "Learn More"
        const ctaHref = ad.cta_url || "#"

        return (
          <div
            key={ad.id}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "16px",
              padding: "16px 18px",
              borderTop: idx === 0 ? "none" : "0.5px solid #e0e0e0",
            }}
          >
            {/* Initials / logo circle */}
            <div
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                backgroundColor: bg,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                fontWeight: 700,
                flexShrink: 0,
                backgroundImage: ad.logo_url ? `url(${ad.logo_url})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
              {ad.logo_url ? "" : init}
            </div>

            {/* Info column */}
            <div style={{ flex: "1 1 200px", minWidth: 0 }}>
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#1B2B6B",
                  lineHeight: 1.3,
                }}
              >
                {ad.company_name}
              </div>
              {ad.tagline && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#666",
                    marginTop: "2px",
                    lineHeight: 1.4,
                  }}
                >
                  {ad.tagline}
                </div>
              )}
              {ad.phone && (
                <div style={{ fontSize: "12px", marginTop: "4px" }}>
                  <a
                    href={`tel:${ad.phone.replace(/[^0-9+]/g, "")}`}
                    style={{ color: "#1D9E75", textDecoration: "none", fontWeight: 500 }}
                  >
                    {ad.phone}
                  </a>
                </div>
              )}
            </div>

            {/* CTA column */}
            <div style={{ flexShrink: 0 }}>
              <a
                href={ctaHref}
                target="_blank"
                rel="noopener sponsored"
                onClick={() => track("click", ad, communitySlug, city)}
                style={{
                  display: "inline-block",
                  padding: "9px 16px",
                  backgroundColor: "#1D9E75",
                  color: "#fff",
                  fontSize: "13px",
                  fontWeight: 600,
                  borderRadius: "8px",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {cta}
              </a>
            </div>
          </div>
        )
      })}
    </div>
  )
}

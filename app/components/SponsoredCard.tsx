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
        borderLeft: "3px solid #1B2B6B",
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
        const hasNext = idx < advertisers.length - 1

        // Divider between multiple ads = 0.5px line with 8px breathing room above + below.
        // First row: 16px top, +8 bottom if a divider follows.
        // Middle row: +8 top, +8 bottom.
        // Last row: +8 top (divider above), 16px bottom.
        const padTop = idx === 0 ? "16px" : "24px"
        const padBottom = hasNext ? "24px" : "16px"

        return (
          <div
            key={ad.id}
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: "18px",
              padding: `${padTop} 20px ${padBottom}`,
              borderTop: idx === 0 ? "none" : "0.5px solid #e0e0e0",
            }}
          >
            {/* Initials / logo circle */}
            <div
              style={{
                width: "52px",
                height: "52px",
                borderRadius: "50%",
                backgroundColor: bg,
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
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
                  fontSize: "16px",
                  fontWeight: 500,
                  color: "#1B2B6B",
                  lineHeight: 1.3,
                }}
              >
                {ad.company_name}
              </div>
              {ad.tagline && (
                <div
                  style={{
                    fontSize: "13px",
                    color: "#666",
                    marginTop: "3px",
                    lineHeight: 1.45,
                  }}
                >
                  {ad.tagline}
                </div>
              )}
              {ad.phone && (
                <div style={{ fontSize: "14px", marginTop: "6px" }}>
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
            <div style={{ flexShrink: 0 }} data-sponsored-cta-wrap>
              <a
                href={ctaHref}
                target="_blank"
                rel="noopener sponsored"
                onClick={() => track("click", ad, communitySlug, city)}
                data-sponsored-cta
                style={{
                  display: "inline-block",
                  padding: "10px 20px",
                  backgroundColor: "#1D9E75",
                  color: "#fff",
                  fontSize: "14px",
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

      {/* Mobile: full-width CTA */}
      <style>{`
        @media (max-width: 600px) {
          [data-sponsored-cta-wrap] { width: 100% !important; flex: 1 1 100% !important; }
          [data-sponsored-cta] { display: block !important; width: 100% !important; text-align: center !important; box-sizing: border-box !important; }
        }
      `}</style>
    </div>
  )
}

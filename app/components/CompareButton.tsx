"use client"

import { useEffect, useState } from "react"

const COOKIE_NAME = "hoa_compare_slugs"
const MAX_COMPARE = 3

function readCookie(): string[] {
  if (typeof document === "undefined") return []
  const match = document.cookie.match(new RegExp("(?:^|; )" + COOKIE_NAME + "=([^;]*)"))
  if (!match) return []
  return decodeURIComponent(match[1]).split(",").map((s) => s.trim()).filter(Boolean)
}

function writeCookie(slugs: string[]) {
  if (typeof document === "undefined") return
  // 7-day expiry, root path so it's visible across community/city/search/compare pages.
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString()
  const value = slugs.length === 0 ? "" : encodeURIComponent(slugs.join(","))
  document.cookie = `${COOKIE_NAME}=${value}; expires=${expires}; path=/; SameSite=Lax`
  // Notify CompareBar (and any other live readers) that the selection changed.
  window.dispatchEvent(new CustomEvent("hoa-compare-changed", { detail: slugs }))
}

interface Props {
  slug: string
  variant?: "default" | "compact"
  className?: string
}

export default function CompareButton({ slug, variant = "default", className = "" }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setSelected(readCookie())
    setHydrated(true)
    function refresh() { setSelected(readCookie()) }
    window.addEventListener("hoa-compare-changed", refresh)
    return () => window.removeEventListener("hoa-compare-changed", refresh)
  }, [])

  const inList = selected.includes(slug)
  const atCap = !inList && selected.length >= MAX_COMPARE

  function toggle() {
    if (inList) {
      writeCookie(selected.filter((s) => s !== slug))
      return
    }
    if (atCap) return
    writeCookie([...selected, slug])
  }

  if (!hydrated) {
    // Render a stable placeholder during SSR + before mount to avoid layout shift.
    return (
      <span
        className={className}
        style={
          variant === "compact"
            ? { display: "inline-block", padding: "4px 10px", fontSize: "11px", color: "#888" }
            : { display: "inline-block", padding: "6px 14px", fontSize: "12px", color: "#888" }
        }
      >
        + Compare
      </span>
    )
  }

  const baseStyle: React.CSSProperties =
    variant === "compact"
      ? {
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          padding: "4px 10px",
          fontSize: "11px",
          fontWeight: 600,
          borderRadius: "999px",
          textDecoration: "none",
          cursor: atCap ? "not-allowed" : "pointer",
          border: "1px solid",
          whiteSpace: "nowrap",
        }
      : {
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 14px",
          fontSize: "12px",
          fontWeight: 600,
          borderRadius: "999px",
          textDecoration: "none",
          cursor: atCap ? "not-allowed" : "pointer",
          border: "1px solid",
          whiteSpace: "nowrap",
        }

  const colorStyle: React.CSSProperties = inList
    ? { backgroundColor: "#1D9E75", color: "#fff", borderColor: "#1D9E75" }
    : atCap
      ? { backgroundColor: "#f0f0f0", color: "#bbb", borderColor: "#e0e0e0" }
      : { backgroundColor: "#fff", color: "#1B2B6B", borderColor: "#1B2B6B" }

  const label = inList
    ? "In comparison ✓"
    : atCap
      ? `Compare (max ${MAX_COMPARE})`
      : "+ Add to comparison"

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        toggle()
      }}
      disabled={atCap}
      title={atCap ? `Maximum ${MAX_COMPARE} communities — remove one first` : ""}
      className={className}
      style={{ ...baseStyle, ...colorStyle }}
    >
      {label}
    </button>
  )
}

export const COMPARE_COOKIE_NAME = COOKIE_NAME
export const COMPARE_MAX = MAX_COMPARE

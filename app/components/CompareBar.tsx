"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { COMPARE_COOKIE_NAME, COMPARE_MAX } from "./CompareButton"

function readSlugs(): string[] {
  if (typeof document === "undefined") return []
  const m = document.cookie.match(new RegExp("(?:^|; )" + COMPARE_COOKIE_NAME + "=([^;]*)"))
  if (!m) return []
  return decodeURIComponent(m[1]).split(",").map((s) => s.trim()).filter(Boolean)
}

function clearSlugs() {
  if (typeof document === "undefined") return
  document.cookie = `${COMPARE_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
  window.dispatchEvent(new CustomEvent("hoa-compare-changed", { detail: [] }))
}

export default function CompareBar() {
  const [slugs, setSlugs] = useState<string[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setSlugs(readSlugs())
    setHydrated(true)
    function refresh() { setSlugs(readSlugs()) }
    window.addEventListener("hoa-compare-changed", refresh)
    return () => window.removeEventListener("hoa-compare-changed", refresh)
  }, [])

  if (!hydrated || slugs.length === 0) return null

  return (
    <div
      role="region"
      aria-label="Community comparison selection"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "20px",
        transform: "translateX(-50%)",
        zIndex: 9000,
        backgroundColor: "#1B2B6B",
        color: "#fff",
        padding: "12px 16px",
        borderRadius: "12px",
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        flexWrap: "wrap",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <span style={{ fontSize: "13px", fontWeight: 600 }}>
        {slugs.length} {slugs.length === 1 ? "community" : "communities"} in comparison{" "}
        <span style={{ opacity: 0.7, fontWeight: 400 }}>(max {COMPARE_MAX})</span>
      </span>
      <Link
        href={`/compare?ids=${slugs.join(",")}`}
        style={{
          padding: "7px 14px",
          backgroundColor: "#1D9E75",
          color: "#fff",
          textDecoration: "none",
          borderRadius: "8px",
          fontSize: "13px",
          fontWeight: 700,
        }}
      >
        Compare now →
      </Link>
      <button
        type="button"
        onClick={clearSlugs}
        style={{
          padding: "6px 12px",
          backgroundColor: "transparent",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: "8px",
          fontSize: "12px",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Clear
      </button>
    </div>
  )
}

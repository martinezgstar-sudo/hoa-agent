"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

type EventRow = {
  id: string
  event_type: string
  community_id: string | null
  community_slug: string | null
  city: string | null
  zip_code: string | null
  is_bot: boolean
  created_at: string
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export default function AnalyticsPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [advertiserId, setAdvertiserId] = useState<string>("")
  const [events, setEvents] = useState<EventRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        router.push("/advertise/login")
        return
      }
      setAdvertiserId(data.user.id)
      setAuthChecked(true)

      // Load events filtered by advertiser_id, exclude bots.
      // Pull last 365 days max — anything older is excluded for performance.
      const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
      const all: EventRow[] = []
      for (let off = 0; off < 50000; off += 1000) {
        const { data: rows, error } = await supabase
          .from("ad_events")
          .select("id, event_type, community_id, community_slug, city, zip_code, is_bot, created_at")
          .eq("advertiser_id", data.user.id)
          .eq("is_bot", false)
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .range(off, off + 999)
        if (error || !rows || rows.length === 0) break
        all.push(...(rows as EventRow[]))
        if (rows.length < 1000) break
      }
      setEvents(all)
      setLoading(false)
    })
  }, [router])

  const stats = useMemo(() => computeStats(events), [events])

  if (!authChecked) {
    return <div style={{ padding: 60, textAlign: "center", color: "#888" }}>Checking session…</div>
  }

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#f9f9f9", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ backgroundColor: "#fff", borderBottom: "1px solid #e5e5e5", padding: "14px 24px" }}>
        <Link href="/advertise/portal" style={{ fontSize: "13px", color: "#1B2B6B", textDecoration: "none", fontWeight: 600 }}>← Back to portal</Link>
        <span style={{ marginLeft: "12px", fontSize: "13px", color: "#888" }}>/ Analytics</span>
      </div>

      <div style={{ maxWidth: "880px", margin: "0 auto", padding: "32px 20px" }}>
        <div style={{ fontSize: "24px", fontWeight: 700, color: "#1B2B6B", marginBottom: "6px" }}>Performance</div>
        <div style={{ fontSize: "13px", color: "#666", marginBottom: "20px" }}>
          Bot traffic excluded. Counts are real human impressions and clicks across all your ads.
        </div>

        {loading ? (
          <div style={{ color: "#888", fontSize: "13px" }}>Loading…</div>
        ) : events.length === 0 ? (
          <div style={{ padding: "40px", textAlign: "center", backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", color: "#888", fontSize: "13px" }}>
            No events yet. Once your ads go live and impressions start firing, your data will appear here.
          </div>
        ) : (
          <>
            {/* KPI grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "20px" }}>
              <Kpi label="Impressions · 30 d" value={stats.windows.d30.impressions} />
              <Kpi label="Clicks · 30 d"      value={stats.windows.d30.clicks} sub={ctrLabel(stats.windows.d30.ctr)} />
              <Kpi label="Impressions · 90 d" value={stats.windows.d90.impressions} />
              <Kpi label="Clicks · 90 d"      value={stats.windows.d90.clicks} sub={ctrLabel(stats.windows.d90.ctr)} />
              <Kpi label="Impressions · all"  value={stats.windows.all.impressions} />
              <Kpi label="Clicks · all"       value={stats.windows.all.clicks} sub={ctrLabel(stats.windows.all.ctr)} />
            </div>

            <Section title="Top 5 ZIPs by clicks">
              {stats.topZips.length === 0 ? <Muted>No ZIP data on click events yet.</Muted> : (
                <BarList items={stats.topZips.map((r) => ({ label: r.key || "(no ZIP)", value: r.count }))} />
              )}
            </Section>

            <Section title="Top 5 communities by clicks">
              {stats.topCommunities.length === 0 ? <Muted>No community data on click events yet.</Muted> : (
                <BarList items={stats.topCommunities.map((r) => ({ label: r.key || "(no slug)", value: r.count }))} />
              )}
            </Section>

            <Section title="Day of week (clicks)">
              <BarList items={DAYS.map((d, i) => ({ label: d, value: stats.byDay[i] || 0 }))} />
            </Section>

            <Section title="Hour of day heatmap (clicks)">
              <HeatRow values={stats.byHour} />
            </Section>
          </>
        )}
      </div>
    </main>
  )
}

function ctrLabel(ctr: number): string {
  if (!isFinite(ctr) || ctr === 0) return ""
  return `${(ctr * 100).toFixed(2)}% CTR`
}

function Kpi({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "14px 16px" }}>
      <div style={{ fontSize: "10px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: "24px", fontWeight: 700, color: "#1B2B6B", marginTop: "4px" }}>{value.toLocaleString()}</div>
      {sub && <div style={{ fontSize: "11px", color: "#1D9E75", marginTop: "2px", fontWeight: 600 }}>{sub}</div>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "18px 20px", marginBottom: "16px" }}>
      <div style={{ fontSize: "13px", fontWeight: 700, color: "#1B2B6B", marginBottom: "10px" }}>{title}</div>
      {children}
    </section>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: "12px", color: "#888" }}>{children}</div>
}

function BarList({ items }: { items: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: "grid", gridTemplateColumns: "120px 1fr 50px", alignItems: "center", gap: "10px", fontSize: "12px" }}>
          <span style={{ color: "#555", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.label}>{it.label}</span>
          <div style={{ height: "8px", backgroundColor: "#f0f0f0", borderRadius: "4px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(it.value / max) * 100}%`, backgroundColor: "#1D9E75", borderRadius: "4px" }} />
          </div>
          <span style={{ color: "#1a1a1a", fontWeight: 600, textAlign: "right" }}>{it.value}</span>
        </div>
      ))}
    </div>
  )
}

function HeatRow({ values }: { values: number[] }) {
  const max = Math.max(1, ...values)
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: "2px" }}>
        {values.map((v, h) => {
          const intensity = v / max
          const bg = `rgba(29, 158, 117, ${0.1 + intensity * 0.85})`
          return (
            <div
              key={h}
              title={`${h.toString().padStart(2, "0")}:00 — ${v} clicks`}
              style={{ height: "24px", backgroundColor: bg, borderRadius: "3px" }}
            />
          )
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: "2px", fontSize: "9px", color: "#888", marginTop: "4px", textAlign: "center" }}>
        {Array.from({ length: 24 }).map((_, h) => <span key={h}>{h % 6 === 0 ? h : ""}</span>)}
      </div>
    </div>
  )
}

// ── Stats compute ────────────────────────────────────────────────────────────

type Window = { impressions: number; clicks: number; ctr: number }

function computeStats(events: EventRow[]) {
  const now = Date.now()
  const W30 = 30 * 24 * 60 * 60 * 1000
  const W90 = 90 * 24 * 60 * 60 * 1000

  const windows = {
    d30: emptyWindow(),
    d90: emptyWindow(),
    all: emptyWindow(),
  }
  const zipCounts = new Map<string, number>()
  const commCounts = new Map<string, number>()
  const byDay = Array(7).fill(0) as number[]
  const byHour = Array(24).fill(0) as number[]

  for (const e of events) {
    const t = new Date(e.created_at).getTime()
    const age = now - t
    const isClick = e.event_type === "click" || e.event_type === "cta_click" || e.event_type === "website_click"
    const isImp = e.event_type === "impression"

    if (isClick || isImp) {
      windows.all[isClick ? "clicks" : "impressions"]++
      if (age <= W30) windows.d30[isClick ? "clicks" : "impressions"]++
      if (age <= W90) windows.d90[isClick ? "clicks" : "impressions"]++
    }
    if (isClick) {
      const z = e.zip_code || ""
      zipCounts.set(z, (zipCounts.get(z) || 0) + 1)
      const c = e.community_slug || ""
      commCounts.set(c, (commCounts.get(c) || 0) + 1)
      const d = new Date(t)
      byDay[d.getDay()]++
      byHour[d.getHours()]++
    }
  }
  ;(["d30", "d90", "all"] as const).forEach((k) => {
    const w = windows[k]
    w.ctr = w.impressions > 0 ? w.clicks / w.impressions : 0
  })

  const topZips = topN(zipCounts, 5)
  const topCommunities = topN(commCounts, 5)

  return { windows, topZips, topCommunities, byDay, byHour }
}

function emptyWindow(): Window {
  return { impressions: 0, clicks: 0, ctr: 0 }
}

function topN(m: Map<string, number>, n: number) {
  return Array.from(m.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
}

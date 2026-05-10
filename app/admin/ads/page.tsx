"use client"

import { useEffect, useMemo, useState } from "react"

const ADMIN_PASSWORD = "Valean2008!"

type Profile = {
  id: string
  company_name?: string | null
  email?: string | null
  phone?: string | null
  category_id?: string | null
  category_text?: string | null
  subscription_plan?: string | null
  subscription_status?: string | null
  target_zips?: string[] | null
  created_at?: string
}

type Ad = {
  id: string
  advertiser_id: string
  status?: string
  headline?: string | null
  body?: string | null
  cta_text?: string | null
  cta_url?: string | null
}

type Tab = "pending" | "active" | "all"

export default function AdminAdsPage() {
  const [authed, setAuthed] = useState(
    typeof window !== "undefined" && sessionStorage.getItem("hoa_admin") === "true",
  )
  const [password, setPassword] = useState("")
  const [tab, setTab] = useState<Tab>("pending")
  const [rows, setRows] = useState<Profile[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string>("")
  const [msg, setMsg] = useState<string>("")
  const [detail, setDetail] = useState<{ profile: Profile; ads: Ad[] } | null>(null)

  const counts = useMemo(() => {
    const out = { pending: 0, active: 0, rejected: 0, total: rows.length }
    for (const r of rows) {
      const s = (r.subscription_status || "").toLowerCase()
      if (s.startsWith("pending")) out.pending++
      else if (s === "active") out.active++
      else if (s === "rejected") out.rejected++
    }
    return out
  }, [rows])

  async function load() {
    setLoading(true)
    setMsg("")
    try {
      const r = await fetch("/api/admin/ads", {
        headers: { "x-admin-password": ADMIN_PASSWORD },
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Load failed")
      setRows((d.profiles || []) as Profile[])
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Load failed")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authed) return
    load()
  }, [authed])

  async function approve(p: Profile) {
    if (!confirm(`Approve ${p.company_name || p.email || p.id}? This will activate their category lock.`)) return
    setBusyId(p.id)
    setMsg("")
    try {
      const r = await fetch("/api/admin/ads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": ADMIN_PASSWORD },
        body: JSON.stringify({ advertiser_id: p.id, action: "approve" }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Approve failed")
      setMsg(`✓ Approved ${p.company_name || p.email || p.id}`)
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Approve failed")
    } finally {
      setBusyId("")
    }
  }

  async function reject(p: Profile) {
    const reason = prompt(`Reject ${p.company_name || p.email || p.id}? Optional reason:`, "")
    if (reason === null) return
    setBusyId(p.id)
    setMsg("")
    try {
      const r = await fetch("/api/admin/ads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": ADMIN_PASSWORD },
        body: JSON.stringify({ advertiser_id: p.id, action: "reject", reason }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Reject failed")
      setMsg(`✗ Rejected ${p.company_name || p.email || p.id}`)
      await load()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Reject failed")
    } finally {
      setBusyId("")
    }
  }

  async function viewDetails(p: Profile) {
    setBusyId(p.id)
    try {
      const r = await fetch(`/api/admin/ads?advertiser_id=${p.id}`, {
        headers: { "x-admin-password": ADMIN_PASSWORD },
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Detail load failed")
      setDetail({ profile: p, ads: (d.ads || []) as Ad[] })
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Load failed")
    } finally {
      setBusyId("")
    }
  }

  const visible = useMemo(() => {
    if (tab === "all") return rows
    return rows.filter((r) => {
      const s = (r.subscription_status || "").toLowerCase()
      return tab === "pending" ? s.startsWith("pending") : s === tab
    })
  }, [rows, tab])

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#f9f9f9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif" }}>
        <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "16px", padding: "40px", width: "340px", textAlign: "center" }}>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#1B2B6B", marginBottom: "4px" }}>
            HOA<span style={{ color: "#1D9E75" }}>Agent</span>
          </div>
          <div style={{ fontSize: "13px", color: "#888", marginBottom: "28px" }}>Admin Ads</div>
          <input
            id="admin-password"
            name="admin-password"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && password === ADMIN_PASSWORD) {
                setAuthed(true)
                sessionStorage.setItem("hoa_admin", "true")
              }
            }}
            style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1.5px solid #e5e5e5", fontSize: "14px", outline: "none", boxSizing: "border-box", marginBottom: "12px" }}
          />
          <button
            onClick={() => {
              if (password === ADMIN_PASSWORD) {
                setAuthed(true)
                sessionStorage.setItem("hoa_admin", "true")
              } else { alert("Wrong password") }
            }}
            style={{ width: "100%", padding: "11px", backgroundColor: "#1B2B6B", color: "#fff", border: "none", borderRadius: "8px", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
          >
            Sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#f9f9f9", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ backgroundColor: "#fff", borderBottom: "1px solid #e5e5e5", padding: "14px 24px" }}>
        <a href="/admin" style={{ fontSize: "13px", color: "#1B2B6B", textDecoration: "none", fontWeight: 600 }}>← Admin home</a>
        <span style={{ marginLeft: "12px", fontSize: "13px", color: "#888" }}>/ Advertiser signups</span>
      </div>

      <div style={{ maxWidth: "1080px", margin: "0 auto", padding: "28px 20px" }}>
        <div style={{ fontSize: "22px", fontWeight: 700, color: "#1B2B6B", marginBottom: "8px" }}>
          Advertiser signups
        </div>
        <div style={{ fontSize: "13px", color: "#666", marginBottom: "18px" }}>
          Review pending submissions. Approve to activate the category lock; reject to free the ZIPs.
        </div>

        {/* Counts row */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "18px" }}>
          <CountTile label="Pending" value={counts.pending} color="#854F0B" bg="#FAEEDA" />
          <CountTile label="Active" value={counts.active} color="#155A3F" bg="#E1F5EE" />
          <CountTile label="Rejected" value={counts.rejected} color="#A32D2D" bg="#FEE9E9" />
          <CountTile label="Total" value={counts.total} color="#1B2B6B" bg="#E6F1FB" />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
          {(["pending", "active", "all"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: "7px 14px",
                fontSize: "12px",
                borderRadius: "999px",
                border: "1px solid #e5e5e5",
                backgroundColor: tab === t ? "#1B2B6B" : "#fff",
                color: tab === t ? "#fff" : "#555",
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {t}
            </button>
          ))}
          <button type="button" onClick={load} style={{ marginLeft: "auto", padding: "7px 14px", fontSize: "12px", borderRadius: "999px", border: "1px solid #e5e5e5", backgroundColor: "#fff", color: "#555", cursor: "pointer" }}>
            Refresh
          </button>
        </div>

        {msg && (
          <div style={{ padding: "10px 14px", backgroundColor: "#E6F1FB", border: "1px solid #1B2B6B", borderRadius: "8px", color: "#0C447C", fontSize: "13px", marginBottom: "12px" }}>
            {msg}
          </div>
        )}

        {loading && <div style={{ color: "#888", fontSize: "13px" }}>Loading…</div>}

        {!loading && visible.length === 0 && (
          <div style={{ padding: "32px", backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", color: "#888", textAlign: "center", fontSize: "13px" }}>
            No advertisers in this tab.
          </div>
        )}

        {!loading && visible.map((p) => (
          <div key={p.id} style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "16px 18px", marginBottom: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 280px" }}>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#1a1a1a" }}>
                  {p.company_name || p.email || p.id}
                </div>
                <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>
                  {[p.email, p.phone].filter(Boolean).join(" · ")}
                </div>
                <div style={{ display: "flex", gap: "6px", marginTop: "8px", flexWrap: "wrap" }}>
                  <Pill label={`Plan: ${p.subscription_plan || "—"}`} bg="#E6F1FB" color="#0C447C" />
                  <Pill label={`Status: ${p.subscription_status || "—"}`} bg={statusBg(p.subscription_status)} color={statusColor(p.subscription_status)} />
                  <Pill label={`Cat: ${p.category_text || "—"}${p.category_id ? "" : " (custom)"}`} bg="#FEF3C7" color="#92400E" />
                  <Pill
                    label={p.subscription_plan === "county" ? "ZIPs: countywide" : `ZIPs: ${(p.target_zips || []).slice(0, 4).join(", ") || "—"}${(p.target_zips || []).length > 4 ? "…" : ""}`}
                    bg="#f0f0f0" color="#555"
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button type="button" onClick={() => approve(p)} disabled={busyId === p.id || p.subscription_status === "active"} style={{ padding: "7px 12px", fontSize: "12px", fontWeight: 700, borderRadius: "8px", border: "none", backgroundColor: p.subscription_status === "active" ? "#ddd" : "#1D9E75", color: "#fff", cursor: p.subscription_status === "active" ? "default" : "pointer" }}>
                  Approve
                </button>
                <button type="button" onClick={() => reject(p)} disabled={busyId === p.id || p.subscription_status === "rejected"} style={{ padding: "7px 12px", fontSize: "12px", fontWeight: 700, borderRadius: "8px", border: "1px solid #E24B4A", backgroundColor: "#fff", color: "#A32D2D", cursor: "pointer" }}>
                  Reject
                </button>
                <button type="button" onClick={() => viewDetails(p)} disabled={busyId === p.id} style={{ padding: "7px 12px", fontSize: "12px", fontWeight: 600, borderRadius: "8px", border: "1px solid #e5e5e5", backgroundColor: "#fff", color: "#555", cursor: "pointer" }}>
                  View Details
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {detail && (
        <DetailModal detail={detail} onClose={() => setDetail(null)} />
      )}
    </main>
  )
}

function statusBg(s?: string | null): string {
  const v = (s || "").toLowerCase()
  if (v.startsWith("pending")) return "#FAEEDA"
  if (v === "active") return "#E1F5EE"
  if (v === "rejected") return "#FEE9E9"
  return "#f0f0f0"
}
function statusColor(s?: string | null): string {
  const v = (s || "").toLowerCase()
  if (v.startsWith("pending")) return "#854F0B"
  if (v === "active") return "#155A3F"
  if (v === "rejected") return "#A32D2D"
  return "#555"
}

function Pill({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{ fontSize: "11px", padding: "3px 9px", borderRadius: "999px", backgroundColor: bg, color, fontWeight: 600 }}>
      {label}
    </span>
  )
}

function CountTile({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <div style={{ padding: "12px 16px", backgroundColor: bg, borderRadius: "10px", minWidth: "140px" }}>
      <div style={{ fontSize: "10px", fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: "22px", fontWeight: 700, color, marginTop: "2px" }}>{value}</div>
    </div>
  )
}

function DetailModal({ detail, onClose }: { detail: { profile: Profile; ads: Ad[] }; onClose: () => void }) {
  const { profile: p, ads } = detail
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.4)", zIndex: 999 }} />
      <div style={{ position: "fixed", top: "5%", left: "50%", transform: "translateX(-50%)", backgroundColor: "#fff", borderRadius: "12px", padding: "24px", width: "min(640px, 92vw)", maxHeight: "90vh", overflowY: "auto", zIndex: 1000, boxShadow: "0 20px 60px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#1B2B6B" }}>{p.company_name || p.email}</div>
            <div style={{ fontSize: "11px", color: "#888" }}>{p.id}</div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", fontSize: "20px", color: "#888", cursor: "pointer" }}>×</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "8px 16px", fontSize: "13px", marginBottom: "20px" }}>
          {[
            ["Email", p.email],
            ["Phone", p.phone],
            ["Plan", p.subscription_plan],
            ["Status", p.subscription_status],
            ["Category", `${p.category_text || ""} ${p.category_id ? "" : "(custom — needs review)"}`.trim()],
            ["Target ZIPs", p.subscription_plan === "county" ? "All Palm Beach County ZIPs" : (p.target_zips || []).join(", ")],
            ["Created", p.created_at ? new Date(p.created_at).toLocaleString() : ""],
          ].map(([k, v], i) => (
            <div key={i} style={{ display: "contents" }}>
              <div style={{ color: "#888", fontWeight: 600 }}>{k}</div>
              <div style={{ color: "#1a1a1a", wordBreak: "break-word" }}>{v || "—"}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: "13px", fontWeight: 700, color: "#1B2B6B", marginBottom: "8px" }}>
          Ad creatives ({ads.length})
        </div>
        {ads.length === 0 ? (
          <div style={{ fontSize: "12px", color: "#888" }}>No ads created yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {ads.map((a) => (
              <div key={a.id} style={{ border: "1px solid #e5e5e5", borderRadius: "8px", padding: "10px 12px" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "#1a1a1a" }}>{a.headline || "(no headline)"}</div>
                <div style={{ fontSize: "11px", color: "#666", marginTop: "2px" }}>{a.body || ""}</div>
                {a.cta_url && (
                  <div style={{ fontSize: "11px", color: "#1D9E75", marginTop: "4px" }}>
                    {a.cta_text || "CTA"} → {a.cta_url}
                  </div>
                )}
                <div style={{ fontSize: "10px", color: "#888", marginTop: "4px" }}>status: {a.status || "—"}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

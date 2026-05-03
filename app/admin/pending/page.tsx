"use client"

import { useState, useEffect, useCallback } from "react"

const ADMIN_PASSWORD = "Valean2008!"

// ── Types ────────────────────────────────────────────────────────────────────

interface PendingDataRow {
  id: string
  community_id: string
  field_name: string
  proposed_value: string
  source_url: string | null
  source_type: string | null
  confidence: number | null
  auto_approvable: boolean
  status: string
  created_at: string
  communities?: { canonical_name: string; slug: string | null }
}

interface PendingFeeRow {
  id: string
  community_id: string
  fee_amount: number
  fee_rounded_min: number | null
  fee_rounded_max: number | null
  fee_rounded_median: number | null
  source_url: string | null
  source_type: string | null
  listing_date: string | null
  status: string
  created_at: string
  communities?: { canonical_name: string; slug: string | null }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function pct(n: number | null) {
  if (n === null) return "—"
  return `${Math.round(n * 100)}%`
}
function fmt(n: number | null) {
  if (n === null || n === undefined) return "—"
  return `$${n.toLocaleString()}`
}
function badge(label: string, color: string) {
  return (
    <span style={{
      display:"inline-block",padding:"2px 8px",borderRadius:"10px",
      fontSize:"11px",fontWeight:600,
      backgroundColor: color === "green" ? "#e8f9f2" : color === "blue" ? "#e8f0ff" :
        color === "orange" ? "#fff3e0" : color === "red" ? "#ffeaea" : "#f5f5f5",
      color: color === "green" ? "#1D9E75" : color === "blue" ? "#1B2B6B" :
        color === "orange" ? "#e65c00" : color === "red" ? "#c0392b" : "#888",
    }}>{label}</span>
  )
}

// ── Tab 1: Pending Community Data ────────────────────────────────────────────

function PendingDataTab() {
  const [rows, setRows]         = useState<PendingDataRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [msg, setMsg]           = useState("")
  const [filterField, setFilterField] = useState("")
  const [filterType, setFilterType]   = useState("")
  const [filterStatus, setFilterStatus] = useState("pending")
  const [bulkWorking, setBulkWorking]   = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ status: filterStatus })
    if (filterField) params.set("field_name", filterField)
    if (filterType)  params.set("source_type", filterType)
    const res = await fetch(`/api/admin/pending?table=community_data&${params}`, {
      headers: { "x-admin-password": ADMIN_PASSWORD }
    })
    const json = await res.json()
    setRows(json.rows || [])
    setLoading(false)
  }, [filterStatus, filterField, filterType])

  useEffect(() => { load() }, [load])

  async function approve(row: PendingDataRow) {
    const res = await fetch("/api/admin/pending", {
      method: "POST",
      headers: { "x-admin-password": ADMIN_PASSWORD, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", table: "community_data", id: row.id,
        community_id: row.community_id, field_name: row.field_name,
        proposed_value: row.proposed_value })
    })
    const json = await res.json()
    setMsg(json.ok ? `✓ Approved — ${row.field_name} updated` : `✗ ${json.error}`)
    load()
  }

  async function reject(id: string) {
    const res = await fetch("/api/admin/pending", {
      method: "POST",
      headers: { "x-admin-password": ADMIN_PASSWORD, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", table: "community_data", id })
    })
    const json = await res.json()
    setMsg(json.ok ? "✗ Rejected" : `Error: ${json.error}`)
    load()
  }

  async function bulkApproveAuto() {
    setBulkWorking(true)
    const res = await fetch("/api/admin/pending", {
      method: "POST",
      headers: { "x-admin-password": ADMIN_PASSWORD, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "bulk_approve_auto" })
    })
    const json = await res.json()
    setMsg(json.ok ? `✓ Bulk approved ${json.count} auto-approvable records` : `✗ ${json.error}`)
    setBulkWorking(false)
    load()
  }

  const autoCount = rows.filter(r => r.auto_approvable && r.status === "pending").length
  const fieldOptions = [...new Set(rows.map(r => r.field_name))].sort()
  const typeOptions  = [...new Set(rows.map(r => r.source_type).filter(Boolean))].sort() as string[]

  return (
    <div>
      {/* Filters */}
      <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginBottom:"16px",alignItems:"center"}}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={selectStyle}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All statuses</option>
        </select>
        <select value={filterField} onChange={e => setFilterField(e.target.value)}
          style={selectStyle}>
          <option value="">All fields</option>
          {fieldOptions.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          style={selectStyle}>
          <option value="">All sources</option>
          {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {autoCount > 0 && filterStatus === "pending" && (
          <button onClick={bulkApproveAuto} disabled={bulkWorking}
            style={{...btnStyle, backgroundColor:"#1D9E75", color:"#fff", marginLeft:"auto"}}>
            {bulkWorking ? "Working…" : `✓ Bulk approve ${autoCount} auto-approvable`}
          </button>
        )}
      </div>

      {msg && (
        <div style={{padding:"10px 14px",borderRadius:"8px",
          backgroundColor: msg.startsWith("✓") ? "#e8f9f2" : "#ffeaea",
          color: msg.startsWith("✓") ? "#1D9E75" : "#c0392b",
          fontSize:"13px",marginBottom:"16px"}}>
          {msg}
        </div>
      )}

      {loading && <div style={centerStyle}>Loading…</div>}
      {!loading && rows.length === 0 && (
        <div style={centerStyle}>No {filterStatus || ""} records found.</div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{overflowX:"auto"}}>
          <table style={tableStyle}>
            <thead>
              <tr style={{backgroundColor:"#f9f9f9"}}>
                {["Community","Field","Proposed Value","Source","Type","Confidence","Auto","Status","Actions"]
                  .map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.id} style={{borderBottom:"1px solid #f0f0f0"}}>
                  <td style={tdStyle}>
                    <div style={{fontWeight:600,fontSize:"12px"}}>{row.communities?.canonical_name || row.community_id.slice(0,8)}</div>
                    {row.communities?.slug && (
                      <a href={`/community/${row.communities.slug}`} target="_blank"
                        style={{fontSize:"11px",color:"#888",textDecoration:"none"}}>view ↗</a>
                    )}
                  </td>
                  <td style={tdStyle}><code style={{fontSize:"11px",background:"#f5f5f5",padding:"2px 6px",borderRadius:"4px"}}>{row.field_name}</code></td>
                  <td style={{...tdStyle, maxWidth:"200px", wordBreak:"break-word" as any}}>{row.proposed_value}</td>
                  <td style={tdStyle}>
                    {row.source_url ? (
                      <a href={row.source_url} target="_blank"
                        style={{fontSize:"11px",color:"#1B2B6B",textDecoration:"none"}}>link ↗</a>
                    ) : "—"}
                  </td>
                  <td style={tdStyle}>{row.source_type ? badge(row.source_type, "blue") : "—"}</td>
                  <td style={tdStyle}>{pct(row.confidence)}</td>
                  <td style={tdStyle}>{row.auto_approvable ? badge("auto","green") : badge("manual","orange")}</td>
                  <td style={tdStyle}>{badge(row.status, row.status==="approved"?"green":row.status==="rejected"?"red":"orange")}</td>
                  <td style={tdStyle}>
                    {row.status === "pending" && (
                      <div style={{display:"flex",gap:"6px"}}>
                        <button onClick={() => approve(row)}
                          style={{...btnSmall, backgroundColor:"#1D9E75",color:"#fff"}}>✓</button>
                        <button onClick={() => reject(row.id)}
                          style={{...btnSmall, backgroundColor:"#f5f5f5",color:"#c0392b"}}>✗</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{fontSize:"12px",color:"#888",marginTop:"12px"}}>{rows.length} record{rows.length!==1?"s":""}</div>
        </div>
      )}
    </div>
  )
}

// ── Tab 2: Pending Fee Observations ──────────────────────────────────────────

type FeeOverrides = { min: string; median: string; max: string }

function PendingFeesTab() {
  const [rows, setRows]         = useState<PendingFeeRow[]>([])
  const [loading, setLoading]   = useState(false)
  const [msg, setMsg]           = useState("")
  const [filterStatus, setFilterStatus] = useState("pending")
  // Per-row admin-edited values. Keyed by row id.
  const [overrides, setOverrides] = useState<Record<string, FeeOverrides>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/pending?table=fee_observations&status=${filterStatus}`, {
      headers: { "x-admin-password": ADMIN_PASSWORD }
    })
    const json = await res.json()
    const newRows: PendingFeeRow[] = json.rows || []
    setRows(newRows)
    // Pre-fill overrides with the rounded values returned from the server
    const seeded: Record<string, FeeOverrides> = {}
    for (const r of newRows) {
      seeded[r.id] = {
        min:    r.fee_rounded_min    != null ? String(r.fee_rounded_min)    : "",
        median: r.fee_rounded_median != null ? String(r.fee_rounded_median) : "",
        max:    r.fee_rounded_max    != null ? String(r.fee_rounded_max)    : "",
      }
    }
    setOverrides(seeded)
    setLoading(false)
  }, [filterStatus])

  useEffect(() => { load() }, [load])

  // Count how many observations per community
  const countByCommunity = rows.reduce((acc, r) => {
    acc[r.community_id] = (acc[r.community_id] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  function setOverrideField(id: string, field: keyof FeeOverrides, value: string) {
    setOverrides(prev => ({
      ...prev,
      [id]: { ...(prev[id] ?? { min: "", median: "", max: "" }), [field]: value },
    }))
  }

  function parseOverride(s: string | undefined): number | null {
    if (s === undefined) return null
    const t = s.trim()
    if (!t) return null
    const v = parseFloat(t)
    return isNaN(v) ? null : v
  }

  async function approveFee(row: PendingFeeRow) {
    const ov = overrides[row.id] ?? { min: "", median: "", max: "" }
    const min    = parseOverride(ov.min)
    const median = parseOverride(ov.median)
    const max    = parseOverride(ov.max)

    const res = await fetch("/api/admin/pending", {
      method: "POST",
      headers: { "x-admin-password": ADMIN_PASSWORD, "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "approve_fee", id: row.id,
        community_id: row.community_id,
        // Defaults from the original observation
        fee_rounded_min:    row.fee_rounded_min,
        fee_rounded_max:    row.fee_rounded_max,
        fee_rounded_median: row.fee_rounded_median,
        // Admin-edited overrides (used by the API when present)
        fee_min_override:    min,
        fee_median_override: median,
        fee_max_override:    max,
      })
    })
    const json = await res.json()
    setMsg(json.ok ? `✓ Fee approved — monthly_fee set on community` : `✗ ${json.error}`)
    load()
  }

  async function rejectFee(id: string) {
    const res = await fetch("/api/admin/pending", {
      method: "POST",
      headers: { "x-admin-password": ADMIN_PASSWORD, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject", table: "fee_observations", id })
    })
    const json = await res.json()
    setMsg(json.ok ? "✗ Rejected" : `Error: ${json.error}`)
    load()
  }

  return (
    <div>
      <div style={{display:"flex",gap:"8px",marginBottom:"16px",alignItems:"center"}}>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={selectStyle}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All statuses</option>
        </select>
        <div style={{fontSize:"12px",color:"#888",marginLeft:"auto"}}>
          ⚠ Fees from listing sites (Zillow, Realtor.com, MLS) are never auto-approved.
        </div>
      </div>

      {msg && (
        <div style={{padding:"10px 14px",borderRadius:"8px",
          backgroundColor: msg.startsWith("✓") ? "#e8f9f2" : "#ffeaea",
          color: msg.startsWith("✓") ? "#1D9E75" : "#c0392b",
          fontSize:"13px",marginBottom:"16px"}}>
          {msg}
        </div>
      )}

      {loading && <div style={centerStyle}>Loading…</div>}
      {!loading && rows.length === 0 && (
        <div style={centerStyle}>No {filterStatus || ""} fee observations found.</div>
      )}

      {!loading && rows.length > 0 && (
        <div style={{display:"flex",flexDirection:"column",gap:"12px"}}>
          {rows.map(row => {
            const ov = overrides[row.id] ?? { min: "", median: "", max: "" }
            return (
              <div key={row.id}
                style={{
                  backgroundColor:"#fff",
                  border:"1px solid #e5e5e5",
                  borderRadius:"10px",
                  padding:"16px 18px",
                  display:"grid",
                  gridTemplateColumns:"minmax(200px, 1fr) minmax(360px, 1.2fr) auto",
                  gap:"18px",
                  alignItems:"start",
                }}>
                {/* Community + meta column */}
                <div>
                  <div style={{fontWeight:600,fontSize:"13px",color:"#1a1a1a",marginBottom:"4px"}}>
                    {row.communities?.canonical_name || row.community_id.slice(0,8)}
                  </div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"6px",alignItems:"center",marginBottom:"8px"}}>
                    {row.source_type ? badge(row.source_type,"orange") : null}
                    {badge(row.status, row.status==="approved"?"green":row.status==="rejected"?"red":"orange")}
                    {countByCommunity[row.community_id] > 1 && (
                      <span style={{fontSize:"11px",color:"#1D9E75",fontWeight:600}}>
                        {countByCommunity[row.community_id]} obs for this community
                      </span>
                    )}
                  </div>
                  {row.communities?.slug && (
                    <a href={`/community/${row.communities.slug}`} target="_blank"
                      style={{fontSize:"11px",color:"#888",textDecoration:"none"}}>view community ↗</a>
                  )}
                </div>

                {/* Found + editable overrides column */}
                <div>
                  <div style={{
                    fontSize:"12px",color:"#888",marginBottom:"8px",
                    fontStyle:"italic",
                  }}>
                    Found: <strong style={{color:"#666"}}>{fmt(row.fee_amount)}</strong> from{" "}
                    <strong style={{color:"#666"}}>{row.source_type || "unknown"}</strong>
                    {row.source_url && (
                      <>
                        {" — "}
                        <a href={row.source_url} target="_blank"
                          style={{color:"#888",textDecoration:"underline"}}>source ↗</a>
                      </>
                    )}
                    {row.listing_date && (
                      <span style={{marginLeft:"8px"}}>· listed {row.listing_date.slice(0,10)}</span>
                    )}
                  </div>
                  <label style={{
                    display:"block",fontSize:"11px",fontWeight:600,
                    color:"#1B2B6B",marginBottom:"6px",
                    textTransform:"uppercase" as const,letterSpacing:"0.04em",
                  }}>
                    Your verified amount:
                  </label>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"8px"}}>
                    <FeeInput label="Min"    value={ov.min}    onChange={v => setOverrideField(row.id,"min",v)}    disabled={row.status !== "pending"}/>
                    <FeeInput label="Median" value={ov.median} onChange={v => setOverrideField(row.id,"median",v)} disabled={row.status !== "pending"}/>
                    <FeeInput label="Max"    value={ov.max}    onChange={v => setOverrideField(row.id,"max",v)}    disabled={row.status !== "pending"}/>
                  </div>
                  <div style={{fontSize:"11px",color:"#999",marginTop:"6px"}}>
                    Round to nearest $25. Enter your independently verified amount.
                  </div>
                </div>

                {/* Actions column */}
                <div style={{display:"flex",flexDirection:"column",gap:"6px",alignItems:"flex-end"}}>
                  {row.status === "pending" && (
                    <>
                      <button onClick={() => approveFee(row)}
                        style={{...btnStyle, backgroundColor:"#1D9E75",color:"#fff",minWidth:"100px"}}
                        title="Apply your verified values to monthly_fee_min/median/max">
                        ✓ Approve
                      </button>
                      <button onClick={() => rejectFee(row.id)}
                        style={{...btnStyle, backgroundColor:"#f5f5f5",color:"#c0392b",minWidth:"100px"}}>
                        ✗ Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
          <div style={{fontSize:"12px",color:"#888",marginTop:"4px"}}>{rows.length} observation{rows.length!==1?"s":""}</div>
        </div>
      )}
    </div>
  )
}

function FeeInput({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div>
      <div style={{fontSize:"10px",color:"#888",marginBottom:"3px",fontWeight:600}}>{label}</div>
      <div style={{position:"relative"}}>
        <span style={{
          position:"absolute",left:"8px",top:"50%",transform:"translateY(-50%)",
          color:"#888",fontSize:"12px",pointerEvents:"none",
        }}>$</span>
        <input
          type="number"
          inputMode="numeric"
          step="25"
          min="0"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          style={{
            width:"100%",
            padding:"6px 8px 6px 18px",
            borderRadius:"6px",
            border:"1px solid #d0d0d0",
            fontSize:"13px",
            outline:"none",
            boxSizing:"border-box",
            backgroundColor: disabled ? "#f5f5f5" : "#fff",
            fontFamily:"inherit",
          }}
        />
      </div>
    </div>
  )
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  padding:"7px 12px",borderRadius:"8px",border:"1px solid #e5e5e5",
  fontSize:"12px",backgroundColor:"#fff",color:"#333",cursor:"pointer"
}
const btnStyle: React.CSSProperties = {
  padding:"7px 16px",borderRadius:"8px",border:"none",
  fontSize:"12px",fontWeight:600,cursor:"pointer"
}
const btnSmall: React.CSSProperties = {
  padding:"4px 10px",borderRadius:"6px",border:"none",
  fontSize:"12px",fontWeight:600,cursor:"pointer"
}
const tableStyle: React.CSSProperties = {
  width:"100%",borderCollapse:"collapse" as any,fontSize:"12px"
}
const thStyle: React.CSSProperties = {
  textAlign:"left" as any,padding:"10px 12px",
  fontWeight:600,color:"#888",fontSize:"11px",
  borderBottom:"1px solid #e5e5e5",whiteSpace:"nowrap" as any
}
const tdStyle: React.CSSProperties = {
  padding:"10px 12px",verticalAlign:"top" as any
}
const centerStyle: React.CSSProperties = {
  textAlign:"center" as any,color:"#888",padding:"48px",fontSize:"14px"
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PendingPage() {
  const [authed, setAuthed]   = useState(
    typeof window !== "undefined" && sessionStorage.getItem("hoa_admin") === "true"
  )
  const [password, setPassword] = useState("")
  const [tab, setTab]           = useState<"data" | "fees">("data")

  if (!authed) {
    return (
      <div style={{minHeight:"100vh",backgroundColor:"#f9f9f9",display:"flex",
        alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif"}}>
        <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",
          borderRadius:"16px",padding:"40px",width:"340px",textAlign:"center"}}>
          <div style={{fontSize:"24px",fontWeight:"700",color:"#1B2B6B",marginBottom:"4px"}}>
            HOA<span style={{color:"#1D9E75"}}>Agent</span>
          </div>
          <div style={{fontSize:"13px",color:"#888",marginBottom:"28px"}}>Pending Review</div>
          <input type="password" placeholder="Password" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && password === ADMIN_PASSWORD) {
                setAuthed(true)
                sessionStorage.setItem("hoa_admin","true")
              }
            }}
            style={{width:"100%",padding:"11px 14px",borderRadius:"8px",
              border:"1.5px solid #e5e5e5",fontSize:"14px",outline:"none",
              boxSizing:"border-box",marginBottom:"12px"}}/>
          <button
            onClick={() => {
              if (password === ADMIN_PASSWORD) {
                setAuthed(true)
                sessionStorage.setItem("hoa_admin","true")
              } else {
                alert("Wrong password")
              }
            }}
            style={{width:"100%",padding:"11px",borderRadius:"8px",
              backgroundColor:"#1B2B6B",color:"#fff",border:"none",
              cursor:"pointer",fontSize:"14px",fontWeight:"600"}}>
            Sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <main style={{fontFamily:"system-ui,sans-serif",backgroundColor:"#f9f9f9",minHeight:"100vh"}}>
      {/* Nav */}
      <nav style={{backgroundColor:"#fff",borderBottom:"1px solid #e5e5e5",
        padding:"0 24px",display:"flex",alignItems:"center",
        justifyContent:"space-between",height:"64px"}}>
        <a href="/" style={{textDecoration:"none"}}>
          <span style={{fontSize:"20px",fontWeight:"700",color:"#1B2B6B"}}>
            HOA<span style={{color:"#1D9E75"}}>Agent</span>
          </span>
        </a>
        <div style={{display:"flex",gap:"16px",alignItems:"center"}}>
          <a href="/admin" style={{fontSize:"12px",color:"#888",textDecoration:"none"}}>← Admin</a>
          <a href="/" style={{fontSize:"12px",color:"#888",textDecoration:"none"}}>Back to site</a>
        </div>
      </nav>

      {/* Tabs */}
      <div style={{backgroundColor:"#fff",borderBottom:"1px solid #e5e5e5",
        padding:"0 24px",display:"flex"}}>
        {[
          { key:"data",  label:"Pending Community Data" },
          { key:"fees",  label:"Pending Fee Observations" },
        ].map(t => (
          <button key={t.key}
            onClick={() => setTab(t.key as "data" | "fees")}
            style={{padding:"16px 20px",border:"none",
              borderBottom: tab===t.key ? "3px solid #1B2B6B" : "3px solid transparent",
              backgroundColor:"transparent",
              color: tab===t.key ? "#1B2B6B" : "#666",
              cursor:"pointer",fontSize:"13px",
              fontWeight: tab===t.key ? "600" : "400"}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{maxWidth:"1200px",margin:"0 auto",padding:"32px 24px"}}>
        <div style={{marginBottom:"24px"}}>
          <h1 style={{fontSize:"20px",fontWeight:"700",color:"#1a1a1a",margin:0}}>
            {tab === "data" ? "Pending Community Data" : "Pending Fee Observations"}
          </h1>
          <p style={{fontSize:"13px",color:"#888",marginTop:"6px",marginBottom:0}}>
            {tab === "data"
              ? "Review proposed community field updates. Auto-approvable (government-sourced) rows can be bulk-approved."
              : "Fee data from listing sites. Never auto-approved — review each observation carefully before applying to communities."}
          </p>
        </div>
        {tab === "data"  && <PendingDataTab/>}
        {tab === "fees"  && <PendingFeesTab/>}
      </div>
    </main>
  )
}

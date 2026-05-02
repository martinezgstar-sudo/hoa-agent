"use client"

import { useState, useEffect } from "react"

const ADMIN_PASSWORD = "Valean2008!"

export default function AdminCommentsPage() {
  const [authed, setAuthed] = useState(
    typeof window !== "undefined" && sessionStorage.getItem("hoa_admin") === "true"
  )
  const [password, setPassword] = useState("")
  const [comments, setComments] = useState<any[]>([])
  const [filter, setFilter] = useState("pending")
  const [loading, setLoading] = useState(false)

  async function fetchComments(status: string) {
    setLoading(true)
    const res = await fetch("/api/admin/comments?status=" + status, {
      headers: { "x-admin-password": ADMIN_PASSWORD },
    })
    const data = await res.json()
    setComments(data.comments || [])
    setLoading(false)
  }

  useEffect(() => {
    if (authed) fetchComments(filter)
  }, [authed, filter])

  async function updateStatus(id: string, status: string) {
    await fetch("/api/admin/comments", {
      method: "PATCH",
      headers: {
        "x-admin-password": ADMIN_PASSWORD,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ id, status }),
    })
    fetchComments(filter)
  }

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#f9f9f9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif" }}>
        <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "16px", padding: "40px", width: "340px", textAlign: "center" }}>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "#1B2B6B", marginBottom: "4px" }}>
            HOA<span style={{ color: "#1D9E75" }}>Agent</span>
          </div>
          <div style={{ fontSize: "13px", color: "#888", marginBottom: "28px" }}>Admin Dashboard</div>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && password === ADMIN_PASSWORD) {
                setAuthed(true)
                sessionStorage.setItem("hoa_admin", "true")
              }
            }}
            style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1.5px solid #e5e5e5", fontSize: "14px", outline: "none", boxSizing: "border-box" as any, marginBottom: "12px" }}
          />
          <button
            onClick={() => {
              if (password === ADMIN_PASSWORD) {
                setAuthed(true)
                sessionStorage.setItem("hoa_admin", "true")
              } else {
                alert("Wrong password")
              }
            }}
            style={{ width: "100%", padding: "11px", borderRadius: "8px", backgroundColor: "#1B2B6B", color: "#fff", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: "600" }}
          >
            Sign in
          </button>
        </div>
      </div>
    )
  }

  const TABS = [
    { key: "comments",     label: "Comments",       href: "/admin/comments" },
    { key: "communities",  label: "Add Community",  href: "/admin/communities" },
    { key: "upload",       label: "CSV Upload",     href: "/admin" },
    { key: "suggestions",  label: "Suggestions",    href: "/admin" },
    { key: "field_updates",label: "Field Updates",  href: "/admin" },
    { key: "research",     label: "Research",       href: "/admin" },
    { key: "news",         label: "News",           href: "/admin/news" },
    { key: "pending",      label: "Pending ›",      href: "/admin/pending" },
  ]

  return (
    <main style={{ fontFamily: "system-ui,sans-serif", backgroundColor: "#f9f9f9", minHeight: "100vh" }}>
      <nav style={{ backgroundColor: "#fff", borderBottom: "1px solid #e5e5e5", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "64px" }}>
        <a href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: "20px", fontWeight: "700", color: "#1B2B6B" }}>
            HOA<span style={{ color: "#1D9E75" }}>Agent</span>
          </span>
        </a>
        <a href="/" style={{ fontSize: "12px", color: "#888", textDecoration: "none" }}>Back to site</a>
      </nav>

      <div style={{ backgroundColor: "#fff", borderBottom: "1px solid #e5e5e5", padding: "0 24px", display: "flex" }}>
        {TABS.map(t => (
          <a
            key={t.key}
            href={t.href}
            style={{
              padding: "16px 20px",
              borderBottom: t.key === "comments" ? "3px solid #1B2B6B" : "3px solid transparent",
              color: t.key === "comments" ? "#1B2B6B" : "#666",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: t.key === "comments" ? "600" : "400",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            {t.label}
          </a>
        ))}
      </div>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
          {["pending", "flagged", "approved", "rejected"].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={{
                padding: "6px 16px",
                borderRadius: "20px",
                border: "1px solid #e5e5e5",
                backgroundColor: filter === s ? "#1a1a1a" : "#fff",
                color: filter === s ? "#fff" : "#555",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "500",
                textTransform: "capitalize",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {loading && <div style={{ textAlign: "center", color: "#888", padding: "40px" }}>Loading...</div>}
        {!loading && comments.length === 0 && (
          <div style={{ textAlign: "center", color: "#888", padding: "40px" }}>No {filter} comments.</div>
        )}
        {comments.map(c => (
          <div key={c.id} style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "16px 20px", marginBottom: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
              <div>
                <div style={{ fontSize: "13px", fontWeight: "500", color: "#1a1a1a" }}>{c.commenter_name}</div>
                <div style={{ fontSize: "11px", color: "#888" }}>
                  {new Date(c.created_at).toLocaleDateString()} · {c.rating ? c.rating + "★" : "No rating"}
                </div>
              </div>
              <span style={{
                fontSize: "11px",
                padding: "2px 10px",
                borderRadius: "20px",
                backgroundColor:
                  c.status === "approved" ? "#E1F5EE" :
                  c.status === "rejected" ? "#FEE9E9" :
                  c.status === "flagged"  ? "#FAEEDA" : "#f0f0f0",
                color:
                  c.status === "approved" ? "#1B2B6B" :
                  c.status === "rejected" ? "#E24B4A" :
                  c.status === "flagged"  ? "#854F0B" : "#555",
              }}>
                {c.status}
              </span>
            </div>
            <div style={{ fontSize: "13px", color: "#333", lineHeight: "1.6", marginBottom: "12px" }}>
              {c.comment_text}
            </div>
            <div style={{ display: "flex", gap: "8px" }}>
              {c.status !== "approved" && (
                <button onClick={() => updateStatus(c.id, "approved")} style={{ fontSize: "12px", padding: "5px 14px", borderRadius: "6px", backgroundColor: "#1B2B6B", color: "#fff", border: "none", cursor: "pointer" }}>
                  Approve
                </button>
              )}
              {c.status !== "rejected" && (
                <button onClick={() => updateStatus(c.id, "rejected")} style={{ fontSize: "12px", padding: "5px 14px", borderRadius: "6px", backgroundColor: "#E24B4A", color: "#fff", border: "none", cursor: "pointer" }}>
                  Reject
                </button>
              )}
              {c.status !== "pending" && (
                <button onClick={() => updateStatus(c.id, "pending")} style={{ fontSize: "12px", padding: "5px 14px", borderRadius: "6px", backgroundColor: "#f0f0f0", color: "#555", border: "none", cursor: "pointer" }}>
                  Reset
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  )
}

"use client"

import { useState } from "react"

const ADMIN_PASSWORD = "Valean2008!"

export default function AdminUploadPage() {
  const [authed, setAuthed] = useState(
    typeof window !== "undefined" && sessionStorage.getItem("hoa_admin") === "true"
  )
  const [password, setPassword] = useState("")
  const [uploadType, setUploadType] = useState<"communities" | "observations">("communities")
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any>(null)

  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.trim().split("\n")
    if (lines.length < 2) return []
    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""))
    return lines.slice(1).map(line => {
      const values: string[] = []
      let current = "", inQuotes = false
      for (const char of line) {
        if (char === '"') inQuotes = !inQuotes
        else if (char === "," && !inQuotes) { values.push(current.trim()); current = "" }
        else current += char
      }
      values.push(current.trim())
      const row: Record<string, string> = {}
      headers.forEach((h, i) => { row[h] = (values[i] || "").replace(/^"|"$/g, "") })
      return row
    })
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    const rows = parseCSV(await file.text())
    const res = await fetch("/api/admin/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": ADMIN_PASSWORD },
      body: JSON.stringify({ type: uploadType, rows }),
    })
    setResult(await res.json())
    setUploading(false)
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
    { key: "comments",      label: "Comments",       href: "/admin/comments" },
    { key: "communities",   label: "Add Community",  href: "/admin/communities" },
    { key: "upload",        label: "CSV Upload",     href: "/admin/upload" },
    { key: "suggestions",   label: "Suggestions",    href: "/admin" },
    { key: "field_updates", label: "Field Updates",  href: "/admin" },
    { key: "research",      label: "Research",       href: "/admin" },
    { key: "news",          label: "News",           href: "/admin/news" },
    { key: "pending",       label: "Pending ›",      href: "/admin/pending" },
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
              borderBottom: t.key === "upload" ? "3px solid #1B2B6B" : "3px solid transparent",
              color: t.key === "upload" ? "#1B2B6B" : "#666",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: t.key === "upload" ? "600" : "400",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            {t.label}
          </a>
        ))}
      </div>

      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "32px 24px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: "600", color: "#1a1a1a", marginBottom: "4px" }}>CSV Upload</h1>
        <p style={{ fontSize: "13px", color: "#888", marginBottom: "32px" }}>
          Bulk import communities or fee observations from a CSV file.
        </p>

        <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
          {(["communities", "observations"] as const).map(t => (
            <button
              key={t}
              onClick={() => { setUploadType(t); setFile(null); setResult(null) }}
              style={{
                padding: "7px 18px",
                borderRadius: "8px",
                border: "1px solid " + (uploadType === t ? "#1B2B6B" : "#e5e5e5"),
                backgroundColor: uploadType === t ? "#1B2B6B" : "#fff",
                color: uploadType === t ? "#fff" : "#555",
                cursor: "pointer",
                fontSize: "13px",
              }}
            >
              {t === "communities" ? "Communities" : "Fee Observations"}
            </button>
          ))}
        </div>

        <div
          style={{ border: "2px dashed #e0e0e0", borderRadius: "10px", padding: "40px", textAlign: "center", marginBottom: "16px", cursor: "pointer" }}
          onClick={() => document.getElementById("csv-admin-input")?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setFile(f) }}
        >
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>📄</div>
          <div style={{ fontSize: "14px", color: "#555" }}>
            {file ? file.name : "Drop CSV here or click to browse"}
          </div>
          <input
            id="csv-admin-input"
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) setFile(f) }}
          />
        </div>

        {result && (
          <div style={{ padding: "12px", borderRadius: "8px", backgroundColor: result.error ? "#FEE9E9" : "#E1F5EE", marginBottom: "16px", fontSize: "13px", color: result.error ? "#E24B4A" : "#1B2B6B" }}>
            {result.error ? "Error: " + result.error : result.success + " rows imported"}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          style={{ width: "100%", padding: "12px", borderRadius: "8px", backgroundColor: file ? "#1B2B6B" : "#ccc", color: "#fff", border: "none", cursor: file ? "pointer" : "not-allowed", fontSize: "14px", fontWeight: "600" }}
        >
          {uploading ? "Uploading..." : "Upload CSV"}
        </button>
      </div>
    </main>
  )
}

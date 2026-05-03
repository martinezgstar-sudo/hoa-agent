"use client"

import { useState } from "react"

export type ContactFormFields = "simple" | "full" | "correction" | "press"

interface ContactFormProps {
  subject: string
  fields?: ContactFormFields
  successMessage?: string
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px", fontSize: "14px",
  border: "1px solid #d0d0d0", borderRadius: "8px",
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
}
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: "12px", fontWeight: 600,
  color: "#444", marginBottom: "5px",
}

export default function ContactForm({ subject, fields = "simple", successMessage }: ContactFormProps) {
  const [form, setForm] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  function set(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setBusy(true)
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, fields, ...form }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) throw new Error(json.error || "Submission failed")
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — please try again.")
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div style={{ padding: "20px 24px", backgroundColor: "#E1F5EE", border: "1px solid #1D9E75", borderRadius: "10px", color: "#0B5239", fontSize: "14px" }}>
        ✓ {successMessage || "Thank you. We will be in touch soon."}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px", backgroundColor: "#fff", padding: "20px", borderRadius: "10px", border: "1px solid #e5e5e5" }}>
      <div>
        <label style={labelStyle}>Your name *</label>
        <input required value={form.name || ""} onChange={(e) => set("name", e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={labelStyle}>Email *</label>
        <input required type="email" value={form.email || ""} onChange={(e) => set("email", e.target.value)} style={inputStyle} />
      </div>

      {fields === "full" && (
        <>
          <div>
            <label style={labelStyle}>Phone</label>
            <input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Subject *</label>
            <input required value={form.formSubject || ""} onChange={(e) => set("formSubject", e.target.value)} style={inputStyle} />
          </div>
        </>
      )}

      {fields === "correction" && (
        <>
          <div>
            <label style={labelStyle}>Community name and URL *</label>
            <input required value={form.community || ""} onChange={(e) => set("community", e.target.value)} placeholder="e.g. Shoma Townhomes — https://www.hoa-agent.com/community/…" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Field that is incorrect *</label>
            <input required value={form.field || ""} onChange={(e) => set("field", e.target.value)} placeholder="e.g. monthly_fee_min" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Correct value *</label>
            <input required value={form.correctValue || ""} onChange={(e) => set("correctValue", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Source we can verify *</label>
            <input required value={form.source || ""} onChange={(e) => set("source", e.target.value)} placeholder="e.g. estoppel, board document, government record link" style={inputStyle} />
          </div>
        </>
      )}

      {fields === "press" && (
        <>
          <div>
            <label style={labelStyle}>Publication or outlet *</label>
            <input required value={form.outlet || ""} onChange={(e) => set("outlet", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Story angle or request *</label>
            <textarea required rows={4} value={form.angle || ""} onChange={(e) => set("angle", e.target.value)} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
          </div>
          <div>
            <label style={labelStyle}>Deadline</label>
            <input type="date" value={form.deadline || ""} onChange={(e) => set("deadline", e.target.value)} style={inputStyle} />
          </div>
        </>
      )}

      {(fields === "simple" || fields === "full") && (
        <div>
          <label style={labelStyle}>Message *</label>
          <textarea required rows={5} value={form.message || ""} onChange={(e) => set("message", e.target.value)} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
        </div>
      )}

      {error && (
        <div style={{ fontSize: "13px", color: "#c0392b", padding: "10px 14px", backgroundColor: "#FEE9E9", borderRadius: "8px" }}>{error}</div>
      )}

      <button type="submit" disabled={busy} style={{ padding: "12px", fontSize: "14px", fontWeight: 600, backgroundColor: busy ? "#999" : "#1B2B6B", color: "#fff", border: "none", borderRadius: "10px", cursor: busy ? "not-allowed" : "pointer" }}>
        {busy ? "Sending…" : "Send Message"}
      </button>
    </form>
  )
}

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

const CATEGORIES = [
  "Cleaning", "Landscaping", "Property Management", "Legal Services",
  "Insurance", "Moving Services", "Home Services", "Real Estate", "Other",
]

export default function AdvertiserSignupPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    company_name: "",
    email: "",
    password: "",
    confirm: "",
    website_url: "",
    phone: "",
    category: "",
    terms: false,
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(prev => ({ ...prev, [k]: v }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (!form.company_name || !form.email || !form.password) {
      setError("Company name, email, and password are required.")
      return
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (form.password !== form.confirm) {
      setError("Passwords do not match.")
      return
    }
    if (!form.terms) {
      setError("You must agree to the terms.")
      return
    }
    setBusy(true)
    try {
      const { data, error: authErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { emailRedirectTo: `${window.location.origin}/advertise/portal` },
      })
      if (authErr) {
        setError(authErr.message)
        setBusy(false)
        return
      }
      const userId = data.user?.id
      if (userId) {
        await supabase.from("advertiser_profiles").insert({
          id: userId,
          company_name: form.company_name,
          email: form.email,
          website_url: form.website_url || null,
          phone: form.phone || null,
          category: form.category || null,
          plan_status: "pending",
        })
      }
      router.push("/advertise/portal/plan")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error — please try again.")
    } finally {
      setBusy(false)
    }
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

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#f9f9f9", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ maxWidth: "440px", margin: "0 auto", padding: "60px 20px 40px" }}>
        <Link href="/advertise" style={{ fontSize: "13px", color: "#888", textDecoration: "none" }}>← Back</Link>
        <div style={{ fontSize: "26px", fontWeight: 700, color: "#1B2B6B", margin: "20px 0 6px", letterSpacing: "-0.02em" }}>
          Create your advertiser account
        </div>
        <p style={{ fontSize: "13px", color: "#666", marginBottom: "28px" }}>
          Reach homebuyers and residents across Palm Beach County.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={labelStyle}>Company name *</label>
            <input value={form.company_name} onChange={e => set("company_name", e.target.value)} required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email *</label>
            <input type="email" value={form.email} onChange={e => set("email", e.target.value)} required style={inputStyle} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div>
              <label style={labelStyle}>Password *</label>
              <input type="password" value={form.password} onChange={e => set("password", e.target.value)} required minLength={8} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Confirm *</label>
              <input type="password" value={form.confirm} onChange={e => set("confirm", e.target.value)} required minLength={8} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Website</label>
            <input type="url" value={form.website_url} onChange={e => set("website_url", e.target.value)} placeholder="https://" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Category</label>
            <select value={form.category} onChange={e => set("category", e.target.value)} style={inputStyle}>
              <option value="">Select a category</option>
              {CATEGORIES.map(c => <option key={c} value={c.toLowerCase()}>{c}</option>)}
            </select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "#555" }}>
            <input type="checkbox" checked={form.terms} onChange={e => set("terms", e.target.checked)} required />
            I agree to the <Link href="/terms" style={{ color: "#1D9E75" }}>terms of service</Link>.
          </label>

          {error && (
            <div style={{ fontSize: "13px", color: "#c0392b", padding: "10px 14px", backgroundColor: "#FEE9E9", borderRadius: "8px" }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={busy} style={{
            padding: "12px", fontSize: "14px", fontWeight: 600,
            backgroundColor: busy ? "#999" : "#1B2B6B", color: "#fff",
            border: "none", borderRadius: "10px", cursor: busy ? "not-allowed" : "pointer",
          }}>
            {busy ? "Creating account…" : "Create Account"}
          </button>

          <div style={{ textAlign: "center", fontSize: "13px", color: "#666" }}>
            Already have an account? <Link href="/advertise/login" style={{ color: "#1D9E75", fontWeight: 600 }}>Sign in</Link>
          </div>
        </form>
      </div>
    </main>
  )
}

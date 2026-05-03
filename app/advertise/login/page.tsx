"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

export default function AdvertiserLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setBusy(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    router.push("/advertise/portal")
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
      <div style={{ maxWidth: "380px", margin: "0 auto", padding: "80px 20px 40px" }}>
        <Link href="/advertise" style={{ fontSize: "13px", color: "#888", textDecoration: "none" }}>← Back</Link>
        <div style={{ fontSize: "26px", fontWeight: 700, color: "#1B2B6B", margin: "20px 0 6px", letterSpacing: "-0.02em" }}>
          Advertiser sign in
        </div>
        <p style={{ fontSize: "13px", color: "#666", marginBottom: "28px" }}>
          Manage your ads and analytics.
        </p>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={inputStyle} />
          </div>
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
            {busy ? "Signing in…" : "Sign In"}
          </button>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
            <Link href="/advertise/forgot-password" style={{ color: "#1D9E75" }}>Forgot password?</Link>
            <Link href="/advertise/signup" style={{ color: "#1D9E75", fontWeight: 600 }}>Create account</Link>
          </div>
        </form>
      </div>
    </main>
  )
}

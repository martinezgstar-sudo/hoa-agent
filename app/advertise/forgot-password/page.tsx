"use client"

import { useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setBusy(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/advertise/login`,
    })
    setBusy(false)
    if (err) setError(err.message)
    else setDone(true)
  }

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#f9f9f9", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ maxWidth: "380px", margin: "0 auto", padding: "80px 20px 40px" }}>
        <Link href="/advertise/login" style={{ fontSize: "13px", color: "#888", textDecoration: "none" }}>← Back to sign in</Link>
        <div style={{ fontSize: "26px", fontWeight: 700, color: "#1B2B6B", margin: "20px 0 6px", letterSpacing: "-0.02em" }}>
          Reset your password
        </div>
        <p style={{ fontSize: "13px", color: "#666", marginBottom: "28px" }}>
          Enter your email and we&apos;ll send you a reset link.
        </p>

        {done ? (
          <div style={{ fontSize: "14px", color: "#1B2B6B", padding: "16px", backgroundColor: "#E1F5EE", borderRadius: "10px" }}>
            ✓ Check your email for a password reset link.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required placeholder="you@example.com"
              style={{
                width: "100%", padding: "10px 14px", fontSize: "14px",
                border: "1px solid #d0d0d0", borderRadius: "8px",
                outline: "none", boxSizing: "border-box", fontFamily: "inherit",
              }}
            />
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
              {busy ? "Sending…" : "Send Reset Link"}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}

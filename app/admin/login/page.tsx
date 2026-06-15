"use client"
import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  function safeNext(): string {
    const raw = params.get("next") || "/admin"
    // Only allow same-origin absolute paths to avoid open redirects.
    return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/admin"
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
    setLoading(false)
    if (res.ok) {
      router.push(safeNext())
      router.refresh()
    } else {
      setError("Incorrect password")
    }
  }

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#f7f7f8", fontFamily: "system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
      <form onSubmit={submit} style={{ background: "#fff", border: "1px solid #e5e5e5", borderRadius: 12, padding: 32, width: "100%", maxWidth: 360, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1B2B6B", letterSpacing: "-0.02em", marginBottom: 4 }}>
          HOA<span style={{ color: "#1D9E75" }}>Agent</span>
        </div>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: "#1a1a1a", margin: "0 0 20px" }}>Admin sign in</h1>
        <input
          type="password"
          value={password}
          autoFocus
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #e0e0e0", fontSize: 14, color: "#1a1a1a", backgroundColor: "#fff", boxSizing: "border-box", marginBottom: 12 }}
        />
        {error !== "" && (
          <div style={{ color: "#E24B4A", fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}
        <button
          type="submit"
          disabled={loading}
          style={{ width: "100%", padding: "12px", borderRadius: 8, backgroundColor: "#1B2B6B", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600 }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}

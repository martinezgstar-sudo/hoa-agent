"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

const PRICE: Record<string, { label: string; price: number }> = {
  starter: { label: "Starter", price: 19.99 },
  growth: { label: "Growth", price: 69.99 },
  county: { label: "County", price: 99.99 },
}

export default function CheckoutPage({ params }: { params: Promise<{ plan: string }> }) {
  const router = useRouter()
  const { plan } = use(params)
  const [email, setEmail] = useState<string>("")
  const [advertiserId, setAdvertiserId] = useState<string>("")
  const [authChecked, setAuthChecked] = useState(false)
  const [stripeStatus, setStripeStatus] = useState<"unknown" | "wired" | "unwired" | "error">("unknown")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/advertise/login"); return }
      setEmail(data.session.user.email ?? "")
      setAdvertiserId(data.session.user.id)
      setAuthChecked(true)
    })
  }, [router])

  async function startCheckout() {
    if (busy) return
    setBusy(true)
    try {
      const r = await fetch("/api/advertise/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, email, advertiser_id: advertiserId }),
      })
      const data = await r.json()
      if (data?.ok && data?.url) {
        window.location.href = data.url
        return
      }
      if (data?.wired === false) setStripeStatus("unwired")
      else setStripeStatus("error")
    } catch {
      setStripeStatus("error")
    } finally {
      setBusy(false)
    }
  }

  if (!authChecked) return <div style={{ padding: 60, textAlign: "center", color: "#888" }}>Checking session…</div>

  const p = PRICE[plan] ?? { label: plan, price: 0 }

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#f9f9f9", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ maxWidth: "520px", margin: "0 auto", padding: "60px 20px 40px" }}>
        <Link href="/advertise/portal/plan" style={{ fontSize: "13px", color: "#888", textDecoration: "none" }}>← Change plan</Link>
        <div style={{ fontSize: "26px", fontWeight: 700, color: "#1B2B6B", margin: "20px 0 6px", letterSpacing: "-0.02em" }}>
          Checkout
        </div>
        <p style={{ fontSize: "14px", color: "#666", marginBottom: "28px" }}>
          {p.label} plan — ${p.price.toFixed(2)}/month
        </p>

        <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "24px" }}>
          <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={startCheckout}
              disabled={busy}
              style={{
                padding: "11px 20px",
                backgroundColor: busy ? "#888" : "#1D9E75",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                fontSize: "14px",
                fontWeight: 700,
                cursor: busy ? "default" : "pointer",
              }}
            >
              {busy ? "Redirecting…" : `Pay $${p.price.toFixed(2)}/mo with card →`}
            </button>
          </div>

          {stripeStatus === "unwired" && (
            <div style={{ fontSize: "13px", color: "#666", lineHeight: 1.6 }}>
              <strong>Payment processing not yet enabled.</strong> Your account
              and plan choice are saved. We&apos;ll contact you at{" "}
              <strong>{email}</strong> to complete subscription setup. In the
              meantime you can explore the portal and create your first ad.
            </div>
          )}
          {stripeStatus === "error" && (
            <div style={{ fontSize: "13px", color: "#A32D2D", lineHeight: 1.6 }}>
              Something went wrong starting checkout. <Link href="/contact" style={{ color: "#1D9E75" }}>Contact us</Link> and we&apos;ll set you up manually.
            </div>
          )}

          <div style={{ display: "flex", gap: "10px", marginTop: "20px", flexWrap: "wrap" }}>
            <Link href="/advertise/portal" style={{
              padding: "11px 20px", backgroundColor: "#1B2B6B", color: "#fff",
              borderRadius: "10px", textDecoration: "none", fontSize: "14px", fontWeight: 600,
            }}>
              Continue to Portal →
            </Link>
            <Link href="/contact" style={{
              padding: "11px 20px", backgroundColor: "#fff", color: "#1B2B6B",
              border: "1px solid #1B2B6B", borderRadius: "10px",
              textDecoration: "none", fontSize: "14px", fontWeight: 600,
            }}>
              Contact us
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}

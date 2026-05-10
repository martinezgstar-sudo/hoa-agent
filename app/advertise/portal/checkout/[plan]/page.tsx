"use client"

import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"

const PRICE: Record<string, { label: string; price: number }> = {
  starter: { label: "Starter", price: 9.99 },
  growth: { label: "Growth", price: 29.99 },
  county: { label: "County", price: 89.99 },
}

type Profile = {
  id: string
  company_name?: string | null
  category_text?: string | null
  category_id?: string | null
  target_zips?: string[] | null
  subscription_plan?: string | null
  subscription_status?: string | null
}

export default function CheckoutPage({ params }: { params: Promise<{ plan: string }> }) {
  const router = useRouter()
  const { plan } = use(params)
  const [email, setEmail] = useState<string>("")
  const [advertiserId, setAdvertiserId] = useState<string>("")
  const [profile, setProfile] = useState<Profile | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [stripeWired, setStripeWired] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ type: "info" | "error" | "success"; text: string } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.push("/advertise/login")
        return
      }
      setEmail(data.session.user.email ?? "")
      setAdvertiserId(data.session.user.id)
      const { data: prof } = await supabase
        .from("advertiser_profiles")
        .select("id, company_name, category_id, category_text, target_zips, subscription_plan, subscription_status")
        .eq("id", data.session.user.id)
        .maybeSingle()
      if (prof) setProfile(prof as Profile)
      setAuthChecked(true)
    })
  }, [router])

  async function startStripeCheckout() {
    if (busy) return
    setBusy(true)
    setMsg(null)
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
      setStripeWired(data?.wired === true)
      if (data?.wired === false) {
        setMsg({ type: "info", text: "Payment processing coming soon. We'll contact you within 24 hours to complete signup." })
      } else {
        setMsg({ type: "error", text: data?.stripe_error || data?.error || "Stripe checkout failed." })
      }
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Network error." })
    } finally {
      setBusy(false)
    }
  }

  async function manualActivate() {
    if (busy) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await fetch("/api/advertise/manual-activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ advertiser_id: advertiserId, plan, email }),
      })
      const data = await r.json()
      if (!r.ok) {
        setMsg({ type: "error", text: data?.error || "Could not submit." })
        return
      }
      router.push("/advertise/portal?signup=pending")
    } catch (err) {
      setMsg({ type: "error", text: err instanceof Error ? err.message : "Network error." })
    } finally {
      setBusy(false)
    }
  }

  if (!authChecked) {
    return <div style={{ padding: 60, textAlign: "center", color: "#888" }}>Checking session…</div>
  }

  const p = PRICE[plan] ?? { label: plan, price: 0 }
  const targetZips = (profile?.target_zips || []).filter(Boolean)

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#f9f9f9", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ maxWidth: "560px", margin: "0 auto", padding: "60px 20px 40px" }}>
        <Link href="/advertise/portal/plan" style={{ fontSize: "13px", color: "#888", textDecoration: "none" }}>← Change plan</Link>
        <div style={{ fontSize: "26px", fontWeight: 700, color: "#1B2B6B", margin: "20px 0 6px", letterSpacing: "-0.02em" }}>
          Review and activate
        </div>
        <p style={{ fontSize: "14px", color: "#666", marginBottom: "24px" }}>
          {p.label} plan — ${p.price.toFixed(2)}/month
        </p>

        {/* Summary card */}
        <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "20px 22px", marginBottom: "16px" }}>
          <SummaryRow label="Tier"     value={`${p.label} — $${p.price.toFixed(2)}/mo`} />
          <SummaryRow label="Email"    value={email || "—"} />
          <SummaryRow label="Category" value={profile?.category_text || "—"} status={profile?.category_id ? "matched" : "pending_review"} />
          <SummaryRow label="ZIPs"     value={plan === "county" ? "All Palm Beach County ZIPs" : targetZips.length ? targetZips.join(", ") : "—"} />
          <SummaryRow label="Exclusivity" value={plan === "county" ? "Countywide in your category" : `${targetZips.length} ZIP${targetZips.length === 1 ? "" : "s"} in your category`} />
        </div>

        {/* Action card */}
        <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "20px 22px" }}>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#1B2B6B", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "12px" }}>
            Activate
          </div>
          <p style={{ fontSize: "13px", color: "#666", lineHeight: 1.6, marginBottom: "16px" }}>
            <strong>Payment processing coming soon.</strong> We&apos;ll contact you at{" "}
            <strong>{email}</strong> within 24 hours to complete signup. In the
            meantime your category and ZIP selections are reserved as{" "}
            <em>pending_review</em>.
          </p>

          {msg && (
            <div style={{
              padding: "10px 12px",
              backgroundColor: msg.type === "error" ? "#FEE9E9" : msg.type === "success" ? "#E1F5EE" : "#FAEEDA",
              border: "1px solid " + (msg.type === "error" ? "#E24B4A" : msg.type === "success" ? "#1D9E75" : "#EF9F27"),
              borderRadius: "8px",
              color: msg.type === "error" ? "#A32D2D" : msg.type === "success" ? "#155A3F" : "#854F0B",
              fontSize: "12px",
              marginBottom: "12px",
            }}>
              {msg.text}
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <button
              type="button"
              onClick={manualActivate}
              disabled={busy}
              style={{
                padding: "12px 18px",
                backgroundColor: busy ? "#888" : "#1D9E75",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                fontSize: "14px",
                fontWeight: 700,
                cursor: busy ? "default" : "pointer",
              }}
            >
              {busy ? "Submitting…" : "Complete Signup (Manual Activation)"}
            </button>
            <button
              type="button"
              onClick={startStripeCheckout}
              disabled={busy}
              style={{
                padding: "11px 18px",
                backgroundColor: "#fff",
                color: "#1B2B6B",
                border: "1.5px solid #1B2B6B",
                borderRadius: "10px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: busy ? "default" : "pointer",
              }}
            >
              Try Stripe checkout (in case it&apos;s wired)
            </button>
          </div>

          <div style={{ display: "flex", gap: "10px", marginTop: "16px", flexWrap: "wrap" }}>
            <Link href="/advertise/portal" style={{ padding: "8px 14px", backgroundColor: "#fff", color: "#555", border: "1px solid #e5e5e5", borderRadius: "8px", textDecoration: "none", fontSize: "12px", fontWeight: 500 }}>
              ← Back to portal
            </Link>
            <Link href="/contact" style={{ padding: "8px 14px", backgroundColor: "#fff", color: "#1B2B6B", border: "1px solid #1B2B6B", borderRadius: "8px", textDecoration: "none", fontSize: "12px", fontWeight: 600 }}>
              Contact us
            </Link>
          </div>
        </div>

        {stripeWired === false && (
          <div style={{ fontSize: "11px", color: "#888", marginTop: "10px" }}>
            (Diagnostic: Stripe env vars not configured.)
          </div>
        )}
      </div>
    </main>
  )
}

function SummaryRow({ label, value, status }: { label: string; value: string; status?: "matched" | "pending_review" }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f0f0f0", fontSize: "13px" }}>
      <span style={{ color: "#888", fontWeight: 500 }}>{label}</span>
      <span style={{ color: "#1a1a1a", textAlign: "right", maxWidth: "60%", wordBreak: "break-word" }}>
        {value}
        {status === "pending_review" && (
          <span style={{ marginLeft: "6px", fontSize: "10px", padding: "2px 6px", borderRadius: "4px", backgroundColor: "#FAEEDA", color: "#854F0B", fontWeight: 600 }}>pending review</span>
        )}
      </span>
    </div>
  )
}

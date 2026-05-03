"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

const PLANS = [
  {
    key: "starter", price: 19.99, label: "Starter",
    summary: "1 city, 1 active ad, basic analytics",
    max_ads: 1, max_cities: 1, badge: null,
  },
  {
    key: "growth", price: 69.99, label: "Growth",
    summary: "Up to 5 cities, 3 rotating ads, full analytics",
    max_ads: 3, max_cities: 5, badge: "Most Popular",
  },
  {
    key: "county", price: 99.99, label: "County",
    summary: "All Palm Beach County cities, 5 rotating ads, priority placement",
    max_ads: 5, max_cities: null, badge: null,
  },
]

const PBC_CITIES = [
  "Boca Raton","Boynton Beach","Delray Beach","Greenacres","Jupiter",
  "Lake Worth","North Palm Beach","Palm Beach Gardens","Riviera Beach",
  "Royal Palm Beach","Wellington","West Palm Beach",
]

export default function PlanSelectionPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [selected, setSelected] = useState<string>("growth")
  const [cities, setCities] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/advertise/login"); return }
      setAuthChecked(true)
    })
  }, [router])

  const plan = PLANS.find(p => p.key === selected)!

  function toggleCity(c: string) {
    if (cities.includes(c)) {
      setCities(cities.filter(x => x !== c))
    } else {
      const max = plan.max_cities
      if (max && cities.length >= max) return
      setCities([...cities, c])
    }
  }

  async function handleContinue() {
    setError("")
    if (plan.max_cities && cities.length === 0) {
      setError("Select at least one city.")
      return
    }
    setBusy(true)
    const { data: sess } = await supabase.auth.getSession()
    const userId = sess.session?.user.id
    if (!userId) { router.push("/advertise/login"); return }

    const target = plan.max_cities === null ? PBC_CITIES : cities
    const { error: err } = await supabase.from("advertiser_profiles").update({
      plan: plan.key,
      max_ads: plan.max_ads,
      target_cities: target,
      updated_at: new Date().toISOString(),
    }).eq("id", userId)

    setBusy(false)
    if (err) { setError(err.message); return }
    router.push(`/advertise/portal/checkout/${plan.key}`)
  }

  if (!authChecked) return <div style={{ padding: "60px", textAlign: "center", color: "#888" }}>Checking session…</div>

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#f9f9f9", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ maxWidth: "920px", margin: "0 auto", padding: "60px 20px 40px" }}>
        <div style={{ fontSize: "26px", fontWeight: 700, color: "#1B2B6B", marginBottom: "8px", letterSpacing: "-0.02em" }}>
          Choose your plan
        </div>
        <p style={{ fontSize: "14px", color: "#666", marginBottom: "32px" }}>
          You can change plans at any time.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px", marginBottom: "32px" }}>
          {PLANS.map(p => {
            const isSel = selected === p.key
            return (
              <div key={p.key} onClick={() => { setSelected(p.key); if (p.max_cities === null) setCities([]) }}
                style={{
                  padding: "20px", borderRadius: "12px", cursor: "pointer",
                  backgroundColor: "#fff",
                  border: isSel ? "2px solid #1B2B6B" : (p.badge ? "2px solid #1D9E75" : "1px solid #e5e5e5"),
                  position: "relative",
                }}>
                {p.badge && (
                  <div style={{ position: "absolute", top: "-10px", right: "16px", backgroundColor: "#1D9E75", color: "#fff", fontSize: "11px", fontWeight: 700, padding: "2px 10px", borderRadius: "12px" }}>
                    {p.badge}
                  </div>
                )}
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#1B2B6B", marginBottom: "4px" }}>{p.label}</div>
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#1a1a1a", marginBottom: "10px" }}>${p.price}<span style={{ fontSize: "12px", fontWeight: 400, color: "#888" }}>/month</span></div>
                <div style={{ fontSize: "13px", color: "#666", lineHeight: 1.5 }}>{p.summary}</div>
              </div>
            )
          })}
        </div>

        {plan.max_cities !== null && (
          <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "20px", marginBottom: "20px" }}>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "#1a1a1a", marginBottom: "10px" }}>
              Select your {plan.max_cities === 1 ? "city" : `cities (max ${plan.max_cities})`}:
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {PBC_CITIES.map(c => {
                const isSel = cities.includes(c)
                const disabled = !isSel && plan.max_cities !== null && cities.length >= plan.max_cities
                return (
                  <button key={c} onClick={() => toggleCity(c)} disabled={disabled} type="button" style={{
                    padding: "6px 14px", borderRadius: "20px",
                    border: "1px solid " + (isSel ? "#1B2B6B" : "#e0e0e0"),
                    backgroundColor: isSel ? "#1B2B6B" : "#fff",
                    color: isSel ? "#fff" : (disabled ? "#bbb" : "#555"),
                    fontSize: "12px", cursor: disabled ? "not-allowed" : "pointer",
                  }}>{c}</button>
                )
              })}
            </div>
          </div>
        )}

        {plan.max_cities === null && (
          <div style={{ backgroundColor: "#E1F5EE", border: "1px solid #1D9E75", borderRadius: "10px", padding: "14px 18px", marginBottom: "20px", fontSize: "13px", color: "#0B5239" }}>
            ✓ County plan covers all 12 Palm Beach County cities — no need to pick.
          </div>
        )}

        {error && (
          <div style={{ fontSize: "13px", color: "#c0392b", padding: "10px 14px", backgroundColor: "#FEE9E9", borderRadius: "8px", marginBottom: "16px" }}>
            {error}
          </div>
        )}

        <button onClick={handleContinue} disabled={busy} style={{
          padding: "14px 28px", fontSize: "14px", fontWeight: 600,
          backgroundColor: busy ? "#999" : "#1B2B6B", color: "#fff",
          border: "none", borderRadius: "10px", cursor: busy ? "not-allowed" : "pointer",
        }}>
          {busy ? "Saving…" : "Continue to Checkout"}
        </button>
      </div>
    </main>
  )
}

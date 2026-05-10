"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import CategoryAutocomplete from "@/app/components/CategoryAutocomplete"

const PLANS = [
  { key: "starter", price: 9.99,  label: "Starter", max_ads: 1, max_zips: 1,    badge: null,
    bullets: ["1 ZIP code", "1 ad creative", "Exclusive in your category for that ZIP", "Basic analytics"] },
  { key: "growth",  price: 29.99, label: "Growth",  max_ads: 3, max_zips: 5,    badge: "Most Popular",
    bullets: ["Up to 5 ZIP codes", "3 ad creatives rotating", "Exclusive in each ZIP", "Full analytics"] },
  { key: "county",  price: 89.99, label: "County",  max_ads: 5, max_zips: null, badge: null,
    bullets: ["All Palm Beach County ZIPs", "5 ad creatives rotating", "Exclusive countywide", "Priority placement"] },
] as const

type PlanKey = "starter" | "growth" | "county"

type Conflict = { zip_code: string; blocked_by_category: string; existing_advertiser_id: string | null; reason: string }

export default function PlanSelectionPage() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [userId, setUserId] = useState<string>("")
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [plan, setPlan] = useState<PlanKey>("growth")
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [categoryText, setCategoryText] = useState("")
  const [zipInput, setZipInput] = useState("")
  const [zips, setZips] = useState<string[]>([])
  const [checking, setChecking] = useState(false)
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [checkNote, setCheckNote] = useState<string>("")
  const [available, setAvailable] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const planMeta = useMemo(() => PLANS.find((p) => p.key === plan)!, [plan])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.push("/advertise/login")
        return
      }
      setUserId(data.session.user.id)
      setAuthChecked(true)
    })
  }, [router])

  // Reset ZIPs and exclusivity state when plan changes
  useEffect(() => {
    setZips([])
    setZipInput("")
    setConflicts([])
    setAvailable(null)
    setCheckNote("")
  }, [plan])

  function addZip() {
    const z = zipInput.trim().slice(0, 5)
    if (!/^\d{5}$/.test(z)) {
      setError("Enter a 5-digit ZIP code.")
      return
    }
    setError("")
    if (zips.includes(z)) return
    if (planMeta.max_zips && zips.length >= planMeta.max_zips) return
    setZips([...zips, z])
    setZipInput("")
    setAvailable(null)
    setConflicts([])
  }

  function removeZip(z: string) {
    setZips(zips.filter((x) => x !== z))
    setAvailable(null)
    setConflicts([])
  }

  async function runCheck() {
    setError("")
    setChecking(true)
    setAvailable(null)
    setConflicts([])
    setCheckNote("")
    try {
      const r = await fetch("/api/advertise/check-exclusivity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: categoryId,
          category_text: categoryText,
          plan,
          zip_codes: plan === "county" ? [] : zips,
          advertiser_id: userId || undefined,
        }),
      })
      const d = await r.json()
      if (!r.ok) {
        setError(d.error || "Check failed")
        setAvailable(false)
        return
      }
      setAvailable(!!d.available)
      setConflicts(d.conflicts || [])
      if (d.note) setCheckNote(d.note)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
      setAvailable(false)
    } finally {
      setChecking(false)
    }
  }

  async function handleContinue() {
    setError("")
    if (!categoryText) {
      setError("Pick a category first.")
      return
    }
    if (plan !== "county" && zips.length === 0) {
      setError("Add at least one ZIP code.")
      return
    }
    if (plan !== "county" && available !== true) {
      setError("Run the availability check before continuing.")
      return
    }
    setBusy(true)
    if (!userId) {
      router.push("/advertise/login")
      return
    }

    // Save profile
    const { error: profErr } = await supabase
      .from("advertiser_profiles")
      .update({
        subscription_plan: plan,
        category_id: categoryId,
        category_text: categoryText,
        target_zips: plan === "county" ? [] : zips,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
    if (profErr) {
      setBusy(false)
      setError(profErr.message)
      return
    }

    // Insert pending zip-category locks. For county: a single is_county_lock=true row.
    const nowIso = new Date().toISOString()
    if (plan === "county") {
      const { error: zErr } = await supabase
        .from("advertiser_zip_categories")
        .insert({
          advertiser_id: userId,
          category_id: categoryId,
          zip_code: null,
          county: "Palm Beach",
          is_county_lock: true,
          status: "pending_review",
          created_at: nowIso,
        })
      if (zErr) {
        setBusy(false)
        setError(zErr.message)
        return
      }
    } else {
      // Insert one row per ZIP. Idempotent: skip ZIPs the advertiser already has.
      const { data: existing } = await supabase
        .from("advertiser_zip_categories")
        .select("zip_code")
        .eq("advertiser_id", userId)
        .eq("category_id", categoryId || "")
        .in("zip_code", zips)
      const have = new Set((existing || []).map((r) => r.zip_code as string))
      const toInsert = zips
        .filter((z) => !have.has(z))
        .map((z) => ({
          advertiser_id: userId,
          category_id: categoryId,
          zip_code: z,
          county: "Palm Beach",
          is_county_lock: false,
          status: "pending_review" as const,
          created_at: nowIso,
        }))
      if (toInsert.length > 0) {
        const { error: zErr } = await supabase.from("advertiser_zip_categories").insert(toInsert)
        if (zErr) {
          setBusy(false)
          setError(zErr.message)
          return
        }
      }
    }

    setBusy(false)
    router.push(`/advertise/portal/checkout/${plan}`)
  }

  if (!authChecked) {
    return <div style={{ padding: 60, textAlign: "center", color: "#888" }}>Checking session…</div>
  }

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#f9f9f9", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "60px 20px 40px" }}>
        <div style={{ fontSize: "26px", fontWeight: 700, color: "#1B2B6B", marginBottom: "6px", letterSpacing: "-0.02em" }}>
          Pick your plan
        </div>
        <p style={{ fontSize: "14px", color: "#666", marginBottom: "28px" }}>
          Pricing per month. Category exclusivity guaranteed in your selected ZIPs.
        </p>

        {/* Step 1 — Tier */}
        <Section title="1. Choose tier">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "12px" }}>
            {PLANS.map((p) => (
              <label
                key={p.key}
                htmlFor={`plan-${p.key}`}
                style={{
                  position: "relative",
                  display: "block",
                  padding: "16px",
                  border: "2px solid " + (plan === p.key ? "#1D9E75" : "#e5e5e5"),
                  borderRadius: "12px",
                  backgroundColor: plan === p.key ? "#F4FBF8" : "#fff",
                  cursor: "pointer",
                }}
              >
                <input
                  id={`plan-${p.key}`}
                  name="plan"
                  type="radio"
                  value={p.key}
                  checked={plan === p.key}
                  onChange={() => setPlan(p.key as PlanKey)}
                  style={{ position: "absolute", left: "-9999px" }}
                />
                {p.badge && (
                  <span style={{ position: "absolute", top: "-10px", right: "12px", backgroundColor: "#1D9E75", color: "#fff", fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "10px" }}>
                    {p.badge}
                  </span>
                )}
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#1B2B6B" }}>{p.label}</div>
                <div style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a", marginBottom: "4px" }}>
                  ${p.price}<span style={{ fontSize: "11px", fontWeight: 400, color: "#888" }}>/mo</span>
                </div>
                <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "11px", color: "#555", lineHeight: 1.6 }}>
                  {p.bullets.map((b) => <li key={b}>✓ {b}</li>)}
                </ul>
              </label>
            ))}
          </div>
        </Section>

        {/* Step 2 — Category */}
        <Section title="2. Your service category">
          <CategoryAutocomplete
            id="ad-category"
            initialText={categoryText}
            initialCategoryId={categoryId}
            onChange={(s) => {
              setCategoryId(s.category_id)
              setCategoryText(s.category_text)
              setAvailable(null)
              setConflicts([])
            }}
          />
        </Section>

        {/* Step 3 — ZIP picker */}
        <Section title="3. Target ZIP codes">
          {plan === "county" ? (
            <div style={{ padding: "14px 16px", backgroundColor: "#E1F5EE", border: "1px solid #c1ddd0", borderRadius: "10px", fontSize: "13px", color: "#155A3F" }}>
              ✓ All Palm Beach County ZIPs included with the County plan — no input required.
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                <input
                  id="zip-input"
                  name="zip-input"
                  type="text"
                  inputMode="numeric"
                  pattern="\d{5}"
                  maxLength={5}
                  value={zipInput}
                  onChange={(e) => setZipInput(e.target.value.replace(/\D/g, "").slice(0, 5))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addZip() } }}
                  placeholder="e.g. 33401"
                  style={{
                    flex: 1,
                    padding: "10px 12px",
                    fontSize: "14px",
                    border: "1px solid #d0d0d0",
                    borderRadius: "8px",
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={addZip}
                  disabled={!!planMeta.max_zips && zips.length >= planMeta.max_zips}
                  style={{
                    padding: "10px 14px",
                    fontSize: "13px",
                    fontWeight: 600,
                    backgroundColor: "#1B2B6B",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    cursor: planMeta.max_zips && zips.length >= planMeta.max_zips ? "not-allowed" : "pointer",
                  }}
                >
                  Add
                </button>
              </div>
              <div style={{ fontSize: "11px", color: "#888", marginBottom: "10px" }}>
                {zips.length} / {planMeta.max_zips} ZIP codes selected
              </div>
              {zips.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {zips.map((z) => (
                    <span key={z} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 10px 5px 12px", borderRadius: "999px", backgroundColor: "#1B2B6B", color: "#fff", fontSize: "12px", fontWeight: 600 }}>
                      {z}
                      <button type="button" onClick={() => removeZip(z)} style={{ border: "none", background: "transparent", color: "#fff", cursor: "pointer", fontSize: "13px", padding: 0, lineHeight: 1 }}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </Section>

        {/* Step 4 — Exclusivity check */}
        <Section title="4. Availability check">
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "10px" }}>
            <button
              type="button"
              onClick={runCheck}
              disabled={checking || !categoryText || (plan !== "county" && zips.length === 0)}
              style={{
                padding: "10px 16px",
                fontSize: "13px",
                fontWeight: 700,
                backgroundColor: "#1B2B6B",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                cursor: checking || !categoryText || (plan !== "county" && zips.length === 0) ? "not-allowed" : "pointer",
                opacity: checking || !categoryText || (plan !== "county" && zips.length === 0) ? 0.5 : 1,
              }}
            >
              {checking ? "Checking…" : "Check availability"}
            </button>
            {available === true && (
              <span style={{ color: "#1D9E75", fontSize: "13px", fontWeight: 600 }}>
                ✓ All selected ZIPs are available
              </span>
            )}
          </div>
          {checkNote && (
            <div style={{ padding: "10px 12px", backgroundColor: "#FAEEDA", border: "1px solid #EF9F27", borderRadius: "8px", fontSize: "12px", color: "#854F0B" }}>
              {checkNote}
            </div>
          )}
          {available === false && conflicts.length > 0 && (
            <div style={{ padding: "10px 12px", backgroundColor: "#FEE9E9", border: "1px solid #E24B4A", borderRadius: "8px", fontSize: "12px", color: "#A32D2D" }}>
              {conflicts.map((c, i) => (
                <div key={i} style={{ marginBottom: "4px" }}>
                  <strong>{categoryText}</strong> is already taken in{" "}
                  <strong>{c.zip_code}</strong>
                  {c.reason === "county_lock" ? " (county-wide lock by another advertiser)" : ""}.
                  Choose a different ZIP or category.
                </div>
              ))}
            </div>
          )}
        </Section>

        {error && (
          <div style={{ padding: "10px 12px", backgroundColor: "#FEE9E9", border: "1px solid #E24B4A", borderRadius: "8px", fontSize: "12px", color: "#A32D2D", marginBottom: "10px" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
          <button
            type="button"
            onClick={() => router.push("/advertise/portal")}
            style={{ padding: "11px 16px", borderRadius: "8px", backgroundColor: "#fff", color: "#555", border: "1.5px solid #e5e5e5", fontSize: "13px", fontWeight: 500, cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={busy || !categoryText || (plan !== "county" && (zips.length === 0 || available !== true))}
            style={{
              padding: "11px 18px",
              borderRadius: "8px",
              backgroundColor: "#1D9E75",
              color: "#fff",
              border: "none",
              fontSize: "13px",
              fontWeight: 700,
              cursor: busy ? "default" : "pointer",
              opacity: busy || !categoryText || (plan !== "county" && (zips.length === 0 || available !== true)) ? 0.5 : 1,
            }}
          >
            {busy ? "Saving…" : "Continue to checkout →"}
          </button>
        </div>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "20px 22px", marginBottom: "16px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: "#1B2B6B", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "10px" }}>
        {title}
      </div>
      {children}
    </section>
  )
}

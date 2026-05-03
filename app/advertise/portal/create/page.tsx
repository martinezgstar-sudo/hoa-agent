"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import SponsoredCard, { type Advertiser } from "@/app/components/SponsoredCard"

type Option = {
  option_number: number
  angle: string
  company_name: string
  tagline: string
  ad_copy: string
  cta_text: string
  cta_url: string
  why_this_works: string
}

type Profile = {
  id: string; company_name: string | null; phone: string | null;
  category: string | null; website_url: string | null;
}

const LOADING_STEPS = [
  "Visiting your website…",
  "Reading your content…",
  "Writing your ads…",
  "Almost done…",
]

export default function CreateAdPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [websiteUrl, setWebsiteUrl] = useState("")
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(0)
  const [error, setError] = useState("")
  const [batches, setBatches] = useState<Option[][]>([])
  const [feedback, setFeedback] = useState<Record<number, string>>({})
  const [saved, setSaved] = useState<string>("")

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession()
      if (!sess.session) { router.push("/advertise/login"); return }
      const { data: prof } = await supabase
        .from("advertiser_profiles").select("*")
        .eq("id", sess.session.user.id).maybeSingle()
      if (!prof) { router.push("/advertise/portal/plan"); return }
      setProfile(prof as Profile)
      if (prof.website_url) setWebsiteUrl(prof.website_url)
    })()
  }, [router])

  async function generateAds(prevFeedback?: string) {
    setError("")
    setBusy(true)
    setStep(0)
    const interval = setInterval(() => {
      setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1))
    }, 5000)

    try {
      const { data: sess } = await supabase.auth.getSession()
      const token = sess.session?.access_token
      if (!token) { router.push("/advertise/login"); return }

      const res = await fetch("/api/advertise/generate-ads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          website_url: websiteUrl,
          feedback: prevFeedback ?? "",
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || "Generation failed")
        return
      }
      setBatches(prev => [...prev, json.options as Option[]])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
    } finally {
      clearInterval(interval)
      setBusy(false)
    }
  }

  async function saveAd(opt: Option) {
    if (!profile) return
    setSaved("")
    const { error: err } = await supabase.from("advertiser_ads").insert({
      advertiser_id: profile.id,
      ad_name: opt.angle.slice(0, 80),
      company_name: opt.company_name,
      tagline: opt.tagline,
      ad_copy: opt.ad_copy,
      cta_text: opt.cta_text,
      cta_url: opt.cta_url,
      status: "draft",
      generated_by: "claude",
      source_url: websiteUrl,
    })
    if (err) { setError(err.message); return }
    setSaved(`Ad saved: "${opt.angle}"`)
  }

  if (!profile) return <div style={{ padding: 60, textAlign: "center", color: "#888" }}>Loading…</div>

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#f9f9f9", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ maxWidth: "920px", margin: "0 auto", padding: "40px 20px" }}>
        <Link href="/advertise/portal" style={{ fontSize: "13px", color: "#888", textDecoration: "none" }}>← Back to portal</Link>
        <h1 style={{ fontSize: "26px", fontWeight: 700, color: "#1B2B6B", margin: "16px 0 10px", letterSpacing: "-0.02em" }}>
          Create a new ad
        </h1>
        <p style={{ fontSize: "14px", color: "#666", marginBottom: "28px" }}>
          Claude will analyze your site and create 4 ad options in about 30 seconds.
        </p>

        {/* Generate input */}
        <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "24px", marginBottom: "24px" }}>
          <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#444", marginBottom: "6px" }}>
            Your website
          </label>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input
              type="url" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)}
              placeholder="https://your-business.com"
              style={{
                flex: "1 1 240px", padding: "11px 14px", fontSize: "14px",
                border: "1px solid #d0d0d0", borderRadius: "8px", outline: "none",
                boxSizing: "border-box",
              }}
            />
            <button onClick={() => generateAds()} disabled={busy || !websiteUrl}
              style={{
                padding: "11px 22px", fontSize: "14px", fontWeight: 600,
                backgroundColor: (busy || !websiteUrl) ? "#999" : "#1D9E75",
                color: "#fff", border: "none", borderRadius: "8px",
                cursor: (busy || !websiteUrl) ? "not-allowed" : "pointer",
              }}>
              {busy ? LOADING_STEPS[step] : "Generate Ads"}
            </button>
          </div>
          {error && (
            <div style={{ fontSize: "13px", color: "#c0392b", padding: "10px 14px", backgroundColor: "#FEE9E9", borderRadius: "8px", marginTop: "12px" }}>
              {error}
            </div>
          )}
          {saved && (
            <div style={{ fontSize: "13px", color: "#0B5239", padding: "10px 14px", backgroundColor: "#E1F5EE", borderRadius: "8px", marginTop: "12px" }}>
              ✓ {saved}
            </div>
          )}
        </div>

        {/* Render batches */}
        {batches.map((opts, batchIdx) => (
          <div key={batchIdx} style={{ marginBottom: "28px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a1a", marginBottom: "12px" }}>
              {batchIdx === 0 ? "Your 4 ad options" : `More options — Batch ${batchIdx + 1}`}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "14px" }}>
              {opts.map((opt) => (
                <div key={opt.option_number} style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "16px" }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "#1D9E75", textTransform: "uppercase", marginBottom: "4px", letterSpacing: "0.04em" }}>
                    Option {opt.option_number}
                  </div>
                  <div style={{ fontSize: "13px", color: "#666", marginBottom: "10px", fontStyle: "italic" }}>
                    Angle: {opt.angle}
                  </div>
                  <SponsoredCard advertisers={[{
                    id: `preview-${batchIdx}-${opt.option_number}`,
                    company_name: opt.company_name,
                    tagline: opt.tagline,
                    phone: profile.phone,
                    cta_text: opt.cta_text,
                    cta_url: opt.cta_url,
                    category: profile.category,
                    logo_url: null,
                  } as Advertiser]} />
                  <div style={{ fontSize: "12px", color: "#1B2B6B", marginTop: "10px", lineHeight: 1.5 }}>
                    <strong>Why this works:</strong> {opt.why_this_works}
                  </div>
                  <button onClick={() => saveAd(opt)} style={{
                    marginTop: "12px", padding: "8px 16px", backgroundColor: "#1B2B6B", color: "#fff",
                    border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: 600,
                  }}>
                    Select This Ad
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}

        {batches.length > 0 && !busy && (
          <div style={{ textAlign: "center", marginBottom: "20px" }}>
            <button onClick={() => generateAds()} style={{
              padding: "11px 22px", backgroundColor: "#fff", color: "#1B2B6B",
              border: "1px solid #1B2B6B", borderRadius: "8px", cursor: "pointer",
              fontSize: "13px", fontWeight: 600,
            }}>+ More Options</button>
          </div>
        )}
      </div>
    </main>
  )
}

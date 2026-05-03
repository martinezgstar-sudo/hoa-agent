"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import SponsoredCard, { type Advertiser } from "@/app/components/SponsoredCard"

type Profile = {
  id: string
  company_name: string | null
  email: string | null
  website_url: string | null
  phone: string | null
  category: string | null
  plan: string | null
  plan_status: string | null
  target_cities: string[] | null
  max_ads: number | null
  logo_url: string | null
}

type Ad = {
  id: string
  ad_name: string | null
  company_name: string | null
  tagline: string | null
  ad_copy: string | null
  cta_text: string | null
  cta_url: string | null
  image_url: string | null
  status: string
  is_rotating: boolean
}

const TABS = ["My Ads", "Analytics", "Settings", "Billing"] as const
type Tab = typeof TABS[number]

export default function PortalDashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ads, setAds] = useState<Ad[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>("My Ads")
  const [stats, setStats] = useState<{ impressions: number; clicks: number }>({ impressions: 0, clicks: 0 })

  useEffect(() => {
    (async () => {
      const { data: sess } = await supabase.auth.getSession()
      if (!sess.session) { router.push("/advertise/login"); return }
      const userId = sess.session.user.id

      const { data: prof } = await supabase
        .from("advertiser_profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle()
      if (!prof || !prof.plan) { router.push("/advertise/portal/plan"); return }
      setProfile(prof as Profile)

      const { data: adRows } = await supabase
        .from("advertiser_ads")
        .select("*")
        .eq("advertiser_id", userId)
        .order("created_at", { ascending: false })
      setAds((adRows || []) as Ad[])

      // 30-day analytics for ads owned by this advertiser
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data: analytics } = await supabase
        .from("ad_analytics")
        .select("event_type, advertiser_id, created_at")
        .gte("created_at", thirtyDaysAgo)
        .eq("advertiser_id", userId)
      const imps = (analytics || []).filter((a: { event_type: string }) => a.event_type === "impression").length
      const clk = (analytics || []).filter((a: { event_type: string }) => a.event_type === "click").length
      setStats({ impressions: imps, clicks: clk })

      setLoading(false)
    })()
  }, [router])

  async function signOut() {
    await supabase.auth.signOut()
    router.push("/advertise")
  }

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: "#888" }}>Loading…</div>
  if (!profile) return null

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#f9f9f9", fontFamily: "system-ui,sans-serif" }}>
      {/* Portal nav */}
      <nav style={{ backgroundColor: "#fff", borderBottom: "1px solid #e5e5e5", padding: "0 24px", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/" style={{ fontSize: "18px", fontWeight: 700, color: "#1B2B6B", textDecoration: "none" }}>
          HOA<span style={{ color: "#1D9E75" }}>Agent</span>
        </Link>
        <div style={{ display: "flex", gap: "16px", alignItems: "center", fontSize: "13px" }}>
          <span style={{ color: "#666" }}>{profile.company_name}</span>
          <button onClick={signOut} style={{ padding: "6px 14px", borderRadius: "6px", border: "1px solid #e0e0e0", background: "#fff", color: "#555", cursor: "pointer", fontSize: "12px" }}>
            Sign Out
          </button>
        </div>
      </nav>

      {/* Tabs */}
      <div style={{ backgroundColor: "#fff", borderBottom: "1px solid #e5e5e5", padding: "0 24px", display: "flex" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "14px 18px",
            border: "none", borderBottom: tab === t ? "3px solid #1B2B6B" : "3px solid transparent",
            background: "transparent", color: tab === t ? "#1B2B6B" : "#666",
            cursor: "pointer", fontSize: "13px", fontWeight: tab === t ? 600 : 400,
          }}>{t}</button>
        ))}
      </div>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 20px" }}>
        {tab === "My Ads" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div>
                <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Your ads</h2>
                <div style={{ fontSize: "12px", color: "#888", marginTop: "4px" }}>
                  {ads.length} of {profile.max_ads ?? 1} ad slot{(profile.max_ads ?? 1) === 1 ? "" : "s"} used
                </div>
              </div>
              <Link href="/advertise/portal/create" style={{
                padding: "10px 18px", backgroundColor: "#1D9E75", color: "#fff",
                borderRadius: "8px", textDecoration: "none", fontSize: "13px", fontWeight: 600,
              }}>+ New Ad</Link>
            </div>
            {ads.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", color: "#888" }}>
                No ads yet. <Link href="/advertise/portal/create" style={{ color: "#1D9E75" }}>Create your first ad</Link>.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {ads.map(a => (
                  <div key={a.id} style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                      <div style={{ fontSize: "13px", color: "#666" }}>{a.ad_name || "Untitled"}</div>
                      <span style={{
                        fontSize: "11px", padding: "2px 8px", borderRadius: "4px", fontWeight: 600,
                        backgroundColor: a.status === "active" ? "#E1F5EE" : a.status === "paused" ? "#FAEEDA" : "#f0f0f0",
                        color: a.status === "active" ? "#0B5239" : a.status === "paused" ? "#854F0B" : "#555",
                      }}>{a.status}</span>
                    </div>
                    <SponsoredCard advertisers={[{
                      id: a.id,
                      company_name: a.company_name || profile.company_name || "Your Company",
                      tagline: a.tagline,
                      phone: profile.phone,
                      cta_text: a.cta_text,
                      cta_url: a.cta_url,
                      category: profile.category,
                      logo_url: a.image_url,
                    } as Advertiser]} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "Analytics" && (
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a", marginBottom: "20px" }}>Last 30 days</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "20px" }}>
              <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "20px" }}>
                <div style={{ fontSize: "26px", fontWeight: 700, color: "#1B2B6B" }}>{stats.impressions.toLocaleString()}</div>
                <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: "4px" }}>Impressions</div>
              </div>
              <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "20px" }}>
                <div style={{ fontSize: "26px", fontWeight: 700, color: "#1D9E75" }}>{stats.clicks.toLocaleString()}</div>
                <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: "4px" }}>Clicks</div>
              </div>
              <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "20px" }}>
                <div style={{ fontSize: "26px", fontWeight: 700, color: "#1a1a1a" }}>
                  {stats.impressions > 0 ? ((stats.clicks / stats.impressions) * 100).toFixed(1) : "0"}%
                </div>
                <div style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: "4px" }}>Click-through rate</div>
              </div>
            </div>
            <div style={{ fontSize: "12px", color: "#888" }}>
              Per-day breakdowns and per-city analytics coming soon.
            </div>
          </div>
        )}

        {tab === "Settings" && (
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a", marginBottom: "20px" }}>Account settings</h2>
            <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "20px", display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px" }}>
              <div><strong style={{ color: "#666" }}>Company:</strong> {profile.company_name}</div>
              <div><strong style={{ color: "#666" }}>Email:</strong> {profile.email}</div>
              <div><strong style={{ color: "#666" }}>Phone:</strong> {profile.phone || "—"}</div>
              <div><strong style={{ color: "#666" }}>Website:</strong> {profile.website_url || "—"}</div>
              <div><strong style={{ color: "#666" }}>Category:</strong> {profile.category || "—"}</div>
              <div><strong style={{ color: "#666" }}>Target cities:</strong> {(profile.target_cities || []).join(", ") || "—"}</div>
            </div>
            <div style={{ fontSize: "12px", color: "#888", marginTop: "12px" }}>
              Editable settings coming soon. Email <a href="mailto:hello@hoa-agent.com" style={{ color: "#1D9E75" }}>hello@hoa-agent.com</a> to make changes for now.
            </div>
          </div>
        )}

        {tab === "Billing" && (
          <div>
            <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a", marginBottom: "20px" }}>Billing</h2>
            <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "20px" }}>
              <div style={{ fontSize: "14px", marginBottom: "10px" }}>
                <strong>Current plan:</strong> {profile.plan ? profile.plan[0].toUpperCase() + profile.plan.slice(1) : "—"}
              </div>
              <div style={{ fontSize: "13px", color: "#666" }}>
                Status: <span style={{ fontWeight: 600 }}>{profile.plan_status || "pending"}</span>
              </div>
              <div style={{ marginTop: "16px", fontSize: "12px", color: "#888" }}>
                Full billing management coming soon. Email <a href="mailto:hello@hoa-agent.com" style={{ color: "#1D9E75" }}>hello@hoa-agent.com</a> for billing questions.
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

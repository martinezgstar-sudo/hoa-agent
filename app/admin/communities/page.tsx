"use client"

import { useState } from "react"

const ADMIN_PASSWORD = "Valean2008!"

const EMPTY_FORM = {
  canonical_name: "",
  slug: "",
  city: "",
  county: "Palm Beach",
  state: "FL",
  property_type: "Single family",
  unit_count: "",
  monthly_fee_min: "",
  monthly_fee_max: "",
  monthly_fee_median: "",
  fee_observation_count: "",
  confidence_score: "2",
  management_company: "",
  str_restriction: "",
  pet_restriction: "",
  vehicle_restriction: "",
  rental_approval: "",
  amenities: "",
  subdivision_names: "",
  street_address_range: "",
  zip_codes: "",
  status: "published",
}

export default function AdminCommunitiesPage() {
  const [authed, setAuthed] = useState(
    typeof window !== "undefined" && sessionStorage.getItem("hoa_admin") === "true"
  )
  const [password, setPassword] = useState("")
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  function handleField(key: string, val: string) {
    if (key === "canonical_name") {
      const slug = val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
      setForm(f => ({ ...f, slug, canonical_name: val }))
    } else {
      setForm(f => ({ ...f, [key]: val }))
    }
  }

  async function handleSave() {
    if (form.canonical_name === "" || form.city === "") {
      setMessage("Community name and city are required.")
      return
    }
    setSaving(true)
    setMessage("")
    const payload = {
      ...form,
      unit_count: form.unit_count ? parseInt(form.unit_count) : null,
      monthly_fee_min: form.monthly_fee_min ? parseFloat(form.monthly_fee_min) : null,
      monthly_fee_max: form.monthly_fee_max ? parseFloat(form.monthly_fee_max) : null,
      monthly_fee_median: form.monthly_fee_median ? parseFloat(form.monthly_fee_median) : null,
      fee_observation_count: form.fee_observation_count ? parseInt(form.fee_observation_count) : null,
      confidence_score: parseInt(form.confidence_score),
    }
    const res = await fetch("/api/admin/communities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (data.ok) {
      setMessage("Community saved successfully.")
      setForm({ ...EMPTY_FORM })
    } else {
      setMessage("Error: " + (data.error || "Unknown error"))
    }
    setSaving(false)
  }

  const Field = ({ label, k, placeholder = "", type = "text" }: { label: string; k: string; placeholder?: string; type?: string }) => (
    <div style={{ marginBottom: "16px" }}>
      <label style={{ fontSize: "12px", fontWeight: "600", color: "#555", display: "block", marginBottom: "4px" }}>{label}</label>
      <input
        type={type}
        value={(form as any)[k]}
        onChange={e => handleField(k, e.target.value)}
        placeholder={placeholder}
        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e0e0e0", fontSize: "13px", outline: "none", boxSizing: "border-box" as any }}
      />
    </div>
  )

  const Select = ({ label, k, options }: { label: string; k: string; options: string[] }) => (
    <div style={{ marginBottom: "16px" }}>
      <label style={{ fontSize: "12px", fontWeight: "600", color: "#555", display: "block", marginBottom: "4px" }}>{label}</label>
      <select
        value={(form as any)[k]}
        onChange={e => handleField(k, e.target.value)}
        style={{ width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid #e0e0e0", fontSize: "13px", outline: "none", boxSizing: "border-box" as any, backgroundColor: "#fff" }}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#f9f9f9", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif" }}>
        <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "16px", padding: "40px", width: "340px", textAlign: "center" }}>
          <div style={{ fontSize: "24px", fontWeight: "700", color: "#1B2B6B", marginBottom: "4px" }}>
            HOA<span style={{ color: "#1D9E75" }}>Agent</span>
          </div>
          <div style={{ fontSize: "13px", color: "#888", marginBottom: "28px" }}>Admin Dashboard</div>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && password === ADMIN_PASSWORD) {
                setAuthed(true)
                sessionStorage.setItem("hoa_admin", "true")
              }
            }}
            style={{ width: "100%", padding: "11px 14px", borderRadius: "8px", border: "1.5px solid #e5e5e5", fontSize: "14px", outline: "none", boxSizing: "border-box" as any, marginBottom: "12px" }}
          />
          <button
            onClick={() => {
              if (password === ADMIN_PASSWORD) {
                setAuthed(true)
                sessionStorage.setItem("hoa_admin", "true")
              } else {
                alert("Wrong password")
              }
            }}
            style={{ width: "100%", padding: "11px", borderRadius: "8px", backgroundColor: "#1B2B6B", color: "#fff", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: "600" }}
          >
            Sign in
          </button>
        </div>
      </div>
    )
  }

  const TABS = [
    { key: "comments",     label: "Comments",       href: "/admin/comments" },
    { key: "communities",  label: "Add Community",  href: "/admin/communities" },
    { key: "upload",       label: "CSV Upload",     href: "/admin" },
    { key: "suggestions",  label: "Suggestions",    href: "/admin" },
    { key: "field_updates",label: "Field Updates",  href: "/admin" },
    { key: "research",     label: "Research",       href: "/admin" },
    { key: "news",         label: "News",           href: "/admin/news" },
    { key: "pending",      label: "Pending ›",      href: "/admin/pending" },
  ]

  return (
    <main style={{ fontFamily: "system-ui,sans-serif", backgroundColor: "#f9f9f9", minHeight: "100vh" }}>
      <nav style={{ backgroundColor: "#fff", borderBottom: "1px solid #e5e5e5", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: "64px" }}>
        <a href="/" style={{ textDecoration: "none" }}>
          <span style={{ fontSize: "20px", fontWeight: "700", color: "#1B2B6B" }}>
            HOA<span style={{ color: "#1D9E75" }}>Agent</span>
          </span>
        </a>
        <a href="/" style={{ fontSize: "12px", color: "#888", textDecoration: "none" }}>Back to site</a>
      </nav>

      <div style={{ backgroundColor: "#fff", borderBottom: "1px solid #e5e5e5", padding: "0 24px", display: "flex" }}>
        {TABS.map(t => (
          <a
            key={t.key}
            href={t.href}
            style={{
              padding: "16px 20px",
              borderBottom: t.key === "communities" ? "3px solid #1B2B6B" : "3px solid transparent",
              color: t.key === "communities" ? "#1B2B6B" : "#666",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: t.key === "communities" ? "600" : "400",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            {t.label}
          </a>
        ))}
      </div>

      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "32px 24px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: "600", color: "#1a1a1a", marginBottom: "4px" }}>Add Community</h1>
        <p style={{ fontSize: "13px", color: "#888", marginBottom: "32px" }}>
          Fill in the details below to add a new HOA community to the database.
        </p>

        {message !== "" && (
          <div style={{
            padding: "12px 16px",
            borderRadius: "8px",
            backgroundColor: message.startsWith("Error") ? "#FEE9E9" : "#E1F5EE",
            color: message.startsWith("Error") ? "#E24B4A" : "#1B2B6B",
            fontSize: "13px",
            marginBottom: "24px",
          }}>
            {message}
          </div>
        )}

        <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "24px", marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: "600", color: "#1B2B6B", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Basic Info</div>
          <Field label="Community Name *" k="canonical_name" placeholder="Estates at Heritage Club" />
          <Field label="Slug (auto-generated)" k="slug" placeholder="estates-at-heritage-club" />
          <Field label="City *" k="city" placeholder="Boynton Beach" />
          <Field label="Zip Codes" k="zip_codes" placeholder="33436, 33437" />
          <Select label="Property Type" k="property_type" options={["Single family", "Condo", "Townhouse", "Mixed"]} />
          <Field label="Unit Count" k="unit_count" placeholder="120" type="number" />
          <Select label="Status" k="status" options={["published", "draft"]} />
        </div>

        <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "24px", marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: "600", color: "#1B2B6B", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>HOA Fees</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <Field label="Fee Min ($/mo)" k="monthly_fee_min" placeholder="250" type="number" />
            <Field label="Fee Max ($/mo)" k="monthly_fee_max" placeholder="350" type="number" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <Field label="Fee Median ($/mo)" k="monthly_fee_median" placeholder="300" type="number" />
            <Field label="Observations" k="fee_observation_count" placeholder="5" type="number" />
          </div>
          <Select label="Confidence Score" k="confidence_score" options={["1", "2", "3"]} />
        </div>

        <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "24px", marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: "600", color: "#1B2B6B", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Management</div>
          <Field label="Management Company" k="management_company" placeholder="Campbell Property Management" />
        </div>

        <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "24px", marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: "600", color: "#1B2B6B", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Restrictions</div>
          <Field label="STR Restriction" k="str_restriction" placeholder="No short-term rentals" />
          <Field label="Pet Restriction" k="pet_restriction" placeholder="2 pets max, 25lb limit" />
          <Field label="Vehicle Restriction" k="vehicle_restriction" placeholder="No commercial vehicles" />
          <Field label="Rental Approval" k="rental_approval" placeholder="Board approval required" />
        </div>

        <div style={{ backgroundColor: "#fff", border: "1px solid #e5e5e5", borderRadius: "12px", padding: "24px", marginBottom: "16px" }}>
          <div style={{ fontSize: "13px", fontWeight: "600", color: "#1B2B6B", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Search and Matching</div>
          <Field label="Subdivision Names" k="subdivision_names" placeholder="Heritage Club, Estates at Heritage" />
          <Field label="Street Address Range" k="street_address_range" placeholder="100-500 Heritage Blvd" />
          <Field label="Amenities" k="amenities" placeholder="Pool, Tennis, Clubhouse" />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          style={{ width: "100%", padding: "14px", borderRadius: "10px", backgroundColor: "#1B2B6B", color: "#fff", border: "none", cursor: "pointer", fontSize: "15px", fontWeight: "600" }}
        >
          {saving ? "Saving..." : "Save Community"}
        </button>
      </div>
    </main>
  )
}

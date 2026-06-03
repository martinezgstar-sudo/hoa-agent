"use client";
import { useState } from "react";

export default function SubmitAssociation() {
  const [f, setF] = useState<any>({});
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  function set(k: string, v: string) { setF((p: any) => ({ ...p, [k]: v })); }

  async function submit() {
    setErr("");
    if (!f.community_name || !f.submitter_email) { setErr("Community name and your email are required."); return; }
    setBusy(true);
    const r = await fetch("/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    setBusy(false);
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || "Something went wrong. Try again."); return; }
    setSent(true);
  }

  const wrap: any = { minHeight: "100vh", backgroundColor: "#f7f7f8", fontFamily: "system-ui, sans-serif" };
  const inner: any = { maxWidth: 620, margin: "0 auto", padding: 24, color: "#1a1a1a" };
  const lab: any = { display: "block", fontSize: 13, fontWeight: 600, color: "#444", margin: "14px 0 4px" };
  const inp: any = { width: "100%", padding: 10, fontSize: 15, border: "1px solid #ccc", borderRadius: 6, boxSizing: "border-box" };

  return (
    <div style={wrap}>
      <nav style={{ backgroundColor: "#fff", borderBottom: "1px solid #e5e5e5", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
        <a href="/" style={{ textDecoration: "none" }}><span style={{ fontSize: 20, fontWeight: 700, color: "#1B2B6B" }}>HOA<span style={{ color: "#1D9E75" }}>Agent</span></span></a>
        <a href="/search" style={{ fontSize: 13, color: "#888", textDecoration: "none" }}>Back to search</a>
      </nav>
      <div style={inner}>
        {sent ? (
          <div style={{ background: "#fff", border: "1px solid #e2e2e2", borderRadius: 10, padding: 24, marginTop: 24 }}>
            <h1 style={{ color: "#1D9E75", fontSize: 22 }}>Thank you</h1>
            <p style={{ color: "#444", lineHeight: 1.6 }}>Your association was submitted. We review each one before it goes live and will reach out at your email if we need more detail.</p>
            <a href="/search" style={{ color: "#185FA5" }}>Back to search</a>
          </div>
        ) : (
          <div style={{ background: "#fff", border: "1px solid #e2e2e2", borderRadius: 10, padding: 24, marginTop: 24 }}>
            <h1 style={{ fontSize: 24, marginBottom: 4 }}>Submit your association</h1>
            <p style={{ color: "#666", fontSize: 14 }}>Not seeing your HOA on HOA Agent? Add it here and we will review and publish it.</p>
            <label style={lab}>Community name *</label>
            <input style={inp} value={f.community_name || ""} onChange={(e) => set("community_name", e.target.value)} />
            <label style={lab}>Your email *</label>
            <input style={inp} type="email" value={f.submitter_email || ""} onChange={(e) => set("submitter_email", e.target.value)} />
            <label style={lab}>City</label>
            <input style={inp} value={f.city || ""} onChange={(e) => set("city", e.target.value)} />
            <label style={lab}>Address</label>
            <input style={inp} value={f.address || ""} onChange={(e) => set("address", e.target.value)} />
            <label style={lab}>Monthly HOA fee</label>
            <input style={inp} value={f.hoa_fee || ""} onChange={(e) => set("hoa_fee", e.target.value)} placeholder="e.g. 350" />
            <label style={lab}>Management company</label>
            <input style={inp} value={f.management_company || ""} onChange={(e) => set("management_company", e.target.value)} />
            <label style={lab}>Property type</label>
            <input style={inp} value={f.property_type || ""} onChange={(e) => set("property_type", e.target.value)} placeholder="Condo, single family, townhome" />
            <label style={lab}>Pet restriction</label>
            <input style={inp} value={f.pet_restriction || ""} onChange={(e) => set("pet_restriction", e.target.value)} />
            <label style={lab}>Short-term rental restriction</label>
            <input style={inp} value={f.str_restriction || ""} onChange={(e) => set("str_restriction", e.target.value)} />
            <label style={lab}>Amenities</label>
            <input style={inp} value={f.amenities || ""} onChange={(e) => set("amenities", e.target.value)} />
            <label style={lab}>Notes</label>
            <textarea style={{ ...inp, minHeight: 80 }} value={f.notes || ""} onChange={(e) => set("notes", e.target.value)} />
            {err && <div style={{ color: "#b91c1c", fontSize: 13, marginTop: 12 }}>{err}</div>}
            <button disabled={busy} onClick={submit} style={{ marginTop: 18, border: "none", borderRadius: 6, padding: "12px 22px", background: "#1D9E75", color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer", opacity: busy ? 0.6 : 1 }}>
              {busy ? "Submitting..." : "Submit association"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

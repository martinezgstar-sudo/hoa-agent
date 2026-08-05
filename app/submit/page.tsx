"use client";
import { useState } from "react";

export default function SubmitAssociation() {
  const [f, setF] = useState<Record<string, string>>({});
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  function set(k: string, v: string) { setF((p) => ({ ...p, [k]: v })); }

  async function submit() {
    setErr("");
    if (!f.community_name || !f.submitter_email) { setErr("Community name and your email are required."); return; }
    setBusy(true);
    const r = await fetch("/api/submit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    setBusy(false);
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error || "Something went wrong. Try again."); return; }
    setSent(true);
  }

  const wrap: React.CSSProperties = { minHeight: "100vh", backgroundColor: "#f7f7f8", fontFamily: "system-ui, sans-serif" };
  const inner: React.CSSProperties = { maxWidth: 620, margin: "0 auto", padding: 24, color: "#1a1a1a" };
  const lab: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 600, color: "#444", margin: "14px 0 4px" };
  const inp: React.CSSProperties = { width: "100%", padding: 10, fontSize: 15, border: "1px solid #ccc", borderRadius: 6, boxSizing: "border-box" };

  // Field spec: [id, label, {type?, placeholder?, required?, multiline?}]
  const fields: Array<[string, string, { type?: string; placeholder?: string; required?: boolean; multiline?: boolean }]> = [
    ["community_name", "Community name *", { required: true }],
    ["submitter_email", "Your email *", { type: "email", required: true }],
    ["city", "City", {}],
    ["address", "Address", {}],
    ["hoa_fee", "Monthly HOA fee", { placeholder: "e.g. 350" }],
    ["management_company", "Management company", {}],
    ["property_type", "Property type", { placeholder: "Condo, single family, townhome" }],
    ["pet_restriction", "Pet restriction", {}],
    ["str_restriction", "Short-term rental restriction", {}],
    ["amenities", "Amenities", {}],
    ["notes", "Notes", { multiline: true }],
  ];

  return (
    <div style={wrap}>
      <nav style={{ backgroundColor: "#fff", borderBottom: "1px solid #e5e5e5", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
        <a href="/" style={{ textDecoration: "none" }}><span style={{ fontSize: 20, fontWeight: 700, color: "#1B2B6B" }}>HOA<span style={{ color: "#06875e" }}>Agent</span></span></a>
        <a href="/search" style={{ fontSize: 13, color: "#595959", textDecoration: "none" }}>Back to search</a>
      </nav>
      <div style={inner}>
        {sent ? (
          <div style={{ background: "#fff", border: "1px solid #e2e2e2", borderRadius: 10, padding: 24, marginTop: 24 }}>
            <h1 style={{ color: "#06875e", fontSize: 22 }}>Thank you</h1>
            <p style={{ color: "#444", lineHeight: 1.6 }}>Your association was submitted. We review each one before it goes live and will reach out at your email if we need more detail.</p>
            <a href="/search" style={{ color: "#185FA5" }}>Back to search</a>
          </div>
        ) : (
          <form
            onSubmit={(e) => { e.preventDefault(); submit(); }}
            style={{ background: "#fff", border: "1px solid #e2e2e2", borderRadius: 10, padding: 24, marginTop: 24 }}
          >
            <h1 style={{ fontSize: 24, marginBottom: 4 }}>Submit your association</h1>
            <p style={{ color: "#595959", fontSize: 14 }}>Not seeing your HOA on HOA Agent? Add it here and we will review and publish it.</p>

            {fields.map(([id, label, opts]) => (
              <div key={id}>
                <label htmlFor={`f-${id}`} style={lab}>{label}</label>
                {opts.multiline ? (
                  <textarea
                    id={`f-${id}`}
                    name={id}
                    style={{ ...inp, minHeight: 80 }}
                    value={f[id] || ""}
                    onChange={(e) => set(id, e.target.value)}
                  />
                ) : (
                  <input
                    id={`f-${id}`}
                    name={id}
                    type={opts.type || "text"}
                    placeholder={opts.placeholder}
                    required={opts.required}
                    style={inp}
                    value={f[id] || ""}
                    onChange={(e) => set(id, e.target.value)}
                  />
                )}
              </div>
            ))}

            {err && <div role="alert" style={{ color: "#b91c1c", fontSize: 13, marginTop: 12 }}>{err}</div>}
            <button
              type="submit"
              disabled={busy}
              style={{ marginTop: 18, border: "none", borderRadius: 6, padding: "12px 22px", background: "#06875e", color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer", opacity: busy ? 0.6 : 1 }}
            >
              {busy ? "Submitting..." : "Submit association"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

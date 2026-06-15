"use client";
import { useEffect, useState } from "react";

export default function LegalReview() {
  const [password, setPassword] = useState("");
  // Middleware gates this route, so render authed and load on mount.
  const [authed, setAuthed] = useState(true);
  const [links, setLinks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, any[]>>({});

  async function load(pw: string) {
    setLoading(true);
    const r = await fetch("/api/admin/legal/list", { headers: { "x-admin-password": pw } });
    if (r.status === 401) { alert("Wrong password"); setLoading(false); return; }
    const j = await r.json();
    setLinks(j.links ?? []); setAuthed(true); setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load("");
  }, []);
  async function decide(id: string, action: "approve" | "reject") {
    await fetch("/api/admin/legal/decide", {
      method: "POST",
      headers: { "x-admin-password": password, "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }
  async function search(linkId: string) {
    const r = await fetch("/api/admin/legal/communities?q=" + encodeURIComponent(q[linkId] || ""),
      { headers: { "x-admin-password": password } });
    const j = await r.json();
    setResults((prev) => ({ ...prev, [linkId]: j.communities || [] }));
  }
  async function assign(linkId: string, legalCaseId: string, communityId: string) {
    await fetch("/api/admin/legal/assign", {
      method: "POST",
      headers: { "x-admin-password": password, "Content-Type": "application/json" },
      body: JSON.stringify({ legalCaseId, communityId }),
    });
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
  }

  const wrap: any = { minHeight: "100vh", backgroundColor: "#f7f7f8" };
  const inner: any = { maxWidth: 860, margin: "0 auto", padding: 24, color: "#1a1a1a", fontFamily: "system-ui, sans-serif" };
  const card: any = { background: "#fff", border: "1px solid #e2e2e2", borderRadius: 10, padding: 16, marginBottom: 12 };
  const btn: any = { border: "none", borderRadius: 6, padding: "8px 16px", color: "#fff", cursor: "pointer", fontWeight: 600, marginRight: 8 };
  const tabs = [
    { label: "Field Updates", href: "/admin/pending" },
    { label: "News", href: "/admin/news" },
    { label: "Comments", href: "/admin/comments" },
    { label: "Legal", href: "/admin/legal" },
  ];
  const Nav = () => (
    <>
      <nav style={{ backgroundColor: "#fff", borderBottom: "1px solid #e5e5e5", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
        <a href="/" style={{ textDecoration: "none" }}><span style={{ fontSize: 20, fontWeight: 700, color: "#1B2B6B" }}>HOA<span style={{ color: "#1D9E75" }}>Agent</span></span></a>
        <a href="/admin" style={{ fontSize: 12, color: "#888", textDecoration: "none" }}>Back to admin</a>
      </nav>
      <div style={{ backgroundColor: "#fff", borderBottom: "1px solid #e5e5e5", padding: "0 24px", display: "flex" }}>
        {tabs.map((t) => {
          const active = t.label === "Legal";
          return <a key={t.label} href={t.href} style={{ padding: "16px 20px", borderBottom: active ? "3px solid #1B2B6B" : "3px solid transparent", color: active ? "#1B2B6B" : "#666", fontSize: 13, fontWeight: active ? 600 : 400, textDecoration: "none" }}>{t.label}</a>;
        })}
      </div>
    </>
  );

  if (!authed) {
    return (
      <div style={wrap}>
        <Nav />
        <div style={inner}>
          <h1 style={{ color: "#185FA5" }}>Legal Match Review</h1>
          <input type="password" placeholder="Password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(password); }}
            style={{ padding: 10, fontSize: 16, border: "1px solid #ccc", borderRadius: 6 }} />
          <button style={{ ...btn, background: "#185FA5", marginLeft: 8 }} onClick={() => load(password)}>Enter</button>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <Nav />
      <div style={inner}>
        <h1 style={{ color: "#185FA5" }}>Legal Match Review</h1>
        <p style={{ color: "#555" }}>{loading ? "Loading..." : links.length + " pending"}</p>
        {links.map((l) => {
          const c = l.legal_cases || {}, com = l.communities || {};
          const url = c.absolute_url ? (c.absolute_url.startsWith("http") ? c.absolute_url : "https://www.courtlistener.com" + c.absolute_url) : null;
          const res = results[l.id] || [];
          return (
            <div key={l.id} style={card}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{c.case_name || "Unnamed case"}</div>
              <div style={{ color: "#555", fontSize: 13, margin: "4px 0" }}>{c.court || "Unknown court"} · {c.date_filed || "no date"} · docket {c.docket_number || "n/a"}</div>
              <div style={{ background: "#f0f6ff", borderRadius: 6, padding: 10, margin: "8px 0" }}>
                Auto-matched to: <strong>{com.canonical_name || "none"}</strong>{com.city ? " (" + com.city + ")" : ""}
                {com.slug && <a href={"/community/" + com.slug} target="_blank" style={{ marginLeft: 8, color: "#185FA5" }}>view page</a>}
              </div>
              <div style={{ fontSize: 13, color: "#444" }}>Match reason: {l.match_reason || "n/a"} · confidence {l.match_confidence ?? "n/a"}</div>
              {c.snippet && <div style={{ fontSize: 13, color: "#666", marginTop: 6, fontStyle: "italic" }}>{c.snippet}</div>}
              {url && <div style={{ marginTop: 6 }}><a href={url} target="_blank" style={{ color: "#185FA5" }}>read on CourtListener</a></div>}
              <div style={{ marginTop: 12 }}>
                <button style={{ ...btn, background: "#1B7A4B" }} onClick={() => decide(l.id, "approve")}>Approve</button>
                <button style={{ ...btn, background: "#b91c1c" }} onClick={() => decide(l.id, "reject")}>Reject</button>
              </div>
              <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#444", marginBottom: 6 }}>Assign the correct HOA</div>
                <input value={q[l.id] || ""} placeholder="search community name"
                  onChange={(e) => setQ((prev) => ({ ...prev, [l.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter") search(l.id); }}
                  style={{ padding: 8, fontSize: 14, border: "1px solid #ccc", borderRadius: 6, width: 280 }} />
                <button style={{ ...btn, background: "#185FA5", marginLeft: 8 }} onClick={() => search(l.id)}>Search HOAs</button>
                {res.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {res.map((cm: any) => (
                      <div key={cm.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fafafa", border: "1px solid #eee", borderRadius: 6, padding: "8px 10px", marginBottom: 6 }}>
                        <span style={{ fontSize: 14 }}>{cm.canonical_name}{cm.city ? " · " + cm.city : ""}</span>
                        <button style={{ ...btn, background: "#1B7A4B", marginRight: 0 }} onClick={() => assign(l.id, l.legal_case_id, cm.id)}>Assign</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {authed && !loading && links.length === 0 && <p style={{ color: "#1B7A4B" }}>Queue clear. Nothing pending.</p>}
      </div>
    </div>
  );
}

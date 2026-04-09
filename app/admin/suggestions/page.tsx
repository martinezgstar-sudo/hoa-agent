"use client"
import { useState, useEffect } from "react"

const ADMIN_PASSWORD = "Valean2008!"
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export default function AdminSuggestions() {
  const [authed, setAuthed] = useState(typeof window !== "undefined" && sessionStorage.getItem("hoa_admin") === "true")
  const [password, setPassword] = useState("")
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  async function loadSuggestions() {
    setLoading(true)
    const res = await fetch(SUPABASE_URL + "/rest/v1/suggestions?order=created_at.desc&limit=50", {
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY }
    })
    const data = await res.json()
    setSuggestions(data || [])
    setLoading(false)
  }

  useEffect(() => { if (authed) loadSuggestions() }, [authed])

  async function approveSuggestion(s: any) {
    // Create community from suggestion
    const slug = (s.community_name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80)
    const payload = {
      canonical_name: s.community_name,
      slug,
      city: s.city || "",
      county: "Palm Beach",
      state: "FL",
      monthly_fee_min: s.hoa_fee || null,
      monthly_fee_max: s.hoa_fee || null,
      str_restriction: s.str_restriction || null,
      pet_restriction: s.pet_restriction || null,
      amenities: s.amenities || null,
      management_company: s.management_company || null,
      status: "published",
      confidence_score: 2,
    }

    const res = await fetch(SUPABASE_URL + "/rest/v1/communities", {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify(payload)
    })

    if (res.ok) {
      // Delete the suggestion
      await fetch(SUPABASE_URL + "/rest/v1/suggestions?id=eq." + s.id, {
        method: "DELETE",
        headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY }
      })
      setMessage("Community approved and published: " + s.community_name)
      loadSuggestions()
    } else {
      const err = await res.json()
      setMessage("Error: " + (err.message || "Failed to create community"))
    }
  }

  async function rejectSuggestion(id: string) {
    await fetch(SUPABASE_URL + "/rest/v1/suggestions?id=eq." + id, {
      method: "DELETE",
      headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY }
    })
    setMessage("Suggestion rejected")
    loadSuggestions()
  }

  if (!authed) {
    return (
      <div style={{minHeight:"100vh",backgroundColor:"#f9f9f9",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"32px",width:"320px"}}>
          <div style={{fontSize:"18px",fontWeight:"600",color:"#1a1a1a",marginBottom:"20px"}}>HOA Agent Admin</div>
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && password === ADMIN_PASSWORD) { setAuthed(true); sessionStorage.setItem("hoa_admin", "true") }}}
            style={{width:"100%",padding:"10px",borderRadius:"8px",border:"1px solid #e0e0e0",fontSize:"14px",marginBottom:"12px",boxSizing:"border-box"}}/>
          <button onClick={() => { if (password === ADMIN_PASSWORD) { setAuthed(true); sessionStorage.setItem("hoa_admin", "true") }}}
            style={{width:"100%",padding:"10px",borderRadius:"8px",backgroundColor:"#1B2B6B",color:"#fff",border:"none",cursor:"pointer",fontSize:"14px",fontWeight:"500"}}>
            Sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <main style={{fontFamily:"system-ui,sans-serif",backgroundColor:"#f9f9f9",minHeight:"100vh"}}>
      <nav style={{backgroundColor:"#fff",borderBottom:"1px solid #e5e5e5",padding:"0 32px",height:"72px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <a href="/" style={{display:"flex",alignItems:"center",gap:"8px",textDecoration:"none"}}>
          <img src="/logo.png" alt="HOA Agent" style={{height:"48px",width:"auto"}}/>
        </a>
        <div style={{display:"flex",gap:"16px",alignItems:"center"}}>
          <a href="/admin/comments" style={{fontSize:"13px",color:"#666",textDecoration:"none"}}>Comments</a>
          <a href="/admin/communities" style={{fontSize:"13px",color:"#666",textDecoration:"none"}}>Add Community</a>
          <a href="/admin/upload" style={{fontSize:"13px",color:"#666",textDecoration:"none"}}>CSV Upload</a>
          <a href="/admin/suggestions" style={{fontSize:"13px",color:"#1D9E75",textDecoration:"none",fontWeight:"500"}}>Suggestions</a>
        </div>
      </nav>

      <div style={{maxWidth:"900px",margin:"0 auto",padding:"32px"}}>
        <h1 style={{fontSize:"22px",fontWeight:"600",color:"#1a1a1a",marginBottom:"4px"}}>Community Suggestions</h1>
        <p style={{fontSize:"13px",color:"#888",marginBottom:"24px"}}>Review and approve community submissions from residents.</p>

        {message && (
          <div style={{backgroundColor:"#E1F5EE",borderRadius:"8px",padding:"12px 16px",marginBottom:"16px",fontSize:"13px",color:"#1B2B6B",fontWeight:"500"}}>
            {message}
          </div>
        )}

        {loading && <div style={{color:"#888",fontSize:"13px"}}>Loading...</div>}

        {!loading && suggestions.length === 0 && (
          <div style={{textAlign:"center",padding:"60px",color:"#888",fontSize:"14px"}}>No pending suggestions.</div>
        )}

        {suggestions.map(s => (
          <div key={s.id} style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"20px 24px",marginBottom:"16px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"12px"}}>
              <div>
                <div style={{fontSize:"16px",fontWeight:"600",color:"#1a1a1a",marginBottom:"4px"}}>{s.community_name || "Unnamed"}</div>
                <div style={{fontSize:"12px",color:"#888"}}>{s.city} — submitted {new Date(s.created_at).toLocaleDateString()}</div>
              </div>
              <div style={{display:"flex",gap:"8px"}}>
                <button onClick={() => approveSuggestion(s)}
                  style={{padding:"8px 16px",borderRadius:"8px",backgroundColor:"#1D9E75",color:"#fff",border:"none",cursor:"pointer",fontSize:"13px",fontWeight:"500"}}>
                  Approve Publish
                </button>
                <button onClick={() => rejectSuggestion(s.id)}
                  style={{padding:"8px 16px",borderRadius:"8px",backgroundColor:"#fff",color:"#E24B4A",border:"1px solid #E24B4A",cursor:"pointer",fontSize:"13px"}}>
                  Reject
                </button>
              </div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px",marginBottom:"12px"}}>
              {[
                {label:"HOA Fee", val: s.hoa_fee ? "$"+s.hoa_fee+"/mo" : null},
                {label:"STR", val: s.str_restriction},
                {label:"Pets", val: s.pet_restriction},
                {label:"Management", val: s.management_company},
                {label:"Amenities", val: s.amenities},
                {label:"Email", val: s.submitter_email},
              ].filter(x => x.val).map(x => (
                <div key={x.label} style={{backgroundColor:"#f9f9f9",borderRadius:"6px",padding:"8px 10px"}}>
                  <div style={{fontSize:"10px",color:"#888",marginBottom:"2px",textTransform:"uppercase",letterSpacing:"0.05em"}}>{x.label}</div>
                  <div style={{fontSize:"12px",color:"#1a1a1a"}}>{x.val}</div>
                </div>
              ))}
            </div>

            {s.notes && (
              <div style={{fontSize:"12px",color:"#555",backgroundColor:"#f9f9f9",borderRadius:"6px",padding:"10px 12px",lineHeight:"1.6"}}>
                {s.notes}
              </div>
            )}

            {s.address && (
              <div style={{fontSize:"11px",color:"#aaa",marginTop:"8px"}}>Address: {s.address}</div>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}

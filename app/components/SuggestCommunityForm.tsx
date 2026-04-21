"use client"
import { useState, useEffect, useRef } from "react"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export default function SuggestCommunityForm({ searchQuery }: { searchQuery: string }) {
  const [name, setName] = useState(searchQuery || "")
  const [city, setCity] = useState("")
  const [email, setEmail] = useState("")
  const [fee, setFee] = useState("")
  const [propertyType, setPropertyType] = useState("")
  const [masterHoa, setMasterHoa] = useState("")
  const [masterHoaId, setMasterHoaId] = useState("")
  const [draftMatches, setDraftMatches] = useState<any[]>([])
  const [masterMatches, setMasterMatches] = useState<any[]>([])
  const [showDrafts, setShowDrafts] = useState(false)
  const [showMasters, setShowMasters] = useState(false)
  const [selectedDraft, setSelectedDraft] = useState<any>(null)
  const [status, setStatus] = useState<"idle"|"submitting"|"success"|"error">("idle")
  const [expanded, setExpanded] = useState(false)

  // Search draft communities as user types
  useEffect(() => {
    if (name.length < 2) { setDraftMatches([]); return }
    const timer = setTimeout(async () => {
      const res = await fetch(
        SUPABASE_URL + "/rest/v1/communities?canonical_name=ilike.*" + encodeURIComponent(name) + "*&status=eq.draft&select=id,canonical_name,city,monthly_fee_min,monthly_fee_max,property_type&limit=6",
        { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } }
      )
      const data = await res.json()
      setDraftMatches(Array.isArray(data) ? data : [])
      setShowDrafts(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [name])

  // Search master HOAs as user types
  useEffect(() => {
    if (masterHoa.length < 2) { setMasterMatches([]); return }
    const timer = setTimeout(async () => {
      const res = await fetch(
        SUPABASE_URL + "/rest/v1/communities?canonical_name=ilike.*" + encodeURIComponent(masterHoa) + "*&status=eq.published&is_sub_hoa=eq.false&select=id,canonical_name,city&limit=6",
        { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } }
      )
      const data = await res.json()
      setMasterMatches(Array.isArray(data) ? data : [])
      setShowMasters(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [masterHoa])

  function selectDraft(draft: any) {
    setSelectedDraft(draft)
    setName(draft.canonical_name)
    setCity(draft.city || "")
    setFee(draft.monthly_fee_min ? String(draft.monthly_fee_min) : "")
    setPropertyType(draft.property_type || "")
    setShowDrafts(false)
  }

  async function handleSubmit() {
    if (!name.trim() || !city.trim()) return
    setStatus("submitting")

    const payload = {
      community_name: name.trim(),
      city: city.trim(),
      hoa_fee: fee ? parseFloat(fee) : null,
      property_type: propertyType || null,
      submitter_email: email || null,
      master_hoa_id: masterHoaId || null,
      master_hoa_name: masterHoa || null,
      existing_community_id: selectedDraft?.id || null,
      notes: selectedDraft ? "User confirmed existing draft community" : "New community suggestion from search",
    }

    const res = await fetch(
      SUPABASE_URL + "/rest/v1/suggestions",
      { method: "POST", headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify(payload) }
    )

    if (res.ok || res.status === 201) {
      setStatus("success")
    } else {
      setStatus("error")
    }
  }

  if (status === "success") {
    return (
      <div style={{backgroundColor:"#E1F5EE",borderRadius:"16px",padding:"32px",textAlign:"center",margin:"16px 0"}}>
        <div style={{fontSize:"32px",marginBottom:"12px"}}>✓</div>
        <div style={{fontSize:"16px",fontWeight:"600",color:"#1B2B6B",marginBottom:"8px"}}>Thanks! We received your suggestion.</div>
        <div style={{fontSize:"13px",color:"#555",lineHeight:"1.6"}}>We will research and add this community within 48 hours. If you left your email we will notify you when it goes live.</div>
      </div>
    )
  }

  return (
    <div style={{backgroundColor:"#fff",border:"2px solid #1B2B6B",borderRadius:"16px",padding:"24px",margin:"16px 0"}}>
      <div style={{fontSize:"16px",fontWeight:"600",color:"#1B2B6B",marginBottom:"4px"}}>Don't see your community?</div>
      <div style={{fontSize:"13px",color:"#888",marginBottom:"20px"}}>Suggest it and we'll add it to HOA Agent. Start typing to see if it already exists in our database.</div>

      {!expanded ? (
        <button onClick={() => setExpanded(true)}
          style={{width:"100%",padding:"12px",borderRadius:"10px",backgroundColor:"#1B2B6B",color:"#fff",border:"none",cursor:"pointer",fontSize:"14px",fontWeight:"600"}}>
          + Suggest a community
        </button>
      ) : (
        <div>
          {/* Community name with draft autocomplete */}
          <div style={{marginBottom:"16px",position:"relative"}}>
            <div style={{fontSize:"12px",fontWeight:"600",color:"#555",marginBottom:"6px"}}>Community name <span style={{color:"#E24B4A"}}>*</span></div>
            <input type="text" value={name} onChange={e => { setName(e.target.value); setSelectedDraft(null) }}
              onFocus={() => draftMatches.length > 0 && setShowDrafts(true)}
              placeholder="Start typing your HOA name..."
              style={{width:"100%",padding:"10px 12px",borderRadius:"8px",border:"1.5px solid #e5e5e5",fontSize:"13px",outline:"none",boxSizing:"border-box"}}/>
            {showDrafts && draftMatches.length > 0 && (
              <div style={{position:"absolute",top:"100%",left:0,right:0,backgroundColor:"#fff",border:"1.5px solid #e5e5e5",borderRadius:"10px",boxShadow:"0 8px 24px rgba(0,0,0,0.1)",zIndex:100,marginTop:"4px",overflow:"hidden"}}>
                <div style={{padding:"8px 12px",fontSize:"11px",fontWeight:"600",color:"#1D9E75",textTransform:"uppercase",letterSpacing:"0.05em",backgroundColor:"#f9f9f9"}}>
                  Already in our database — click to select
                </div>
                {draftMatches.map(d => (
                  <div key={d.id} onClick={() => selectDraft(d)}
                    style={{padding:"10px 14px",fontSize:"13px",cursor:"pointer",borderBottom:"1px solid #f5f5f5"}}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor="#f5f5f5")}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor="#fff")}>
                    <div style={{fontWeight:"500",color:"#1a1a1a"}}>{d.canonical_name}</div>
                    <div style={{fontSize:"11px",color:"#888"}}>{d.city}{d.property_type ? " · " + d.property_type : ""}{d.monthly_fee_min ? " · $" + d.monthly_fee_min + "/mo" : ""}</div>
                  </div>
                ))}
                <div onClick={() => setShowDrafts(false)}
                  style={{padding:"10px 14px",fontSize:"12px",color:"#888",cursor:"pointer",fontStyle:"italic"}}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor="#f5f5f5")}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor="#fff")}>
                  None of these — add "{name}" as new
                </div>
              </div>
            )}
          </div>

          {selectedDraft && (
            <div style={{backgroundColor:"#E1F5EE",borderRadius:"8px",padding:"10px 14px",marginBottom:"16px",fontSize:"12px",color:"#1B2B6B"}}>
              ✓ You selected an existing community. Submitting will request we publish and verify this profile.
            </div>
          )}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"16px"}}>
            <div>
              <div style={{fontSize:"12px",fontWeight:"600",color:"#555",marginBottom:"6px"}}>City <span style={{color:"#E24B4A"}}>*</span></div>
              <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="West Palm Beach"
                style={{width:"100%",padding:"10px 12px",borderRadius:"8px",border:"1.5px solid #e5e5e5",fontSize:"13px",outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div>
              <div style={{fontSize:"12px",fontWeight:"600",color:"#555",marginBottom:"6px"}}>Monthly HOA fee</div>
              <input type="number" value={fee} onChange={e => setFee(e.target.value)} placeholder="350"
                style={{width:"100%",padding:"10px 12px",borderRadius:"8px",border:"1.5px solid #e5e5e5",fontSize:"13px",outline:"none",boxSizing:"border-box"}}/>
            </div>
          </div>

          <div style={{marginBottom:"16px"}}>
            <div style={{fontSize:"12px",fontWeight:"600",color:"#555",marginBottom:"6px"}}>Property type</div>
            <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
              {["Single family","Condo","Townhouse","Mixed"].map(t => (
                <button key={t} type="button" onClick={() => setPropertyType(propertyType === t ? "" : t)}
                  style={{padding:"6px 14px",borderRadius:"20px",border:"1.5px solid " + (propertyType===t?"#1B2B6B":"#e5e5e5"),backgroundColor:propertyType===t?"#1B2B6B":"#fff",color:propertyType===t?"#fff":"#555",cursor:"pointer",fontSize:"12px"}}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Master HOA with autocomplete */}
          <div style={{marginBottom:"16px",position:"relative"}}>
            <div style={{fontSize:"12px",fontWeight:"600",color:"#555",marginBottom:"6px"}}>Part of a master HOA? (optional)</div>
            <input type="text" value={masterHoa} onChange={e => { setMasterHoa(e.target.value); setMasterHoaId("") }}
              onFocus={() => masterMatches.length > 0 && setShowMasters(true)}
              placeholder="e.g. PGA National, Abacoa, Mirasol..."
              style={{width:"100%",padding:"10px 12px",borderRadius:"8px",border:"1.5px solid #e5e5e5",fontSize:"13px",outline:"none",boxSizing:"border-box"}}/>
            {showMasters && masterMatches.length > 0 && (
              <div style={{position:"absolute",top:"100%",left:0,right:0,backgroundColor:"#fff",border:"1.5px solid #e5e5e5",borderRadius:"10px",boxShadow:"0 8px 24px rgba(0,0,0,0.1)",zIndex:100,marginTop:"4px",overflow:"hidden"}}>
                {masterMatches.map(m => (
                  <div key={m.id} onClick={() => { setMasterHoa(m.canonical_name); setMasterHoaId(m.id); setShowMasters(false) }}
                    style={{padding:"10px 14px",fontSize:"13px",cursor:"pointer",borderBottom:"1px solid #f5f5f5"}}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor="#f5f5f5")}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor="#fff")}>
                    <div style={{fontWeight:"500",color:"#1a1a1a"}}>{m.canonical_name}</div>
                    <div style={{fontSize:"11px",color:"#888"}}>{m.city}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{marginBottom:"20px"}}>
            <div style={{fontSize:"12px",fontWeight:"600",color:"#555",marginBottom:"6px"}}>Your email (optional — we will notify you when added)</div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com"
              style={{width:"100%",padding:"10px 12px",borderRadius:"8px",border:"1.5px solid #e5e5e5",fontSize:"13px",outline:"none",boxSizing:"border-box"}}/>
          </div>

          {status === "error" && (
            <div style={{fontSize:"12px",color:"#E24B4A",marginBottom:"12px"}}>Something went wrong. Please try again.</div>
          )}

          <div style={{display:"flex",gap:"8px"}}>
            <button onClick={() => setExpanded(false)}
              style={{flex:1,padding:"11px",borderRadius:"8px",backgroundColor:"#fff",color:"#555",border:"1.5px solid #e5e5e5",cursor:"pointer",fontSize:"13px"}}>
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={!name.trim() || !city.im() || status==="submitting"}
              style={{flex:2,padding:"11px",borderRadius:"8px",backgroundColor:(name.trim()&&city.trim())?"#1B2B6B":"#ccc",color:"#fff",border:"none",cursor:(name.trim()&&city.trim())?"pointer":"not-allowed",fontSize:"13px",fontWeight:"600"}}>
              {status==="submitting" ? "Submitting..." : "Submit suggestion"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

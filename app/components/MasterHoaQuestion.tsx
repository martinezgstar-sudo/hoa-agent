"use client"
import { useState, useEffect } from "react"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

interface Props {
  communityId: string
  communityName: string
}

export default function MasterHoaQuestion({ communityId, communityName }: Props) {
  const [answered, setAnswered] = useState(false)
  const [answer, setAnswer] = useState("")
  const [masterName, setMasterName] = useState("")
  const [masterId, setMasterId] = useState("")
  const [matches, setMatches] = useState<any[]>([])
  const [showMatches, setShowMatches] = useState(false)
  const [status, setStatus] = useState<"idle"|"submitting"|"success">("idle")

  // Check if already answered in localStorage
  useEffect(() => {
    const key = "master_hoa_answered_" + communityId
    if (localStorage.getItem(key)) setAnswered(true)
  }, [communityId])

  // Autocomplete master HOAs
  useEffect(() => {
    if (masterName.length < 2) { setMatches([]); return }
    const timer = setTimeout(async () => {
      const res = await fetch(
        SUPABASE_URL + "/rest/v1/communities?canonical_name=ilike.*" + encodeURIComponent(masterName) + "*&status=eq.published&select=id,canonical_name,city&limit=6",
        { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } }
      )
      const data = await res.json()
      setMatches(Array.isArray(data) ? data : [])
      setShowMatches(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [masterName])

  async function handleSubmit() {
    setStatus("submitting")
    
    if (answer === "no" || answer === "unsure") {
      // Mark as answered locally only
      localStorage.setItem("master_hoa_answered_" + communityId, "true")
      setAnswered(true)
      return
    }

    if (answer === "yes" && masterId) {
      // Update community directly as verified
      await fetch(
        SUPABASE_URL + "/rest/v1/communities?id=eq." + communityId,
        { method: "PATCH",
          headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ is_sub_hoa: true, master_hoa_id: masterId })
        }
      )
    }

    localStorage.setItem("master_hoa_answered_" + communityId, "true")
    setStatus("success")
    setTimeout(() => setAnswered(true), 2000)
  }

  if (answered) return null

  if (status === "success") {
    return (
      <div style={{backgroundColor:"#E1F5EE",border:"1px solid #1D9E75",borderRadius:"10px",padding:"14px 18px",marginBottom:"12px",fontSize:"13px",color:"#1B2B6B",fontWeight:"500"}}>
        ✓ Thank you — connection recorded and verified.
      </div>
    )
  }

  return (
    <div style={{backgroundColor:"#FEF9EC",border:"1px solid #EF9F27",borderRadius:"10px",padding:"16px 18px",marginBottom:"12px"}}>
      <div style={{fontSize:"13px",fontWeight:"600",color:"#854F0B",marginBottom:"4px"}}>Community structure question</div>
      <div style={{fontSize:"13px",color:"#633806"ginBottom:"14px",lineHeight:"1.5"}}>
        Is <strong>{communityName}</strong> part of a larger master HOA community?
      </div>

      {!answer && (
        <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
          <button onClick={() => setAnswer("yes")}
            style={{padding:"8px 18px",borderRadius:"8px",backgroundColor:"#1B2B6B",color:"#fff",border:"none",cursor:"pointer",fontSize:"13px",fontWeight:"600"}}>
            Yes
          </button>
          <button onClick={() => { setAnswer("no"); handleSubmit() }}
            style={{padding:"8px 18px",borderRadius:"8px",backgroundColor:"#fff",color:"#555",border:"1px solid #e5e5e5",cursor:"pointer",fontSize:"13px"}}>
            No — standalone
          </button>
          <button onClick={() => { setAnswer("unsure"); handleSubmit() }}
            style={{padding:"8px 18px",borderRadius:"8px",backgroundColor:"#fff",color:"#555",border:"1px solid #e5e5e5",cursor:"pointer",fontSize:"13px"}}>
            Not sure
          </button>
      </div>
      )}

      {answer === "yes" && (
        <div>
          <div style={{fontSize:"12px",color:"#854F0B",marginBottom:"8px",marginTop:"8px"}}>Which master HOA does it belong to?</div>
          <div style={{position:"relative"}}>
            <input type="text" value={masterName} onChange={e => { setMasterName(e.target.value); setMasterId("") }}
              placeholder="Start typing master HOA name..."
              autoFocus
              style={{width:"100%",padding:"10px 12px",borderRadius:"8px",border:"1.5px solid #EF9F27",fontSize:"13px",outline:"none",boxSizing:"border-box"}}/>
            {showMatches && matches.length > 0 && (
              <div style={{position:"absolute",top:"100%",left:0,right:0,backgroundColor:"#fff",border:"1.5px solid #e5e5e5",borderRadius:"10px",boxShadow:"0 8px 24px rgba(0,0,0,0.1)",zIndex:100,marginTop:"4px",overflow:"hidden"}}>
                {matches.map(m => (
                  <div key={m.id} onClick={() => { setMasterName(m.canonical_name); setMasterId(m.id); setShowMatches(false) }}
                    style={{padding:"10px 14px",fontSize:"13px",cursor:"pointer",borderBottom:"1px solid #f5f5f5"}}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor="#f5f5f5")}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor="#fff")}>
                    <div style={{fontWeight:"500"}}>{m.canonical_name}</div>
                    <div style={{fontSize:"11px",color:"#888"}}>{m.city}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:"8px",marginTop:"12px"}}>
            <button onClick={() => setAnswer("")}
              style={{flex:1,padding:"9px",borderRadius:"8px",backgroundColor:"#fff",color:"#555",border:"1px solid #e5e5e5",cursor:"pointer",fontSize:"13px"}}>
              Back
            </button>
            <button onClick={handleSubmit} disabled={!masterId || status==="submitting"}
              style={{flex:2,padding:"9px",borderRadius:"8px",backgroundColor:masterId?"#1B2B6B":"#ccc",color:"#fff",border:"none",cursor:masterId?"pointer":"not-allowed",fontSize:"13px",fontWeight:"600"}}>
              {status==="submitting" ? "Saving..." : "Confirm — verified connection"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

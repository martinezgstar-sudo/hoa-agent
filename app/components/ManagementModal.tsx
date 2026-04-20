"use client"
import { useState } from "react"

interface Props {
  communityId: string
  communityName: string
}

const KNOWN_COMPANIES = [
  "FirstService Residential",
  "Castle Group",
  "Self-managed",
  "Campbell Property Management",
  "Jupiter Management",
  "Lang Management",
  "Sea Breeze Community Management",
  "Davenport Professional Property Management",
  "Realtime Property Management",
  "Crest Management Group",
  "Troon Golf & Leisure",
  "Vista Blue Management",
  "Hawkeye Management",
  "Phoenix Management Services",
  "AKAM Management",
  "Associa Florida",
  "CMC Management",
  "CPM Property Management",
  "Florida Skyline Management",
  "Gulf Stream Management",
  "Harbor Management of South Florida",
  "JDM Property Managers LLC",
  "Leland Management",
  "Miami Management",
  "Real Time Property Management",
  "GRS Community Management",
  "Vesta Property Services",
  "KW Property Management",
  "Sentry Management",
  "Greystar",
]

export default function ManagementModal({ communityId, communityName }: Props) {
  const [open, setOpen] = useState(false)
  const [company, setCompany] = useState("")
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [status, setStatus] = useState<"idle"|"submitting"|"success"|"error">("idle")

  const suggestions = company.length > 1
    ? KNOWN_COMPANIES.filter(c => c.toLowerCase().includes(company.toLowerCase())).slice(0, 6)
    : []

  async function handleSubmit() {
    if (!company.trim()) return
    setStatus("submitting")

    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        community_id: communityId,
        comment_text: "Management company update: " + company.trim(),
        is_anonymous: true,
        is_resident: true,
        management_company_reported: company.trim(),
      })
    })

    if (res.ok) {
      setStatus("success")
    } else {
      setStatus("error")
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{fontSize:"11px",color:"#1D9E75",border:"1px solid #1D9E75",borderRadius:"20px",padding:"3px 10px",backgroundColor:"#fff",cursor:"pointer",whiteSpace:"nowrap"}}>
        + Know this? Add it
      </button>
    )
  }

  return (
    <>
      <div onClick={() => { setOpen(false); setShowSuggestions(false) }}
        style={{position:"fixed",inset:0,backgroundColor:"rgba(0,0,0,0.4)",zIndex:999}} />

      <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",backgroundColor:"#fff",borderRadius:"16px",padding:"28px 24px",width:"min(420px, 90vw)",zIndex:1000,boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}}>

        {status === "success" ? (
          <div style={{textAlign:"center",padding:"16px 0"}}>
            <div style={{fontSize:"36px",marginBottom:"12px"}}>✓</div>
            <div style={{fontSize:"15px",fontWeight:"600",color:"#1B2B6B",marginBottom:"8px"}}>Thank you!</div>
            <div style={{fontSize:"13px",color:"#888",marginBottom:"20px",lineHeight:"1.6"}}>The management company info will be reviewed and added within 24 hours.</div>
            <button onClick={() => { setOpen(false); setStatus("idle"); setCompany("") }}
              style={{padding:"10px 24px",borderRadius:"8px",backgroundColor:1B2B6B",color:"#fff",border:"none",cursor:"pointer",fontSize:"14px",fontWeight:"600"}}>
              Close
            </button>
          </div>
        ) : (
          <>
            <div style={{fontSize:"11px",fontWeight:"600",color:"#1D9E75",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"8px"}}>Add management info</div>
            <div style={{fontSize:"16px",fontWeight:"600",color:"#1a1a1a",marginBottom:"6px",lineHeight:"1.4"}}>Who manages {communityName}?</div>
            <div style={{fontSize:"12px",color:"#888",marginBottom:"20px"}}>Start typing to see suggestions from known Palm Beach County management companies.</div>

            <div style={{marginBottom:"16px",position:"relative"}}>
              <input
                type="text"
                value={company}
                onChange={e => { setCompany(e.target.value); setShowSuggestions(true) }}
                onFocus={() => setShowSuggestions(true)}
                placeholder="e.g. Castle Group, FirstService, Lang Management"
                autoFocus
                style={{width:"100%",border:"1.5px solid #e5e5e5",borderRadius:"10px",padding:"12px 14px",fontSize:"14px",outline:"none",boxSizing:"border-box"}}
              />
              {showSuggestions && suggestions.length > 0 && (
                <div style={{position:"absolute",top:"100%",left:0,right:0,backgroundColor:"#fff",border:"1.5px solid #e5e5e5",borderRadius:"10px",boxShadow:"0 8px 24px rgba(0,0,0,0.1)",zIndex:10,marginTop:"4px",overflow:"hidden"}}>
                  {suggestions.map(s => (
                    <div key={s}
                      onClick={() => { setCompany(s); setShowSuggestions(false) }}
                      style={{padding:"10px 14px",fontSize:"13px",color:"#1a1a1a",cursor:"pointer",borderBottom:"1px solid #f5f5f5"}}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f5f5f5")}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#fff")}>
                      {s}
                    </div>
                  ))}
                  {company.length > 1 && !KNOWN_COMPANIES.some(c => c.toLowerCase() === company.toLowerCase()) && (
                    <div
                      onClick={() => setShowSuggestions(false)}
                      style={{padding:"10px 14px",fontSize:"12px",color:"#888",cursor:"pointer",fontStyle:"italic"}}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = "#f5f5f5")}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = "#fff")}>
                      Use "{company}" (not in our list)
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{backgroundColor:"#FEF9EC",border:"1px solid #EF9F27",borderRadius:"8px",padding:"10px 14px",marginBottom:"16px",fontSize:"11px",color:"#854F0B",lineHeight:"1.6"}}>
              Only current or former residents of this community should submit management info. Submissions are reviewed before publishing.
            </div>

            {status === "error" && (
              <div style={{fontSize:"12px",color:"#E24B4A",marginBottom:"12px"}}>Something went wrong. Please try again.</div>
            )}

            <div style={{display:"flex",gap:"8px"}}>
              <button type="button" onClick={() => setOpen(false)}
                style={{flex:1,padding:"11px",borderRadius:"8px",backgroundColor:"#fff",color:"#555",border:"1.5px solid #e5e5e5",cursor:"pointer",fontSize:"13px",fontWeight:"500"}}>
                Cancel
              </button>
              <button type="button" onClick={handleSubmit} disabled={!company.trim() || status==="submitting"}
                style={{flex:2,padding:"11px",borderRadius:"8px",backgroundColor:company.trim()?"#1D9E75":"#ccc",color:"#fff",border:"none",cursor:company.trim()?"pointer":"not-allowed",fontSize:"13px",fontWeight:"600"}}>
                {status==="submitting" ? "Submitting..." : "Submit"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

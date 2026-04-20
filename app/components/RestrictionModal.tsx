"use client"
import { useState } from "react"

interface Props {
  communityId: string
  field: "str_restriction" | "pet_restriction" | "vehicle_restriction" | "rental_approval"
  communityName: string
}

const FIELD_CONFIG = {
  str_restriction: {
    question: "Are short-term rentals allowed in this community?",
    subtext: "Airbnb, VRBO, or rentals under 30 days",
    yes: "Yes — allowed",
    no: "No — not allowed",
    unsure: "Not sure",
  },
  pet_restriction: {
    question: "Are pets allowed in this community?",
    subtext: "Dogs, cats, or other animals",
    yes: "Yes — allowed",
    no: "No — not allowed",
    unsure: "Allowed with restrictions",
  },
  vehicle_restriction: {
    question: "Are commercial vehicles allowed to park here?",
    subtext: "Work trucks, vans, vehicles with logos or signage",
    yes: "Yes — allowed",
    no: "No — not allowed",
    unsure: "Not sure",
  },
  rental_approval: {
    question: "Does the board require app renting?",
    subtext: "Board interview, application, or background check required",
    yes: "Yes — approval required",
    no: "No — not required",
    unsure: "Not sure",
  },
}

export default function RestrictionModal({ communityId, field, communityName }: Props) {
  const [open, setOpen] = useState(false)
  const [answer, setAnswer] = useState("")
  const [details, setDetails] = useState("")
  const [status, setStatus] = useState<"idle"|"submitting"|"success"|"error">("idle")

  const config = FIELD_CONFIG[field]

  async function handleSubmit() {
    if (!answer) return
    setStatus("submitting")

    const fieldMap: Record<string, string> = {
      str_restriction: "str_allowed",
      pet_restriction: "pets_allowed",
      vehicle_restriction: "vehicle_restriction",
      rental_approval: "rental_approval",
    }

    const body: any = {
      community_id: communityId,
      comment_text: details || `Restriction update: ${config.question} — ${answer}`,
      is_anonymous: true,
      is_resident: true,
      [fieldMap[field]]: answer,
    }

    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      setStatus("success")   } else {
      setStatus("error")
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{fontSize:"11px",color:"#1D9E75",border:"1px solid #1D9E75",borderRadius:"20px",padding:"2px 9px",backgroundColor:"#fff",cursor:"pointer",whiteSpace:"nowrap",flexShrink:0}}>
        + Add
      </button>
    )
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={() => setOpen(false)}
        style={{position:"fixed",inset:0,backgroundColor:"rgba(0,0,0,0.4)",zIndex:999}}
      />

      {/* Modal */}
      <div style={{position:"fixed",top:"50%",left:"50%",transform:"translate(-50%,-50%)",backgroundColor:"#fff",borderRadius:"16px",padding:"28px 24px",width:"min(440px, 90vw)",zIndex:1000,boxShadow:"0 20px 60px rgba(0,0,0,0.15)"}}>

        {status === "success" ? (
          <div style={{textAlign:"center",padding:"16px 0"}}>
            <div style={{fontSize:"36px",marginBottom:"12px"}}>✓</div>
            <div style={{fontSize:"15px",fontWeight:"600",color:"#1B2B6B",marginBottom:"8px"}}>Thank you!</div>
            <div style={{fontSize:"13px",color:"#888",marginBottom:"20px",lineHeight:"1.6"}}>Your submission will be reviewed and added to this profile within 24 hours.</div>
            <button onClick={() => { setOpen(false); setStatus("idle"); setAnswer(""); setDetails("") }}
              style={{padding:"10px 24px",borderRadius:"8px",backgroundColor:"#1B2B6B",color:"#fff",border:"none",cursor:"pointer",fontSize:"14px",fontWeight:"600"}}>
              Close
            </button>
          </div>
        ) : (
          <>
            <div style={{fontSize:"11px",fontWeight:"600",color:"#1D9E75",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"8px"}}>Add restriction info</div>
            <div style={{fontSize:"16px",fontWeight:"600",color:"#1a1a1a",marginBottom:"6px",lineHeight:"1.4"}}>{config.question}</div>
            <div style={{fontSize:"12px",color:"#888",marginBottom:"20px"}}>{config.subtext}</div>

            <div style={{display:"flex",flexDirection:"column",gap:"8px",marginBottom:"20px"}}>
              {[
                { val: "yes", label: config.yes },
                { val: "no", label: config.no },
                { val: "unsure", label: config.unsure },
              ].map(opt => (
                <button key={opt.val} type="button" onClick={() => setAnswer(opt.val)}
                  style={{padding:"12px 16px",borderRadius:"10px",border:"2px solid " + (answer===opt.val?"#1B2B6B":"#e5e5e5"),backgroundColor:answer===opt.val?"#1B2B6B":"#fff",color:answer===opt.val?"#fff":"#333",cursor:"pointer",fontSize:"13px",fontWeight:answer===opt.val?"600":"400",textAlign:"left",transition:"all 0.15s"}}>
                  {opt.label}
                </button>
              ))}
            </div>

            {answer && (
              <div style={{marginBottom:"16px"}}>
                <div style={{fontSize:"12px",color:"#555",marginBottom:"6px"}}>Any details to add? (optional)</div>
                <textarea
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                  placeholder="e.g. No pets over 25 lbs, breed restrictions apply..."
                  rows={3}
                  style={{width:"100%",border:"1.5px solid #e5e5e5",borderRadius:"8px",padding:"10px 12px",fontSize:"13px",resize:"vertical",outline:"none",boxSizing:"border-box",fontFamily:"system-ui,sans-serif"}}
                />
              </div>
            )}

            <div style={{backgroundColor:"#FEF9EC",border:"1px solid #EF9F27",borderRadius:"8px",padding:"10px 14px",marginBottom:"16px",fontSize:"11px",color:"#854F0B",lineHeight:"1.6"}}>
              Only current or former residents of this community should submit restriction info. Submissions are reviewed before publishing.
            </div>

            {status === "error" && (
              <div style={{fontSize:"12px",color:"#E24B4A",marginBottom:"12px"}}>Something went wrong. Please try again.</div>
            )}

            <div style={{display:"flex",gap:"8px"}}>
              <button type="button" onClick={() => setOpen(false)}
                style={{flex:1,padding:"11px",borderRadius:"8px",backgroundColor:"#fff",color:"#555",border:"1.5px solid #e5e5e5",cursor:"pointer",fontSize:"13px",fontWeight:"500"}}>
                Cancel
              </button>
              <button type="button" onClick={handleSubmit} disabled={!answer || status==="submitting"}
                style={{flex:2,padding:"11px",borderRadius:"8px",backgroundColor:answer?"#1D9E75":"#ccc",color:"#fff",border:"none",cursor:answer?"pointer":"not-allowed",fontSize:"13px",fontWeight:"600"}}>
                {status==="submitting" ? "Submitting..." : "Submit"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

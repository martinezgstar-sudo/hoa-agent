"use client"
import { useState } from "react"

export default function ReportModal() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    await fetch("/api/report-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    })
    setSubmitted(true)
    setSubmitting(false)
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={{fontSize:"13px",padding:"10px 20px",borderRadius:"8px",backgroundColor:"#1B2B6B",color:"#fff",border:"none",cursor:"pointer",fontWeight:"500",whiteSpace:"nowrap"}}>
        Get report — 
      </button>
      {open && (
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,backgundColor:"rgba(0,0,0,0.5)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:"24px"}} onClick={() => setOpen(false)}>
          <div style={{backgroundColor:"#fff",borderRadius:"16px",padding:"32px",maxWidth:"440px",width:"100%",position:"relative"}} onClick={e => e.stopPropagation()}>
            <button onClick={() => setOpen(false)} style={{position:"absolute",top:"16px",right:"16px",background:"none",border:"none",fontSize:"20px",cursor:"pointer",color:"#888"}}>✕</button>
            {submitted ? (
              <div style={{textAlign:"center",padding:"16px 0"}}>
                <div style={{fontSize:"40px",marginBottom:"16px"}}>✓</div>
                <div style={{fontSize:"18px",fontWeight:"600",color:"#1a1a1a",marginBottom:"8px"}}>You are on the list</div>
                <div style={{fontSize:"14px",color:"#888",lineHeight:"1.6"}}>Full reports are coming soon. We will email you as soon as they are available ong with a discount for early access.</div>
              </div>
            ) : (
              <>
                <div style={{fontSize:"11px",fontWeight:"600",color:"#1D9E75",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"8px"}}>Full HOA Report — </div>
                <h2 style={{fontSize:"22px",fontWeight:"600",color:"#1a1a1a",marginBottom:"8px",lineHeight:"1.3"}}>Get the complete picture</h2>
                <p style={{fontSize:"13px",color:"#888",lineHeight:"1.7",marginBottom:"20px"}}>Full reports are coming soon. Enter your email to be notified when available — early access customers get a discount.</p>
                <div style={{display:"flex",flexDirection:"column",gap:"8px",marginBottom:"20px"}}>
                  {["Complete fee trend analysis","Full source trail with citations","All special assessment signals","Restriction detail","Management company history","Downloadable PDF"].map(i => (
                    <div key={i} style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"13px",color:"#444"}}>
                      <span style={{color:"#1D9E75",fontWeight:"600"}}>✓</span>{i}
                    </div>
                  ))}
                </div>
                <form onSubmit={handleSubmit}>
                  <input type="email" required placeholder="your@email.com" value={email} onChange={e => setEmail(e.target.value)}
                    style={{width:"100%",padding:"10px 12px",borderRadius:"8px",border:"1px solid #e0e0e0",fontSize:"13px",outline:"none",boxSizing:"border-box",marginBottom:"12px"}}/>
                  <button type="submit" disabled={submitting}
                    style={{width:"100%",padding:"12px",borderRadius:"8px",backgroundColor:"#1B2B6B",color:"#fff",border:"none",cursor:"pointer",fontSize:"14px",fontWeight:"600"}}>
                    {submitting ? "Submitting..." : "Notify me when available"}
                  </button>
              </form>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

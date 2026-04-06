"use client"
import { useState } from "react"

export default function GuideForm() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle"|"submitting"|"success"|"error">("idle")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setStatus("submitting")
    const res = await fetch("/api/guide-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    })
    if (res.ok) {
      setStatus("success")
      setEmail("")
    } else {
      setStatus("error")
    }
  }

  if (status === "success") {
    return (
      <div style={{display:"flex",alignItems:"center",gap:"12px",padding:"12px 16px",backgroundColor:"#fff",borderRadius:"8px"}}>
        <span style={{fontSize:"20px"}}>✓</span>
        <div>
          <div style={{fontSize:"14px",fontWeight:"500",color:"#1B2B6B"}}>Check your inbox</div>
        <div style={{fontSize:"12px",color:"#666"}}>The Palm Beach County HOA Fee Guide is on its way.</div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{display:"flex",gap:"8px",flexShrink:0}}>
      <input
        type="email"
        required
        placeholder="your@email.com"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={{fontSize:"13px",padding:"8px 12px",borderRadius:"8px",border:"1px solid #5DCAA5",outline:"none",width:"200px"}}
      />
      <button
        type="submit"
        disabled={status === "submitting"}
        style={{fontSize:"13px",padding:"8px 16px",borderRadius:"8px",backgroundColor:"#1B2B6B",color:"#fff",border:"none",cursor:"pointer",fontWeight:"500"}}
      >
        {status === "submitting" ? "Sending..." : "Get guide"}
      </button>
      {status === "error" && <div style={{fontSize:"12px",color:"#E24B4A",alignSelf:"center"}}>Something went wrong. Try again.</div>}
    </form>
  )
}

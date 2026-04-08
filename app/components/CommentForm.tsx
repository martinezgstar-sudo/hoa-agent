"use client"
import { useState } from "react"

export default function CommentForm({ communityId }: { communityId: string }) {
  const [step, setStep] = useState(1)
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [isResident, setIsResident] = useState<string>("")
  const [residentType, setResidentType] = useState<string>("")
  const [residencyLength, setResidencyLength] = useState<string>("")
  const [hoaFee, setHoaFee] = useState("")
  const [feeIncludes, setFeeIncludes] = useState<string[]>([])
  const [feeIncreased, setFeeIncreased] = useState<string>("")
  const [specialAssessment, setSpecialAssessment] = useState<string>("")
  const [assessmentAmount, setAssessmentAmount] = useState("")
  const [strAllowed, setStrAllowed] = useState<string>("")
  const [petsAllowed, setPetsAllowed] = useState<string>("")
  const [rentalApproval, setRentalApproval] = useState<string>("")
  const [managementRating, setManagementRating] = useState(0)
  const [maintenanceRating, setMaintenanceRating] = useState(0)
  const [status, setStatus] = useState<"idle"|"submitting"|"success"|"error">("idle")
  const [error, setError] = useState("")

  const feeIncludeOptions = ["Water","Sewer","Cable","Internet","Lawn","Insurance","Trash","Pool","Security","Clubhouse","Gym"]

  function toggleFeeIncludes(item: string) {
    setFeeIncludes(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item])
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!comment.trim()) return
    setStatus("submitting")
    setError("")

    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        community_id: communityId,
        comment_text: comment,
        rating: rating || null,
        commenter_name: isAnonymous ? "Anonymous" : (name || "Anonymous"),
        email: email || null,
        is_anonymous: isAnonymous,
        is_resident: isResident === "yes",
        resident_type: residentType || null,
        residency_length: residencyLength || null,
        hoa_fee_reported: hoaFee ? parseFloat(hoaFee) : null,
        fee_includes: feeIncludes.length > 0 ? feeIncludes.join("|") : null,
        special_assessment: specialAssessment || null,
        assessment_amount: assessmentAmount ? parseFloat(assessmentAmount) : null,
        str_allowed: strAllowed || null,
        pets_allowed: petsAllowed || null,
        rental_approval: rentalApproval || null,
        management_rating: managementRating || null,
        maintenance_rating: maintenanceRating || null,
      })
    })

    if (res.ok) {
      setStatus("success")
    } else {
      const data = await res.json()
      setError(data.error || "Something went wrong")
      setStatus("error")
    }
  }

  if (status === "success") {
    return (
      <div style={{backgroundColor:"#E1F5EE",borderRadius:"12px",padding:"24px",textAlign:"center"}}>
        <div style={{fontSize:"32px",marginBottom:"8px"}}>✓</div>
      <div style={{fontSize:"15px",fontWeight:"600",color:"#1B2B6B",marginBottom:"8px"}}>Thank you for sharing your experience</div>
        <div style={{fontSize:"13px",color:"#555",lineHeight:"1.6"}}>Your review is pending approval and will appear once verified. If you provided HOA fee or restriction data, it will be used to improve this community profile.</div>
      </div>
    )
  }

  const SelectBtn = ({value, current, onClick, label}: {value:string, current:string, onClick:()=>void, label:string}) => (
    <button type="button" onClick={onClick}
      style={{padding:"8px 14px",borderRadius:"8px",border:"1.5px solid " + (current===value?"#1B2B6B":"#e0e0e0"),backgroundColor:current===value?"#1B2B6B":"#fff",color:current===value?"#fff":"#555",cursor:"pointer",fontSize:"13px",fontWeight:current===value?"600":"400"}}>
      {label}
    </button>
  )

  const StarRow = ({label, value, onChange}: {label:string, value:number, onChange:(n:number)=>void}) => {
    const [h, setH] = useState(0)
    return (
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"10px"}}>
        <div style={{fontSize:"13px",color:"#555"}}>{label}</div>
        <div style={{display:"flex",gap:"4px"}}>
          {[1,2,3,4,5].map(s => (
            <button key={s} type="button" onClick={() => onChange(s)} onMouseEnter={() => setH(s)} onMouseLeave={() => setH(0)}
              style={{background:"none",border:"none",cursor:"pointer",fontSize:"20px",color:(h||value)>=s?"#EF9F27":"#e5e5e5",padding:"0 1px"}}>★</button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"24px"}}>
      <div style={{fontSize:"15px",fontWeight:"600",color:"#1a1a1a",marginBottom:"4px"}}>Share your HOA experience</div>
      <div style={{fontSize:"12px",color:"#888",marginBottom:"20px"}}>Your identity is protected. Anonymous submissions are fully supported. We never share your information with the HOA, managemt company, or any third party.</div>

      <div style={{display:"flex",gap:"8px",marginBottom:"24px"}}>
        {[1,2,3].map(s => (
          <div key={s} style={{flex:1,height:"4px",borderRadius:"2px",backgroundColor:step>=s?"#1B2B6B":"#e5e5e5"}}></div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>

        {step === 1 && (
          <div>
            <div style={{fontSize:"13px",fontWeight:"600",color:"#1B2B6B",marginBottom:"16px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Step 1 — About you</div>

            <div style={{marginBottom:"16px"}}>
              <div style={{fontSize:"12px",color:"#555",marginBottom:"8px"}}>Are you a current or former resident of this community?</div>
              <div style={{display:"flex",gap:"8px"}}>
                <SelectBtn value="yes" current={isResident} onClick={() => setIsResident("yes")} label="Yes"/>
                <SelectBtn value="no" current={isResident} onClick={() => setIsResident("no")} label="No — but I know this community"/>              </div>
            </div>

            {isResident === "yes" && (
              <>
                <div style={{marginBottom:"16px"}}>
                  <div style={{fontSize:"12px",color:"#555",marginBottom:"8px"}}>Owner or renter?</div>
                  <div style={{display:"flex",gap:"8px"}}>
                    <SelectBtn value="owner" current={residentType} onClick={() => setResidentType("owner")} label="Owner"/>
                    <SelectBtn value="renter" current={residentType} onClick={() => setResidentType("renter")} label="Renter"/>
                    <SelectBtn value="former" current={residentType} onClick={() => setResidentType("former")} label="Former resident"/>
                  </div>
                </div>
                <div style={{marginBottom:"16px"}}>
                  <div style={{fontSize:"12px",color:"#555",marginBottom:"8px"}}>How long have you lived here?</div>
                  <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
                    {["Less than 1 year","1-3 years","3-5 years","5+ years"].map(l => (
                      <SelectBtn key={l} value={l} current={residencyLength} onClick={() => setResidencyLength(l)} label={l}/>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div style={{marginBottom:"16px"}}>
              <div style={{fontSize:"12px",color:"#555",marginBottom:"8px"}}>How do you want to appear?</div>
              <div style={{display:"flex",gap:"8px",alignItems:"center",padding:"12px 16px",backgroundColor:"#f9f9f9",borderRadius:"8px"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:"13px",fontWeight:"500",color:"#1a1a1a"}}>Post anonymously</div>
                  <div style={{fontSize:"11px",color:"#888"}}>Your name will not appear publicly</div>
                </div>
                <button type="button" onClick={() => setIsAnonymous(!isAnonymous)}
                  style={{width:"44px",height:"24px",borderRadius:"12px",border:"none",cursor:"pointer",backgroundColor:isAnonymous?"#1B2B6B":"#ccc",position:"relative",transition:"background 0.2s"}}>
                  <div style={{width:"18px",height:"18px",borderRadius:"50%",backgroundColor:"#fff",position:"absolute",top:"3px",left:isAnonymous?"23px":"3px",transition:"left 0.2s"}}></div>
                </button>
              </div>
            </div>

            {!isAnonymous && (
              <div style={{marginBottom:"16px"}}>
                <div style={{fontSize:"12px",color:"#555",marginBottom:"6px"}}>Your name (optional)</div>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="First name or full name"
                  style={{width:"100%",border:"1.5px solid #e5e5e5",borderRadius:"8px",padding:"10px 12px",fontSize:"13px",outline:"none",boxSizing:"border-box"}}/>
              </div>
            )}

            <div style={{marginBottom:"20px"}}>
              <div style={{fontSize:"12px",color:"#555",marginBottom:"6px"}}>Email (optional — only used to notify you when approved, never displayed)</div>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com"
                style={{width:"100%",border:"1.5px solid #e5e5e5",borderRadius:"8px",padding:"10px 12px",fontSize:"13px",outline:"none",boxSizing:"border-box"}}/>
            </div>

            <button type="button" onClick={() => setStep(2)}
              style={{width:"100%",padding:"12px",borderRadius:"8px",backgroundColor:"#1B2B6B",color:"#fff",border:"none",cursor:"pointer",fontSize:"14px",fontWeight:"600"}}>
              Next — HOA Details
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <div style={{fontSize:"13px",fontWeight:"600",color:"#1B2B6B",marginBottom:"16px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Step 2 — HOA details</div>
            <div style={{fontSize:"12px",color:"#888",marginBottom:"16px"}}>This information helps buyee informed decisions. All fields are optional.</div>

            <div style={{marginBottom:"16px"}}>
              <div style={{fontSize:"12px",color:"#555",marginBottom:"6px"}}>Monthly HOA fee (your approximate amount)</div>
              <div style={{position:"relative"}}>
                <span style={{position:"absolute",left:"12px",top:"50%",transform:"translateY(-50%)",color:"#888",fontSize:"13px"}}>$</span>
                <input type="number" value={hoaFee} onChange={e => setHoaFee(e.target.value)} placeholder="350"
                  style={{width:"100%",border:"1.5px solid #e5e5e5",borderRadius:"8px",padding:"10px 12px 10px 24px",fontSize:"13px",outline:"none",boxSizing:"border-box"}}/>
              </div>
            </div>

            <div style={{marginBottom:"16px"}}>
              <div style={{fontSize:"12px",color:"#555",marginBottom:"8px"}}>What does your HOA fee include? (select all that apply)</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
                {feeIncludeOptions.map(item => (
                  <button key={item} type="button" onClick={() => toggleFeeIncludes(item)}
                    style={{padding:"5px 12px",borderRadius:"20px",border:"1.5px solid " + (feeIncludes.includes(item)?"#1B2B6B":"#e0e0e0"),backgroundColor:feeIncludes.includes(item)?"#1B2B6B":"#fff",color:feeIncludes.includes(item)?"#fff":"#555",cursor:"pointer",fontSize:"12px"}}>
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div style={{marginBottom:"16px"}}>
              <div style={{fontSize:"12px",color:"#555",marginBottom:"8px"}}>Has your HOA fee increased in the last 2 years?</div>
              <div style={{display:"flex",gap:"8px"}}>
                <SelectBtn value="yes" current={feeIncreased} onClick={() => setFeeIncreased("yes")} label="Yes"/>
                <SelectBtn value="no" current={feeIncreased} onClick={() => setFeeIncreased("no")} label="No"/>
                <SelectBtn value="unsure" current={feeIncreased} onClick={() => setFeeIncreased("unsure")} label="Not sure"/>
              </div>
            </div>

            <div style={{marginBottom:"16px"}}>
              <div style={{fontSize:"12px",color:"#555",marginBottom:"8px"}}>Any active special assessments?</div>
              <div style={{display:"flex",gap:"8px"}}>
                <SelectBtn value="yes" current={specialAssessment} onClick={() => setSpecialAssessment("yes")} label="Yes"/>
                <SelectBtn value="no" current={specialAssessment} onClick={() => setSpecialAssessment("no")} label="No"/>
                <SelectBtn value="unsure" current={specialAssessment} onClick={() => setSpecialAssessment("unsure")} label="Not sure"/>
              </div>
              {specialAssessment === "yes" && (
                <div style={{marginTop:"10px"}}>
                  <input type="number" value={assessmentAmount} onChange={e => setAssessmentAmount(e.target.value)} placeholder="Monthly assessment amount $"
                    style={{width:"100%",border:"1.5px solid #e5e5e5",borderRadius:"8px",padding:"10px 12px",fontSize:"13px",outline:"none",boxSizing:"border-box"}}/>
                </div>
              )}
            </div>

            <div style={{marginBottom:"16px"}}>
              <div style={{fontSize:"12px",color:"#555",marginBottom:"8px"}}>Short-term rentals allowed? (Airbnb, VRBO)</div>
              <div style={{display:"flex",gap:"8px"}}>
                <SelectBtn value="yes" current={strAllowed} onClick={() => setStrAllowed("yes")} label="Yes"/>
                <SelectBtn value="no" current={strAllowed} onClick={() => setStrAllowed("no")} label="No"/>
                <SelectBtn value="unsure" current={strAllowed} onClick={() => setStrAllowed("unsure")} label="Not sure"/>
              </div>
            </div>

            <div style={{marginBottom:"16px"}}>
              <div style={{fontSize:"12px",color:"#555",marginBottom:"8px"}}>Pets allowed?</div>
              <div style={{display:"flex",gap:"8px"}}>
                <SelectBtn value="yes" current={petsAllowed} onClick={() => setPetsAllowed("yes")} label="Yes"/>
                <SelectBtn value="restricted" current={petsAllowed} onClick={() => setPetsAllowed("restricted")} label="With restrictions"/>
                <SelectBtn value="no" current={petsAllowed} onClick={() => setPetsAllowed("no")} label="No"/>
              </div>
            </div>

            <div style={{marginBottom:"20px"}}>
              <div style={{fontSize:"12px",color:"#555",marginBottom:"8px"}}>Board approval required for rentals?</div>
              <div style={{display:"flex",gap:"8px"}}>
                <SelectBtn value="yes" current={rentalApproval} onClick={() => setRentalApproval("yes")} label="Yes"/>
                <SelectBtn value="no" current={rentalApproval} onClick={() => setRentalApproval("no")} label="No"/>
                <SelectBtn value="unsure" current={rentalApproval} onClick={() => setRentalApproval("unsure")} label="Not sure"/>
              </div>
            </div>

            <div style={{display:"flex",gap:"8px"}}>
              <button type="button" onClick={() => setStep(1)}
                style={{flex:1,padding:"12px",borderRadius:"8px",backgroundColor:"#fff",color:"#1B2B6B",border:"1.5px solid #1B2B6B",cursor:"pointer",fontSize:"14px",fontWeight:"600"}}>
                Back
              </button>
              <button type="button" onClick={() => setStep(3)}
                style={{flex:2,padding:"12px",borderRadius:"8px",backgroundColor:"#1B2B6B",color:"#fff",border:"none",cursor:"pointer",fontSize:"14px",fontWeight:"600"}}>
                Next — Your Review
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div>
            <div style={{fontSize:"13px",fontWeight:"600",color:"#1B2B6B",marginBottom:"16px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Step 3 — Your review</div>

            <div style={{marginBottom:"16px"}}>
              <div style={{fontSize:"12px",color:"#555",marginBottom:"10px"}}>Rate your experience</div>
              <div style={{backgroundColor:"#f9f9f9",borderRadius:"8px",padding:"14px 16px"}}>
                <StarRow label="Overall rating" value={rating} onChange={setRating}/>
                <StarRow label="Management responsiveness" value={managementRating} onChange={setManagementRating}/>
                <StarRow label="Community maintenance" value={maintenanceRating} onChange={setMaintenanceRating}/>
              </div>
            </div>

            <div style={{marginBottom:"16px"}}>
              <div style={{fontSize:"12px",color:"#555",marginBottom:"6px"}}>Your review *</div>
              <textarea value={comment} onChange={e => setComment(e.target.value)} required rows={5}
                placeholder="Share your experience — HOA management, community atmosphere, any issues or highlights buyers should know about..."
                style={{width:"100%",border:"1.5px solid #e5e5e5",borderRadius:"8px",padding:"10px 12px",fontSize:"13px",resize:"vertical",outline:"none",boxSizing:"border-box",fontFamily:"system-ui,sans-serif"}}/>
              <div style={{fontSize:"11px",color:"#aaa",marginTop:"4px"}}>{comment.length}/2000</div>
            </div>

            <div style={{backgroundColor:"#f9f9f9",borderRadius:"8px",padding:"12px 16px",marginBottom:"16px",fontSize:"12px",color:"#888",lineHeight:"1.6"}}>
              <strong style={{color:"#555"}}>Privacy notice:</strong> Your identity will never be shared with the HOA, management company, board members, or any third party. {isAnonymous ? "Your review will be posted anonymously." : name ? `Your review will be posted as "${name}".` : "Your review will be posted anonymously."}
            </div>

            {error && <div style={{fontSize:"12px",color:"#E24B4A",marginBottom:"12px"}}>{error}</div>}

            <div style={{display:"flex",gap:"8px"}}>
              <button type="button" onClick={() => setStep(2)}
                style={{flex:1,padding:"12px",borderRadius:"8px",backgroundColor:"#fff",color:"#1B2B6B",border:"1.5px solid #1B2B6B",cursor:"pointer",fontSize:"14px",fontWeight:"600"}}>
                Back
              </button>
              <button type="submit" disabled={status==="submitting" || !comment.trim()}
                style={{flex:2,padding:"12px",borderRadius:"8px",backgroundColor:comment.trim()?"#1D9E75":"#ccc",color:"#fff",border:"none",cursor:comment.trim()?"pointer":"not-allowed",fontSize:"14px",fontWeight:"600"}}>
                {status==="submitting" ? "Submitting..." : "Submit review"}
              </button>
            </div>
          </div>
        )}

      </form>
    </div>
  )
}

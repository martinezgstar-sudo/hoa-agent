"use client"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

function getConfidenceLabel(score: number) {
  if (score >= 3) return { label: "High", color: "#1D9E75", bg: "#E1F5EE", stars: "★★★" }
  if (score >= 2) return { label: "Medium", color: "#EF9F27", bg: "#FAEEDA", stars: "★★☆" }
  return { label: "Low", color: "#E24B4A", bg: "#FEE9E9", stars: "★☆☆" }
}


function SuggestForm({ address }: { address: string }) {
  const [step, setStep] = useState(1)
  const [status, setStatus] = useState<"idle"|"submitting"|"success"|"error">("idle")
  const [communityName, setCommunityName] = useState("")
  const [city, setCity] = useState("")
  const [hoaFee, setHoaFee] = useState("")
  const [feeUnsure, setFeeUnsure] = useState(false)
  const [strRestriction, setStrRestriction] = useState("")
  const [strUnsure, setStrUnsure] = useState(false)
  const [petRestriction, setPetRestriction] = useState("")
  const [petUnsure, setPetUnsure] = useState(false)
  const [rentalRestriction, setRentalRestriction] = useState("")
  const [rentalUnsure, setRentalUnsure] = useState(false)
  const [amenities, setAmenities] = useState<string[]>([])
  const [managementCompany, setManagementCompany] = useState("")
  const [unitCount, setUnitCount] = useState("")
  const [specialAssessment, setSpecialAssessment] = useState("")
  const [assessmentAmount, setAssessmentAmount] = useState("")
  const [submitterEmail, setSubmitterEmail] = useState("")
  const [notes, setNotes] = useState("")
  const [rating, setRating] = useState(0)
  const [ratingHover, setRatingHover] = useState(0)
  const [comment, setComment] = useState("")

  const amenityOptions = ["Pool","Tennis Court","Clubhouse","Fitness Center","Playground","Golf Course","Boat Dock","Gated","Security","None"]

  function toggleAmenity(a: string) {
    if (a === "None") { setAmenities(["None"]); return }
    setAmenities(prev => {
      const without = prev.filter(x => x !== "None")
      return without.includes(a) ? without.filter(x => x !== a) : [...without, a]
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("submitting")
    await fetch("/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        community_name: communityName,
        city,
        hoa_fee: feeUnsure ? "unsure" : hoaFee,
        str_restriction: strUnsure ? "unsure" : strRestriction,
        pet_restriction: petUnsure ? "unsure" : petRestriction,
        rental_restriction: rentalUnsure ? "unsure" : rentalRestriction,
        amenities: amenities.join("|"),
        management_company: managementCompany,
        unit_count: unitCount,
        special_assessment: specialAssessment,
        assessment_amount: assessmentAmount,
        submitter_email: submitterEmail,
        notes,
        rating: rating || null,
        comment,
      })
    })
    setStatus("success")
  }

  const inputStyle = {width:"100%",border:"1.5px solid #e5e5e5",borderRadius:"8px",padding:"10px 12px",fontSize:"13px",outline:"none",boxSizing:"border-box" as const}
  const labelStyle = {fontSize:"12px",color:"#555",marginBottom:"6px",display:"block" as const}
  const sectionStyle = {marginBottom:"18px"}

  const ChkBtn = ({value, current, onClick, label}: {value:string, current:string, onClick:()=>void, label:string}) => (
    <button type="button" onClick={onClick}
      style={{padding:"7px 14px",borderRadius:"8px",border:"1.5px solid "+(current===value?"#1B2B6B":"#e0e0e0"),backgroundColor:current===value?"#1B2B6B":"#fff",color:current===value?"#fff":"#555",cursor:"pointer",fontSize:"13px",marginRight:"6px",marginBottom:"6px"}}>
      {label}
    </button>
  )

  if (status === "success") {
    return (
      <div style={{backgroundColor:"#E1F5EE",borderRadius:"12px",padding:"24px",textAlign:"center",marginTop:"16px"}}>
        <div style={{fontSize:"32px",marginBottom:"8px"}}>checkmark</div>
        <div style={{fontSize:"15px",fontWeight:"600",color:"#1B2B6B",marginBottom:"8px"}}>Thank you for contributing</div>
        <div style={{fontSize:"13px",color:"#555"}}>Your submission will be reviewed and added to HOA Agent. This helps buyers make better decisions.</div>
      </div>
    )
  }

  return (
    <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"24px",marginTop:"16px",textAlign:"left"}}>
      <div style={{fontSize:"15px",fontWeight:"600",color:"#1a1a1a",marginBottom:"4px"}}>Add this community</div>
      <div style={{fontSize:"12px",color:"#888",marginBottom:"20px"}}>Help buyers know what to expect. Fields marked * are required.</div>
      <div style={{display:"flex",gap:"8px",marginBottom:"20px"}}>
        {[1,2,3].map(s => (
          <div key={s} style={{flex:1,height:"4px",borderRadius:"2px",backgroundColor:step>=s?"#1B2B6B":"#e5e5e5"}}></div>
        ))}
      </div>
      <form onSubmit={handleSubmit}>
        {step === 1 && (
          <div>
            <div style={{fontSize:"12px",fontWeight:"600",color:"#1B2B6B",marginBottom:"16px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Step 1 of 3 — Community basics</div>
            <div style={sectionSte}>
              <label style={labelStyle}>Community name *</label>
              <input required value={communityName} onChange={e => setCommunityName(e.target.value)} placeholder="e.g. Bermuda Run HOA" style={inputStyle}/>
            </div>
            <div style={sectionStyle}>
              <label style={labelStyle}>City *</label>
              <input required value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Boca Raton" style={inputStyle}/>
            </div>
            <div style={sectionStyle}>
              <label style={labelStyle}>Monthly HOA fee *</label>
              <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                <div style={{position:"relative",flex:1}}>
                  <span style={{position:"absolute",left:"12px",top:"50%",transform:"translateY(-50%)",color:"#888",fontSize:"13px"}}>$</span>
                  <input type="number" value={hoaFee} onChange={e => setHoaFee(e.target.value)} placeholder="350" disabled={feeUnsure}
                    style={{...inputStyle,paddingLeft:"24px",opacity:feeUnsure?0.4:1}}/>
                </div>
                <label style={{display:"flex",alignItems:"center",gap:"6px",fontSize:"13px",color:"#555",cursor:"pointer",whiteSpace:"nowrap"}}>
                  <input type="checkbox" checked={feeUnsure} onChange={e => setFeeUnsure(e.target.checked)}/>
                  I am not sure
                </label>
              </div>
            </div>
            <div style={sectionStyle}>
              <label style={labelStyle}>Amenities *</label>
              <div style={{display:"flex",flexWrap:"wrap"}}>
                {amenityOptions.map(a => (
                  <button key={a} type="button" onClick={() => toggleAmenity(a)}
                    style={{padding:"6px 14px",borderRadius:"20px",border:"1.5px solid "+(amenities.includes(a)?"#1B2B6B":"#e0e0e0"),backgroundColor:amenities.includes(a)?"#1B2B6B":"#fff",color:amenities.includes(a)?"#fff":"#555",cursor:"pointer",fontSize:"12px",margin:"0 6px 6px 0"}}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={() => setStep(2)} disabled={!communityName || !city || (!hoaFee && !feeUnsure)}
              style={{width:"100%",padding:"12px",borderRadius:"8px",backgroundColor:(communityName && city && (hoaFee || feeUnsure))?"#1B2B6B":"#ccc",color:"#fff",border:"none",cursor:(communityName && city && (hoaFee || feeUnsure))?"pointer":"not-allowed",fontSize:"14px",fontWeight:"600"}}>
              Next — Restrictions
            </button>
          </div>
        )}
        {step === 2 && (
          <div>
            <div style={{fontSize:"12px",fontWeight:"600",color:"#1B2B6B",marginBottom:"16px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Step 2 of 3 — Restrictions *</div>
            <div style={sectionStyle}>
              <label style={labelStyle}>Short-term rentals allowed? (Airbnb, VRBO)</label>
              <div style={{display:"flex",flexWrap:"w}}>
                {["Yes","No","Restricted"].map(v => <ChkBtn key={v} value={v} current={strUnsure?"":strRestriction} onClick={() => {setStrRestriction(v);setStrUnsure(false)}} label={v}/>)}
                <label style={{display:"flex",alignItems:"center",gap:"6px",fontSize:"13px",color:"#555",cursor:"pointer",padding:"7px 0"}}>
                  <input type="checkbox" checked={strUnsure} onChange={e => {setStrUnsure(e.target.checked);if(e.target.checked)setStrRestriction("")}}/>
                  Not sure
                </label>
              </div>
            </div>
            <div style={sectionStyle}>
              <label style={labelStyle}>Pets allowed?</label>
              <div style={{display:"flex",flexWrap:"wrap"}}>
                {["Yes","No","With restrictions"].map(v => <ChkBtn key={v} value={v} current={petUnsure?"":petRestriction} onClick={() => {setPetRestriction(v);setPetUnsure(false)}} label={v}/>)}
                <label style={{display:"flex",alignItems:"center",gap:"6px",fontSize:"13px",color:"#555",cursor:"pointer",padding:"7px 0"}}>
                  <input type="checkbox" checked={petUnsure} onChange={e => {setPetUnsure(e.target.checked);if(e.target.checked)setPetRestriction("")}}/>
                  Not sure
                </label>
              </div>
            </div>
            <div style={sectionStyle}>
              <label style={labelStyle}>Rental approval required?</label>
              <div style={{display:"flex",flexWrap:"wrap"}}>
                {["Yes","No"].map(v => <ChkBtn key={v} value={v} current={rentalUnsure?"":rentalRestriction} onClick={() => {setRentalRestriction(v);setRentalUnsure(false)}} label={v}/>)}
                <label style={{display:"flex",alignItems:"center",gap:"6px",fontSize:"13px",color:"#555",cursor:"pointer",padding:"7px 0"}}>
                  <input type="checkbox" checked={rentalUnsure} onChange={e => {setRentalUnsure(e.target.checked);if(e.target.checked)setRentalRestriction("")}}/>
                  Not sure
                </label>
              </div>
            </div>
            <div style={{display:"flex",gap:"8px"}}>
              <button type="button" onClick={() => setStep(1)}
                style={{flex:1,padding:"12px",borderRadius:"8px",backgroundColor:"#fff",color:"#1B2B6B",border:"1.5px solid #1B2B6B",cursor:"pointer",fontSize:"14px",fontWeight:"600"}}>Back</button>
              <button type="button" onClick={() => setStep(3)}
                style={{flex:2,padding:"12px",borderRadius:"8px",backgroundColor:"#1B2B6B",color:"#fff",border:"none",cursor:"pointer",fontSize:"14px",fontWeight:"600"}}>Next — Optional details</button>
            </div>
          </div>
        )}
        {step === 3 && (
          <div>
            <div style={{fontSize:"12px",fontWeight:"600",color:"#1B2B6B",marginBottom:"16px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Step 3 of 3 — Optional details</div>
            <div style={sectionStyle}>
              <label style={labelStyle}>Management company</label>
              <input v={managementCompany} onChange={e => setManagementCompany(e.target.value)} placeholder="e.g. Seacrest Services" style={inputStyle}/>
            </div>
            <div style={sectionStyle}>
              <label style={labelStyle}>Approximate number of units</label>
              <input type="number" value={unitCount} onChange={e => setUnitCount(e.target.value)} placeholder="e.g. 250" style={inputStyle}/>
            </div>
            <div style={sectionStyle}>
              <label style={labelStyle}>Any active special assessments?</label>
              <div style={{display:"flex",flexWrap:"wrap"}}>
                {["Yes","No"].map(v => <ChkBtn key={v} value={v} current={specialAssessment} onClick={() => setSpecialAssessment(v)} label={v}/>)}
              </div>
              {specialAssessment === "Yes" && (
                <input type="number" value={assessmentAmount} onChange={e => setAssessmentAmount(e.target.value)}
                  placeholder="Monthly assessment amount $" style={{...inputStyle,marginTop:"8px"}}/>
              )}
            </div>
            <div style={sectionStyle}>
              <label style={labelStyle}>Overall rating (5 = Excellent)</label>
              <div style={{display:"flex",gap:"4px",marginBottom:"4px"}}>
                {[1,2,3,4,5].map(s => (
                  <button key={s} type="button"
                    onClick={() => setRating(s)}
                    onMouseEnter={() => setRatingHover(s)}
                    onMouseLeave={() => setRatingHover(0)}
                    style={{background:"none",border:"none",cursor:"pointer",fontSize:"28px",padding:"0 2px",color:(ratingHover||rating)>=s?"#EF9F27":"#e5e5e5"}}>
                    {String.fromCharCode(9733)}
                  </button>
                ))}
                {rating > 0 && <button type="button" onClick={() => setRating(0)} style={{background:"none",border:"none",cursor:"pointer",fontSize:"11px",color:"#888",marginLeft:"8px"}}>Clear</button>}
              </div>
              <div style={{fontSize:"11px",color:"#aaa"}}>{rating===1?"Poor":rating===2?"Below average":rating===3?"Average":rating===4?"Good":rating===5?"Excellent":""}</div>
            </div>
            <div style={sectionStyle}>
              <label style={labelStyle}>Share your experience (optional)</label>
              <textarea value={comment} onChange={e => setComment(e.target.value)} rows={4}
                placeholder="What is it like living here? HOA management, community atmosphere, anything buyers should know..."
                style={{...inputStyle,resize:"vertical",fontFamily:"system-ui,sans-serif"}}/>
            </div>
            <div style={sectionStyle}>
              <label style={labelStyle}>Your email (optional)</label>
              <input type="email" value={submitterEmail} onChange={e => setSubmitterEmail(e.target.value)} placeholder="your@email.com" style={inputStyle}/>
            </div>
            <div style={sectionStyle}>
              <label style={labelStyle}>Anything else buyers should know?</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                placeholder="Gate code policy, parking rules, recent fee increases..."
                style={{...inputStyle,resize:"vertical",fontFamily:"system-ui,sans-serif"}}/>
            </div>
            <div style={{backgroundColor:"#f9f9f9",borderRadius:"8px",padding:"12px 16px",marginBottom:"16px",fontSize:"12px",color:"#888"}}>
              Your submission will be reviewed before publishing. We never share your email publicly.
            </div>
            <div style={{display:"flex",gap:"8px"}}>
              <button type="button" onClick={() => setStep(2)}
                style={{flex:1,padding:"12px",borderRadius:"8px",backgroundColor:"#fff",color:"#1B2B6B",border:"1.5px solid #1B2B6B",cursor:"pointer",fontSize:"14px",fontWeight:"600"}}>Back</button>
              <button type="submit" disabled={status==="submitting"}
                style={{flex:2,padding:"12px",borderRadius:"8px",backgroundColor:"#1D9E75",color:"#fff",border:"none",cursor:"pointer",fontSize:"14px",fontWeight:"600"}}>
                {status==="submitting" ? "Submitting..." : "Submit community"}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}


export default function SearchPage() {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [communities, setCommunities] = useState<any[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showSuggestForm, setShowSuggestForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [addressResult, setAddressResult] = useState<any>(null)
  const [searching, setSearching] = useState(false)
  const [selectedCity, setSelectedCity] = useState("")
  const debounceRef = useRef<any>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const q = params.get("q") || ""
    const address = params.get("address") || ""
    const result = params.get("result") || ""
    if (address) {
      setQuery(address)
      if (result) {
        try { setAddressResult(JSON.parse(decodeURIComponent(result))) } catch {}
      }
    } else {
      setQuery(q)
      fetchCommunities(q)
    }
  }, [])

  async function fetchCommunities(q: string, city: string = "") {
    setLoading(true)
    const cityParam = city ? "&city=" + encodeURIComponent(city) : ""
    const res = await fetch("/api/communities-search?q=" + encodeURIComponent(q) + cityParam)
    const data = await res.json()
    setCommunities(data.communities || [])
    setLoading(false)
  }

  async function fetchSuggestions(q: string) {
    if (q.length < 2) { setSuggestions([]); setShowSuggestions(false); return }
    const res = await fetch("/api/address-search?q=" + encodeURIComponent(q))
    const data = await res.json()
    setSuggestions(data.suggestions || [])
    setShowSuggestions((data.suggestions || []).length > 0)
  }

  function handleCityFilter(city: string) {
    const newCity = selectedCity === city ? "" : city
    setSelectedCity(newCity)
    setAddressResult(null)
    fetchCommunities(query, newCity)
  }

  function handleInput(val: string) {
    setQuery(val)
    setAddressResult(null)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300)
  }

  async function handleSuggestionClick(s: any) {
    setShowSuggestions(false)
    if (s.type === "community") {
      router.push("/community/" + s.slug)
      return
    }
    setSearching(true)
    setQuery(s.label)
    const params = new URLSearchParams({
      streetName: s.streetName || "",
      neighborhood: s.neighborhood || "",
      locality: s.locality || "",
      city: s.city || "",
    })
    const res = await fetch("/api/address-lookup?" + params.toString())
    const data = await res.json()
    setAddressResult(data)
    setSearching(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setShowSuggestions(false)
    const isAddress = /^\d/.test(query.trim())
    if (isAddress) {
      setSearching(true)
      const res = await fetch("/api/address-search?q=" + encodeURIComponent(query))
      const data = await res.json()
      if (data.suggestions && data.suggestions.length > 0) {
        const s = data.suggestions[0]
        const res2 = await fetch("/api/address-lookup?pcn=" + s.pcn + "&streetName=" + encodeURIComponent(s.streetName) + "&city=" + encodeURIComponent(s.city))
        const data2 = await res2.json()
        setAddressResult(data2)
      } else {
        const parts = query.trim().toLowerCase().split(' ')
        const knownCities = ['boynton','boca','delray','wellington','jupiter','greenacres','lantana','tequesta','riviera']
        const cityHint = parts.find(p => knownCities.some(c => p.includes(c))) || ''
        if (cityHint) {
          const res3 = await fetch("/api/address-lookup?streetName=&city=" + encodeURIComponent(cityHint))
          const data3 = await res3.json()
          setAddressResult(data3.cityMatches ? data3 : { match: null })
        } else {
          setAddressResult({ match: null })
        }
      }
      setSearching(false)
    } else {
      fetchCommunities(query)
    }
  }

  const isAddress = /^\d/.test(query.trim())

  return (
    <main style={{fontFamily:"system-ui,sans-serif",backgroundColor:"#f9f9f9",minHeight:"100vh"}}>
      <nav style={{backgroundColor:"#fff",borderBottom:"1px solid #e5e5e5",padding:"0 32px",height:"72px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <a href="/" style={{display:"flex",alignItems:"center",gap:"8px",textDecoration:"none"}}>
          <img src="/logo.png" alt="HOA Agent" style={{height:"48px",width:"auto"}}/>
        </a>
        <div style={{display:"flex",gap:"24px",alignItems:"center"}}>
          <a href="/search" style={{fontSize:"13px",color:"#1D9E75",textDecoration:"none",fontWeight:"500"}}>Search</a>
          <a href="/pricing" style={{fontSize:"13px",color:"#666",textDecoration:"none"}}>Pricing</a>
          <a href="/pricing" style={{fontSize:"13px",backgroundColor:"#1B2B6B",color:"#fff",padding:"8px 16px",borderRadius:"6px",textDecoration:"none"}}>Sign in</a>
        </div>
      </nav>

      <div style={{backgroundColor:"#fff",borderBottom:"1px solid #e5e5e5",padding:"24px 32px"}}>
        <div style={{maxWidth:"720px",margin:"0 auto"}}>
          <h1 style={{fontSize:"22px",fontWeight:"600",color:"#1a1a1a",marginBottom:"4px"}}>Search HOA communities</h1>
          <p style={{fontSize:"13px",color:"#888",marginBottom:"16px"}}>Search by community name, city, management company — or enter a property address</p>
          <form onSubmit={handleSubmit} style={{position:"relative"}}>
            <div style={{display:"flex",gap:"8px"}}>
              <div style={{position:"relative",flex:1}}>
                <input
                  type="text"
                  value={query}
                  onChange={e => handleInput(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="Community name, city, or 123 Main St..."
                  style={{width:"100%",border:"1.5px solid #1B2B6B",borderRadius:"10px",padding:"10px 16px",fontSize:"14px",outline:"none",boxSizing:"border-box"}}
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div style={{position:"absolute",top:"100%",left:0,right:0,backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"10px",boxShadow:"0 4px 12px rgba(0,0,0,0.1)",zIndex:100,marginTop:"4px",overflow:"hidden"}}>
                    {suggestions.map((s: any, i: number) => (
                      <div
                        key={i}
                        onMouseDown={() => handleSuggestionClick(s)}
                        style={{padding:"10px 16px",cursor:"pointer",fontSize:"13px",borderBottom:i < suggestions.length-1 ? "1px solid #f0f0f0" : "none",display:"flex",alignItems:"center",gap:"8px"}}
                      >
                        <span style={{fontSize:"11px",padding:"2px 6px",borderRadius:"4px",backgroundColor:s.type==="address"?"#E1F5EE":"#EEF2FF",color:s.type==="address"?"#1B2B6B":"#4338CA",flexShrink:0}}>
                          {s.type === "address" ? "Address" : "HOA"}
                        </span>
                        {s.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button type="submit" style={{fontSize:"13px",padding:"10px 20px",borderRadius:"10px",backgroundColor:"#1D9E75",color:"#fff",border:"none",cursor:"pointer",fontWeight:"500",whiteSpace:"nowrap"}}>
                {searching ? "Searching..." : "Search"}
              </button>
            </div>
          </form>
          {isAddress && !addressResult && <div style={{fontSize:"12px",color:"#888",marginTop:"10px"}}>Enter a Palm Beach County address to find its HOA</div>}
          {!isAddress && (
            <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginTop:"12px"}}>
              {["Boynton Beach","Boca Raton","Delray Beach","West Palm Beach","Lake Worth","Wellington","Jupiter","Greenacres"].map((city) => (
                <button
                  key={city}
                  onClick={() => handleCityFilter(city)}
                  style={{fontSize:"12px",padding:"5px 12px",borderRadius:"20px",border:"1px solid " + (selectedCity===city?"#1B2B6B":"#e0e0e0"),backgroundColor:selectedCity===city?"#1B2B6B":"#fff",color:selectedCity===city?"#fff":"#555",cursor:"pointer",fontWeight:selectedCity===city?"600":"400"}}
                >
                  {city}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{maxWidth:"720px",margin:"0 auto",padding:"20px 32px"}}>
        {addressResult && (
          <div style={{marginBottom:"24px"}}>
            {addressResult.match ? (
              <div>
                <div style={{fontSize:"13px",color:"#888",marginBottom:"12px"}}>HOA community found for this address:</div>
                <a href={"/community/" + addressResult.match.slug} style={{textDecoration:"none"}}>
                  <div style={{backgroundColor:"#fff",border:"2px solid #1D9E75",borderRadius:"12px",padding:"16px 20px",cursor:"pointer"}}>
                    <div style={{fontSize:"15px",fontWeight:"600",color:"#1a1a1a",marginBottom:"3px"}}>{addressResult.match.canonical_name}</div>
                    <div style={{fontSize:"12px",color:"#888",marginBottom:"8px"}}>{addressResult.match.city}</div>
                    <div style={{fontSize:"13px",color:"#1D9E75",fontWeight:"500"}}>View community profile →</div>
                  </div>
                </a>
              </div>
            ) : addressResult.cityMatches ? (
              <div>
                <div style={{fontSize:"13px",color:"#888",marginBottom:"12px"}}>No exact match found. HOA communities in this area:</div>
                {addressResult.cityMatches.map((c: any) => (
                  <a key={c.slug} href={"/community/" + c.slug} style={{textDecoration:"none"}}>
                    <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"14px 20px",marginBottom:"8px",cursor:"pointer"}}>
                      <div style={{fontSize:"14px",fontWeight:"500",color:"#1a1a1a"}}>{c.canonical_name}</div>
                      <div style={{fontSize:"12px",color:"#888"}}>{c.city}</div>
                    </div>
                  </a>
                ))}
                <div style={{marginTop:"16px",textAlign:"center"}}>
                  <button onClick={() => setShowSuggestForm(true)} style={{fontSize:"13px",color:"#1B2B6B",background:"none",border:"1px solid #1B2B6B",borderRadius:"8px",padding:"8px 20px",cursor:"pointer"}}>
                    My community is not listed here
                  </button>
                  {showSuggestForm && <SuggestForm address={query} />}
                </div>
              </div>
            ) : (
              <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"24px",textAlign:"center"}}>
                <div style={{fontSize:"15px",fontWeight:"500",color:"#1a1a1a",marginBottom:"8px"}}>This HOA is not in our database yet</div>
                <div style={{fontSize:"13px",color:"#888",marginBottom:"16px"}}>We cover 7,000+ communities in Palm Beach County. Help us add yours.</div>
                <button onClick={() => setShowSuggestForm(true)} style={{fontSize:"13px",padding:"8px 20px",borderRadius:"8px",backgroundColor:"#1B2B6B",color:"#fff",border:"none",cursor:"pointer"}}>Suggest this community</button>
                {showSuggestForm && <div style={{marginTop:"16px"}}><SuggestForm address={query} /></div>}
              </div>
            )}
          </div>
        )}

        {!addressResult && (
          <>
            <div style={{fontSize:"12px",color:"#888",marginBottom:"16px"}}>{loading ? "Searching..." : communities.length + " communities found in Palm Beach County"}</div>
            {communities.length === 0 && !loading && query && (
              <div style={{textAlign:"center",padding:"60px",color:"#888",fontSize:"14px"}}>No communities found. Try a different search.</div>
            )}
            {communities.map((c: any) => (
              <a key={c.id} href={"/community/" + c.slug} style={{textDecoration:"none"}}>
                <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"16px 20px",marginBottom:"10px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",cursor:"pointer"}}>
                  <div>
                    <div style={{fontSize:"15px",fontWeight:"500",color:"#1a1a1a",marginBottom:"3px"}}>{c.canonical_name}</div>
                    <div style={{fontSize:"12px",color:"#888",marginBottom:"8px"}}>{c.city}{c.property_type ? " · " + c.property_type : ""}{c.unit_count ? " · " + c.unit_count + " units" : ""}</div>
                    <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                      <span style={{fontSize:"11px",padding:"2px 8px",borderRadius:"4px",backgroundColor:"#E1F5EE",color:"#1B2B6B"}}>Active entity</span>
                      {c.assessment_signal_count > 0 && <span style={{fontSize:"11px",padding:"2px 8px",borderRadius:"4px",backgroundColor:"#FAEEDA",color:"#854F0B"}}>{c.assessment_signal_count} signals</span>}
                      {c.management_company && c.management_compan!== "Unknown" && <span style={{fontSize:"11px",padding:"2px 8px",borderRadius:"4px",backgroundColor:"#f0f0f0",color:"#555"}}>{c.management_company}</span>}
                    </div>
                  </div>
                  <div style={{textAlign:"right",flexShrink:0,marginLeft:"16px"}}>
                    <div style={{fontSize:"15px",fontWeight:"500",color:"#1a1a1a"}}>{c.monthly_fee_min && c.monthly_fee_max ? "$" + c.monthly_fee_min + "-$" + c.monthly_fee_max + "/mo" : "Fee unknown"}</div>
                    {(() => { const conf = getConfidenceLabel(c.confidence_score); return <div style={{display:"inline-block",padding:"2px 10px",borderRadius:"20px",backgroundColor:conf.bg,color:conf.color,fontSize:"11px",fontWeight:"600"}}>{conf.stars} {conf.label}</div> })()}
                    <div style={{fontSize:"11px",color:"#1D9E75",marginTop:"4px"}}>View profile →</div>
                  </div>
                </div>
              </a>
            ))}
          </>
        )}
      </div>

      <footer style={{borderTop:"1px solid #e5e5e5",padding:"24px 32px",textAlign:"center",fontSize:"12px",color:"#888"}}>
        <div style={{marginBottom:"8px",fontWeight:"500",color:"#1a1a1a"}}>HOA Agent</div>
        <div>Florida HOA intelligence platform · Palm Beach County · © 2026</div>
        <div style={{marginTop:"8px",fontSize:"11px",color:"#aaa",lineHeight:"1.6"}}>HOA Agent provides informational data only. Content is not verified for accuracy and should not be relied upon for legal, financial, or real estate decisions. We are not affiliated with any HOA, management company, or government agency.</div>
      </footer>
    </main>
  )
}

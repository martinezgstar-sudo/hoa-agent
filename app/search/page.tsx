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
  const [nameMatches, setNameMatches] = useState<any[]>([])
  const [showNameDropdown, setShowNameDropdown] = useState(false)
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

  async function fetchNameMatches(val: string) {
    if (val.length < 2) { setNameMatches([]); setShowNameDropdown(false); return }
    const res = await fetch("/api/address-search?q=" + encodeURIComponent(val))
    const data = await res.json()
    const communities = (data.suggestions || []).filter((s: any) => s.type === "community")
    setNameMatches(communities)
    setShowNameDropdown(communities.length > 0)
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
            <div style={sectionStyle}>
              <label style={labelStyle}>Community name *</label>
              <div style={{position:"relative"}}>
                <input required value={communityName}
                  onChange={e => { setCommunityName(e.target.value); fetchNameMatches(e.target.value) }}
                  onBlur={() => setTimeout(() => setShowNameDropdown(false), 200)}
                  placeholder="e.g. Bermuda Run HOA" style={inputStyle}/>
                {showNameDropdown && (
                  <div style={{position:"absolute",top:"100%",left:0,right:0,backgroundColor:"#fff",border:"1px solid #e0e0e0",borderRadius:"8px",zIndex:100,boxShadow:"0 4px 12px rgba(0,0,0,0.1)",marginTop:"4px"}}>
                    <div style={{fontSize:"11px",color:"#888",padding:"8px 12px 4px",borderBottom:"1px solid #f0f0f0"}}>Already in our database — select to skip adding:</div>
                    {nameMatches.map((m: any) => (
                      <div key={m.slug} onClick={() => { window.open("/community/"+m.slug, "_blank"); setShowNameDropdown(false) }}
                        style={{padding:"10px 12px",cursor:"pointer",fontSize:"13px",borderBottom:"1px solid #f5f5f5",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                        <span style={{color:"#1a1a1a"}}>{m.label}</span>
                        <span style={{fontSize:"11px",color:"#1D9E75"}}>View profile →</span>
                      </div>
                    ))}
                    <div style={{padding:"8px 12px",fontSize:"12px",color:"#888",borderTop:"1px solid #f0f0f0"}}>
                      Not listed? Continue filling the form to add it.
                    </div>
                  </div>
                )}
              </div>
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
              <div style={{display:"flex",flexWrap:"wrap"}}>
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
            <div style={{fontSize:"12px",fontWeight:"600",color:"#1B2B6B",marginBottom:"16px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Step 3 of 3 — Optional details</div>         <div style={sectionStyle}>
              <label style={labelStyle}>Management company</label>
              <input value={managementCompany} onChange={e => setManagementCompany(e.target.value)} placeholder="e.g. Seacrest Services" style={inputStyle}/>
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
  const [showFilters, setShowFilters] = useState(false)
  const [filterPropertyType, setFilterPropertyType] = useState("")
  const [filterPets, setFilterPets] = useState("")
  const [filterStr, setFilterStr] = useState("")
  const [filterFeeRange, setFilterFeeRange] = useState("")
  const [filterHasReviews, setFilterHasReviews] = useState("")
  const [filterManagement, setFilterManagement] = useState("")
  const debounceRef = useRef<any>(null)

  const activeFilterCount = [selectedCity, filterPropertyType, filterPets, filterStr, filterFeeRange, filterHasReviews, filterManagement].filter(Boolean).length

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

  async function fetchCommunities(q: string, overrides: Record<string,string> = {}) {
    setLoading(true)
    const params = new URLSearchParams()
    params.set("q", q)
    const city = overrides.city !== undefined ? overrides.city : selectedCity
    const propertyType = overrides.property_type !== undefined ? overrides.property_type : filterPropertyType
    const pets = overrides.pets !== undefined ? overrides.pets : filterPets
    const str = overrides.str !== undefined ? overrides.str : filterStr
    const feeRange = overrides.fee_range !== undefined ? overrides.fee_range : filterFeeRange
    const hasReviews = overrides.has_reviews !== undefined ? overrides.has_reviews : filterHasReviews
    const management = overrides.management !== undefined ? overrides.management : filterManagement
    if (city) params.set("city", city)
    if (propertyType) params.set("property_type", propertyType)
    if (pets) params.set("pets", pets)
    if (str) params.set("str", str)
    if (feeRange) params.set("fee_range", feeRange)
    if (hasReviews) params.set("has_reviews", hasReviews)
    if (management) params.set("management", management)
    const res = await fetch("/api/communities-search?" + params.toString())
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
    fetchCommunities(query, { city: newCity })
  }

  function handleFilterChange(key: string, value: string, setter: (v: string) => void) {
    const newVal = value
    setter(newVal)
    setAddressResult(null)
    fetchCommunities(query, { [key]: newVal })
  }

  function clearAllFilters() {
    setSelectedCity("")
    setFilterPropertyType("")
    setFilterPets("")
    setFilterStr("")
    setFilterFeeRange("")
    setFilterHasReviews("")
    setFilterManagement("")
    fetchCommunities(query, { city: "", property_type: "", pets: "", str: "", fee_range: "", has_reviews: "", management: "" })
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
        const parts = query.trim().toLowerCase().split(" ")
        const knownCities = ["boynton","boca","delray","wellington","jupiter","greenacres","lantana","tequesta","riviera"]
        const cityHint = parts.find(p => knownCities.some(c => p.includes(c))) || ""
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

  const FilterBtn = ({ value, current, onClick, label }: { value: string, current: string, onClick: () => void, label: string }) => (
    <button type="button" onClick={onClick}
      style={{padding:"5px 12px",borderRadius:"20px",border:"1px solid "+(current===value?"#1B2B6B":"#e0e0e0"),backgroundColor:current===value?"#1B2B6B":"#fff",color:current===value?"#fff":"#555",cursor:"pointer",fontSize:"12px",fontWeight:current===value?"600":"400"}}>
      {label}
    </button>
  )

  return (
    <main style={{fontFamily:"system-ui,sans-serif",backgroundColor:"#f9f9f9",minHeight:"100vh"}}>
      <nav style={{backgroundColor:"#fff",borderBottom:"1px solid #e5e5e5",padding:"0 16px",height:"64px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <a href="/" style={{display:"flex",alignItems:"center",gap:"8px",textDecoration:"none"}}>
          <span style={{fontSize:"22px",fontWeight:"700",color:"#1B2B6B",letterSpacing:"-0.02em"}}>HOA<span style={{color:"#1D9E75"}}>Agent</span></span>
        </a>
        <div style={{display:"flex",gap:"12px",alignItems:"center"}}>
          <a href="/search" style={{fontSize:"13px",color:"#1D9E75",textDecoration:"none",fontWeight:"500"}}>Search</a>
          <a href="/reports" style={{fontSize:"13px",color:"#666",textDecoration:"none"}}>Reports</a>
          <a href="/search" style={{fontSize:"13px",backgroundColor:"#1D9E75",color:"#fff",padding:"6px 12px",borderRadius:"6px",whiteSpace:"nowrap",textDecoration:"none"}}>Share your HOA</a>
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
                  style={{width:"100%",border:"1.5psolid #1B2B6B",borderRadius:"10px",padding:"10px 16px",fontSize:"14px",outline:"none",boxSizing:"border-box"}}
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div style={{position:"absolute",top:"100%",left:0,right:0,backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"10px",boxShadow:"0 4px 12px rgba(0,0,0,0.1)",zIndex:100,marginTop:"4px",overflow:"hidden"}}>
                    {suggestions.map((s: any, i: number) => (
                      <div key={i} onMouseDown={() => handleSuggestionClick(s)}
                        style={{padding:"10px 16px",cursor:"pointer",fontSize:"13px",borderBottom:i < suggestions.length-1 ? "1px solid #f0f0f0" : "none",display:"flex",alignItems:"center",gap:"8px"}}>
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
              <button type="button" onClick={() => setShowFilters(!showFilters)}
                style={{fontSize:"13px",padding:"10px 14px",borderRadius:"10px",backgroundColor:showFilters||activeFilterCount>0?"#1B2B6B":"#fff",color:showFilters||activeFilterCount>0?"#fff":"#555",border:"1px solid "+(showFilters||activeFilterCount>0?"#1B2B6B":"#e0e0e0"),cursor:"pointer",whiteSpace:"nowrap",fontWeight:"500"}}>
                Filters{activeFilterCount > 0 ? " (" + activeFilterCount + ")" : ""}
              </button>
            </div>
          </form>

          {isAddress && !addressResult && <div style={{fontSize:"12px",color:"#888",marginTop:"10px"}}>Enter a Palm Beach County address to find its HOA</div>}

          {!isAddress && (
            <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginTop:"12px"}}>
              {["Boynton Beach","Boca Raton","Delray Beach","West Palm Beach","Lake Worth","Wellington","Jupiter","Greenacres"].map((city) => (
                <button key={city} onClick={() => handleCityFilter(city)}
                  style={{fontSize:"12px",padding:"5px 12px",borderRadius:"20px",border:"1px solid "+(selectedCity===city?"#1B2B6B":"#e0e0e0"),backgroundColor:selectedCity===city?"#1B2B6B":"#fff",color:selectedCity===city?"#fff":"#555",cursor:"pointer",fontWeight:selectedCity===city?"600":"400"}}>
                  {city}
                </button>
              ))}
            </div>
          )}

          {showFilters && (
            <div style={{backgroundColor:"#f9f9f9",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"16px 20px",marginTop:"12px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
                <div style={{fontSize:"13px",fontWeight:"500",color:"#1a1a1a"}}>Filter results</div>
                {activeFilterCount > 0 && (
                  <button onClick={clearAllFilters} style={{fontSize:"11px",color:"#E24B4A",background:"none",border:"none",cursor:"pointer",padding:0}}>Clear all filters</button>
                )}
              </div>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px"}}>

                <div>
                  <div style={{fontSize:"11px",fontWeight:"600",color:"#888",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"8px"}}>Property type</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
                    {["Single family","Condo","Townhouse"].map(v => (
                      <FilterBtn key={v} value={v} current={filterPropertyType}
                        onClick={() => handleFilterChange("property_type", filterPropertyType === v ? "" : v, setFilterPropertyType)}
                        label={v} />
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{fontSize:"11px",fontWeight:"600",color:"#888",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"8px"}}>Pets</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
                    <FilterBtn value="yes" current={filterPets} onClick={() => handleFilterChange("pets", filterPets === "yes" ? "" : "yes", setFilterPets)} label="Allowed" />
                    <FilterBtn value="no" current={filterPets} onClick={() => handleFilterChange("pets", filterPets === "no" ? "" : "no", setFilterPets)} label="Not allowed" />
                  </div>
                </div>

                <div>
                  <div style={{fontSize:"11px",fontWeight:"600",color:"#888",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"8px"}}>Short-term rentals</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
                    <FilterBtn value="allowed" current={filterStr} onClick={() => handleFilterChange("str", filterStr === "allowed" ? "" : "allowed", setFilterStr)} label="Allowed" />
                    <FilterBtn value="not_allowed" current={filterStr} onClick={() => handleFilterChange("str", filterStr === "not_allowed" ? "" : "not_allowed", setFilterStr)} label="Not allowed" />
                  </div>
                </div>

                <div>
                  <div style={{fontSize:"11px",fontWeight:"600",color:"#888",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"8px"}}>Monthly fee</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
                    {[{val:"under200",label:"Under $200"},{val:"200to400",label:"$200–$400"},{val:"400to600",label:"$400–$600"},{val:"over600",l:"$600+"}].map(f => (
                      <FilterBtn key={f.val} value={f.val} current={filterFeeRange}
                        onClick={() => handleFilterChange("fee_range", filterFeeRange === f.val ? "" : f.val, setFilterFeeRange)}
                        label={f.label} />
                    ))}
                  </div>
                </div>

                <div>
                  <div style={{fontSize:"11px",fontWeight:"600",color:"#888",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"8px"}}>Reviews</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:"6px"}}>
                    <FilterBtn value="yes" current={filterHasReviews} onClick={() => handleFilterChange("has_reviews", filterHasReviews === "yes" ? "" : "yes", setFilterHasReviews)} label="Has reviews" />
                  </div>
                </div>

                <div>
                  <div style={{fontSize:"11px",fontWeight:"600",color:"#888",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"8px"}}>Management company</div>
                  <input
                    type="text"
                    value={filterManagement}
                    onChange={e => handleFilterChange("management", e.target.value, setFilterManagement)}
                    placeholder="e.g. Castle Group"
                    style={{width:"100%",border:"1px solid #e0e0e0",borderRadius:"8px",padding:"7px 10px",fontSize:"12px",outline:"none",boxSizing:"border-box"}}
                  />
                </div>

              </div>

              {activeFilterCount > 0 && (
                <div style={{marginTop:"14px",paddingTop:"12px",borderTop:"1px solid #e5e5e5",display:"flex",flexWrap:"wrap",gap:"6px"}}>
                  {selectedCity && <span style={{fontSize:"11px",padding:"3px 10px",borderRadius:"20px",backgroundColor:"#1B2B6B",color:"#fff"}}>City: {selectedCity} <button onClick={() => handleCityFilter("")} style={{background:"none",border:"none",color:"#fff",cursor:"pointer",marginLeft:"4px",padding:0,fontSize:"11px"}}>×</button></span>}
                  {filterPropertyType && <span style={{fontSize:"11px",padding:"3px 10px",borderRadius:"20px",backgroundColor:"#1B2B6B",color:"#fff"}}>{filterPropertyType} <button onClick={() => handleFilterChange("property_type","",setFilterPropertyType)} style={{background:"none",border:"none",color:"#fff",cursor:"pointer",marginLeft:"4px",padding:0,fontSize:"11px"}}>×</button></span>}
                  {filterPets && <span style={{fontSize:"11px",padding:"3px 10px",borderRadius:"20px",backgroundColor:"#1B2B6B",color:"#fff"}}>Pets: {filterPets} <button onClick={() => handleFilterChange("pets","",setFilterPets)} style={{background:"none",border:"none",color:"#fff",cursor:"pointer",marginLeft:"4px",padding:0,fontSize:"11px"}}>×</button></span>}
                  {filterStr && <span style={{fontSize:"11px",padding:"3px 10px",borderRadius:"20px",backgroundColor:"#1B2B6B",color:"#fff"}}>STR: {filterStr} <button onClick={() => handleFilterChange("str","",setFilterStr)} style={{baround:"none",border:"none",color:"#fff",cursor:"pointer",marginLeft:"4px",padding:0,fontSize:"11px"}}>×</button></span>}
                  {filterFeeRange && <span style={{fontSize:"11px",padding:"3px 10px",borderRadius:"20px",backgroundColor:"#1B2B6B",color:"#fff"}}>Fee: {filterFeeRange} <button onClick={() => handleFilterChange("fee_range","",setFilterFeeRange)} style={{background:"none",border:"none",color:"#fff",cursor:"pointer",marginLeft:"4px",padding:0,fontSize:"11px"}}>×</button></span>}
                  {filterHasReviews && <span style={{fontSize:"11px",padding:"3px 10px",borderRadius:"20px",backgroundColor:"#1B2B6B",color:"#fff"}}>Has reviews <button onClick={() => handleFilterChange("has_reviews","",setFilterHasReviews)} style={{background:"none",border:"none",color:"#fff",cursor:"pointer",marginLeft:"4px",padding:0,fontSize:"11px"}}>×</button></span>}
                  {filterManagement && <span style={{fontSize:"11px",padding:"3px 10px",borderRadius:"20px",backgroundColor:"#1B2B6B",color:"#"}}>Mgmt: {filterManagement} <button onClick={() => handleFilterChange("management","",setFilterManagement)} style={{background:"none",border:"none",color:"#fff",cursor:"pointer",marginLeft:"4px",padding:0,fontSize:"11px"}}>×</button></span>}
                </div>
              )}
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
                    <div style={{fontSize:"15px",fontWeight:"600",color:"#1a1a1a",marginBottom:"3px"}}>{adressResult.match.canonical_name}</div>
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
              <div style={{textAlign:"center",padding:"60px",color:"#888",fontSize:"14px"}}>No communities found. Try a different search or adjust your filters.</div>
            )}
            {communities.map((c: any) => (
              <a key={c.id} href={"/community/" + c.slug} style={{textDecoration:"none"}}>
                <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"16px 20px",marginBottom:"10px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",cursor:"pointer"}}>
                  <div>
                    <div style={{fontSize:"15px",fontWeight:"500",color:"#1a1a1a",marginBottom:"3px"}}>{c.canonical_name}</div>
                    <div style={{fontSize:"12px",color:"#888",marginBottom:"8px"}}>{c.city_verified ? c.city : "Palm Beach County"}{c.property_type ? " · " + c.property_type : ""}{c.unit_count ? " · " + c.unit_count + " units" : ""}</div>
                    <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                      <span style={{fontSize:"11px",padding:"2px 8px",borderRadius:"4px",backgroundColor:"#E1F5EE",color:"#1B2B6B"}}>Active entity</span>
                      {c.review_count > 0 && <span style={{fontSize:"11px",padding:"2px 8px",borderRadius:"4px",backgroundColor:"#f0f0f0",color:"#555"}}>{"★".repeat(Math.round(c.review_avg |)} {c.review_count} reviews</span>}
                      {c.assessment_signal_count > 0 && <span style={{fontSize:"11px",padding:"2px 8px",borderRadius:"4px",backgroundColor:"#FAEEDA",color:"#854F0B"}}>{c.assessment_signal_count} signals</span>}
                      {c.management_company && c.management_company !== "Unknown" && <span style={{fontSize:"11px",padding:"2px 8px",borderRadius:"4px",backgroundColor:"#f0f0f0",color:"#555"}}>{c.management_company}</span>}
                      {c.pet_restriction && c.pet_restriction !== "Unknown" && <span style={{fontSize:"11px",padding:"2px 8px",borderRadius:"4px",backgroundColor:c.pet_restriction.toLowerCase().includes("yes")?"#E1F5EE":"#FEE9E9",color:c.pet_restriction.toLowerCase().includes("yes")?"#1B2B6B":"#A32D2D"}}>Pets: {c.pet_restriction}</span>}
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
        <div>HOA Intelligence Platform · Palm Beach County · © 2026</div>
        <div style={{marginTop:"8px",fontSize:"11px",color:"#aaa",lineHeight:"1.6"}}>HOA Agentides informational data only. Content is not verified for accuracy and should not be relied upon for legal, financial, or real estate decisions. We are not affiliated with any HOA, management company, or government agency.</div>
      </footer>
    </main>
  )
}

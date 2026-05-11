"use client"

import { useState, useEffect } from "react"

const ADMIN_PASSWORD = "Valean2008!"
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!





interface Comment {
  id: string
  community_id: string
  comment_text: string
  rating: number | null
  commenter_name: string
  status: string
  created_at: string
  communities?: { canonical_name: string }
}



function CommentsTab() {
  const [comments, setComments] = useState<any[]>([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(false)

  async function fetchComments(status: string) {
    setLoading(true)
    const res = await fetch('/api/admin/comments?status=' + status, { headers: { 'x-admin-password': ADMIN_PASSWORD } })
    const data = await res.json()
    setComments(data.comments || [])
    setLoading(false)
  }

  useEffect(() => { fetchComments(filter) }, [filter])

  async function updateStatus(id: string, status: string) {
    await fetch('/api/admin/comments', {
      method: 'PATCH',
      headers: { 'x-admin-password': ADMIN_PASSWORD, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status })
    })
    fetchComments(filter)
  }

  return (
    <div>
      <div style={{display:"flex",gap:"8px",marginBottom:"24px"}}>
        {["pending","flagged","approved","rejected"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{padding:"6px 16px",borderRadius:"20px",border:"1px solid #e5e5e5",backgroundColor:filter===s?"#1a1a1a":"#fff",color:filter===s?"#fff":"#555",cursor:"pointer",fontSize:"12px",fontWeight:"500",textTransform:"capitalize"}}>
            {s}
          </button>
        ))}
      </div>
      {loading && <div style={{textAlign:"center",color:"#888",padding:"40px"}}>Loading...</div>}
      {!loading && comments.length === 0 && <div style={{textAlign:"center",color:"#888",padding:"40px"}}>No {filter} comments.</div>}
      {comments.map(c => (
        <div key={c.id} style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"16px 20px",marginBottom:"12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"10px"}}>
            <div>
              <div style={{fontSize:"13px",fontWeight:"500",color:"#1a1a1a"}}>{c.commenter_name}</div>
              <div style={{fontSize:"11px",color:"#888"}}>{new Date(c.created_at).toLocaleDateString()} · {c.rating ? c.rating + "★" : "No rating"}</div>
            </div>
            <span style={{fontSize:"11px",padding:"2px 10px",borderRadius:"20px",backgroundColor:c.status==="approved"?"#E1F5EE":c.status==="rejected"?"#FEE9E9":c.status==="flagged"?"#FAEEDA":"#f0f0f0",color:c.status==="approved"?"#1B2B6B":c.status==="rejected"?"#E24B4A":c.status==="flagged"?"#854F0B":"#555"}}>
              {c.status}
            </span>
          </div>
          <div style={{fontSize:"13px",color:"#333",lineHeight:"1.6",marginBottom:"12px"}}>{c.comment_text}</div>
          <div style={{display:"flex",gap:"8px"}}>
            {c.status !== "approved" && <button onClick={() => updateStatus(c.id,"approved")} style={{fontSize:"12px",padding:"5px 14px",borderRadius:"6px",backgroundColor:"#1B2B6B",color:"#fff",border:"none",cursor:"pointer"}}>Approve</button>}
            {c.sts !== "rejected" && <button onClick={() => updateStatus(c.id,"rejected")} style={{fontSize:"12px",padding:"5px 14px",borderRadius:"6px",backgroundColor:"#E24B4A",color:"#fff",border:"none",cursor:"pointer"}}>Reject</button>}
            {c.status !== "pending" && <button onClick={() => updateStatus(c.id,"pending")} style={{fontSize:"12px",padding:"5px 14px",borderRadius:"6px",backgroundColor:"#f0f0f0",color:"#555",border:"none",cursor:"pointer"}}>Reset</button>}
          </div>
        </div>
      ))}
    </div>
  )
}








const EMPTY_FORM = {
  canonical_name: "",
  slug: "",
  city: "",
  county: "Palm Beach",
  state: "FL",
  property_type: "Single family",
  unit_count: "",
  monthly_fee_min: "",
  monthly_fee_max: "",
  monthly_fee_median: "",
  fee_observation_count: "",
  confidence_score: "2",
  management_company: "",
  str_restriction: "",
  pet_restriction: "",
  vehicle_restriction: "",
  rental_approval: "",
  amenities: "",
  subdivision_names: "",
  street_address_range: "",
  zip_codes: "",
  status: "published",
}

function CommunitiesTab() {
  const [password, setPassword] = useState("")
  const [form, setForm] = useState({...EMPTY_FORM})
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  function handleField(key: string, val: string) {
    if (key === "canonical_name") {
      const slug = val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
      setForm(f => ({...f, slug, canonical_name: val}))
    } else {
      setForm(f => ({...f, [key]: val}))
    }
  }

  async function handleSave() {
    if (form.canonical_name === "" || form.city === "") {
      setMessage("Community name and city are required.")
      return
    }
    setSaving(true)
    setMessage("")
    const payload = {
      ...form,
      unit_count: form.unit_count ? parseInt(form.unit_count) : null,
      monthly_fee_min: form.monthly_fee_min ? parseFloat(form.monthly_fee_min) : null,
      monthly_fee_max: form.monthly_fee_max ? parseFloat(form.monthly_fee_max) : null,
      monthly_fee_median: form.monthly_fee_median ? parseFloat(form.monthly_fee_median) : null,
      fee_observation_count: form.fee_observation_count ? parseInt(form.fee_observation_count) : null,
      confidence_score: parseInt(form.confidence_score),
    }
    const res = await fetch("/api/admin/communities", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload)
    })
    const data = await res.json()
    if (data.ok) {
      setMessage("Community saved successfully.")
      setForm({...EMPTY_FORM})
    } else {
      setMessage("Error: " + (data.error || "Unknown error"))
    }
    setSaving(false)
  }


  const Field = ({label, k, placeholder="", type="text"}: {label:string,k:string,placeholder?:string,type?:string}) => (
    <div style={{marginBottom:"16px"}}>
      <label style={{fontSize:"12px",fontWeight:"600",color:"#555",display:"block",marginBottom:"4px"}}>{label}</label>
      <input type={type} value={(form as any)[k]} onChange={e => handleField(k, e.target.value)} placeholder={placeholder}
        style={{width:"100%",padding:"8px 12px",borderRadius:"8px",border:"1px solid #e0e0e0",fontSize:"13px",outline:"none",boxSizing:"border-box"}}/>
    </div>
  )

  const Select = ({label, k, options}: {label:string,k:string,options:string[]}) => (
    <div style={{marginBottom:"16px"}}>
      <label style={{fontSize:"12px",fontWeight:"600",color:"#555",display:"block",marginBottom:"4px"}}>{label}</label>
      <select value={(form as any)[k]} onChange={e => handleField(k, e.target.value)}
        style={{width:"100%",padding:"8px 12px",borderRadius:"8px",border:"1px solid #e0e0e0",fontSize:"13px",outline:"none",boxSizing:"border-box",backgroundColor:"#fff"}}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )

  return (
    <main style={{fontFamily:"system-ui,sans-serif",backgroundColor:"#f9f9f9",minHeight:"100vh"}}>
      <nav style={{backgroundColor:"#fff",borderBottom:"1px solid #e5e5e5",padding:"0 32px",height:"72px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <a href="/" style={{display:"flex",alignItems:"center",gap:"8px",textDecoration:"none"}}>
          <span style={{fontSize:"22px",fontWeight:"700",color:"#1B2B6B",letterSpacing:"-0.02em"}}>HOA<span style={{color:"#1D9E75"}}>Agent</span></span>
        </a>
        <div style={{display:"flex",gap:"16px",alignItems:"center"}}>
          <a href="/admin/comments" style={{fontSize:"13px",color:"#666",textDecoration:"none"}}>Comments</a>
          <a href="/admin/communities" style={{fontSize:"13px",color:"#1D9E75",textDecoration:"none",fontWeight:"500"}}>Add Community</a>
        </div>
      </nav>

      <div style={{maxWidth:"720px",margin:"0 auto",padding:"32px"}}>
        <h1 style={{fontSize:"22px",fontWeight:"600",color:"#1a1a1a",marginBottom:"4px"}}>Add Community</h1>
        <p style={{fontSize:"13px",color:"#888",marginBottom:"32px"}}>Fill in the details below to add a new HOA community to the database.</p>

        {message !== "" && (
          <div style={{padding:"12px 16px",borderRadius:"8px",backgroundColor:message.startsWith("Error") ? "#FEE9E9" : "#E1F5EE",color:message.startsWith("Error") ? "#E24B4A" : "#1B2B6B",fontSize:"13px",marginBottom:"24px"}}>
            {message}
          </div>
        )}

        <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"24px",marginBottom:"16px"}}>
          <div style={{fontSize:"13px",fontWeight:"600",color:"#1B2B6B",marginBottom:"16px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Basic Info</div>
          <Field label="Community Name *" k="canonical_name" placeholder="Estates at Heritage Club"/>
          <Field label="Slug (auto-generated)" k="slug" placeholder="estates-at-heritage-club"/>
          <Field label="City *" k="city" placeholder="Boynton Beach"/>
          <Field label="Zip Codes" k="zip_codes" placeholder="33436, 33437"/>
          <Select label="Property Type" k="property_type" options={["Single family","Condo","Townhouse","Mixed"]}/>
          <Field label="Unit Count" k="unit_count" placeholder="120" type="number"/>
          <Select label="Status" k="status" options={["published","draft"]}/>
        </div>

        <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"24px",marginBottom:"16px"}}>
          <div style={{fontSize:"13px",fontWeight:"600",color:"#1B2B6B",marginBottom:"16px",textTransform:"uppercase",letterSpacing:"0.05em"}}>HOA Fees</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px"}}>
            <Field label="Fee Min ($/mo)" k="monthly_fee_min" placeholder="250" type="number"/>
            <Field label="Fee Max ($/mo)" k="monthly_fee_max" placeholder="350" type="number"/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px"}}>
            <Field label="Fee Median ($/mo)" k="monthly_fee_median" placeholder="300" type="number"/>
            <Field label="Observations" k="fee_observation_count" placeholder="5" type="number"/>
          </div>
          <Select label="Confidence Score" k="confidence_score" options={["1","2","3"]}/>
        </div>

        <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"24px",marginBottom:"16px"}}>
          <div style={{fontSize:"13px",fontWeight:"600",color:"#1B2B6B",marginBottom:"16px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Management</div>
          <Field label="Management Company" k="management_company" placeholder="Campbell Property Management"/>
        </div>

        <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"24px",marginBottom:"16px"}}>
          <div style={{fontSize:"13px",fontWeight:"600",color:"#1B2B6B",marginBottom:"16px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Restrictions</div>
          <Field label="STR Restriction" k="str_restriction" placeholder="No short-term rentals"/>
          <Field label="Pet Restriction" k="pet_restriction" placeholder="2 pets max, 25lb limit"/>
          <Field label="Vehicle Restriction" k="vehicle_restriction" placeholder="No commercial vehicles"/>
          <Field label="Rental Approval" k="rental_approval" placeholder="Board approval required"/>
        </div>

        <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"24px",marginBottom:"16px"}}>
          <div style={{fontSize:"13px",fontWeight:"600",color:"#1B2B6B",marginBottom:"16px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Search and Matching</div>
          <Field label="Subdivision Names" k="subdivision_names" placeholder="Heritage Club, Estates at Heritage"/>
          <Field label="Street Address Range" k="street_address_range" placeholder="100-500 Heritage Blvd"/>
          <Field label="Amenities" k="amenities" placeholder="Pool, Tennis, Clubhouse"/>
        </div>

        <button onClick={handleSave} disabled={saving}
          style={{width:"100%",padding:"14px",borderRadius:"10px",backgroundColor:"#1B2B6B",color:"#fff",border:"none",cursor:"pointer",fontSize:"15px",fontWeight:"600"}}>
          {saving ? "Saving..." : "Save Community"}
        </button>
      </div>
    </main>
  )
}



function SuggestionsTab() {
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [matches, setMatches] = useState<Record<string,any[]>>({})
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  async function load() {
    setLoading(true)
    const res = await fetch(SUPABASE_URL+"/rest/v1/suggestions?order=created_at.desc&limit=50",{headers:{apikey:SUPABASE_KEY,Authorization:"Bearer "+SUPABASE_KEY}})
    const data = (await res.json()||[]).filter((s: any) => s.community_name)
    setSuggestions(data)
    const mm: Record<string,any[]> = {}
    for (const s of data) {
      const words = s.community_name.split(" ").filter((w: string) => w.length > 3)
      const q = words.slice(0,2).join(" ")
      const r = await fetch(SUPABASE_URL+"/rest/v1/communities?select=id,canonical_name,slug,city,monthly_fee_min,status&canonical_name=ilike.*"+encodeURIComponent(q)+"*&limit=5",{headers:{apikey:SUPABASE_KEY,Authorization:"Bearer "+SUPABASE_KEY}})
      const m = await r.json()
      if (m?.length > 0) mm[s.id] = m
    }
    setMatches(mm)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function del(id: string) {
    await fetch(SUPABASE_URL+"/rest/v1/suggestions?id=eq."+id,{method:"DELETE",headers:{apikey:SUPABASE_KEY,Authorization:"Bearer "+SUPABASE_KEY}})
    load()
  }

  async function approve(s: any) {
    const slug = s.community_name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80)
    const res = await fetch(SUPABASE_URL+"/rest/v1/communities",{method:"POST",headers:{apikey:SUPABASE_KEY,Authorization:"Bearer "+SUPABASE_KEY,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify({canonical_name:s.community_name,slug,city:s.city||"",county:"Palm Beach",state:"FL",monthly_fee_min:s.hoa_fee||null,monthly_fee_max:s.hoa_fee||null,str_restriction:s.str_restriction||null,pet_restriction:s.pet_restriction||null,amenities:s.amenities||null,management_company:s.management_company||null,status:"published",confidence_score:2,city_verified:true})})
    if (res.ok) { await del(s.id); setMessage("Published: "+s.community_name) }
  }

  async function merge(s: any, c: any) {
    const u: any = {}
    if (s.hoa_fee && !c.monthly_fee_min) u.monthly_fee_min = s.hoa_fee
    if (s.str_restriction) u.str_restriction = s.str_restriction
    if (s.pet_restriction) u.pet_restriction = s.pet_restriction
    if (s.amenities) u.amenities = s.amenities
    if (Object.keys(u).length > 0) await fetch(SUPABASE_URL+"/rest/v1/communities?id=eq."+c.id,{method:"PATCH",headers:{apikey:SUPABASE_KEY,Authorization:"Bearer "+SUPABASE_KEY,"Content-Type":"application/json"},body:JSON.stringify(u)})
    await del(s.id); setMessage("Merged into: "+c.canonical_name)
  }

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:"20px"}}>
        <div style={{fontSize:"13px",color:"#888"}}>Approve, merge or reject community submissions.</div>
        <button onClick={load} style={{fontSize:"12px",padding:"6px 14px",borderRadius:"8px",border:"1px solid #e0e0e0",backgroundColor:"#fff",cursor:"pointer"}}>Refresh</button>
      </div>
      {message && <div style={{backgroundColor:"#E1F5EE",borderRadius:"8px",padding:"12px",marginBottom:"16px",fontSize:"13px",color:"#1B2B6B"}}>{message}</div>}
      {loading && <div style={{textAlign:"center",color:"#888",padding:"40px"}}>Loading...</div>}
      {!loading && suggestions.length === 0 && <div style={{textAlign:"center",padding:"60px",color:"#888"}}>No pending suggestions.</div>}
      {suggestions.map(s => (
        <div key={s.id} style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"20px",marginBottom:"16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"12px"}}>
            <div>
              <div style={{fontSize:"16px",fontWeight:"600",color:"#1a1a1a"}}>{s.community_name}</div>
              <div style={{fontSize:"12px",color:"#888"}}>{s.city} — {new Date(s.created_at).toLocaleDateString()}</div>
            </div>
            <div style={{display:"flex",gap:"8px"}}>
              <button onClick={() => approve(s)} style={{padding:"7px 12px",borderRadius:"8px",backgroundColor:"#1D9E75",color:"#fff",border:"none",cursor:"pointer",fontSize:"12px",fontWeight:"500"}}>Approve</button>
              <button onClick={() => del(s.id)} style={{padding:"7px 12px",borderRadius:"8px",backgroundColor:"#fff",color:"#E24B4A",border:"1px solid #E24B4A",cursor:"pointer",fontSize:"12px"}}>Reject</button>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"8px",marginBottom:"12px"}}>
            {[{l:"Fee",v:s.hoa_fee?"$"+s.hoa_fee+"/mo":null},{l:"STR",v:s.str_restriction},{l:"Pets",v:s.pet_restriction},{l:"Management",v:s.management_company},{l:"Email",v:s.submitter_email}].filter(x=>x.v).map(x => (
              <div key={x.l} style={{backgroundColor:"#f9f9f9",borderRadius:"6px",padding:"8px"}}>
                <div style={{fontSize:"10px",color:"#888",marginBottom:"2px",textTransform:"uppercase"}}>{x.l}</div>
                <div style={{fontSize:"12px",color:"#1a1a1a"}}>{x.v}</div>
              </div>
            ))}
          </div>
          {s.notes && <div style={{fontSize:"12px",color:"#555",backgroundColor:"#f9f9f9",borderRadius:"6px",padding:"10px",marginBottom:"12px"}}>{s.notes}</div>}
          {matches[s.id]?.length > 0 && (
            <div style={{borderTop:"1px solid #f0f0f0",paddingTop:"12px"}}>
              <div style={{fontSize:"11px",fontWeight:"600",color:"#EF9F27",marginBottom:"8px",textTransform:"uppercase"}}>Possible duplicates</div>
              {matches[s.id].map(c => (
                <div key={c.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",backgroundColor:"#FFFBF0",border:"1px solid #F5E6C8",borderRadius:"8px",marginBottom:"6px"}}>
                  <div>
                    <div style={{fontSize:"13px",fontWeight:"500"}}>{c.canonical_name}</div>
                    <div style={{fontSize:"11px",color:"#888"}}>{c.city} · {c.status}</div>
                  </div>
                  <div style={{display:"flex",gap:"6px"}}>
                    <a href={"/community/"+c.slug} target="_blank" style={{padding:"5px 10px",borderRadius:"6px",border:"1px solid #e0e0e0",backgroundColor:"#fff",color:"#555",textDecoration:"none",fontSize:"11px"}}>View</a>
                    <button onClick={() => merge(s,c)} style={{padding:"5px 10px",borderRadius:"6px",backgroundColor:"#1B2B6B",color:"#fff",border:"none",cursor:"pointer",fontSize:"1px"}}>Merge</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function UploadTab() {
  const [uploadType, setUploadType] = useState<"communities"|"observations">("communities")
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any>(null)

  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.trim().split("\n")
    if (lines.length < 2) return []
    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""))
    return lines.slice(1).map(line => {
      const values: string[] = []
      let current = "", inQuotes = false
      for (const char of line) {
        if (char === '"') inQuotes = !inQuotes
        else if (char === "," && !inQuotes) { values.push(current.trim()); current = "" }
        else current += char
      }
      values.push(current.trim())
      const row: Record<string, string> = {}
      headers.forEach((h, i) => row[h] = (values[i] || "").replace(/^"|"$/g, ""))
      return row
    })
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    const rows = parseCSV(await file.text())
    const res = await fetch("/api/admin/upload", {method:"POST",headers:{"Content-Type":"application/json","x-admin-password":ADMIN_PASSWORD},body:JSON.stringify({type:uploadType,rows})})
    setResult(await res.json())
    setUploading(false)
  }

  return (
    <div>
      <div style={{display:"flex",gap:"8px",marginBottom:"20px"}}>
        {(["communities","observations"] as const).map(t => (
          <button key={t} onClick={() => {setUploadType(t);setFile(null);setResult(null)}}
            style={{padding:"7px 18px",borderRadius:"8px",border:"1px solid "+(uploadType===t?"#1B2B6B":"#e5e5e5"),backgroundColor:uploadType===t?"#1B2B6B":"#fff",color:uploadType===t?"#fff":"#555",cursor:"pointer",fontSize:"13px"}}>
            {t === "communities" ? "Communities" : "Fee Observations"}
          </button>
        ))}
      </div>
      <div style={{border:"2px dashed #e0e0e0",borderRadius:"10px",padding:"40px",textAlign:"center",marginBottom:"16px",cursor:"pointer"}}
        onClick={() => document.getElementById("csv-admin-input")?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => {e.preventDefault();const f=e.dataTransfer.files[0];if(f)setFile(f)}}>
        <div style={{fontSize:"32px",marginBottom:"8px"}}>📄</div>
        <div style={{fontSize:"14px",color:"#555"}}>{file ? file.name : "Drop CSV here or click to browse"}</div>
        <input id="csv-admin-input" type="file" accept=".csv" style={{display:"none"}} onChange={e => {const f=e.target.files?.[0];if(f)setFile(f)}}/>
      </div>
      {result && <div style={{padding:"12px",borderRadius:"8px",backgroundColor:"#E1F5EE",marginBottom:"16px",fontSize:"13px",color:"#1B2B6B"}}>{result.success} rows imported</div>}
      <button onClick={handleUpload} disabled={!file||uploading}
        style={{width:"100%",padding:"12px",borderRadius:"8px",backgroundColor:file?"#1B2B6B":"#ccc",color:"#fff",border:"none",cursor:file?"pointer":"not-allowed",fontSize:"14px",fontWeight:"600"}}>
        {uploading ? "Uploading..." : "Upload CSV"}
      </button>
    </div>
  )
}


function FieldSuggestionsTab() {
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  const fieldLabels: Record<string, string> = {
    management_company: "Management Company",
    str_restriction: "Short-term Rentals",
    pet_restriction: "Pets",
    vehicle_restriction: "Commercial Vehicles",
    rental_approval: "Rental Approval",
  }

  async function load() {
    setLoading(true)
    const res = await fetch(
      SUPABASE_URL + "/rest/v1/pending_community_data?status=eq.pending&select=*,communities(canonical_name,slug)&order=created_at.desc",
      { headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY } }
    )
    const data = await res.json()
    setSuggestions(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function approve(s: any) {
    const fieldName = s.field_name || s.field
    const proposed = s.proposed_value || s.suggested_value
    const fieldMap: Record<string, string> = {
      str_restriction: "str_restriction",
      pet_restriction: "pet_restriction",
      vehicle_restriction: "vehicle_restriction",
      rental_approval: "rental_approval",
      management_company: "management_company",
      website_url: "website_url",
      amenities: "amenities",
    }
    if (!fieldName || !fieldMap[fieldName]) {
      setMessage("Cannot apply: unsupported field " + fieldName)
      return
    }
    await fetch(
      SUPABASE_URL + "/rest/v1/communities?id=eq." + s.community_id,
      { method: "PATCH", headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldMap[fieldName]]: proposed }) }
    )
    await fetch(
      SUPABASE_URL + "/rest/v1/pending_community_data?id=eq." + s.id,
      { method: "PATCH", headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved", reviewed_at: new Date().toISOString() }) }
    )
    setMessage("Approved: " + (fieldLabels[fieldName] || fieldName) + " for " + (s.communities?.canonical_name || s.community_id))
    load()
  }

  async function reject(s: any) {
    await fetch(
      SUPABASE_URL + "/rest/v1/pending_community_data?id=eq." + s.id,
      { method: "PATCH", headers: { apikey: SUPABASE_KEY, Authorization: "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected", reviewed_at: new Date().toISOString() }) }
    )
    load()
  }

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:"20px"}}>
        <div style={{fontSize:"13px",color:"#888"}}>Review field updates submitted by residents.</div>
        <button onClick={load} style={{fontSize:"12px",padding:"6px 14px",borderRadius:"8px",border:"1px solid #e0e0e0",backgroundColor:"#fff",cursor:"pointer"}}>Refresh</button>
      </div>
      {message && <div style={{backgroundColor:"#E1F5EE",borderRadius:"8px",padding:"12px",marginBottom:"16px",fontSize:"13px",color:"#1B2B6B"}}>{message}</div>}
      {loading && <div style={{textAlign:"center",color:"#888",padding:"40px"}}>Loading...</div>}
      {!loading && suggestions.length === 0 && <div style={{textAlign:"center",padding:"60px",color:"#888"}}>No pending field suggestions.</div>}
      {suggestions.map((s: any) => (
        <div key={s.id} style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"20px",marginBottom:"12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"12px"}}>
            <div>
              <div style={{fontSize:"11px",fontWeight:"600",color:"#1D9E75",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"4px"}}>{fieldLabels[s.field_name || s.field] || s.field_name || s.field}</div>
              <div style={{fontSize:"14px",fontWeight:"600",color:"#1a1a1a",marginBottom:"4px"}}>{s.communities?.canonical_name}</div>
              <div style={{fontSize:"15px",fontWeight:"500",color:"#1B2B6B",backgroundColor:"#E1F5EE",padding:"5px 12px",borderRadius:"6px",display:"inline-block"}}>{s.proposed_value || s.suggested_value}</div>
              {s.details && <div style={{fontSize:"12px",color:"#666",marginTop:"8px"}}>Details: {s.details}</div>}
            </div>
            <div style={{fontSize:"11px",color:"#aaa"}}>{new Date(s.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>
          </div>
          <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
            <button onClick={() => approve(s)} style={{padding:"7px 16px",borderRadius:"8px",backgroundColor:"#1D9E75",color:"#fff",border:"none",cursor:"pointer",fontSize:"12px",fontWeight:"600"}}>Approve + Publish</button>
            <button onClick={() => reject(s)} style={{padding:"7px 16px",borderRadius:"8px",backgroundColor:"#fff",color:"#E24B4A",border:"1px solid #E24B4A",cursor:"pointer",fontSize:"12px"}}>Reject</button>
            {s.communities?.slug && (
              <a href={"/community/" + s.communities.slug} target="_blank"
                style={{padding:"7px 16px",borderRadius:"8px",backgroundColor:"#f5f5f5",color:"#555",fontSize:"12px",textDecoration:"none"}}>
                View page
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AdminPage() {
  const [authed, setAuthed] = useState(typeof window !== "undefined" && sessionStorage.getItem("hoa_admin") === "true")
  const [password, setPassword] = useState("")
  const [tab, setTab] = useState("comments")

  if (!authed) {
    return (
      <div style={{minHeight:"100vh",backgroundColor:"#f9f9f9",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"system-ui,sans-serif"}}>
        <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"16px",padding:"40px",width:"340px",textAlign:"center"}}>
          <div style={{fontSize:"24px",fontWeight:"700",color:"#1B2B6B",marginBottom:"4px"}}>HOA<span style={{color:"#1D9E75"}}>Agent</span></div>
          <div style={{fontSize:"13px",color:"#888",marginBottom:"28px"}}>Admin Dashboard</div>
          <input type="password" placeholder="Password" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && password === ADMIN_PASSWORD) { setAuthed(true); sessionStorage.setItem("hoa_admin","true") }}}
            style={{width:"100%",padding:"11px 14px",borderRadius:"8px",border:"1.5px solid #e5e5e5",fontSize:"14px",outline:"none",boxSizing:"border-box" as any,marginBottom:"12px"}}/>
          <button onClick={() => { if (password === ADMIN_PASSWORD) { setAuthed(true); sessionStorage.setItem("hoa_admin","true") } else alert("Wrong password") }}
            style={{width:"100%",padding:"11px",borderRadius:"8px",backgroundColor:"#1B2B6B",color:"#fff",border:"none",cursor:"pointer",fontSize:"14px",fontWeight:"600"}}>
            Sign in
          </button>
        </div>
      </div>
    )
  }

  const TABS = [
    {key:"comments",label:"Comments"},
    {key:"communities",label:"Add Community"},
    {key:"upload",label:"CSV Upload"},
    {key:"suggestions",label:"Suggestions"},
    {key:"field_updates",label:"Field Updates"},
    {key:"research",label:"Research"},
    {key:"leads",label:"Leads"},
    {key:"news",label:"News",href:"/admin/news"},
    {key:"ads",label:"Advertiser Signups ›",href:"/admin/ads"},
    {key:"pending",label:"Pending ›",href:"/admin/pending"},
  ]

  return (
    <main style={{fontFamily:"system-ui,sans-serif",backgroundColor:"#f9f9f9",minHeight:"100vh"}}>
      <nav style={{backgroundColor:"#fff",borderBottom:"1px solid #e5e5e5",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:"64px"}}>
        <a href="/" style={{textDecoration:"none"}}>
          <span style={{fontSize:"20px",fontWeight:"700",color:"#1B2B6B"}}>HOA<span style={{color:"#1D9E75"}}>Agent</span></span>
        </a>
        <a href="/" style={{fontSize:"12px",color:"#888",textDecoration:"none"}}>Back to site</a>
      </nav>
      <div style={{backgroundColor:"#fff",borderBottom:"1px solid #e5e5e5",padding:"0 24px",display:"flex"}}>
        {TABS.map(t => (
          t.href ? (
            <a
              key={t.key}
              href={t.href}
              style={{padding:"16px 20px",borderBottom:"3px solid transparent",backgroundColor:"transparent",color:"#666",cursor:"pointer",fontSize:"13px",fontWeight:"400",textDecoration:"none"}}
            >
              {t.label}
            </a>
          ) : (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{padding:"16px 20px",border:"none",borderBottom:tab===t.key?"3px solid #1B2B6B":"3px solid transparent",backgroundColor:"transparent",color:tab===t.key?"#1B2B6B":"#666",cursor:"pointer",fontSize:"13px",fontWeight:tab===t.key?"600":"400"}}>
              {t.label}
            </button>
          )
        ))}
      </div>
      <div style={{maxWidth:"900px",margin:"0 auto",padding:"32px 24px"}}>
        {tab === "comments" && <CommentsTab/>}
        {tab === "communities" && <CommunitiesTab/>}
        {tab === "upload" && <UploadTab/>}
        {tab === "suggestions" && <SuggestionsTab/>}
        {tab === "field_updates" && <FieldSuggestionsTab/>}
        {tab === "research" && <ResearchTab/>}
        {tab === "leads" && <LeadsTab/>}
      </div>
    </main>
  )
}

// ── Leads Tab (one-time legacy backfill) ─────────────────────────────────────

function LeadsTab() {
  type BackfillResult = {
    ok: boolean
    dry_run?: boolean
    count_sent: number
    count_skipped: number
    count_failed: number
    recipients: string[]
    failed: Array<{ email: string; error: string }>
    total_eligible: number
  }
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [result, setResult] = useState<BackfillResult | null>(null)
  const [preview, setPreview] = useState<BackfillResult | null>(null)
  const [error, setError] = useState<string>("")

  async function preflight() {
    setError("")
    setBusy(true)
    try {
      const res = await fetch("/api/admin/backfill-leads?dry_run=1", {
        method: "POST",
        headers: { "x-admin-password": ADMIN_PASSWORD },
      })
      const data = (await res.json()) as BackfillResult & { error?: string }
      if (!res.ok) throw new Error(data.error || "Preflight failed")
      setPreview(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preflight failed")
    } finally {
      setBusy(false)
    }
  }

  async function runBackfill() {
    if (busy || done) return
    const n = preview?.recipients?.length ?? 0
    if (!confirm(`This will email ${n} legacy lead${n === 1 ? "" : "s"}. Continue?`)) return
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/admin/backfill-leads", {
        method: "POST",
        headers: { "x-admin-password": ADMIN_PASSWORD },
      })
      const data = (await res.json()) as BackfillResult & { error?: string }
      if (!res.ok) throw new Error(data.error || "Backfill failed")
      setResult(data)
      setDone(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backfill failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a", marginBottom: "8px" }}>
        Lead backfill
      </h2>
      <p style={{ fontSize: "13px", color: "#666", marginBottom: "20px", lineHeight: 1.6 }}>
        One-time follow-up email to report-request leads created <strong>before 2026-05-01</strong> that
        never received a reply. Skips Izzy test addresses and any row that already has{" "}
        <code style={{ fontSize: "12px", backgroundColor: "#f0f0f0", padding: "1px 4px", borderRadius: "4px" }}>backfill_sent_at</code> set.
      </p>

      <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={preflight}
          disabled={busy}
          style={{
            padding: "8px 14px",
            fontSize: "13px",
            fontWeight: 600,
            backgroundColor: "#fff",
            color: "#1B2B6B",
            border: "1.5px solid #1B2B6B",
            borderRadius: "8px",
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy && !preview ? "Checking…" : "Preview eligible leads"}
        </button>
        <button
          type="button"
          onClick={runBackfill}
          disabled={busy || done || !preview}
          style={{
            padding: "9px 16px",
            fontSize: "13px",
            fontWeight: 700,
            backgroundColor: busy || done || !preview ? "#bbb" : "#1D9E75",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            cursor: busy || done || !preview ? "not-allowed" : "pointer",
          }}
        >
          {done ? "Sent ✓" : busy ? "Sending…" : "Send Backfill Emails to Legacy Leads"}
        </button>
      </div>

      {error && (
        <div style={{ padding: "10px 12px", backgroundColor: "#FEE9E9", border: "1px solid #E24B4A", borderRadius: "8px", color: "#A32D2D", fontSize: "13px", marginBottom: "12px" }}>
          {error}
        </div>
      )}

      {preview && !result && (
        <div style={{ padding: "14px 16px", backgroundColor: "#FAEEDA", border: "1px solid #EF9F27", borderRadius: "8px", marginBottom: "12px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#854F0B", marginBottom: "8px" }}>
            Preview · {preview.recipients.length} email{preview.recipients.length === 1 ? "" : "s"} would be sent
          </div>
          <div style={{ fontSize: "12px", color: "#633806", lineHeight: 1.7 }}>
            {preview.recipients.length === 0 ? (
              <em>(none eligible)</em>
            ) : (
              <ul style={{ margin: 0, paddingLeft: "18px" }}>
                {preview.recipients.map((e) => (<li key={e}>{e}</li>))}
              </ul>
            )}
          </div>
        </div>
      )}

      {result && (
        <div style={{ padding: "14px 16px", backgroundColor: "#E1F5EE", border: "1px solid #1D9E75", borderRadius: "8px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#155A3F", marginBottom: "8px" }}>
            Backfill complete
          </div>
          <div style={{ fontSize: "12px", color: "#155A3F", marginBottom: "8px" }}>
            sent: <strong>{result.count_sent}</strong> · skipped: <strong>{result.count_skipped}</strong> · failed: <strong>{result.count_failed}</strong>
          </div>
          {result.recipients.length > 0 && (
            <>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#155A3F", marginBottom: "4px" }}>Recipients:</div>
              <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "#155A3F", lineHeight: 1.7 }}>
                {result.recipients.map((e) => (<li key={e}>{e}</li>))}
              </ul>
            </>
          )}
          {result.failed.length > 0 && (
            <>
              <div style={{ fontSize: "12px", fontWeight: 600, color: "#A32D2D", marginTop: "10px", marginBottom: "4px" }}>Failed:</div>
              <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "12px", color: "#A32D2D", lineHeight: 1.7 }}>
                {result.failed.map((f) => (<li key={f.email}>{f.email} — {f.error}</li>))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Research Tools Tab ────────────────────────────────────────────────────────

function ResearchTab() {
  const [stats, setStats]       = useState<{pending_data_count:number,pending_fee_count:number,last_run:any}|null>(null)
  const [running, setRunning]   = useState(false)
  const [output, setOutput]     = useState("")
  const [dryRun, setDryRun]     = useState(true)
  const [batchSize, setBatchSize] = useState(10)

  useEffect(() => {
    fetch("/api/admin/research", { headers: { "x-admin-password": ADMIN_PASSWORD } })
      .then(r => r.json())
      .then(d => setStats(d))
      .catch(() => {})
  }, [])

  async function runResearch() {
    setRunning(true)
    setOutput("Starting research batch…\n")
    try {
      const res = await fetch("/api/admin/research", {
        method: "POST",
        headers: { "x-admin-password": ADMIN_PASSWORD, "Content-Type": "application/json" },
        body: JSON.stringify({ batch: batchSize, dry_run: dryRun })
      })
      const json = await res.json()
      if (json.ok) {
        setOutput(json.stdout || json.summary || "Done.")
      } else {
        setOutput("Error: " + (json.error || "unknown") + "\n" + (json.stderr || ""))
      }
    } catch (e: unknown) {
      setOutput("Network error: " + String(e))
    }
    setRunning(false)
  }

  return (
    <div>
      <h2 style={{fontSize:"16px",fontWeight:"700",color:"#1a1a1a",marginBottom:"4px"}}>Research Tools</h2>
      <p style={{fontSize:"13px",color:"#888",marginBottom:"24px"}}>
        Run the comprehensive research pipeline against thin communities.
        Government-sourced data auto-approves; listing fees and other data go to the pending review queue.
      </p>

      {/* Stats cards */}
      {stats && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"12px",marginBottom:"24px"}}>
          <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"16px"}}>
            <div style={{fontSize:"11px",color:"#888",fontWeight:600,marginBottom:"6px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Pending Data Items</div>
            <div style={{fontSize:"28px",fontWeight:"700",color:"#1B2B6B"}}>{stats.pending_data_count ?? "—"}</div>
          </div>
          <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"16px"}}>
            <div style={{fontSize:"11px",color:"#888",fontWeight:600,marginBottom:"6px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Pending Fee Observations</div>
            <div style={{fontSize:"28px",fontWeight:"700",color:"#1B2B6B"}}>{stats.pending_fee_count ?? "—"}</div>
          </div>
          <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"16px"}}>
            <div style={{fontSize:"11px",color:"#888",fontWeight:600,marginBottom:"6px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Last Run</div>
            <div style={{fontSize:"13px",fontWeight:"600",color:"#333"}}>
              {stats.last_run
                ? new Date(stats.last_run.run_at).toLocaleString()
                : "Never"}
            </div>
            {stats.last_run && (
              <div style={{fontSize:"11px",color:"#888",marginTop:"4px"}}>
                {stats.last_run.communities_researched} communities · {stats.last_run.fields_filled} fields
              </div>
            )}
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"20px",marginBottom:"16px"}}>
        <div style={{display:"flex",gap:"16px",alignItems:"flex-end",flexWrap:"wrap"}}>
          <div>
            <label style={{display:"block",fontSize:"11px",fontWeight:600,color:"#888",marginBottom:"6px",textTransform:"uppercase"}}>
              Batch Size
            </label>
            <select value={batchSize} onChange={e => setBatchSize(Number(e.target.value))}
              style={{padding:"8px 12px",borderRadius:"8px",border:"1px solid #e5e5e5",fontSize:"13px",backgroundColor:"#fff"}}>
              {[5,10,20,50].map(n => <option key={n} value={n}>{n} communities</option>)}
            </select>
          </div>
          <div>
            <label style={{display:"block",fontSize:"11px",fontWeight:600,color:"#888",marginBottom:"6px",textTransform:"uppercase"}}>
              Mode
            </label>
            <select value={dryRun ? "dry" : "live"}
              onChange={e => setDryRun(e.target.value === "dry")}
              style={{padding:"8px 12px",borderRadius:"8px",border:"1px solid #e5e5e5",fontSize:"13px",backgroundColor:"#fff"}}>
              <option value="dry">Dry Run (log only)</option>
              <option value="live">Live (write to DB)</option>
            </select>
          </div>
          <button onClick={runResearch} disabled={running}
            style={{padding:"9px 20px",borderRadius:"8px",border:"none",
              backgroundColor: running ? "#ccc" : "#1B2B6B",
              color:"#fff",fontSize:"13px",fontWeight:600,cursor:running?"not-allowed":"pointer"}}>
            {running ? "Running…" : `▶ Run Research Batch (${batchSize} communities)`}
          </button>
          <a href="/admin/pending"
            style={{padding:"9px 20px",borderRadius:"8px",border:"1px solid #e5e5e5",
              color:"#1B2B6B",fontSize:"13px",fontWeight:600,textDecoration:"none",
              backgroundColor:"#fff",display:"inline-block"}}>
            View Pending Approvals →
          </a>
        </div>
        {dryRun && (
          <div style={{marginTop:"12px",fontSize:"12px",color:"#e65c00",backgroundColor:"#fff8f0",
            padding:"8px 12px",borderRadius:"6px",border:"1px solid #ffd5a8"}}>
            ⚠ Dry Run mode — findings will be logged but NOT written to the database.
            Switch to Live mode to write auto-approvable data and queue pending items.
          </div>
        )}
      </div>

      {/* Output */}
      {output && (
        <div style={{backgroundColor:"#1a1a1a",borderRadius:"12px",padding:"16px",
          fontFamily:"monospace",fontSize:"12px",color:"#e5e5e5",
          whiteSpace:"pre-wrap",maxHeight:"500px",overflowY:"auto",
          lineHeight:"1.6"}}>
          {output}
        </div>
      )}
    </div>
  )
}

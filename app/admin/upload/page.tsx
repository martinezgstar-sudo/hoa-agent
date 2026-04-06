"use client"
import { useState } from "react"

const ADMIN_PASSWORD = "Valean2008!"

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n")
  if (lines.length < 2) return []
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""))
  return lines.slice(1).map(line => {
    const values: string[] = []
    let current = ""
    let inQuotes = false
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

export default function AdminUpload() {
  const [authed, setAuthed] = useState(typeof window !== "undefined" && sessionStorage.getItem("hoa_admin") === "true")
  const [password, setPassword] = useState("")
  const [activeTab, setActiveTab] = useState<"communities"|"observations">("communities")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Record<string, string>[]>([])
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{success: number, errors: string[]} | null>(null)

  function handleFile(f: File) {
    setFile(f)
    setResult(null)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const rows = parseCSV(text)
      setPreview(rows.slice(0, 3))
    }
    reader.readAsText(f)
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setResult(null)
    const text = await file.text()
    const rows = parseCSV(text)
    const res = await fetch("/api/admin/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": ADMIN_PASSWORD },
      body: JSON.stringify({ type: activeTab, rows })
    })
    const data = await res.json()
    setResult(data)
    setUploading(false)
  }

  function downloadTemplate(type: "communities" | "observations") {
    const templates: Record<string, string> = {
      communities: "canonical_name,slug,city,zip_codes,property_type,unit_count,monthly_fee_min,monthly_fee_max,monthly_fee_median,fee_observation_count,confidence_score,management_company,str_restriction,pet_restriction,vehicle_restriction,rental_approval,amenities,subdivision_names,street_address_range,status\nEstates at Heritage Club,estates-at-heritage-club,Boynton Beach,33436,Single family,120,250,350,300,5,2,Campbell Property Management,No short-term rentals,2 pets max,No commercial vehicles,Board approval required,Pool|Tennis|Clubhouse,Heritage Club,100-500 Heritage Blvd,published",
      observations: "community_name,mls_number,listing_date,property_address,listing_agent,fee_min,fee_max,fee_includes,special_assessment,assessment_amount,assessment_end_date,reserve_status,source_text\nEstates at Heritage Club,MLS123456,2026-01-15,123 Heritage Blvd Boynton Beach FL,John Smith,250,350,Water and lawn,Yes,$200/mo roof assessment,2027-12,Fully funded,HOA fee is $300/mo includes water and lawn care. Special assessment of $200/mo for roof through 2027."
    }
    const blob = new Blob([templates[type]], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = type === "communities" ? "communities_template.csv" : "fee_observations_template.csv"
    a.click()
  }

  if (!authed) {
    return (
      <div style={{minHeight:"100vh",backgroundColor:"#f9f9f9",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"32px",width:"320px"}}>
          <div style={{fontSize:"18px",fontWeight:"600",color:"#1a1a1a",marginBottom:"4px"}}>HOA Agent Admin</div>
          <div style={{fontSize:"13px",color:"#888",marginBottom:"20px"}}>CSV Upload Tool</div>
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            style={{width:"100%",padding:"10px",borderRadius:"8px",border:"1px solid #e0e0e0",fontSize:"14px",marginBottom:"12px",boxSizing:"border-box"}}/>
          <button onClick={() => if (password === ADMIN_PASSWORD) { setAuthed(true); sessionStorage.setItem("hoa_admin", "true") }}
            style={{width:"100%",padding:"10px",borderRadius:"8px",backgroundColor:"#1B2B6B",color:"#fff",border:"none",cursor:"pointer",fontSize:"14px",fontWeight:"500"}}>
            Sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <main style={{fontFamily:"system-ui,sans-serif",backgroundColor:"#f9f9f9",minHeight:"100vh"}}>
      <nav style={{backgroundColor:"#fff",borderBottom:"1px solid #e5e5e5",padding:"0 32px",height:"72px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <a href="/" style={{display:"flex",alignItems:"center",gap:"8px",textDecoration:"none"}}>
          <img src="/logo.png" alt="HOA Agent" style={{height:"48px",width:"auto"}}/>
        </a>
        <div style={{display:"flex",gap:"16px",alignItems:"center"}}>
          <a href="/admin/comments" style={{fontSize:"13px",color:"#666",textDecoration:"none"}}>Comments</a>
          <a href="/admin/communities" style={{fontSize:"13px",color:"#666",textDecoration:"none"}}>Add Community</a>
          <a href="/admin/upload" style={{fontSize:"13px",color:"#1D9E75",textDecoration:"none",fontWeight:"500"}}>CSV Upload</a>
        </div>
      </nav>

      <div style={{maxWidth:"800px",margin:"0 auto",padding:"32px"}}>
        <h1 style={{fontSize:"22px",fontWeight:"600",color:"#1a1a1a",marginBottom:"4px"}}>CSV Upload Tool</h1>
        <p style={{fontSize:"13px",color:"#888",marginBottom:"24px"}}>Upload communities or fee observations in bulk. Download a template to get started.</p>

        <div style={{display:"flex",gap:"8px",marginBottom:"24px"}}>
          {(["communities","observations"] as const).map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); setFile(null); setPreview([]); setResult(null) }}
              style={{padding:"8px 20px",borderRadius:"8px",border:"1px solid " + (activeTab===tab?"#1B2B6B":"#e5e5e5"),backgroundColor:activeTab===tab?"#1B2B6B":"#fff",color:activeTab===tab?"#fff":"#555",cursor:"pointer",fontSize:"13px",fontWeight:"500",textTransform:"capitalize"}}>
              {tab === "communities" ? "Communities" : "Fee Observations"}
            </button>
          ))}
        </div>

        <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"24px",marginBottom:"16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
            <div style={{fontSize:"14px",fontWeight:"500",color:"#1a1a1a"}}>
              {activeTab === "communities" ? "Upload Communities CSV" : "Upload Fee Observations CSV"}
            </div>
            <button onClick={() => downloadTemplate(activeTab)}
              style={{fontSize:"12px",padding:"6px 14px",borderRadius:"6px",border:"1px solid #1B2B6B",backgroundColor:"#fff",color:"#1B2B6B",cursor:"pointer"}}>
              Download Template
            </button>
          </div>

          <div
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            style={{border:"2px dashed #e0e0e0",borderRadius:"10px",padding:"40px",textAlign:"center",marginBottom:"16px",cursor:"pointer"}}
            onClick={() => document.getElementById("csv-input")?.click()}
          >
            <div style={{fontSize:"32px",marginBottom:"8px"}}>📄</div>
            <div style={{fontSize:"14px",color:"#555",marginBottom:"4px"}}>{file ? file.name : "Drop CSV file here or click to browse"}</div>
            <div style={{fontSize:"12px",color:"#aaa"}}>CSV files only</div>
            <input id="csv-input" type="file" accept=".csv" style={{display:"none"}} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}/>
          </div>

          {preview.length > 0 && (
            <div style={{marginBottom:"16px"}}>
              <div style={{fontSize:"12px",fontWeight:"600",color:"#555",marginBottom:"8px"}}>Preview — first 3 rows:</div>
              <div style={{overflowX:"auto",fontSize:"11px",border:"1px solid #e5e5e5",borderRadius:"8px"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead>
                    <tr style={{backgroundColor:"#f5f5f5"}}>
                      {Object.keys(preview[0]).map(h => (
                        <th key={h} style={{padding:"6px 10px",textAlign:"left",borderBottom:"1px solid #e5e5e5",whiteSpace:"nowrap",color:"#555"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((val, j) => (
                          <td key={j} style={{padding:"6px 10px",borderBottom:"1px solid #f0f0f0",whiteSpace:"nowrap",maxWidth:"150px",overflow:"hidden",textOverflow:"ellipsis"}}>{val}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div style={{padding:"12px 16px",borderRadius:"8px",backgroundColor:result.errors.length===0?"#E1F5EE":"#FEE9E9",marginBottom:"16px"}}>
              <div style={{fontSize:"13px",fontWeight:"500",color:result.errors.length===0?"#1B2B6B":"#E24B4A",marginBottom:"4px"}}>
                {result.success} rows imported successfully
              </div>
              {result.errors.map((e, i) => (
                <div key={i} style={{fontSize:"12px",color:"#E24B4A"}}>{e}</div>
              ))}
            </div>
          )}

          <button onClick={handleUpload} disabled={!file || uploading}
            style={{width:"100%",padding:"12px",borderRadius:"8px",backgroundColor:file?"#1B2B6B":"#ccc",color:"#fff",border:"none",cursor:file?"pointer":"not-allowed",fontSize:"14px",fontWeight:"600"}}>
            {uploading ? "Uploading..." : "Upload CSV"}
          </button>
        </div>

        <div style={{backgroundColor:"#fff",border:"1px solid #e5e5e5",borderRadius:"12px",padding:"20px"}}>
          <div style={{fontSize:"13px",fontWeight:"500",color:"#1a1a1a",marginBottom:"12px"}}>Instructions</div>
          <div style={{fontSize:"12px",color:"#666",lineHeight:"1.8"}}>
            <div>1. Download the template for the type of data you want to upload</div>
            <div>2. Fill it in — you can use Claude to extract data from MLS listings</div>
            <div>3. Save as CSV and upload here</div>
            <div>4. Preview confirms your data looks right before importing</div>
            <div>5. Click Upload — data appears in Supabase instantly</div>
            {activeTab === "observations" && <div style={{marginTop:"8px",color:"#EF9F27"}}>Note: Fee observations are linked to communities by name. Make sure community_name matches exactly.</div>}
          </div>
        </div>
      </div>
    </main>
  )
}

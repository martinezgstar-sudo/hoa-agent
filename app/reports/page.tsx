"use client"

export default function Reports() {
  return (
    <main style={{fontFamily:"system-ui,sans-serif",backgroundColor:"#f9f9f9",minHeight:"100vh"}}>
      <nav style={{backgroundColor:"#fff",borderBottom:"1px solid #e5e5e5",padding:"0 32px",height:"72px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <a href="/" style={{display:"flex",alignItems:"center",gap:"8px",textDecoration:"none"}}>
          <span style={{fontSize:"22px",fontWeight:"700",color:"#1B2B6B",letterSpacing:"-0.02em"}}>HOA<span style={{color:"#1D9E75"}}>Agent</span></span>
        </a>
        <div style={{display:"flex",gap:"24px",alignItems:"center"}}>
          <a href="/search" style={{fontSize:"13px",color:"#666",textDecoration:"none"}}>Browse</a>
          <a href="/reports" style={{fontSize:"13px",color:"#1B2B6B",textDecoration:"none",fontWeight:"600"}}>Reports</a>
          <a href="/search" style={{fontSize:"13px",backgroundColor:"#1D9E75",color:"#fff",padding:"8px 16px",borderRadius:"6px",textDecoration:"none"}}>Share your HOA</a>
        </div>
      </nav>

      <div style={{maxWidth:"800px",margin:"0 auto",padding:"48px 32px"}}>

        <div style={{textAlign:"center",marginBottom:"56px"}}>
          <div style={{fontSize:"11px",fontWeight:"600",color:"#1D9E75",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"12px"}}>HOA Agent Reports</div>
          <h1 style={{fontSize:"36px",fontWeight:"700",color:"#1B2B6B",marginBottom:"16px",lineHeight:"1.2"}}>Know everything before you commit</h1>
          <p style={{fontSize:"16px",color:"#666",maxWidth:"520px",margin:"0 auto",lineHeight:"1.6"}}>Community reports give buyers, agents and investors the full picture — fees, restrictions, entity status, source trail and resident intelligence in one place.</p>
        </div>

        {/* Single Report */}
        <div style={{backgroundColor:"#fff",border:"2px solid #1B2B6B",borderRadius:"16px",padding:"32px",marginBottom:"24px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"20px"}}>
            <div>
              <div style={{fontSize:"13px",fontWeight:"600",color:"#1D9E75",marginBottom:"6px",textTransform:"uppercase",letterSpacing:"0.05em"}}>Single community report</div>
              <div style={{fontSize:"32px",fontWeight:"700",color:"#1a1a1a",marginBottom:"4px"}}>$29</div>
              <div style={{fontSize:"13px",color:"#888"}}>Per community, one-time</div>
            </div>
            <a href="#" style={{padding:"12px 24px",borderRadius:"8px",backgroundColor:"#1B2B6B",color:"#fff",textDecoration:"none",fontSize:"14px",fontWeight:"600"}}>Coming soon</a>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}>
            {["Full source trail with citations","Fee history and observed range","STR, pet and rental restrictions","Entity status and registered agent","Special assessment signals","Management company details","Resident review summary","PDF download included"].map(f => (
              <div key={f} style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"13px",color:"#555"}}>
                <span style={{color:"#1D9E75",fontWeight:"700"}}>✓</span>{f}
              </div>
            ))}
          </div>
        </div>

        {/* Agent Bundles */}
        <div style={{marginBottom:"48px"}}>
          <div style={{fontSize:"13px",fontWeight:"600",color:"#888",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:"16px"}}>Agent bundles — buy in bulk and save</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"16px"}}>
            {[
              {name:"Starter",qty:"5 reports",price:"$24",per:"$4.80 each",savings:"Save 20%",highlight:false},
              {name:"Professional",qty:"15 reports",price:"$60",per:"$4.00 each",savings:"Save 33%",highlight:true},
              {name:"Power Agent",qty:"50 reports",price:"$175",per:"$3.50 each",savings:"Save 41%",highlight:false},
        ].map(t => (
              <div key={t.name} style={{backgroundColor:t.highlight?"#EEF2FF":"#fff",border:"2px solid "+(t.highlight?"#1B2B6B":"#e5e5e5"),borderRadius:"12px",padding:"20px",textAlign:"center"}}>
                <div style={{fontSize:"12px",fontWeight:"600",color:"#888",marginBottom:"4px"}}>{t.name}</div>
                <div style={{fontSize:"28px",fontWeight:"700",color:"#1a1a1a",marginBottom:"2px"}}>{t.price}</div>
                <div style={{fontSize:"12px",color:"#888",marginBottom:"6px"}}>{t.qty}</div>
                <div style={{fontSize:"12px",color:"#1D9E75",fontWeight:"600",marginBottom:"2px"}}>{t.per}</div>
                <div style={{fontSize:"11px",color:"#aaa",marginBottom:"16px"}}>{t.savings}</div>
                <a href="#" style={{display:"block",padding:"8px",borderRadius:"6px",backgroundColor:"#1B2B6B",color:"#fff",textDecoration:"none",fontSize:"12px",fontWeight:"600"}}>Coming soon</a>
              </div>
            ))}
          </div>
          <div style={{backgroundColor:"#f9f9f9",borderRadius:"12px",padding:"16px 20px",marginTop:"16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:"13px",fontWeight:"600",color:"#1a1a1a",marginBottom:"2px"}}>BNI member discount</div>
              <div style={{fontSize:"12px",color:"#888"}}>Active BNI members get 20% off all bundles. Mention your chapter at checkout.</div>
            </div>
            <div style={{fontSize:"22px",fontWeight:"700",color:"#1B2B6B",marginLeft:"24px",whiteSpace:"nowrap"}}>20% off</div>
          </div>
        </div>

        {/* Advertise */}
        <div style={{backgroundColor:"#1B2B6B",borderRadius:"16px",padding:"32px",color:"#fff",marginBottom:"48px"}}>
          <div style={{fontSize:"11px",fontWeight:"600",color:"#1D9E75",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"12px"}}>For local businesses</div>
          <h2 style={{fontSize:"24px",fontWeight:"700",marginBottom:"12px"}}>Advertise to HOA buyers</h2>
          <p style={{fontSize:"14px",color:"rgba(255,255,255,0.8)",marginBottom:"24px",lineHeight:"1.6",maxWidth:"480px"}}>Reach buyers actively researching communities in your area. Exclusive zip code sponsorships — one vendor per trade per zip code in Palm Beach County.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"12px",marginBottom:"24px"}}>
            {[
              {size:"Small zip",price:"$99/mo",desc:"1-2 zip codes"},
              {size:"Medium zone",price:"$199/mo",desc:"3-5 zip codes"},
              {size:"County wide",price:"$299/mo",desc:"Full Palm Beach County"},
            ].map(t => (
              <div key={t.size} style={{backgroundColor:"rgba(255,255,255,0.1)",borderRadius:"10px",padding:"16px",textAlign:"center"}}>
                <div style={{fontSize:"12px",color:"rgba(255,255,255,0.7)",marginBottom:"4px"}}>{t.size}</div>
                <div style={{fontSize:"22px",fontWeight:"700",marginBottom:"2px"}}>{t.price}</div>
                <div style={{fontSize:"11px",color:"rgba(255,255,255,0.6)"}}>{t.desc}</div>
              </div>
            ))}
          </div>
          <a href="mailto:morningstar.palmbeach@gmail.com" style={{display:"inline-block",padding:"12px 24px",borderRadius:"8px",backgroundColor:"#1D9E75",color:"#fff",textDecoration:"none",fontSize:"14px",fontWeight:"600"}}>Inquire about sponsorship</a>
        </div>

      </div>

      <footer style={{borderTop:"1px solid #e5e5e5",padding:"24px 32px",textAlign:"center",fontSize:"12px",color:"#888"}}>
        <div style={{marginBottom:"8px",fontWeight:"500",color:"#1a1a1a"}}>HOA Agent</div>
        <div>HOA Intelligence Platform · Palm Beach County · © 2026</div>
      </footer>
    </main>
  )
}

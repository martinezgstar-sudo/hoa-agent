export const metadata = { robots: { index: false, follow: false } }

export default function PitchPage() {
  return (
    <main style={{fontFamily:"system-ui,sans-serif",backgroundColor:"#0f1623",minHeight:"100vh",color:"#fff"}}>
      <nav style={{padding:"24px 48px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
        <a href="/" style={{textDecoration:"none"}}><img src="/logo.png" alt="HOA Agent" style={{height:"40px",width:"auto"}}/></a>
        <div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)",letterSpacing:"0.1em",textTransform:"uppercase"}}>Confidential — Partner Overview</div>
      </nav>
      <section style={{padding:"80px 48px 64px",maxWidth:"900px",margin:"0 auto",textAlign:"center"}}>
        <div style={{fontSize:"11px",fontWeight:"600",color:"#1D9E75",textTransform:"uppercase",letterSpacing:"0.15em",marginBottom:"20px"}}>Florida HOA Intelligence Platform</div>
        <h1 style={{fontSize:"px",fontWeight:"700",lineHeight:"1.1",marginBottom:"24px",color:"#fff"}}>The missing data layer for Florida real estate</h1>
        <p style={{fontSize:"18px",color:"rgba(255,255,255,0.6)",lineHeight:"1.7",maxWidth:"620px",margin:"0 auto 40px"}}>HOA Agent aggregates fee data, restrictions, assessments, and resident reviews for HOA and condo communities — structured, source-attributed, and searchable.</p>
        <a href="https://hoa-agent.com" target="_blank" style={{display:"inline-block",padding:"14px 32px",borderRadius:"10px",backgroundColor:"#1D9E75",color:"#fff",textDecoration:"none",fontSize:"14px",fontWeight:"600"}}>View Live Platform</a>
      </section>
      <section style={{padding:"64px 48px",maxWidth:"900px",margin:"0 auto",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
        <div style={{fontSize:"11px",fontWeight:"600",color:"#1D9E75",textTransform:"uppercase",letterSpacing:"0.15em",marginBottom:"16px"}}>The Problem</div>
        <h2 style={{fontSize:"32px",fontWeight:"600",lineHeight:"1.2",marginBottom:"20px"}}>HOA data is broken</h2>
        <p style={{fontSize:"15px",color:"rgba(255,255,255,0.6)",lineHeight:"1.8",marginBottom:"16px"}}>HOA and condo fees are one of the largest hidden costs in real estate. For a $400,000 home, a $500/month HOA fee adds $6,000 per year in carrng costs — yet buyers have no reliable single source for this data.</p>
        <p style={{fontSize:"15px",color:"rgba(255,255,255,0.6)",lineHeight:"1.8"}}>It is scattered across county records, buried in HOA documents, and inconsistent across platforms. Nobody has built a clean structured database from the source — the residents themselves.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"16px",marginTop:"32px"}}>
          {[{stat:"73%",label:"of Florida homes are in an HOA or condo association"},{stat:"$400-800",label:"average monthly HOA fee in Palm Beach County"},{stat:"0",label:"reliable structured databases for Florida HOA data"}].map(s => (
            <div key={s.stat} style={{backgroundColor:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"12px",padding:"20px 24px"}}>
              <div style={{fontSize:"32px",fontWeight:"700",color:"#1D9E75",marginBottom:"4px"}}>{s.stat}</div>
              <div style={{fontSize:"13px",color:"rgba(255,255,255,0.",lineHeight:"1.5"}}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>
      <section style={{padding:"64px 48px",maxWidth:"900px",margin:"0 auto",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
        <div style={{fontSize:"11px",fontWeight:"600",color:"#1D9E75",textTransform:"uppercase",letterSpacing:"0.15em",marginBottom:"16px"}}>What We Have Built</div>
        <h2 style={{fontSize:"32px",fontWeight:"600",lineHeight:"1.2",marginBottom:"32px"}}>A working product, live today</h2>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px"}}>
          {["Live platform at hoa-agent.com","37 communities indexed in Palm Beach County","Address search via Mapbox and Palm Beach County GIS","AI comment moderation via Anthropic Claude","Entity verification pipeline via Make.com","Admin data entry and community management","SEO-optimized community profiles","Built on Next.js, Supabase, Vercel","Terms of Service and Privacy Policy","Community suggestion and review system"].map(item => (
            <div key={item} style={{display:"flex",alignItems:"center",gap:"12px",fontSize:"14px",color:"rgba(255,255,255,0.7)"}}>
              <div style={{width:"6px",height:"6px",borderRadius:"50%",backgroundColor:"#1D9E75",flexShrink:0}}></div>
              {item}
            </div>
          ))}
        </div>
      </section>
      <section style={{padding:"64px 48px",maxWidth:"900px",margin:"0 auto",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
        <div style={{fontSize:"11px",fontWeight:"600",color:"#1D9E75",textTransform:"uppercase",letterSpacing:"0.15em",marginBottom:"16px"}}>Revenue Model</div>
        <h2 style={{fontSize:"32px",fontWeight:"600",lineHeight:"1.2",marginBottom:"40px"}}>Three clear monetization tiers</h2>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"20px"}}>
          {[{price:"Free",label:"Basic Access",items:["Community profiles","Fee ranges","Entity status","Address search","Up to 10 reviews"]},{price:"$2.99",label:"Reviews Unlock",items:["All resident reviews","Per community","One-time purchase","Instant access","No subscription"]},{price:"$29",label:"Full Report",items:["Complete fee trend PDF","Full source trail","All assessment signals","Restriction detail","Management history"]}].map(t => (
            <div key={t.price} style={{backgroundColor:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"12px",padding:"24px"}}>
              <div style={{fontSize:"32px",fontWeight:"700",color:"#1D9E75",marginBottom:"4px"}}>{t.price}</div>
              <div style={{fontSize:"13px",fontWeight:"600",color:"#fff",marginBottom:"16px"}}>{t.label}</div>
              {t.items.map(i => (
                <div key={i} style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"13px",color:"rgba(255,255,255,0.5)",marginBottom:"8px"}}>
                  <div style={{width:"4px",height:"4px",borderRadius:"50%",backgroundColor:"#1D9E75",flexShrink:0}}></div>
                  {i}
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
      <section style={{padding:"64px 48px",maxWidth:"900px",margin:"0 auto",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
        <div style={{fontSize:"11px",fontWeight:"600",color:"#1D9E75",textTransform:"uppercase",letterSpacing:"0.15em",marginBottom:"16px"}}>Growth Path</div>
        <h2 style={{fontSize:"32px",fontWeight:"600",lineHeight:"1.2",marginBottom:"40px"}}>From Palm Beach to national</h2>
        <div style={{display:"flex",flexDirection:"column",gap:"16px"}}>
          {[{phase:"Phase 1",title:"Complete Palm Beach County",desc:"Build resident review database and public records pipeline. Cover all 2,000 plus HOA communities in Palm Beach County."},{phase:"Phase 2",title:"South Florida Expansion",desc:"Expand to Broward and Miami-Dade counties. Target 10,000 plus communities. Launch B2B API for property management companies."},{phase:"Phase 3",title:"Statewide Florida",desc:"Full Florida coverage. Launch white label platform for brokerages. Data licensing with title companies and mortgage lenders."},{phase:"Phase 4",title:"National Expansion",desc:"Expand to HOA-dense states — Arizona, Texas, Nevada, California. Position as the definitive national HOA intelligence platform."}].map((p,i) => (
            <div key={p.phase} style={{display:"flex",gap:"24px",alignItems:"flex-start"}}>
              <div style={{width:"32px",height:"32px",borderRadius:"50%",backgroundColor:"#1D9E75",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"13px",fontWeight:"700",flexShrink:0}}>{i+1}</div>
              <div style={{backgroundColor:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"12px",padding:"20px 24px",flex:1}}>
                <div style={{fontSize:"11px",fontWeight:"600",color:"#1D9E75",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"6px"}}>{p.phase}</div>
                <div style={{fontSize:"16px",fontWeight:"600",color:"#fff",marginBottom:"8px"}}>{p.title}</div>
                <div style={{fontSize:"13px",color:"rgba(255,255,255,0.5)",lineHeight:"1.7"}}>{p.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section style={{padding:"64px 48px",maxWidth:"900px",margin:"0 auto",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
        <div style={{fontSize:"11px",fontWeight:"600",color:"#1D9E75",textTransform:"uppercase",letterSpacing:"0.15em",marginBottom:"16px"}}>Exit Potential</div>
        <h2 style={{fontSize:"32px",fontWeight:"600",lineHeight:"1.2",marginBottom:"20px"}}>Built to grow, positioned to sell</h2>
        <p style={{fontSize:"15px",color:"rgba(255,255,255,0.6)",lineHeight:"1.8",marginBottom:"32px"}}>A clean, structured, source-attributed HOA database covering Florida is a strategic asset for any platform serving real estate professionals or consumers.</p>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"16px",marginBottom:"32px"}}>
          {["CoStar Group","Zillow Group","Redfin","Realtor.com","AppFolio","Buildium","CoreLogic","Black Knight","Title insurance companies"].map(t => (
            <div key={t} style={{backgroundColor:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"8px",padding:"12px 16px",fontSize:"13px",color:"rgba(255,255,255,0.6)"}}>{t}</div>
          ))}
        </div>
      </section>
      <section style={{padding:"64px 48px",maxWidth:"900px",margin:"0 auto",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
        <div style={{fontSize:"11px",fontWeight:"600",color:"#1D9E75",textTransform:"uppercase",letterSpacing:"0.15em",marginBottom:"16px"}}>The Opportunity</div>
        <h2 style={{fontSize:"32px",fontWeight:"600",lineHeight:"1.2",marginBottom:"20px"}}>What we are looking for</h2>
        <p style={{fontSize:"15px",color:"rgba(255,255,255,0.6)",lineHeight:"1.8",marginBottom:"32px"}}>We are seeking a tech-experienced partner who sees the vision. We bring domain expertise, a working live product, a growing resident database, and a clear path to monetization and scale.</p>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"20px",marginBottom:"40px"}}>
          <div style={{backgroundColor:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"12px",padding:"24px"}}>
            <div style={{fontSize:"14px",fontWeight:"600",color:"#1D9E75",marginBottom:"12px"}}>What we bring</div>
            {["Licensed Florida realtor with MLS access","Working live product at hoa-agent.com","Deep HOA and real estate market knowledge","Clear monetization model","Established legal and data foundation"].map(i => (
              <div key={i} style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"13px",color:"rgba(255,255,255,0.6)",marginBottom:"8px"}}>
                <div style={{width:"4px",height:"4px",borderRadius:"50%",backgroundColor:"#1D9E75",flexShrink:0}}></div>
                {i}
              </div>
            ))}
          </div>
          <div style={{backgroundColor:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"12px",padding:"24px"}}>
            <div style={{fontSize:"14px",fontWeight:"600",color:"#1D9E75",marginBottom:"12px"}}>What we are looking for</div>
            {["Tech scaling experience","Prop tech or real estate industry connections","Strategic guidance on growth","Help accelerating data pipeline automation","Vision alignment on long-term exit"].map(i => (
              <div key={i} style={{display:"flex",alignItems:"center",gap:"8px",fontSize:"13px",color:"rgba(255,255,255,0.6)",marginBottom:"8px"}}>
                <div style={{width:"4px",height:"4px",borderRadius:"50%",backgroundColor:"#1D9E75",flexShrink:0}}></div>
                {i}
              </div>
            ))}
          </div>
        </div>
      </section>
      <section style={{padding:"64px 48px 80px",maxWidth:"900px",margin:"0 auto",textAlign:"center",borderTop:"1px solid rgba(255,255,255,0.08)"}}>
        <h2 style={{fontSize:"36px",fontWeight:"700",marginBottom:"16px"}}>Let us build this together</h2>
        <p style={{fontSize:"16px",color:"rgba(255,255,255,0.5)",marginBottom:"32px"}}>Reach out to start a conversation.</p>
        <a href="mailto:fieldlogisticsfl@gmail.com" style={{display:"inline-block",padding:"16px 40px",borderRadius:"10px",backgroundColor:"#1D9E75",color:"#fff",textDecoration:"none",fontSize:"15px",fontWeight:"600"}}>fieldlogisticsfl@gmail.com</a>
        <div style={{fontSize:"13px",color:"rgba(255,255,255,0.3)",marginTop:"16px"}}>Ismael Martinez · London Foster Realty · HOA Agent</div>
      </section>
      <footer style={{borderTop:"1px solid rgba(255,255,255,0.08)",padding:"24px 48px",textAlign:"center",fontSize:"12px",color:"rgba(255,255,255,0.3)"}}>
        2026 Ismael Martinez LLC · HOA Agent · Confidential
      </footer>
    </main>
  )
}
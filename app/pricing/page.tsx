export default function PricingPage() {
  return (
    <main style={{fontFamily:'system-ui,sans-serif',backgroundColor:'#f9f9f9',minHeight:'100vh'}}>
      <nav style={{backgroundColor:'#fff',borderBottom:'1px solid #e5e5e5',padding:'0 32px',height:'72px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <a href='/' style={{display:'flex',alignItems:'center',gap:'8px',textDecoration:'none'}}>
          <img src='/logo.png' alt='HOA Agent' style={{height:'48px',width:'auto'}}/>
        </a>
        <div style={{display:'flex',gap:'24px',alignItems:'center'}}>
          <a href='/search' style={{fontSize:'13px',color:'#666',textDecoration:'none'}}>Search</a>
          <a href='/pricing' style={{fontSize:'13px',color:'#1D9E75',textDecoration:'none',fontWeight:'500'}}>Pricing</a>
        </div>
      </nav>
      <section style={{padding:'80px 32px 64px',textAlign:'center',maxWidth:'800px',margin:'0 auto'}}>
        <div style={{fontSize:'11px',fontWeight:'600',color:'#1D9E75',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'16px'}}>Simple pricing</div>
        <h1 style={{fontSize:'40px',fontWeight:'600',color:'#1a1a1a',lineHeight:'1.2',marginBottom:'16px'}}>Know the HOA before you commit</h1>
        <p style={{fontSize:'16px',color:'#666',marginBottom:'56px',maxWidth:'480px',margin:'0 auto 56px',lineHeight:'1.6'}}>Start free. Pay only when you need deeper data.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'20px',maxWidth:'800px',margin:'0 auto'}}>
          {[
            {price:'Free',label:'Basic Access',color:'#f9f9f9',border:'#e5e5e5',items:['Community profiles','Fee ranges','Entity status','Address search','Up to 10 reviews','City filters'],cta:'Search now',href:'/search',ctaStyle:{backgroundColor:'#fff',color:'#1B2B6B',border:'1px solid #1B2B6B'}},
            {price:'.99',label:'Reviews Unlock',color:'#EEF2FF',border:'#1B2B6B',items:['All resident reviews','Per community','One-time purchase','Instant access','No subscription','Email confirmation'],cta:'Coming soon',href:'#',ctaStyle:{backgroundColor:'#1B2B6B',color:'#fff',border:'none'}},
            {price:'',label:'Full Report',color:'#E1F5EE',border:'#1D9E75',items:['Complete fee trend PDF','Full source trail','All assessment signals','Restriction detail','Management history','Downloadable PDF'],cta:'Coming soon',href:'#',ctaStyle:{backgroundColor:'#1D9E75',color:'#fff',border:'none'}},
          ].map(t => (
            <div key={t.price} style={{backgroundColor:t.color,border:'2px solid '+t.border,borderRadius:'16px',padding:'28px 24px',textAlign:'left'}}>
              <div style={{fontSize:'36px',fontWeight:'700',color:'#1a1a1a',marginBottom:'4px'}}>{t.price}</div>
              <div style={{fontSize:'14px',fontWeight:'600',color:'#555',marginBottom:'20px'}}>{t.label}</div>
              <div style={{display:'flex',flexDirection:'column',gap:'10px',marginBottom:'24px'}}>
                {t.items.map(i => (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'13px',color:'#444'}}>
                    <span style={{color:'#1D9E75',fontWeight:'600'}}>✓</span>{i}
                  </div>
                ))}
              </div>
              <a href={t.href} style={{display:'block',padding:'12px',borderRadius:'8px',textAlign:'center',fontSize:'13px',fontWeight:'600',textDecoration:'none',...t.ctaStyle}}>{t.cta}</a>
            </div>
          ))}
        </div>
      </section>
      <footer style={{borderTop:'1px solid #e5e5e5',padding:'24px 32px',textAlign:'center',fontSize:'12px',color:'#888',marginTop:'48px'}}>
        <div style={{marginBottom:'8px',fontWeight:'500',color:'#1a1a1a'}}>HOA Agent</div>
        <div>Florida HOA intelligence platform · Palm Beach County · © 2026</div>
        <div style={{marginTop:'8px',fontSize:'11px',color:'#aaa'}}><a href='/terms' style={{color:'#aaa',textDecoration:'none',marginRight:'16px'}}>Terms of Service</a><a href='/privacy' style={{color:'#aaa',textDecoration:'none'}}>Privacy Policy</a></div>
      </footer>
    </main>
  )
}

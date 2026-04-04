export default function PrivacyPage() {
  return (
    <main style={{fontFamily:'system-ui,sans-serif',backgroundColor:'#f9f9f9',minHeight:'100vh'}}>
      <nav style={{backgroundColor:'#fff',borderBottom:'1px solid #e5e5e5',padding:'0 32px',height:'72px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <a href='/' style={{display:'flex',alignItems:'center',gap:'8px',textDecoration:'none'}}>
          <img src='/logo.png' alt='HOA Agent' style={{height:'48px',width:'auto'}}/>
        </a>
        <div style={{display:'flex',gap:'24px',alignItems:'center'}}>
          <a href='/search' style={{fontSize:'13px',color:'#666',textDecoration:'none'}}>Search</a>
          <a href='/pricing' style={{fontSize:'13px',color:'#666',textDecoration:'none'}}>Pricing</a>
        </div>
      </nav>
      <div style={{maxWidth:'720px',margin:'0 auto',padding:'48px 32px'}}>
        <h1 style={{fontSize:'28px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px'}}>Privacy Policy</h1>
        <p style={{fontSize:'13px',color:'#888',marginBottom:'32px'}}>Last updated: April 2026</p>

        <h2 style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px',marginTop:'24px'}}>1. Information We Collect</h2>
        <p style={{fontSize:'14px',color:'#555',lineHeight:'1.8',marginBottom:'16px'}}>We collect information you voluntarily provide including email addresses submitted for our HOA Fee Guide, review submissions including name and comment text, and community suggestions including address and contact email. We also collect standard server logs including IP addresses and browser information.</p>

        <h2 style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px',marginTop:'24px'}}>2. How We Use Your Information</h2>
        <p style={{fontSize:'14px',color:'#555',lineHeight:'1.8',marginBottom:'16px'}}>We use collected information to respond to community suggestions, display approved reviews on community pages, send requested guides or resources, and improve our platform. We do not sell your personal information to third parties.</p>

        <h2 style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px',marginTop:'24px'}}>3. Cookies</h2>
        <p style={{fontSize:'14px',color:'#555',lineHeight:'1.8',marginBottom:'16px'}}>HOA Agent uses minimal cookies necessary for site functionality. We do not use advertising cookies or third-party tracking cookies.</p>

        <h2 style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px',marginTop:'24px'}}>4. Data Storage</h2>
        <p style={{fontSize:'14px',color:'#555',lineHeight:'1.8',marginBottom:'16px'}}>Your data is stored securely on Supabase infrastructure. We take reasonable measures to protect your information but cannot guarantee absolute security.</p>

        <h2 style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px',marginTop:'24px'}}>5. Your Rights</h2>
        <p style={{fontSize:'14px',color:'#555',lineHeight:'1.8',marginBottom:'16px'}}>You may request deletion of your personal data at any time by emailing info@hoa-agent.com. We will process deletion requests within 30 days.</p>

        <h2 style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px',marginTop:'24px'}}>6. Public Records Data</h2>
        <p style={{fontSize:'14px',color:'#555',lineHeight:'1.8',marginBottom:'16px'}}>Community information displayed on HOA Agent is sourced from public records including Florida Division of Corporations, Palm Beach County property data, and MLS observations. This data is publicly available and not considered private information.</p>

        <h2 style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px',marginTop:'24px'}}>7. Children</h2>
        <p style={{fontSize:'14px',color:'#555',lineHeight:'1.8',marginBottom:'16px'}}>HOA Agent is not directed at children under 13. We do not knowingly collect information from children.</p>

        <h2 style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px',marginTop:'24px'}}>8. Changes to This Policy</h2>
        <p style={{fontSize:'14px',color:'#555',lineHeight:'1.8',marginBottom:'16px'}}>We may update this privacy policy from time to time. We will note the date of the last update at the top of this page.</p>

        <h2 style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px',marginTop:'24px'}}>9. Contact</h2>
        <p style={{fontSize:'14px',color:'#555',lineHeight:'1.8',marginBottom:'16px'}}>Questions about this privacy policy? Email us at info@hoa-agent.com.</p>
      </div>
      <footer style={{borderTop:'1px solid #e5e5e5',padding:'24px 32px',textAlign:'center',fontSize:'12px',color:'#888'}}>
        <div style={{marginBottom:'8px',fontWeight:'500',color:'#1a1a1a'}}>HOA Agent</div>
        <div>Florida HOA intelligence platform · Palm Beach County · © 2026</div>
        <div style={{marginTop:'8px',fontSize:'11px',color:'#aaa'}}><a href='/terms' style={{color:'#aaa',textDecoration:'none',marginRight:'16px'}}>Terof Service</a><a href='/privacy' style={{color:'#aaa',textDecoration:'none'}}>Privacy Policy</a></div>
      </footer>
    </main>
  )
}

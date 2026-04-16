export default function TermsPage() {
  return (
    <main style={{fontFamily:'system-ui,sans-serif',backgroundColor:'#f9f9f9',minHeight:'100vh'}}>
      <nav style={{backgroundColor:'#fff',borderBottom:'1px solid #e5e5e5',padding:'0 32px',height:'72px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <a href='/' style={{display:'flex',alignItems:'center',gap:'8px',textDecoration:'none'}}>
          <img src='/logo.png' alt='HOA Agent' style={{height:'48px',width:'auto'}}/>
        </a>
        <div style={{display:'flex',gap:'24px',alignItems:'center'}}>
          <a href='/search' style={{fontSize:'13px',color:'#666',textDecoration:'none'}}>Search</a>
          <a href='/reports' style={{fontSize:'13px',color:'#666',textDecoration:'none'}}>Reports</a>
        </div>
      </nav>
      <div style={{maxWidth:'720px',margin:'0 auto',padding:'48px 32px'}}>
        <h1 style={{fontSize:'28px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px'}}>Terms of Service</h1>
        <p style={{fontSize:'13px',color:'#888',marginBottom:'32px'}}>Last updated: April 2026</p>

        <h2 style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px',marginTop:'24px'}}>1. Informational Use Only</h2>
        <p style={{fontSize:'14px',color:'#555',lineHeight:'1.8',marginBottom:'16px'}}>HOA Agent provides data about homeowner associations and condominium communities for informational purposes only. Nothing on this site constitutes legal, financial, or real estate advice. All data should be independently verified before making any real estate or financial decision.</p>

        <h2 style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px',marginTop:'24px'}}>2. Data Accuracy</h2>
        <p style={{fontSize:'14px',color:'#555',lineHeight:'1.8',marginBottom:'16px'}}>We source data from public records, government databases, and user submissions. HOA Agent does not guarantee the accuracy, completeness, or timeliness of any information on this site. Fee amounts, restrictions, and entity information may change without notice. Always verify directly with the association or management company.</p>

        <h2 style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px',marginTop:'24px'}}>3. No Affiliation</h2>
        <p style={{fontSize:'14px',color:'#555',lineHeight:'1.8',marginBottom:'16px'}}>HOA Agent is not affiliated with any homeowner association, condominium association, management company, or government agency. We are an independent information platform.</p>

        <h2 style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px',marginTop:'24px'}}>4. User Submissions</h2>
        <p style={{fontSize:'14px',color:'#555',lineHeight:'1.8',marginBottom:'16px'}}>By submitting a review, comment, or community suggestion, you confirm that your submission is truthful and does not contain defamatory, discriminatory, or illegal content. We reserve the right to moderate, edit, or remove any submission at our discretion. You grant HOA Agent a non-exclusive license to display your submission on our platform.</p>

        <h2 style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px',marginTop:'24px'}}>5. Fair Housing</h2>
        <p style={{fontSize:'14px',color:'#555',lineHeight:'1.8',marginBottom:'16px'}}>HOA Agent is committed to Fair Housing principles. We do not discriminate on the basis of race, color, religion, sex, national origin, disability, familial status, or any other protected class. Any content that violates Fair Housing laws will be removed immediately.</p>

        <h2 style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px',marginTop:'24px'}}>6. Limitation of Liability</h2>
        <p style={{fontSize:'14px',color:'#555',lineHeight:'1.8',marginBottom:'16px'}}>HOA Agent shall not be liable for any damages arising from your use of or reliance on information provided on this site. This includes but is not limited to financial loss, real estate transaction disputes, or decisions made based on inaccurate data.</p>

        <h2 style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px',marginTop:'24px'}}>7. Intellectual Property</h2>
        <p style={{fontSize:'14px',color:'#555',lineHeight:'1.8',marginBottom:'16px'}}>All original content, design, and software on HOA Agent is owned by Ismael Martinez LLC. You may not reproduce, scrape, or redistribute our content without written permission.</p>

        <h2 style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px',marginTop:'24px'}}>8. Changes to Terms</h2>
        <p style={{fontSize:'14px',color:'#555',lineHeight:'1.8',marginBottom:'16px'}}>We may update these terms at any time. Continued use of the site constitutes acceptance of the updated terms.</p>

        <h2 style={{fontSize:'16px',fontWeight:'600',color:'#1a1a1a',marginBottom:'8px',marginTop:'24px'}}>9. Contact</h2>
        <p style={{fontSize:'14px',color:'#555',lineHeight:'1.8',marginBottom:'16px'}}>Questions about these terms? Email us at fieldlogisticsfl@gmail.com.</p>
      </div>
      <footer style={{borderTop:'1px solid #e5e5e5',padding:'24px 32px',textAlign:'center',fontSize:'12px',color:'#888'}}>
        <div style={{marginBottom:'8px',fontWeight:'500',color:'#1a1a1a'}}>HOA Agent</div>
        <div>HOA Intelligence Platform · Palm Beach County · © 2026</div>
        <div style={{marginTop:'8px',fontSize:'11px',color:'#aaa'}}><a href='/terms' style={{color:'#aaa',textDecoration:'none',marginRight:'16px'}}>Terms of Service</a><a href='/privacy' style={{color:'#aaa',textDecoration:'none'}}>Privacy Policy</a></div>
      </footer>
    </main>
  )
}

export default function TermsPage() {
  return (
    <main style={{fontFamily:"system-ui,sans-serif",backgroundColor:"#f9f9f9",minHeight:"100vh"}}>
      <nav style={{backgroundColor:"#fff",borderBottom:"1px solid #e5e5e5",padding:"0 32px",height:"72px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <a href="/" style={{display:"flex",alignItems:"center",gap:"8px",textDecoration:"none"}}>
          <span style={{fontSize:"22px",fontWeight:"700",color:"#1B2B6B",letterSpacing:"-0.02em"}}>HOA<span style={{color:"#1D9E75"}}>Agent</span></span>
        </a>
        <div style={{display:"flex",gap:"24px",alignItems:"center"}}>
          <a href="/search" style={{fontSize:"13px",color:"#666",textDecoration:"none"}}>Search</a>
          <a href="/reports" style={{fontSize:"13px",color:"#666",textDecoration:"none"}}>Reports</a>
        </div>
      </nav>
      <div style={{maxWidth:"720px",margin:"0 auto",padding:"48px 32px"}}>
        <h1 style={{fontSize:"28px",fontWeight:"600",color:"#1a1a1a",marginBottom:"8px"}}>Terms of Service</h1>
        <p style={{fontSize:"13px",color:"#888",marginBottom:"32px"}}>Last updated: April 2026</p>

        <h2 style={{fontSize:"16px",fontWeight:"600",color:"#1a1a1a",marginBottom:"8px",marginTop:"24px"}}>1. Informational Use Only</h2>
        <p style={{fontSize:"14px",color:"#555",lineHeight:"1.8",marginBottom:"16px"}}>HOA Agent provides data about homeowner associations and condominium communities for informational purposes only. Nothing on this site constitutes legal, financial, or real estate advice. All data should be independently verified before making any real estate or financial decision.</p>

        <h2 style={{fontSize:"16px",fontWeight:"600",color:"#1a1a1a",marginBottom:"8px",marginTop:"24px"}}>2. Data Accuracy</h2>
        <p style={{fontSize:"14px",color:"#555",lineHeight:"1.8",marginBottom:"16px"}}>We source data from public records, government databases, and user submissions. HOA Agent does not guarantee the accuracy, completeness, or timeliness of any information on this site. Fee amounts, restrictions, and entity information may change without notice. Always verify directly with the association or management company.</p>

        <h2 style={{fontSize:"16px",fontWeight:"600",color:"#1a1a1a",marginBottom:"8px",marginTop:"24px"}}>3. No Affiliation</h2>
        <p style={{fontSize:"14px",color:"#555",lineHeight:"1.8",marginBottom:"16px"}}>HOA Agent is not affiliated with any homeowner association, condominium association, management company, or government agency. We are an independent information platform.</p>

        <h2 style={{fontSize:"16px",fontWeight:"600",color:"#1a1a1a",marginBottom:"8px",marginTop:"24px"}}>4. User Submissions</h2>
        <p style={{fontSize:"14px",color:"#555",lineHeight:"1.8",marginBottom:"16px"}}>By submitting a review, comment, or community suggestion, you confirm that your submission is truthful and does not contain defamatory, discriminatory, or illegal content. We reserve the right to moderate, edit, or remove any submission at our discretion. You grant HOA Agent a perpetual, non-exclusive, royalty-free license to display, distribute, and use your submission on our platform and in related marketing materials.</p>

        <h2 style={{fontSize:"16px",fontWeight:"600",color:"#1a1a1a",marginBottom:"8px",marginTop:"24px"}}>5. Prohibited Uses — Scraping and Data Extraction</h2>
        <p style={{fontSize:"14px",color:"#555",lineHeight:"1.8",marginBottom:"16px"}}>You may not use automated tools, bots, crawlers, scrapers, or any other means to extract, copy, or collect data from HOA Agent in bulk. Specifically prohibited:</p>
        <ul style={{fontSize:"14px",color:"#555",lineHeight:"2",marginBottom:"16px",paddingLeft:"24px"}}>
          <li>Automated scraping of community profiles, fee data, or restriction data</li>
          <li>Bulk downloading or mirroring of our database</li>
          <li>Using our data to build a competing product or service</li>
          <li>Reselng, licensing, or redistributing our data to third parties</li>
          <li>Accessing our API endpoints at a rate that exceeds normal user behavior</li>
          <li>Circumventing any rate limiting, access controls, or technical measures we implement</li>
        </ul>
        <p style={{fontSize:"14px",color:"#555",lineHeight:"1.8",marginBottom:"16px"}}>Violation of this section may result in immediate IP blocking, legal action, and claims for damages. Our database contains proprietary records that are protected under copyright and trade secret law. We actively monitor for unauthorized data extraction and reserve the right to pursue all available legal remedies.</p>

        <h2 style={{fontSize:"16px",fontWeight:"600",color:"#1a1a1a",marginBottom:"8px",marginTop:"24px"}}>6. Proprietary Data and Watermarking</h2>
        <p style={{fontSize:"14px",color:"#555",lineHeight:"1.8",marginBottom:"16px"}}>Our database includes proprietary records that serve as digital watermarks. These records allow us to identify unauthorized copies of our data. If our watermark records appear in any third-party database or product, we will treat that as conclusive evidence of unauthorized copying and pursue appropriate legal remedies.</p>

        <h2 style={{fontSize:"16px",fontWeight:"600",color:"#1a1a1a",marginBottom:"8px",marginTop:"24px"}}>7. Commercial Use Restrictions</h2>
        <p style={{fontSize:"14px",color:"#555",lineHeight:"1.8",marginBottom:"16px"}}>All data on HOA Agent is for personal, non-commercial use only unless you have entered into a written commercial data licensing agreement with HOA Agent. Commercial use includes but is not limited to: incorporating our data into real estate software, mortgage products, investment analysis tools, or any product sold or licensed to third parties. To inquire about commercial licensing contact fieldlogisticsfl@gmail.com.</p>

        <h2 style={{fontSize:"16px",fontWeight:"600",color:"#1a1a1a",marginBottom:"8px",marginTop:"24px"}}>8. Fair Housing</h2>
        <p style={{fontSize:"14px",color:"#555",lineHeight:"1.8",marginBottom:"16px"}}>HOA Agent is committed to Fair Housing principles. We do not discriminate on the basis of race, color, religion, sex, national origin, disability, familial status, or any other protected class. Any content that violates Fair Housing laws will be removed immediately.</p>

        <h2 style={{fontSize:"16px",fontWeight:"600",color:"#1a1a1a",marginBottom:"8px",marginTop:"24px"}}>9. Intellectual Property</h2>
        <p style={{fontSize:"14px",color:"#555",lineHeight:"1.8",marginBottom:"16px"}}>All original content, design, software, data compilations, and proprietary algorithms on HOA Agent are owned by HOA Agent LLC and protected under United States copyright law. The HOA Agent name and logo are pending trademark registration. You may not reproduce, scrape, frame, or redistribute our content without prior written permission. Unauthorized use will be prosecuted to the fullest extent of the law.</p>

        <h2 style={{fontSize:"16px",fontWeight:"600",color:"#1a1a1a",marginBottom:"8px",marginTop:"24px"}}>10. Limitation of Liability</h2>
        <p style={{fontSize:"14px",color:"#555",lineHeight:"1.8",marginBottom:"16px"}}>HOA Agent shall not be liable for any damages arising from your use of or reliance on information provided on this site. This includes but is not limited to financial loss, real estate transaction disputes, or decisions made based on inaccurate data.</p>

        <h2 style={{fontSize:"16px",fontWeight:"600",color:"#1a1a1a",marginBottom:"8px",marginTop:"24px"}}>11. Governing Law</h2>
        <p style={{fontSize:"14px",color:"#555",lineHeight:"1.8",marginBottom:"16px"}}>These terms are governed by the laws of the State of Florida. Any disputes arising from use of this platform shall be resolved in Palm Beach County, Florida.</p>

        <h2 style={{fontSize:"16px",fontWeight:"600",color:"#1a1a1a",marginBottom:"8px",marginTop:"24px"}}>12. Changes to Terms</h2>
        <p style={{fontSize:"14px",color:"#555",lineHeight:"1.8",marginBottom:"16px"}}>We may update these terms at any time. Continued use of the site constitutes acceptance of the updated terms.</p>

        <h2 style={{fontSize:"16px",fontWeight:"600",color:"#1a1a1a",marginBottom:"8px",marginTop:"24px"}}>13. Contact</h2>
        <p style={{fontSize:"14px",color:"#555",lineHeight:"1.8",marginBottom:"16px"}}>Questions about these terms? Email us at fieldlogisticsfl@gmail.com.</p>
      </div>
      <footer style={{borderTop:"1px solid #e5e5e5",padding:"24px 32px",textAlign:"center",fontSize:"12px",color:"#888"}}>
        <div style={{marginBottom:"8px",fontWeight:"500",color:"#1a1a1a"}}>HOA Agent</div>
        <div>HOA Intelligence Platform · Palm Beach County · © 2026</div>
        <div style={{marginTop:"8px",fontSize:"11px",color:"#aaa"}}>
          <a href="/terms" style={{color:"#aaa",textDecoration:"none",marginRight:"16px"}}>Terms of Service</a>
          <a href="/privacy" style={{color:"#aaa",textDecoration:"none"}}>Privacy Policy</a>
        </div>
      </footer>
    </main>
  )
}

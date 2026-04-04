import { supabase } from '@/lib/supabase'
import HomeSearch from '@/app/components/HomeSearch'

export default async function Home() {
  const { count } = await supabase
    .from('communities')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'published')

  const { data: featured } = await supabase
    .from('communities')
    .select('*')
    .eq('status', 'published')
    .order('confidence_score', { ascending: false })
    .limit(3)

  const totalCommunities = count || 0

  return (
    <main style={{fontFamily: 'system-ui, sans-serif', margin: 0, padding: 0, backgroundColor: '#f9f9f9'}}>

      <nav style={{backgroundColor: '#fff', borderBottom: '1px solid #e5e5e5', padding: '0 32px', height: '72px', display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
          <img src="/logo.png" alt="HOA Agent" style={{height: '48px', width: 'auto'}}/>
        </div>
        <div style={{display: 'flex', gap: '24px', alignItems: 'center'}}>
          <a href="/search" style={{fontSize: '13px', color: '#666', textDecoration: 'none'}}>Search</a>
          <a href="#" style={{fontSize: '13px', color: '#666', textDecoration: 'none'}}>Cities</a>
          <a href="#" style={{fontSize: '13px', color: '#666', textDecoration: 'none'}}>Pricing</a>
          <a href="#" style={{fontSize: '13px', backgroundColor: '#1B2B6B', color: '#fff', padding: '8px 16px', borderRadius: '6px', textDecoration: 'none'}}>Sign in</a>
        </div>
      </nav>

      <section style={{backgroundColor: '#fff', padding: '72px 32px 64px', textAlign: 'center', borderBottom: '1px solid #e5e5e5'}}>
        <div style={{fontSize: '11px', fontWeight: '600', color: '#1D9E75', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '16px'}}>Florida HOA intelligence platform</div>
        <h1 style={{fontSize: '42px', fontWeight: '600', color: '#1a1a1a', lineHeight: '1.2', marginBottom: '16px', maxWidth: '560px', marginLeft: 'auto', marginRight: 'auto'}}>Know the HOA before you commit</h1>
        <p style={{fontSize: '16px', color: '#666', marginBottom: '36px', maxWidth: '440px', marginLeft: 'auto', marginRight: 'auto', lineHeight: '1.6'}}>Structured, source-attributed data on HOA and condo communities across Florida. Fees, assessments, restrictions and reviews all in one place.</p>

        <HomeSearch />

        <div style={{display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap'}}>
          {['Boynton Beach HOA', 'Boca Raton condos', 'Campbell Property Management', 'Palm Beach County'].map((hint) => (
            <a key={hint} href={"/search?q=" + encodeURIComponent(hint)} style={{fontSize: '12px', padding: '5px 12px', borderRadius: '20px', border: '1px solid #e0e0e0', color: '#666', cursor: 'pointer', backgroundColor: '#fff', textDecoration: 'none'}}>{hint}</a>
          ))}
        </div>
      </section>

      <section style={{backgroundColor: '#f5f5f5', padding: '16px 32px', display: 'flex', gap: '32px', justifyContent: 'center', flexWrap: 'wrap', borderBottom: '1px solid #e5e5e5'}}>
        {[totalCommunities + ' communities tracked', 'Source-attributed data', 'Florida public records verified', 'Updated weekly'].map((item) => (
          <div key={item} style={{display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#555'}}>
            <div style={{width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#1D9E75'}}></div>
            {item}
          </div>
        ))}
      </section>

      <section style={{padding: '32px', maxWidth: '680px', margin: '0 auto'}}>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px'}}>
          {[
            {num: totalCommunities.toString(), label: 'Communities in Palm Beach County'},
            {num: 'Palm Beach', label: 'County coverage'},
            {num: 'Free', label: 'Basic community profiles'},
          ].map((stat) => (
            <div key={stat.label} style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '20px', textAlign: 'center'}}>
              <div style={{fontSize: '28px', fontWeight: '600', color: '#1a1a1a', marginBottom: '4px'}}>{stat.num}</div>
              <div style={{fontSize: '12px', color: '#888'}}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{padding: '0 32px 32px', maxWidth: '680px', margin: '0 auto'}}>
        <div style={{fontSize: '11px', fontWeight: '600', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px'}}>Featured communities — Palm Beach County</div>
        {featured?.map((c) => (
          <a key={c.id} href={"/community/" + c.slug} style={{textDecoration: 'none'}}>
            <div style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '16px 20px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer'}}>
              <div>
                <div style={{fontSize: '15px', fontWeight: '500', color: '#1a1a1a', marginBottom: '3px'}}>{c.canonical_name}</div>
                <div style={{fontSize: '12px', color: '#888', marginBottom: 'x'}}>{c.city} · {c.property_type}{c.unit_count ? ' · ' + c.unit_count + ' units' : ''}</div>
                <div style={{display: 'flex', gap: '6px'}}>
                  <span style={{fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#E1F5EE', color: '#1B2B6B'}}>Active entity</span>
                  {c.assessment_signal_count > 0
                    ? <span style={{fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#FAEEDA', color: '#854F0B'}}>{c.assessment_signal_count} assessment signals</span>
                    : <span style={{fontSize: '11px', padding: '2px 8px', borderRadius: '4px', backgroundColor: '#f0f0f0', color: '#888'}}>No signals</span>
                  }
                </div>
              </div>
              <div style={{textAlign: 'right', flexShrink: 0, marginLeft: '16px'}}>
                <div style={{fontSize: '14px', fontWeight: '500', color: '#1a1a1a'}}>
                  {c.nthly_fee_min && c.monthly_fee_max ? '$' + c.monthly_fee_min + '-$' + c.monthly_fee_max + '/mo' : 'Fee unknown'}
                </div>
                <div style={{fontSize: '11px', color: '#1D9E75', marginTop: '6px'}}>View profile →</div>
              </div>
            </div>
          </a>
        ))}
      </section>

      <section style={{padding: '0 32px 32px', maxWidth: '680px', margin: '0 auto'}}>
        <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px'}}>
          {[
            {step: 'Step 1', title: 'Search any community', desc: 'Find by name, address, city, county, or management company.'},
            {step: 'Step 2', title: 'Read the profile', desc: 'Fee history, assessments, restrictions, entity status all source-labeled.'},
            {step: 'Step 3', title: 'Get the full report', desc: '$29 deep-dive PDF with source trail and fee trend history.'},
          ].map((h) => (
            <div key={h.step} style={{backgroundColor: '#fff', border: '1px solid #e5e5e5', borderRadius: '12px', padding: '16px'}}>
              <div style={{fontSize: '11px', fontWeight: '600', color: '#1D9E75', marginBottom: '6px'}}>{h.step}</div>
              <div style={{fontSize: '13px', fontWeight: '500', color: '#1a1a1a', marginBottom: '4px'}}>{h.title}</div>
              <div style={{fontSize: '12px', color: '#888', lineHeight: '1.5'}}>{h.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <section style={{margin: '0 32px 40px', maxWidth: '616px', marginLeft: 'auto', marginRight: 'auto'}}>
        <div style={{backgroundColor: '#E1F5EE', borderRadius: '12px', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap'}}>
          <div>
            <div style={{fontSize: '15px', fontWeight: '500', color: '#1B2B6B', marginBottom: '4px'}}>Get the Palm Beach County HOA Fee Guide free</div>
            <div style={{fontSize: '12px', color: '#1B2B6B'}}>2025 data. Median fees by city, top management companies, assessment trends.</div>
          </div>
          <div style={{display: 'flex', gap: '8px', flexShrink: 0}}>
            <input type="email" placeholder="your@email.com" style={{fontSize: '13px', padding: '8px 12px', borderRadius: '8px', border: '1px solid #5DCAA5', outline: 'none', width: '200px'}}/>
            <button style={{fontSize: '13px', padding: '8px 16px', borderRadius: '8px', backgroundColor: '#1B2B6B', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: '500'}}>Get guide</button>
          </div>
        </div>
      </section>

      <footer style={{borderTop: '1px solid #e5e5e5', padding: '24px 32px', textAlign: 'center', fontSize: '12px', color: '#888'}}>
        <div style={{marginBottom: '8px', fontWeight: '500', color: '#1a1a1a'}}>HOA Agent</div>
        <div>Florida HOA intelligence platform · Palm Beach County © 2026</div>
      </footer>

    </main>
  )
}
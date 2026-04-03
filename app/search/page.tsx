import { supabase } from '@/lib/supabase'

function getConfidenceLabel(score: number) {
  if (score >= 3) return { label: 'High', color: '#1D9E75', bg: '#E1F5EE', stars: '★★★' }
  if (score >= 2) return { label: 'Medium', color: '#EF9F27', bg: '#FAEEDA', stars: '★★☆' }
  return { label: 'Low', color: '#E24B4A', bg: '#FEE9E9', stars: '★☆☆' }
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string, city?: string }> }) {
  const { q, city } = await searchParams
  const query = q || ''

  let dbQuery = supabase
    .from('communities')
    .select('*')
    .eq('status', 'published')
    .order('confidence_score', { ascending: false })
    .limit(100)

  if (query.length > 1) {
    dbQuery = dbQuery.or(`canonical_name.ilike.%${query}%,city.ilike.%${query}%,management_company.ilike.%${query}%,subdivision_names.ilike.%${query}%,zip_codes.ilike.%${query}%`)
  }

  if (city) {
    dbQuery = dbQuery.ilike('city', `%${city} data: communities } = await dbQuery

  const cities = ['Boynton Beach', 'Boca Raton', 'Jupiter', 'Delray Beach', 'Wellington', 'Palm Beach Gardens', 'Loxahatchee']

  return (
    <main style={{fontFamily:'system-ui,sans-serif',backgroundColor:'#f9f9f9',minHeight:'100vh'}}>
      <nav style={{backgroundColor:'#fff',borderBottom:'1px solid #e5e5e5',padding:'0 32px',height:'60px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <a href="/" style={{display:'flex',alignItems:'center',gap:'8px',textDecoration:'none'}}>
          <div style={{width:'10px',height:'10px',borderRadius:'50%',backgroundColor:'#1D9E75'}}></div>
          <span style={{fontSize:'18px',fontWeight:'600',color:'#1a1a1a'}}>HOA Agent</span>
        </a>
        <div style={{display:'flex',gap:'24px',alignItems:'center'}}>
          <a href="/search" style={{fontSize:'13px',color:'#1D9E75',textDecoration:'none',fontWeight:'500'}}>Search</a>
          <a href="#" style={{fontSize:'13px',color:'#666',textDecoration:'none'}}>Pricing</a>
          <a href="#" style={{fontSize:'13px',backgroundColor:'#1a1a1a',color:'#fff',padding:'8px 16px',borderRadius:'6px',textDecoration:'none'}}>Sign in</a>
        </div>
      </nav>

      <div style={{backgroundColor:'#fff',borderBottom:'1px solid #e5e5e5',padding:'24px 32px'}}>
        <div style={{maxWidth:'720px',margin:'0 auto'}}>
          <h1 style={{fontSize:'22px',fontWeight:'600',color:'#1a1a1a',marginBottom:'16px'}}>Search HOA communities</h1>
          <form action="/search" method="GET">
            <div style={{display:'flex',gap:'8px',marginBottom:'12px'}}>
              <input name="q" type="text" defaultValue={query} placeholder="Search by community name, city, zip code..." style={{flex:1,border:'1.5px solid #1a1a1a',borderRadius:'10px',padding:'10px 16px',fontSize:'14px',outline:'none'}}/>
              {city && <input type="hidden" name="city" value={city}/>}
              <button type="submit" style={{fontSize:'13px',padding:'10px 20px',borderRadius:'10px',backgroundColor:'#1D9E75',color:'#fff',border:'none',cursor:'pointer',fontWeight:'500'}}>Search</button>
            </div>
          </form>
          <div style={{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center'}}>
            <span style={{fontSize:'11px',color:'#888'}}>Filter by city:</span>
            {cities.map((c) => (
              <a key={c} href={`/search?${query ? `q=${query}&` : ''}city=${encodeURIComponent(c)}`}
                style={{fontSize:'11px',padding:'3px 10px',borderRadius:'20px',border:'1px solid #e5e5e5',backgroundColor: city === c ? '#1a1a1a' : '#fff',color: city === c ? '#fff' : '#555',textDecoration:'none'}}>
                {c}
              </a>
            ))}
            {city && (
              <a href={`/search${query ? `?q=${query}` : ''}`} style={{fontSize:'11px',padding:'3px 10px',borderRadius:'20px',border:'1px solid #e5e5e5',color:'#E24B4A',textDecoration:'none'}}>
                Clear filter
              </a>
            )}
          </div>
        </div>
      </div>

      <div style={{maxWidth:'720px',margin:'0 auto',padding:'20px 32px'}}>
        <div style={{fontSize:'12px',color:'#888',marginBottom:'16px'}}>
          {communities?.length || 0} communities found in Palm Beach County
          {city && ` · ${city}`}
          {query && ` · "${query}"`}
        </div>

        {communities?.length === 0 && (
          <div style={{textAlign:'center',padding:'60px',color:'#888',fontSize:'14px'}}>No communities found. Try a different search.</div>
        )}

        {communities?.map((c) => {
          const conf = getConfidenceLabel(c.confidence_score)
          return (
            <a key={c.id} href={`/community/${c.slug}`} style={{textDecoration:'none'}}>
              <div style={{backgroundColor:'#fff',border:'1px solid #e5e5e5',borderRadius:'12px',padding:'16px 20px',marginBottom:'10px',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:'15px',fontight:'500',color:'#1a1a1a',marginBottom:'3px'}}>{c.canonical_name}</div>
                  <div style={{fontSize:'12px',color:'#888',marginBottom:'8px'}}>
                    {c.city}{c.property_type ? ` · ${c.property_type}` : ''}{c.unit_count ? ` · ${c.unit_count} units` : ''}
                  </div>
                  <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                    <span style={{fontSize:'11px',padding:'2px 8px',borderRadius:'4px',backgroundColor:'#E1F5EE',color:'#085041'}}>Active entity</span>
                    {c.assessment_signal_count > 0
                      ? <span style={{fontSize:'11px',padding:'2px 8px',borderRadius:'4px',backgroundColor:'#FAEEDA',color:'#854F0B'}}>{c.assessment_signal_count} signals</span>
                      : <span style={{fontSize:'11px',padding:'2px 8px',borderRadius:'4px',backgroundColor:'#f0f0f0',color:'#888'}}>No signals</span>
                    }
                    {c.management_company && c.management_company !== 'Unknown' && (
                    <span style={{fontSize:'11px',padding:'2px 8px',borderRadius:'4px',backgroundColor:'#f0f0f0',color:'#555'}}>{c.management_company}</span>
                    )}
                  </div>
                </div>
                <div style={{textAlign:'right',flexShrink:0,marginLeft:'16px'}}>
                  <div style={{fontSize:'15px',fontWeight:'500',color:'#1a1a1a',marginBottom:'4px'}}>
                    {c.monthly_fee_min && c.monthly_fee_max ? `$${c.monthly_fee_min}-$${c.monthly_fee_max}/mo` : 'Fee unknown'}
                  </div>
                  <div style={{display:'inline-block',padding:'2px 10px',borderRadius:'20px',backgroundColor:conf.bg,color:conf.color,fontSize:'11px',fontWeight:'600',marginBottom:'4px'}}>
                    {conf.stars} {conf.label}
                  </div>
                  <div style={{fontSize:'11px',color:'#1D9E75',marginTop:'4px'}}>View profile →</div>
                </div>
              </div>
            </a>
          )
        })}
      </di

      <footer style={{borderTop:'1px solid #e5e5e5',padding:'24px 32px',textAlign:'center',fontSize:'12px',color:'#888'}}>
        <div style={{marginBottom:'8px',fontWeight:'500',color:'#1a1a1a'}}>HOA Agent</div>
        <div>Florida HOA intelligence platform · Palm Beach County © 2025</div>
      </footer>
    </main>
  )
}
import { supabase } from '@/lib/supabase'
import { redirect } from 'next/navigation'

export default async function SuggestionsAdminPage() {
  const { data: suggestions } = await supabase
    .from('community_suggestions')
    .select('*, communities(canonical_name, slug)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  const fieldLabels: Record<string, string> = {
    management_company: 'Management Company',
    str_restriction: 'Short-term Rentals',
    pet_restriction: 'Pets',
    vehicle_restriction: 'Commercial Vehicles',
    rental_approval: 'Rental Approval',
  }

  const fieldMap: Record<string, string> = {
    str_restriction: 'str_restriction',
    pet_restriction: 'pet_restriction',
    vehicle_restriction: 'vehicle_restriction',
    rental_approval: 'rental_approval',
    management_company: 'management_company',
  }

  async function approve(id: string, communityId: string, field: string, value: string) {
    'use server'
    await supabase.from('communities').update({ [fieldMap[field]]: value }).eq('id', communityId)
    await supabase.from('community_suggestions').update({ status: 'approved', reviewed_at: new Date().toISOString() }).eq('id', id)
    redirect('/admin/suggestions')
  }

  async function reject(id: string) {
    'use server'
    await supabase.from('community_suggestions').update({ status: 'rejected', reviewed_at: new Date().toISOString() }).eq('id', id)
    redirect('/admin/suggestions')
  }

  return (
    <main style={{fontFamily:'system-ui,sans-serif',padding:'32px',maxWidth:'800px',margin:'0 auto'}}>
      <a href="/admin" style={{fontSize:'13px',color:'#888',textDecoration:'none'}}>← Back to admin</a>
      <h1 style={{fontSize:'24px',fontWeight:'600',color:'#1a1a1a',margin:'16px 0 4px'}}>Pending Suggestions</h1>
      <div style={{fontSize:'13px',color:'#888',marginBottom:'24px'}}>{suggestions?.length || 0} pending review</div>

      {!suggestions || suggestions.length === 0 ? (
        <div style={{backgroundColor:'#f9f9f9',borderRadius:'12px',padding:'40px',textAlign:'center',color:'#888',fontSize:'14px'}}>
          No pending suggestions. All caught up!
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
          {suggestions.map((s: any) => (
            <div key={id} style={{backgroundColor:'#fff',border:'1px solid #e5e5e5',borderRadius:'12px',padding:'20px 24px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'12px'}}>
                <div>
                  <div style={{fontSize:'13px',fontWeight:'600',color:'#1B2B6B',marginBottom:'4px'}}>
                    {fieldLabels[s.field] || s.field}
                  </div>
                  <div style={{fontSize:'13px',color:'#888',marginBottom:'8px'}}>
                    {s.communities?.canonical_name}
                  </div>
                  <div style={{fontSize:'15px',fontWeight:'500',color:'#1a1a1a',backgroundColor:'#E1F5EE',padding:'6px 12px',borderRadius:'6px',display:'inline-block'}}>
                    {s.suggested_value}
                  </div>
                  {s.details && (
                    <div style={{fontSize:'12px',color:'#666',marginTop:'8px'}}>Details: {s.details}</div>
                  )}
                </div>
                <div style={{fontSize:'11px',color:'#aaa'}}>
                  {new Date(s.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                </div>
              </div>

              <div style={{display:'flex',gap:'8px',marginTop:'12px'}}>
                <form action={approve.bind(null, s.id, s.community_id, s.field, s.suggested_value)}>
                  <button type="submit"
                    style={{padding:'8px 20px',borderRadius:'8px',backgroundColor:'#1D9E75',color:'#fff',border:'none',cursor:'pointer',fontSize:'13px',fontWeight:'600'}}>
                    Approve + Publish
                  </button>
                </form>
                <form action={reject.bind(null, s.id)}>
                  <button type="submit"
                    style={{padding:'8px 20px',borderRadius:'8px',backgroundColor:'#fff',color:'#E24B4A',border:'1px solid #E24B4A',cursor:'pointer',fontSize:'13px',fontWeight:'600'}}>
                    Reject
                  </button>
                </form>
                <a href={'/community/' + s.communities?.slug} target="_blank"
                  style={{padding:'8px 20px',borderRadius:'8px',backgroundColor:'#f5f5f5',color:'#555',border:'none',cursor:'pointer',fontSize:'13px',textDecoration:'none'}}>
                  View page
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

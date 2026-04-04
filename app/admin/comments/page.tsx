'use client'

import { useState, useEffect } from 'react'

interface Comment {
  id: string
  community_id: string
  comment_text: string
  rating: number | null
  commenter_name: string
  status: string
  created_at: string
  communities?: { canonical_name: string }
}

const ADMIN_PASSWORD = 'hoaagent2025'

export default function AdminComments() {
  const [authed, setAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [comments, setComments] = useState<Comment[]>([])
  const [filter, setFilter] = useState('pending')
  const [loading, setLoading] = useState(false)

  async function fetchComments(status: string) {
    setLoading(true)
    const res = await fetch('/api/admin/comments?status=' + status)
    const data = await res.json()
    setComments(data.comments || [])
    setLoading(false)
  }

  useEffect(() => {
    if (authed) fetchComments(filter)
  }, [authed, filter])

  async function updateStatus(id: string, status: string) {
    await fetch('/api/admin/comments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status })
    })
    fetchComments(filter)
  }

  if (!authed) {
    return (
      <div style={{minHeight:'100vh',backgroundColor:'#f9f9f9',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{backgroundColor:'#fff',border:'1px solid #e5e5e5',borderRadius:'12px',padding:'32px',width:'320px'}}>
          <div style={{fontSize:'18px',fontWeight:'600',color:'#1a1a1a',marginBottom:'4px'}}>HOA Agent Admin</div>
          <div style={{fontSize:'12px',color:'#888',marginBottom:'20px'}}>Comment moderation</div>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && password === ADMIN_PASSWORD && setAuthed(true)}
            style={{width:'100%',border:'1.5px solid #e5e5e5',borderRadius:'8px',padding:'10px 12px',fontSize:'14px',outline:'none',boxSizing:'border-box',marginBottom:'10px'}}
          />
          <button
            onClick={() => password === ADMIN_PASSWORD ? setAuthed(true) : alert('Wrong password')}
            style={{width:'100%',padding:'10px',borderRadius:'8px',backgroundColor:'#085041',color:'#fff',border:'none',cursor:'pointer',fontSize:'14px',fontWeight:'500'}}
          >
            Sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{minHeight:'100vh',backgroundColor:'#f9f9f9',fontFamily:'system-ui,sans-serif'}}>
      <nav style={{backgroundColor:'#fff',borderBottom:'1px solid #e5e5e5',padding:'0 32px',height:'60px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <img src="/logo.png" alt="HOA Agent" style={{height:'36px',width:'auto'}}/>
          <span style={{fontSize:'12px',color:'#888',marginLeft:'8px'}}>Comment Moderation</span>
        </div>
        <a href="/" style={{fontSize:'13px',color:'#666',textDecoration:'none'}}>Back to site</a>
      </nav>

      <div style={{maxWidth:'800px',margin:'0 auto',padding:'24px 32px'}}>
        <div style={{display:'flex',gap:'8px',marginBottom:'24px'}}>
          {['pending','flagged','approved','rejected'].map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              style={{padding:'6px 16px',borderRadius:'20px',border:'1px solid #e5e5e5',backgroundColor: filter === s ? '#1a1a1a' : '#fff',color: filter === s ? '#fff' : '#555',cursor:'pointer',fontSize:'12px',fontWeight:'500',textTransform:'capitalize'}}>
              {s}
            </button>
          ))}
        </div>

        {loading && <div style={{textAlign:'center',color:'#888',padding:'40px'}}>Loading...</div>}

        {!loading && comments.length === 0 && (
          <div style={{textAlign:'center',color:'#888',padding:'40px'}}>No {filter} comments.</div>
        )}

        {comments.map((c) => (
          <div key={c.id} style={{backgroundColor:'#fff',border:'1px solid #e5e5e5',borderRadius:'12px',padding:'16px 20px',marginBottom:'12px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'10px'}}>
              <div>
                <div style={{fontSize:'13px',fontWeight:'500',color:'#1a1a1a'}}>{c.commenter_name}</div>
                <div style={{fontSize:'11px',color:'#888'}}>{new Date(c.created_at).toLocaleDateString()} · {c.rating ? c.rating + '★' : 'No rating'}</div>
              </div>
              <span style={{fontSize:'11px',padding:'2px 10px',borderRadius:'20px',backgroundColor: c.status === 'approved' ? '#E1F5EE' : c.status === 'rejected' ? '#FEE9E9' : c.status === 'flagged' ? '#FAEEDA' : '#f0f0f0',color: c.status === 'approved' ? '#085041' : c.status === 'rejected' ? '#E24B4A' : c.status === 'flagged' ? '#854F0B' : '#555'}}>
                {c.status}
              </span>
            </div>
            <div style={{fontSize:'13px',color:'#333',lineHeight:'1.6',marginBottom:'12px'}}>{c.comment_text}</div>
            <div style={{display:'flex',gap:'8px'}}>
              {c.status !== 'approved' && (
                <button onClick={() => updateStatus(c.id, 'approved')}
                  style={{fontSize:'12px',padding:'5px 14px',borderRadius:'6px',backgroundColor:'#085041',color:'#fff',border:'none',cursor:'pointer'}}>
                  Approve
                </button>
              )}
              {c.status !== 'rejected' && (
                <button onClick={() => updateStatus(c.id, 'rejected')}
                  style={{fontSize:'12px',padding:'5px 14px',borderRadius:'6px',backgroundColor:'#E24B4A',color:'#fff',border:'none',cursor:'pointer'}}>
                  Reject
                </button>
              )}
              {c.status !== 'pending' && (
                <button onClick={() => updateStatus(c.id, 'pending')}
                  style={{fontSize:'12px',padding:'5px 14px',borderRadius:'6px',backgroundColor:'#f0f0f0',color:'#555',border:'none',cursor:'pointer'}}>
                  Reset
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

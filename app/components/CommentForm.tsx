'use client'

import { useState } from 'react'

export default function CommentForm({ communityId }: { communityId: string }) {
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [name, setName] = useState('')
  const [status, setStatus] = useState<'idle'|'submitting'|'success'|'error'>('idle')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!comment.trim()) return
    setStatus('submitting')
    setError('')

    const res = await fetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        community_id: communityId,
        comment_text: comment,
        rating: rating || null,
        commenter_name: name || 'Anonymous'
      })
    })

    if (res.ok) {
      setStatus('success')
    } else {
      const data = await res.json()
      setError(data.error || 'Something went wrong')
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div style={{backgroundColor:'#E1F5EE',borderRadius:'12px',padding:'20px 24px',textAlign:'center'}}>
        <div style={{fontSize:'20px',marginBottom:'8px'}}>✓</div>
        <div style={{fontSize:'14px',fontWeight:'500',color:'#085041',marginBottom:'4px'}}>Comment submitted</div>
        <div style={{fontSize:'12px',color:'#0F6E56'}}>Your comment is pending review and will appear once approved.</div>
      </div>
    )
  }

  return (
    <div style={{backgroundColor:'#fff',border:'1px solid #e5e5e5',borderRadius:'12px',padding:'20px 24px'}}>
      <div style={{fontSize:'15px',fontWeight:'500',color:'#1a1a1a',marginBottom:'4px'}}>Leave a comment</div>
      <div style={{fontSize:'12px',color:'#888',marginBottom:'16px'}}>Share your experience with this community. Comments are reviewed before posting.</div>      <form onSubmit={handleSubmit}>
        <div style={{marginBottom:'14px'}}>
          <div style={{fontSize:'12px',color:'#555',marginBottom:'6px'}}>Rating (optional)</div>
          <div style={{display:'flex',gap:'4px'}}>
            {[1,2,3,4,5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                onMouseEnter={() => setHovered(star)}
                onMouseLeave={() => setHovered(0)}
                style={{background:'none',border:'none',cursor:'pointer',fontSize:'24px',color:(hovered || rating) >= star ? '#EF9F27' : '#e5e5e5',padding:'0 2px'}}
              >
                ★
              </button>
            ))}
            {rating > 0 && (
              <button type="button" onClick={() => setRating(0)} style={{background:'none',border:'none',cursor:'pointer',fontSize:'11px',color:'#888',marginLeft:'8px'}}>
                Clear
              </button>
            )}
          </div>
      </div>

        <div style={{marginBottom:'14px'}}>
          <div style={{fontSize:'12px',color:'#555',marginBottom:'6px'}}>Your comment *</div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share what you know about HOA fees, management, rules, assessments, or community life..."
            required
            rows={4}
            style={{width:'100%',border:'1.5px solid #e5e5e5',borderRadius:'8px',padding:'10px 12px',fontSize:'13px',resize:'vertical',outline:'none',boxSizing:'border-box',fontFamily:'system-ui,sans-serif'}}
          />
          <div style={{fontSize:'11px',color:'#aaa',marginTop:'4px'}}>{comment.length}/2000</div>
        </div>

        <div style={{marginBottom:'16px'}}>
          <div style={{fontSize:'12px',color:'#555',marginBottom:'6px'}}>Your name (optional)</div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Anonymous"
            style={{width:'100%',border:'1.5px solid #e5e5e5',borderRadius:'8px',padding:'10px 12px',fontSize:'13px',outline:'none',boxSizing:'border-box'}}
          />
        </div>

        {error && (
          <div style={{fontSize:'12px',color:'#E24B4A',marginBottom:'12px'}}>{error}</div>
        )}

        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{fontSize:'11px',color:'#aaa'}}>Comments are reviewed before appearing publicly.</div>
          <button
            type="submit"
            disabled={status === 'submitting' || !comment.trim()}
            style={{fontSize:'13px',padding:'10px 20px',borderRadius:'8px',backgroundColor: comment.trim() ? '#085041' : '#ccc',color:'#fff',border:'none',cursor: comment.trim() ? 'pointer' : 'not-allowed',fontWeight:'500'}}
          >
            {status === 'submitting' ? 'Submitting...' : 'Submit comment'}
          </button>
        </div>
      </form>
    </div>
  )
}

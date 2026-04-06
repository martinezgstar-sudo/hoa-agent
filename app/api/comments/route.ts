import { supabase } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

async function moderateComment(text: string, rating: number | null): Promise<{ status: string, reason: string }> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `You are a content moderator for an HOA community review platform. Review this comment and respond with JSON only.

Comment: "${text}"
Rating: ${rating || 'not provided'}

Respond with exactly this JSON format:
{"status": "approved" or "flagged", "reason": "brief reason"}

Auto-approve if: factual, about HOA fees/management/rules/community life, constructive criticism, neutral or positive.
Flag if: profanity, personal attacks, spam, completely off-topic, fake-seeming, or extremely one-sided without specifics.`
        }]
      })
    })
    const data = await response.json()
    const result = JSON.parse(data.content[0].text)
    return result
  } catch {
    return { status: 'pending', reason: 'moderation error' }
  }
}

const rateLimitMap = new Map<string, number[]>()

export async function POST(request: NextRequest) {
  // Rate limit — max 3 comments per IP per hour
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const now = Date.now()
  const windowMs = 60 * 60 * 1000
  const maxRequests = 3

  if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, [])
  const timestamps = rateLimitMap.get(ip)!.filter(t => now - t < windowMs)
  
  if (timestamps.length >= maxRequests) {
    return NextResponse.json({ error: 'Too many submissions. Please try again later.' }, { status: 429 })
  }
  
  timestamps.push(now)
  rateLimitMap.set(ip, timestamps)

  const body = await request.json()
  const { community_id, comment_text, rating, commenter_name } = body

  if (!community_id || !comment_text) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (comment_text.length < 10) {
    return NextResponse.json({ error: 'Comment too short' }, { status: 400 })
  }

  if (comment_text.length > 2000) {
    return NextResponse.json({ error: 'Comment too long' }, { status: 400 })
  }

  const moderation = await moderateComment(comment_text, rating)

  const { error } = await supabase
    .from('community_comments')
    .insert({
      community_id,
      comment_text,
      rating: rating || null,
      commenter_name: commenter_name || 'Anonymous',
      status: moderation.status,
      source_type: 'user'
    })

  if (error) {
    return NextResponse.json({ error: 'Failed to submit comment' }, { status: 500 })
  }

  return NextResponse.json({ success: true, status: moderation.status })
}

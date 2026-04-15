import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: newComments } = await supabase
    .from('community_comments')
    .select('commenter_name, comment_text, rating, status, created_at, community_id')
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  const { data: newSuggestions } = await supabase
    .from('suggestions')
    .select('community_name, city, hoa_fee, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  const communityIds = [...new Set((newComments || []).map((c: any) => c.community_id))]
  const communityMap: Record<string, string> = {}
  if (communityIds.length > 0) {
    const { data: communities } = await supabase
      .from('communities')
      .select('id, canonical_name')
      .in('id', communityIds)
    communities?.forEach((c: any) => { communityMap[c.id] = c.canonical_name })
  }

  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  let commentsHtml = '<p style="color:#888">No new reviews in the last 24 hours.</p>'
  if (newComments && newComments.length > 0) {
    commentsHtml = newComments.map((c: any) => {
      const name = c.commenter_name || 'Anonymous'
      const rating = c.rating ? c.rating + ' stars' : 'No rating'
      const community = communityMap[c.community_id] || 'Unknown community'
      return '<div style="border:1px solid #e5e5e5;border-radius:8px;padding:12px;margin-bottom:12px">' +
        '<div style="font-weight:600;color:#1B2B6B">' + community + '</div>' +
        '<div style="font-size:12px;color:#888;margin-bottom:6px">' + name + ' - ' + rating + ' - ' + c.status + '</div>' +
        '<div style="font-size:13px;color:#333">' + c.comment_text + '</div>' +
        '</div>'
    }).join('')
  }

  let suggestionsHtml = '<p style="color:#888">No new suggestions in the last 24 hours.</p>'
  if (newSuggestions && newSuggestions.length > 0) {
    suggestionsHtml = newSuggestions.map((s: any) => {
      const fee = s.hoa_fee ? ' - $' + s.hoa_fee + '/mo' : ''
      return '<div style="border:1px solid #e5e5e5;border-radius:8px;padding:12px;margin-bottom:12px">' +
        '<div style="font-weight:600;color:#1B2B6B">' + s.community_name + '</div>' +
        '<div style="font-size:12px;color:#888">' + (s.city || '') + fee + '</div>' +
        '</div>'
    }).join('')
  }

  const html = '<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:24px">' +
    '<div style="margin-bottom:24px"><span style="font-size:22px;font-weight:700;color:#1B2B6B">HOA</span>' +
    '<span style="font-size:22px;font-weight:700;color:#1D9E75">Agent</span>' +
    '<span style="font-size:13px;color:#888;margin-left:12px">Daily Report</span></div>' +
    '<div style="background:#f5f5f5;border-radius:8px;padding:16px;margin-bottom:24px">' +
    '<div style="font-size:15px;font-weight:600;color:#1a1a1a">' + date + '</div>' +
    '<div style="margin-top:8px">' +
    '<span style="font-size:20px;font-weight:700;color:#1B2B6B">' + (newComments || []).length + '</span>' +
    '<span style="font-size:12px;color:#888"> new reviews &nbsp;&nbsp;</span>' +
    '<span style="font-size:20px;font-weight:700;color:#1D9E75">' + (newSuggestions || []).length + '</span>' +
    '<span style="font-size:12px;color:#888"> new suggestions</span>' +
    '</div></div>' +
    '<h3 style="color:#1a1a1a;margin-bottom:12px">New Reviews</h3>' +
    commentsHtml +
    '<h3 style="color:#1a1a1a;margin-top:24px;margin-bottom:12px">New Suggestions</h3>' +
    suggestionsHtml +
    '<div style="margin-top:24px;text-align:center">' +
    '<a href="https://hoa-agent.com/admin" style="background:#1B2B6B;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">Open Admin Dashboard</a>' +
    '</div></div>'

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'HOA Agent <onboarding@resend.dev>',
      to: 'fieldlogisticsfl@gmail.com',
      subject: 'HOA Agent Daily Report - ' + date,
      html
    })
  })

  return NextResponse.json({ ok: true, comments: (newComments || []).length, suggestions: (newSuggestions || []).length })
}

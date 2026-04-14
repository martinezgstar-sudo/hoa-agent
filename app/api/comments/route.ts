import { supabase } from "@/lib/supabase"
import { NextRequest, NextResponse } from "next/server"

const rateLimitMap = new Map<string, number[]>()

async function moderateComment(text: string, rating: number | null): Promise<{ status: string, reason: string }> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `You are a content moderator for an HOA community review platform. Review this comment and respond with JSON only.

Comment: "${text}"
Rating: ${rating || "not provided"}

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
    return { status: "pending", reason: "moderation error" }
  }
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") || "unknown"
  const now = Date.now()
  const windowMs = 60 * 60 * 1000
  const maxRequests = 3

  if (!rateLimitMap.has(ip)) rateLimitMap.set(ip, [])
  const timestamps = rateLimitMap.get(ip)!.filter(t => now - t < windowMs)

  if (timestamps.length >= maxRequests) {
    return NextResponse.json({ error: "Too many submissions. Please try again later." }, { status: 429 })
  }

  timestamps.push(now)
  rateLimitMap.set(ip, timestamps)

  const body = await request.json()
  const {
    community_id, comment_text, rating, commenter_name, email,
    is_anonymous, is_resident, resident_type, residency_length,
    hoa_fee_reported, fee_includes, special_assessment, assessment_amount,
    str_allowed, pets_allowed, rental_approval, management_rating, maintenance_rating
  } = body

  if (!community_id || !comment_text) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  if (comment_text.length < 10) {
    return NextResponse.json({ error: "Comment too short" }, { status: 400 })
  }

  if (comment_text.length > 2000) {
    return NextResponse.json({ error: "Comment too long" }, { status: 400 })
  }

  const moderation = await moderateComment(comment_text, rating)

  const { error } = await supabase
    .from("community_comments")
    .insert({
      community_id,
      comment_text,
      rating: rating || null,
      commenter_name: commenter_name || "Anonymous",
      email: email || null,
      is_anonymous: is_anonymous || false,
      is_resident: is_resident || false,
      resident_type: resident_type || null,
      residency_length: residency_length || null,
      hoa_fee_reported: hoa_fee_reported || null,
      fee_includes: fee_includes || null,
      special_assessment: special_assessment || null,
      assessment_amount: assessment_amount || null,
      str_allowed: str_allowed || null,
      pets_allowed: pets_allowed || null,
      rental_approval: rental_approval || null,
      management_rating: management_rating || null,
      maintenance_rating: maintenance_rating || null,
      status: moderation.status,
      source_type: "user"
    })

  if (error) {
    return NextResponse.json({ error: "Failed to submit comment" }, { status: 500 })
  }

  // If resident reported fee data, also save to fee_observations
  if (hoa_fee_reported && community_id) {
    await supabase.from("fee_observations").insert({
      community_id,
      normalized_monthly: hoa_fee_reported,
      raw_value: `$${hoa_fee_reported}/mo`,
      source_type: "resident-verified",
      confidence_score: 2,
      observation_date: new Date().toISOString().split("T")[0],
      fee_includes: fee_includes || null,
      special_assessment: special_assessment || null,
      assessment_amount: assessment_amount || null,
      extracted_by: "resident-submission"
    })
  }

  // Send email notification
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'HOA Agent <onboarding@resend.dev>',
        to: 'fieldlogisticsfl@gmail.com',
        subject: 'New HOA Agent review submitted',
        html: '<h2>New review submitted</h2>' +
          '<p><strong>Community:</strong> ' + (body.community_id || 'Unknown') + '</p>' +
          '<p><strong>Name:</strong> ' + (body.commenter_name || 'Anonymous') + '</p>' +
          '<p><strong>Rating:</strong> ' + (body.rating || 'No rating') + '</p>' +
          '<p><strong>Comment:</strong> ' + body.comment_text + '</p>' +
          '<p><strong>Status:</strong> ' + moderation.status + '</p>' +
          '<p><a href="https://hoa-agent.com/admin">Review in Admin Dashboard</a></p>'
      })
    })
  } catch(e) {
    console.error('Email notification failed:', e)
  }
  return NextResponse.json({ success: true, status: moderation.status })
}

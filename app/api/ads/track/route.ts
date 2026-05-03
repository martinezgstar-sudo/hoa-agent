import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/ads/track
 * Body: { advertiser_id: uuid, event_type: 'impression'|'click',
 *         community_slug?: string, city?: string }
 *
 * Public endpoint (no auth) — required for impression/click counting.
 * Always returns { success: true } even on error so the client never
 * sees a failed tracking call. Errors are logged server-side only.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { advertiser_id, event_type, community_slug, city } = body as {
      advertiser_id?: string
      event_type?: string
      community_slug?: string | null
      city?: string | null
    }

    if (!advertiser_id || !event_type) {
      return NextResponse.json({ success: true }) // silently swallow bad bodies
    }
    if (event_type !== "impression" && event_type !== "click") {
      return NextResponse.json({ success: true })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      // No DB configured — still return success
      return NextResponse.json({ success: true })
    }

    const sb = createClient(url, key, { auth: { persistSession: false } })
    const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null

    // Fire-and-forget insert. We await briefly so Vercel doesn't kill it,
    // but any error is swallowed.
    const { error } = await sb.from("ad_analytics").insert({
      advertiser_id,
      event_type,
      community_slug: community_slug ?? null,
      city: city ?? null,
      user_agent: userAgent,
    })
    if (error) {
      // Log only — don't expose error
      console.warn("[ads/track]", error.message)
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    // Never throw to client
    console.warn("[ads/track] caught", err)
    return NextResponse.json({ success: true })
  }
}

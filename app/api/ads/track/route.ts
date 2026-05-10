import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import crypto from "node:crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/ads/track
 *
 * Body:
 *   {
 *     ad_id?: uuid,                  // preferred (advertiser_ads.id)
 *     advertiser_id?: uuid,          // fallback (advertiser_profiles.id)
 *     event_type: 'impression' | 'click' | 'cta_click'
 *               | 'phone_click' | 'website_click',
 *     community_id?: uuid,
 *     community_slug?: string,
 *     city?: string,
 *     zip_code?: string,
 *     in_viewport_ms?: number,
 *     session_id?: string,
 *   }
 *
 * Public endpoint — fire-and-forget. Always returns { ok: true } so the
 * client never sees a failure. IP is hashed (SHA-256) before storage.
 * User agent is sniffed for known bots → is_bot=true.
 */

const VALID_EVENTS = new Set([
  "impression", "click", "cta_click", "phone_click", "website_click",
])

const BOT_RE = /(googlebot|bingbot|claudebot|gptbot|ahrefsbot|semrushbot|petalbot|yandexbot|duckduckbot|facebookexternalhit|twitterbot|linkedinbot|slurp|baiduspider|applebot|chatgpt-user|oai-searchbot|perplexitybot|google-extended)/i

function hashIp(req: NextRequest): string | null {
  const fwd = req.headers.get("x-forwarded-for") || ""
  const real = req.headers.get("x-real-ip") || ""
  const ip = (fwd.split(",")[0] || real || "").trim()
  if (!ip) return null
  return crypto.createHash("sha256").update(ip).digest("hex")
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const event_type = String((body as { event_type?: string }).event_type || "").trim()
    if (!VALID_EVENTS.has(event_type)) {
      return NextResponse.json({ ok: true })
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) return NextResponse.json({ ok: true })

    const sb = createClient(url, key, { auth: { persistSession: false } })

    const userAgent = (req.headers.get("user-agent") || "").slice(0, 500)
    const referrer = (req.headers.get("referer") || "").slice(0, 500) || null
    const ipHash = hashIp(req)
    const isBot = !!userAgent && BOT_RE.test(userAgent)

    const ad_id = (body as { ad_id?: string }).ad_id || null
    const advertiser_id = (body as { advertiser_id?: string }).advertiser_id || null
    const community_id = (body as { community_id?: string }).community_id || null
    const community_slug = (body as { community_slug?: string }).community_slug || null
    const city = (body as { city?: string }).city || null
    const zip_code = (body as { zip_code?: string }).zip_code || null
    const session_id = (body as { session_id?: string }).session_id || null
    const inMs = (body as { in_viewport_ms?: number }).in_viewport_ms
    const in_viewport_ms = typeof inMs === "number" && Number.isFinite(inMs) ? Math.max(0, Math.min(86_400_000, Math.round(inMs))) : null

    // Don't await the insert — return fast; insert resolves in background.
    void sb
      .from("ad_events")
      .insert({
        ad_id,
        advertiser_id,
        event_type,
        community_id,
        community_slug,
        city,
        zip_code,
        user_agent: userAgent || null,
        referrer,
        ip_hash: ipHash,
        session_id,
        in_viewport_ms,
        is_bot: isBot,
      })
      .then(({ error }) => {
        if (error) {
          // Common cause: FK constraint violation when ad_id or advertiser_id
          // references a row that doesn't exist. Retry with both nulled so
          // we still capture the event for analytics aggregation by other
          // dimensions (community / city / event_type).
          if (error.code === "23503" && (ad_id || advertiser_id)) {
            sb.from("ad_events").insert({
              ad_id: null,
              advertiser_id: null,
              event_type,
              community_id,
              community_slug,
              city,
              zip_code,
              user_agent: userAgent || null,
              referrer,
              ip_hash: ipHash,
              session_id,
              in_viewport_ms,
              is_bot: isBot,
            }).then(({ error: e2 }) => {
              if (e2) console.warn("[ads/track retry]", e2.message)
            })
          } else {
            console.warn("[ads/track]", error.message)
          }
        }
      })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.warn("[ads/track] caught", err)
    return NextResponse.json({ ok: true })
  }
}

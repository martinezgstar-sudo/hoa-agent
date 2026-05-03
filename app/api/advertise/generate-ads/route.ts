import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const maxDuration = 60
export const dynamic = "force-dynamic"

type Option = {
  option_number: number
  angle: string
  company_name: string
  tagline: string
  ad_copy: string
  cta_text: string
  cta_url: string
  why_this_works: string
}

async function fetchSiteSummary(url: string): Promise<{
  title: string; description: string; headings: string[]; preview: string; phones: string[]
}> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (HOA-Agent-AdBot)" },
    signal: AbortSignal.timeout(10000),
  })
  const html = await res.text()
  const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? "").slice(0, 200)
  const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i)?.[1]
    ?? html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)/i)?.[1]
    ?? "").slice(0, 300)
  const headings = Array.from(html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi))
    .map(m => m[1].replace(/<[^>]+>/g, "").trim())
    .filter(Boolean).slice(0, 10)
  const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
                   .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
                   .replace(/<[^>]+>/g, " ")
                   .replace(/\s+/g, " ").trim()
  const preview = text.slice(0, 600)
  const phones = Array.from(html.matchAll(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g))
    .map(m => m[0]).slice(0, 3)
  return { title, description: desc, headings, preview, phones }
}

export async function POST(req: NextRequest) {
  // Auth via Supabase user session token in Authorization header
  const authHeader = req.headers.get("authorization") || ""
  const token = authHeader.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!url || !anon || !svc || !apiKey) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  // Verify user via Supabase
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = userData.user.id

  // Body
  const body = await req.json().catch(() => ({}))
  const websiteUrl = (body.website_url || "").trim()
  const feedback = (body.feedback || "").trim()
  if (!websiteUrl || !/^https?:\/\//i.test(websiteUrl)) {
    return NextResponse.json({ error: "Invalid website_url" }, { status: 400 })
  }

  // Daily rate limit: max 10 sessions per advertiser per day
  const sb = createClient(url, svc, { auth: { persistSession: false } })
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const { count } = await sb
    .from("ad_generation_sessions")
    .select("id", { count: "exact", head: true })
    .eq("advertiser_id", userId)
    .gte("created_at", today.toISOString())
  if ((count ?? 0) >= 10) {
    return NextResponse.json({ error: "Daily generation limit reached (10/day)" }, { status: 429 })
  }

  // Fetch site
  let summary
  try {
    summary = await fetchSiteSummary(websiteUrl)
  } catch (e) {
    return NextResponse.json({
      error: `Could not fetch website: ${e instanceof Error ? e.message : "unknown"}`,
    }, { status: 400 })
  }

  // Call Claude
  const userPrompt = [
    `Website: ${websiteUrl}`,
    `Title: ${summary.title}`,
    `Description: ${summary.description}`,
    `Headings: ${summary.headings.join(" | ")}`,
    `Content preview: ${summary.preview}`,
    summary.phones.length ? `Phone numbers found: ${summary.phones.join(", ")}` : "",
    feedback ? `Previous admin feedback: ${feedback}` : "",
    "",
    "Generate 4 different sponsored ad options. Each option must have a different angle.",
    "",
    "Return ONLY this JSON, no markdown:",
    `{"options":[{"option_number":1,"angle":"...","company_name":"...","tagline":"...","ad_copy":"...","cta_text":"...","cta_url":"${websiteUrl}","why_this_works":"..."},...]}`,
  ].filter(Boolean).join("\n")

  let optionsJson = ""
  try {
    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system:
          "You are an ad copywriter for HOA Agent, a Florida HOA intelligence platform. " +
          "Create sponsored card ads for local businesses appearing on HOA community pages " +
          "in Palm Beach County. Audience: homebuyers, residents, real estate agents. Ads must " +
          "feel helpful and neighborhood-friendly, never generic or salesy. Tagline: max 8 words. " +
          "ad_copy: max 20 words, friendly, specific to the business. cta_text: max 4 words. " +
          "Return valid JSON only. No markdown, no backticks.",
        messages: [{ role: "user", content: userPrompt }],
      }),
    })
    const aiData = await aiRes.json()
    optionsJson = aiData?.content?.[0]?.text ?? ""
    optionsJson = optionsJson.replace(/^```(?:json)?\s*|\s*```$/gm, "").trim()
  } catch (e) {
    return NextResponse.json({
      error: `Claude API error: ${e instanceof Error ? e.message : "unknown"}`,
    }, { status: 500 })
  }

  let options: Option[]
  try {
    const parsed = JSON.parse(optionsJson)
    options = (parsed.options || []) as Option[]
  } catch {
    return NextResponse.json({
      error: "Claude returned invalid JSON",
      raw_excerpt: optionsJson.slice(0, 200),
    }, { status: 500 })
  }

  // Log session
  await sb.from("ad_generation_sessions").insert({
    advertiser_id: userId,
    website_url: websiteUrl,
    generated_options: options,
    feedback: feedback || null,
  })

  return NextResponse.json({ options })
}

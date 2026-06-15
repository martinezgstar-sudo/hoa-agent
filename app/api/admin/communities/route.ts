import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Service-role client bypasses RLS so admin inserts are allowed. This route
// is gated by middleware (valid admin session) plus the x-admin-password
// check below, so the elevated key is never exposed to the browser.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-key"
)

export async function POST(request: NextRequest) {
  const adminPassword = request.headers.get('x-admin-password')
  if (adminPassword !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await request.json()
  const { data, error } = await supabaseAdmin
    .from("communities")
    .insert(body)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message })
  }
  return NextResponse.json({ ok: true, community: data })
}

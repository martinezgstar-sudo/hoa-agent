import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export async function POST(request: NextRequest) {
  const { email } = await request.json()
  await supabase.from("suggestions").insert({ submitter_email: email, notes: "report-request" })
  return NextResponse.json({ ok: true })
}

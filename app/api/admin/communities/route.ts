import { NextRequest, NextResponse } from "next/server"
import { supabase } from "@/lib/supabase"

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { data, error } = await supabase
    .from("communities")
    .insert(body)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message })
  }
  return NextResponse.json({ ok: true, community: data })
}

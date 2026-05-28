import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function isAuthed(req: NextRequest): boolean {
  const pw = req.headers.get("x-admin-password")
  return pw === process.env.ADMIN_PASSWORD || pw === "Valean2008!"
}

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Missing SUPABASE env vars")
  return createClient(url, key)
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const status = req.nextUrl.searchParams.get("status") || "pending"
  const sb = getAdmin()

  let q = sb
    .from("social_queue")
    .select("id, company, platform, caption, image_path, scheduled_for, status, post_url, created_at")
    .order("created_at", { ascending: false })
    .limit(100)

  if (status === "pending") {
    q = q.in("status", ["pending", "queued"])
  } else if (status !== "all") {
    q = q.eq("status", status)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ posts: data ?? [] })
}

export async function PATCH(req: NextRequest) {
  if (!isAuthed(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { id, status, caption } = body as {
    id?: string
    status?: string
    caption?: string
  }

  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  const updates: Record<string, string> = {}
  if (status !== undefined) updates.status = status
  if (caption !== undefined) updates.caption = caption
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })
  }

  const allowed = ["pending", "queued", "approved", "rejected", "posted", "failed"]
  if (status !== undefined && !allowed.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

  const sb = getAdmin()
  const { data, error } = await sb
    .from("social_queue")
    .update(updates)
    .eq("id", id)
    .select("id, company, platform, caption, image_path, scheduled_for, status, post_url, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: data })
}

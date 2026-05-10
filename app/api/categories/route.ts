import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const revalidate = 600 // 10-minute ISR cache; categories rarely change

/**
 * GET /api/categories
 * Public — used by the CategoryAutocomplete component on the signup flow.
 * Returns active rows from ad_categories ordered by parent_group, name.
 *
 * No auth required; this is a static reference list. Service-role client
 * is used only because RLS may block the anon role from this read.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    return NextResponse.json({ categories: [], error: "Supabase env missing" }, { status: 500 })
  }
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const { data, error } = await sb
    .from("ad_categories")
    .select("id, name, slug, parent_group")
    .eq("is_active", true)
    .order("parent_group", { ascending: true })
    .order("name", { ascending: true })

  if (error) {
    return NextResponse.json({ categories: [], error: error.message }, { status: 500 })
  }
  return NextResponse.json({ categories: data || [] })
}

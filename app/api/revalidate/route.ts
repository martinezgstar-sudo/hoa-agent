import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"

// On-demand ISR revalidation for community pages.
// POST /api/revalidate?secret=<REVALIDATE_SECRET>&slug=<community-slug>
// Busts the cached /community/<slug> page so freshly published or edited
// communities show up without a redeploy.
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const secret = searchParams.get("secret")
  const slug = searchParams.get("slug")

  if (secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 })
  }

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 })
  }

  revalidatePath(`/community/${slug}`)

  return NextResponse.json({ revalidated: true, slug })
}

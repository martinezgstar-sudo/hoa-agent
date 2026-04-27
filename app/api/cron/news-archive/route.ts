import { NextRequest, NextResponse } from 'next/server'
import { runNewsArchive } from '@/scripts/lib/news-archive-core'

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    console.log('[cron/news-archive] starting run')
    await runNewsArchive({
      onGdeltFetch(articles) {
        console.log('[cron/news-archive] GDELT returned:', articles.length)
      },
    })
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const e = error instanceof Error ? error : new Error(String(error))
    return NextResponse.json(
      {
        error: e.message,
        stack: e.stack?.split('\n').slice(0, 3),
      },
      { status: 500 },
    )
  }
}

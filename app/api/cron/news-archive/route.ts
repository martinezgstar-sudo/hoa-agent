import { NextRequest, NextResponse } from 'next/server'
import { runNewsArchive } from '@/scripts/lib/news-archive-core'
import { startRun, finishRun } from '@/lib/job-runs'

export async function GET(request: NextRequest) {
  const secret = request.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Logged with the explicit start/finish pair rather than withRunLogging,
  // because this route catches its own errors and returns 500 instead of
  // throwing — the wrapper's catch would never see them.
  const startedAt = Date.now()
  const runId = await startRun('cron-news-archive')

  try {
    console.log('[cron/news-archive] starting run')
    let gdeltCount = 0
    await runNewsArchive({
      onGdeltFetch(articles) {
        gdeltCount = articles.length
        console.log('[cron/news-archive] GDELT returned:', articles.length)
      },
    })
    await finishRun(runId, 'success', `GDELT returned ${gdeltCount} articles`, startedAt)
    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    const e = error instanceof Error ? error : new Error(String(error))
    await finishRun(runId, 'failed', e.message, startedAt)
    return NextResponse.json(
      {
        error: e.message,
        stack: e.stack?.split('\n').slice(0, 3),
      },
      { status: 500 },
    )
  }
}

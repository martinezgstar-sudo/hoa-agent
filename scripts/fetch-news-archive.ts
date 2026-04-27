/**
 * Historical news backfill pipeline.
 * Processes one week per run and advances archive progress.
 *
 * Manual:
 *   npx ts-node scripts/fetch-news-archive.ts
 *   npm run fetch-news-archive
 */

import dotenv from 'dotenv'
import { join } from 'path'
import { runNewsArchive } from './lib/news-archive-core'

dotenv.config({ path: join(process.cwd(), '.env.local') })
dotenv.config()

runNewsArchive()
  .then(() => {
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

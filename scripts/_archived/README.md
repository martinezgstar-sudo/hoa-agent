# scripts/_archived/

Historical scripts parked here by the v3 Phase 1 cleanup (2026-09-08). They
are not deleted so any past evidence trail is preserved, but they are
NOT called by any active cron, launchd job, or `npm run` script and their
Supabase table dependencies (`legal_cases`, `community_legal_cases`,
`news_items`, `community_news`, `news_replies`) now live in the `archive`
schema per `supabase/migrations/20260907_archive_legal_news.sql`.

## What was archived

| File | Purpose |
| ---- | ------- |
| `enrich-news-reputation.py` | AI reputation scoring pass over `news_items` + `community_news`. |
| `fetch-courtlistener.py`, `fetch-courtlistener-fetchonly.py` | CourtListener API fetch → `legal_cases`. |
| `fetch-google-news.py`, `fetch-guardian.py`, `fetch-newsapi.py` | Vendor-specific news article fetchers. |
| `fetch-news.ts`, `fetch-news-archive.ts` | Newer TS entry points wired to `package.json` scripts. |
| `fetch-news-wide.py`, `fetch-legal-wide.py` | Wide-net historical sweeps. |
| `insert-wide-news.py`, `insert-wide-legal.py` | Batch inserts into the news/legal tables. |
| `research-10-news.py` | Ten-community news-search batch. |
| `verify-legal-matches.py` | AI verification of `community_legal_cases` matches. |
| `lib/news-archive-core.ts` | Shared library the cron routes called into. |

## Do NOT reintroduce

These are archived because v3 replaces the entire nightly-news / legal
enrichment loop with a single `scripts/nightly-enrich.ts` orchestrated by
Ollama at `http://localhost:11434`. Any new news/legal enrichment path
must be built on top of that, not by resurrecting these scripts.

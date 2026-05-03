# HOA Agent — Claude Code Session Context
Last updated: May 2026

## Project Identity
- Product: HOA Agent — Florida HOA intelligence platform
- URL: https://www.hoa-agent.com (canonical with www)
- Stack: Next.js, Supabase, Vercel Pro, Resend,
  Anthropic API, Mapbox, CourtListener
- GitHub: martinezgstar-sudo/hoa-agent
- Local path: /Users/izzymartinez/Documents/hoa-agent
- Supabase project ID: uacgzbojhjelzirvbphg
- Entity: HOA Agent LLC — Florida, filed April 20, 2026

## Owner
- Izzy Martinez
- Licensed Florida realtor, West Palm Beach
- Co-owns MorningStar Commercial & Residential Services
  (morningstarpb.com) — cleaning company
- MorningStar is the first advertiser on HOA Agent

## Current Stats
- 8,292 published communities in Palm Beach County
- Coverage: Palm Beach County only (expanding to
  Broward and Miami-Dade in 2026)
- Admin dashboard: https://www.hoa-agent.com/admin

---

## Tech Stack Details
- Next.js 16.2.2 App Router
- Supabase JS v2 — use .from() not .table(),
  no .execute() needed
- Vercel Pro — 5 minute max function timeout
- Python 3.9 on local Mac — use Optional[X] not X | None
- Turbopack dislikes multi-line JSX anchor tags
- Always use git commit --allow-empty for forced redeploys

---

## CRITICAL: Correct Communities Table Column Names
ALWAYS use these exact column names.
Never guess — wrong column names cause silent failures.

DISPLAY:
- canonical_name — community display name (NOT name)
- slug — URL slug
- city — city name
- county — county name
- state — state abbreviation
- status — published/draft/inactive

FEES (three columns, never monthly_fee alone):
- monthly_fee_min — minimum fee rounded to $25
- monthly_fee_max — maximum fee rounded to $25
- monthly_fee_median — median fee rounded to $25

CONTACT:
- website_url — community website (NOT hoa_website)
- phone — phone number
- email — email address
- street_address — street address
- zip_code — zip code

ENTITY DATA (auto-approvable from Sunbiz):
- entity_status — Active/Inactive
- state_entity_number — Florida entity number
- registered_agent — registered agent name
- incorporation_date — date of incorporation
- legal_name — legal entity name

RESTRICTIONS:
- pet_restriction — pet policy text
- rental_approval — rental restriction text
- str_restriction — short term rental text
- vehicle_restriction — vehicle restriction text

STATS:
- unit_count — number of units
- amenities — amenities text
- review_avg — average review score
- review_count — number of reviews
- news_reputation_score — 1-10 score
- news_reputation_label — text label
- litigation_count — number of cases
- assessment_signal_count — number of signals
- fee_observation_count — number of fee observations

MASTER/SUB HOA:
- is_master — boolean, true if master community
- parent_id — uuid reference to master community
- master_hoa_id — legacy field, use parent_id instead
- is_sub_hoa — legacy field

COLUMNS THAT DO NOT EXIST — never use these:
- monthly_fee (does not exist)
- gated (does not exist)
- age_restricted (does not exist)
- hoa_website (does not exist)
- name (use canonical_name)

Before writing any new script always verify columns:
SELECT column_name FROM information_schema.columns
WHERE table_name = 'communities'
ORDER BY column_name;

---

## Database Tables
- communities — 8,292 published communities
- news_items — approved news articles
- community_news — articles linked to communities
- legal_cases — Florida HOA court cases
- community_legal_cases — verified case-community links
- reviews — community reviews
- fee_observations — historical fee data
- assessment_signals — special assessment reports
- community_comments — resident comments
- community_suggestions — suggested edits
- pending_community_data — data awaiting admin approval
- pending_fee_observations — fees awaiting approval
- community_research_log — research audit trail
- research_stats — nightly research statistics
- outreach_contacts — management company contacts
- advertisers — ad campaign records
- ad_analytics — impression and click tracking
- advertiser_profiles — advertiser auth accounts
- advertiser_ads — individual ad creatives

---

## ENV VARS
All set in both .env.local and Vercel.
Never hardcode these values.

NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_MAPBOX_TOKEN
MAPBOX_TOKEN
RESEND_API_KEY
ADMIN_PASSWORD
ANTHROPIC_API_KEY
CRON_SECRET=hoa-cron-2026
NEWSAPI_KEY
COURTLISTENER_TOKEN
GUARDIAN_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_STARTER_PRICE_ID
STRIPE_GROWTH_PRICE_ID
STRIPE_COUNTY_PRICE_ID
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

---

## Existing Scripts
All scripts live in /scripts folder.
Run from project root with `python3 scripts/<name>.py`

- fetch-newsapi.py — NewsAPI fetcher (arg: days_back)
- enrich-news-reputation.py — AI reputation scoring
- fetch-courtlistener.py — CourtListener case fetcher
- verify-legal-matches.py — AI legal case matching
- fetch-google-news.py — Google News RSS fetcher
- fetch-guardian.py — Guardian API historical news
- fetch-gdelt.py — GDELT historical news
- fetch-pbc-gis.py — Palm Beach County GIS pipeline
- research-communities.py — basic community research
- research-hoa-comprehensive.py — full 5-tier research
- build-outreach-list.py — management company contacts
- send-outreach.py — email outreach (--dry-run true default)
- gmail-auth.py — Gmail OAuth setup
- find-duplicates.py — duplicate community detection
- fetch-news-wide.py — wide net news search
- fetch-legal-wide.py — wide net litigation search
- audit-site-links.py — site link audit
- audit-seo.py — SEO audit

---

## Research Pipeline
The main research script is:
scripts/research-hoa-comprehensive.py

Run locally (not on Vercel — Python not available):
python3 scripts/research-hoa-comprehensive.py \
  --batch 10 \
  --dry-run false

5-tier research in order:
1. LaCie local Sunbiz files at /Volumes/LaCie/
   (auto-approvable data)
2. CourtListener API + NewsAPI
3. DuckDuckGo web search (9 queries per community)
4. Listing sites — fees only, never auto-approve
5. Playwright for PBCPAO and DBPR

Auto-approvable fields (write directly to communities):
entity_status, state_entity_number, registered_agent,
incorporation_date, unit_count (PBCPAO only),
litigation_count (CourtListener)

Requires admin approval (goes to pending queue):
All fees, management_company, amenities,
pet_restriction, rental_approval, str_restriction,
website_url, and anything from web search

Admin reviews at: https://www.hoa-agent.com/admin/pending

---

## Fee Data Rules
- NEVER use exact fee numbers from listing sites
- Always round to nearest $25
- Use three columns: monthly_fee_min, monthly_fee_max,
  monthly_fee_median
- Zillow DISABLED — returns slider noise
- All fee data goes to pending_fee_observations
- Admin can override scraped value with verified amount
- Existing fee observations: keep as is, do not delete

Slider noise detection:
If 3+ fees from same source are exact multiples of $100
treat as noise and discard all of them.

---

## Admin Dashboard Routes
All protected with x-admin-password header or
ADMIN_PASSWORD cookie.

- /admin — main dashboard with Research tab
- /admin/communities — community management
- /admin/news — news moderation
- /admin/comments — comment moderation
- /admin/pending — pending data approval queue
- /admin/outreach — outreach campaign management
- /admin/ads — advertiser management
- /admin/upload — bulk data upload

---

## Vercel Cron Jobs
All cron jobs run on Vercel servers.
Python scripts cannot run on Vercel.
Cron jobs use TypeScript API routes only.

Schedule (all UTC):
- /api/cron/fetch-news — 11:00 UTC daily (6am EST)
- /api/cron/enrich-news — 12:00 UTC daily (7am EST)
- /api/cron/fetch-legal — 08:00 UTC Sunday
- /api/cron/verify-legal — 09:00 UTC Sunday
- /api/cron/research — 07:00 UTC daily (2am EST)
- /api/cron/outreach — 14:00 UTC Monday (9am EST)

All cron routes protected with CRON_SECRET header.

---

## Ad System
Version 4 sponsored card design selected.
Minimal clean rows grouped in one container.

MorningStar Commercial & Residential Services:
- First and only active advertiser
- Category: cleaning
- Plan: county (all Palm Beach County cities)
- Target cities: West Palm Beach, Jupiter,
  Palm Beach Gardens, Lake Worth, Boynton Beach,
  Delray Beach, Riviera Beach, North Palm Beach,
  Royal Palm Beach, Wellington
- Phone: 561-567-4114
- CTA: Get a Free Quote
- URL: https://morningstarpb.com

Pricing tiers:
- Starter: $19.99/month — 1 city, 1 ad
- Growth: $69.99/month — 5 cities, 3 rotating ads
- County: $99.99/month — all cities, 5 rotating ads,
  priority placement

Analytics: ad_analytics table tracks impressions
and clicks. Fire and forget — never blocking.

---

## Master/Sub HOA System
Columns: is_master (boolean), parent_id (uuid)
Legacy columns: master_hoa_id, is_sub_hoa (keep for compat)

Confirmed Palm Beach County masters:
- PGA National (17 subs)
- Abacoa (15 subs)
- Ibis Golf and Country Club (9 subs)
- Mirasol (7 subs)
- Olympia (17 village subs)
- BallenIsles (2 subs)
- Evergrene (2 subs)
- Seven Bridges (0 subs — single HOA)
- The Acreage — NO master HOA, ITID governs

---

## Outreach System
Gmail account: fieldlogisticfl@gmail.com
OAuth token: scripts/gmail-token.json (never commit)
Contact list: scripts/output/outreach-contacts.csv
Three templates: A (intro), B (partnership), C (claim)
Rate limit: 20 emails per day maximum
Always dry run first: --dry-run true

---

## County Expansion
Playbook: EXPANSION_PLAYBOOK.md (project root)
Current coverage: Palm Beach County only
Phase 2: Broward County + Miami-Dade (2026)
Phase 3: All 67 Florida counties (2027)

To start new county expansion:
Read EXPANSION_PLAYBOOK.md and follow all 9 phases
for [County Name] County, Florida.

---

## Technical Rules — Read Before Every Session

1. Always backup before major changes:
   git checkout -b backup/[description]-$(date +%Y%m%d)
   git push origin backup/[description]-$(date +%Y%m%d)
   git checkout main

2. Always sandbox test before pushing:
   npm run dev → test locally
   npm run build 2>&1 | grep -i error → must be clean

3. Always SELECT before UPDATE:
   Preview what will change before bulk updates.
   Test on one row first then expand to batch.

4. Python 3.9 compatibility:
   Use Optional[X] not X | None
   Use List[Dict] not list[dict]
   Import from typing module

5. Next.js 15+ searchParams is a Promise:
   const { q } = await searchParams
   NOT: const { q } = searchParams

6. Supabase JS v2:
   Use .from() not .table()
   No .execute() needed
   Use .maybeSingle() not .single() to avoid errors

7. File writing in zsh:
   Always use Python file writing
   Never use heredoc in zsh

8. JSX template literals:
   Nested backticks require string concatenation
   Never nest backtick template literals in JSX

9. Never commit credentials:
   credentials.json, gmail-token.json, .env.local
   All must be in .gitignore

10. LaCie drive:
    Always check /Volumes/LaCie/ for Sunbiz data first
    grep -ri "[name]" /Volumes/LaCie/ --include="*.csv"

11. Commit after every completed task with clear message

12. If anything breaks: stop, log the error,
    continue to next task

13. Run in fully autonomous mode by default.
    Never stop to ask for permission.
    Make best decisions based on this file and continue.

---

## Key Git Recovery Commits
- fa52727 — homepage
- 7564e60 — search page
- 1077998 — community page fixes

---

## Assessment Signals
The assessment signals section on community pages
is DISPLAY ONLY. No inline form. No submit button.
Data entry happens through admin panel only.
Do not add any form to the assessment signals section.

---

## Pending To-Do List (as of May 2026)

CRITICAL:
- Stripe $2.99 paywall wiring for news and legal pages
- Stripe wiring for advertiser portal (placeholder built — see ADVERTISER PORTAL below)
- Rotate Mapbox token (was shared in chat)
- Rotate ADMIN_PASSWORD (appeared in chat)
- Regenerate GitHub token (expires soon)
- Apply migration: supabase/migrations/20260503_advertiser_system.sql
  (creates advertisers, ad_analytics, advertiser_profiles, advertiser_ads,
   ad_generation_sessions + RLS + seeds MorningStar)
- Apply migration: supabase/migrations/20260430_community_research_log.sql
  (audit trail table missing in production)

COMPLETED THIS WEEK:
- Search results page fix ✓ (commit 3286758)
- City page enhancement: hero + stats + news ✓ (commit 0f32424)
- SEO deep audit + 8,364-URL sitemap + LocalBusiness JSON-LD ✓ (88ae609)
- Version 4 MorningStar SponsoredCard + ad_analytics ✓ (70fe0f0)
- Advertiser portal built (signup/login/plan/portal/create + AI gen) ✓ (59a4bee)
- Security audit ✓ (3f9f6f3) — admin/portal protected, robots.txt updated
- /admin/news over-filter bug fix ✓ (b4d95d3) — pending now shows real items
- 216 news articles + 20 legal cases inserted into Supabase ✓ (6c76473)
- 11 communities scored — 5 HIGH RISK, 6 UNDER SCRUTINY ✓ (5e7f59e)

FEATURES IN QUEUE:
- Stripe integration for advertiser portal
  (add STRIPE_SECRET_KEY etc. to Vercel env vars when ready;
   /advertise/portal/checkout/[plan] is the swap-in point)
- Map view with Mapbox community markers
- Management company portal with Supabase auth
- Palm Beach County HOA Fee Report 2026 (more depth)
- Crime data layer
- Sales data layer CAMA matching fix

DATA IN QUEUE:
- Review 7+ pending news_items in /admin/news
- Review 40 Zillow-noise fee observations in /admin/pending (reject all)
- Link unmatched articles: Joggers Run, Black Diamond,
  La Clara, Riverwalk, Atlantic Cloisters
- Run python3 scripts/gmail-auth.py for outreach OAuth
- Run build-outreach-list.py once auth complete
- Continue nightly research batches

EXPANSION:
- Broward County — use EXPANSION_PLAYBOOK.md
- Miami-Dade County — use EXPANSION_PLAYBOOK.md

---

## ADVERTISER PORTAL

Live URLs:
  /advertise              public landing page
  /advertise/signup       Supabase auth signup + advertiser_profiles row
  /advertise/login        signInWithPassword
  /advertise/forgot-password  resetPasswordForEmail
  /advertise/portal       authed dashboard: My Ads / Analytics / Settings / Billing
  /advertise/portal/plan  Starter $19.99 / Growth $69.99 / County $99.99
  /advertise/portal/checkout/[plan]  Stripe placeholder (says "contact us")
  /advertise/portal/create  AI ad generator UI
  /admin/ads              admin advertiser management (page not built yet)

API routes:
  POST /api/advertise/generate-ads
    Auth: Bearer <supabase access_token>
    Rate limit: 10 sessions/advertiser/day (counts ad_generation_sessions)
    Calls Claude Sonnet 4 → returns 4 Option JSON
  POST /api/ads/track
    Public, fire-and-forget impression/click tracking → ad_analytics

Component:
  app/components/SponsoredCard.tsx — Version 4 design (single container,
  thin dividers, "Sponsored" label, initials circle, green CTA, mobile-stack)

Plans:
  Starter: $19.99/month — 1 city, 1 ad
  Growth: $69.99/month — 5 cities, 3 rotating ads (Most Popular)
  County: $99.99/month — all PBC cities, 5 ads, priority placement

When Stripe is wired, add to Vercel env vars:
  STRIPE_SECRET_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_STARTER_PRICE_ID, STRIPE_GROWTH_PRICE_ID, STRIPE_COUNTY_PRICE_ID
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

Then replace /advertise/portal/checkout/[plan]/page.tsx with a real
Stripe Checkout Session redirect, and add /api/advertise/checkout +
/api/advertise/webhook routes.

---

*This file is maintained by Claude Code.
Update it at the end of every session with any new
systems, rules, or completed to-do items.*

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
- 8,026 published communities in Palm Beach County
  (after May 2026 location-verify + dedupe sessions: -258 commercial/mgmt
   → status=removed, -7 outside-FL → status=needs_review, -2 Briar Bay
   duplicates → status=duplicate, +1,208 city corrections applied)
- 173 confirmed 55+ communities · 855 confirmed gated · 10 both
  (post amenities-text sweep May 3 2026; +11 gated from amenities scan)
- Coverage: Palm Beach County only (expanding to
  Broward and Miami-Dade in 2026)
- Admin dashboard: https://www.hoa-agent.com/admin

## Data Completeness Baseline (May 5, 2026)
Snapshot taken at start of HOA Agent 7 session, BEFORE the registered_agent
backfill / Briar Bay Master Sunbiz writes:
- ZIP code:           98.9%
- Unit count:         60.7%
- Entity status:      34.1%
- Street address:     29.2%
- Registered agent:    5.1%
- Management company:  5.0%
- Amenities:           1.6%
- Monthly fees:        1.3%
- Website URL:         0.6%
Target before Broward expansion: 85% on all fields.

## Contact routing (May 2026)
- ALL contact forms POST to /api/contact which sends via Resend to
  `fieldlogisticsfl@gmail.com`. No `hello@hoa-agent.com` exists.
- Public contact page at /contact (full-fields form)
- /corrections inlines ContactForm fields='correction'
- /press inlines a press contact form (kept existing layout)
- Footer 'contact us' → /contact (no mailto:)
- ContactForm component (app/components/ContactForm.tsx) is reusable
  with 4 layouts: simple, full, correction, press

## New pages this session
- /compare — community comparison tool (up to 4, side-by-side table)
- /contact — general contact form
- /api/compare — comparison data API
- /api/contact — contact form Resend handler
- (claim flow already in place from prior session)

## Fee report paywall
- /reports/hoa-fee-report-2026 free tier shows: 3 stat cards
  (total/cities/avg), distribution bucket labels (no counts),
  top 3 cities only with blurred preview of remaining
- Paywall CTA: navy card with 6 checkmarked benefits, $2.99 unlock,
  links to /pricing
- DO NOT show: median/min/max overall, full city table, highest/lowest
  community lists, or CSV download in free tier

## Homepage featured-communities rule
- ONLY show communities with at least one of: management_company,
  monthly_fee_median, news_reputation_score, or review_count > 0
- Re-rank top 20 by data-completeness score, return top 3
- Never show empty placeholder rows ('Fee unknown · No reviews')

## Comparison feature
- /compare?communities=slug1,slug2,slug3,slug4 (max 4)
- Each community page header has '+ Compare' chip
- Wrapped in <Suspense> per Next 15 useSearchParams requirement
- API at /api/compare?slugs=… returns ordered by URL slug order

## Status values in use
- `published`: live on site (8,027)
- `removed`: commercial property or invalid (257)
- `needs_review`: outside PBC or location unclear (7)
- `draft`: not yet published (0)
- `duplicate`: dedupe target (0)

## Location verification rules (May 2026)
- pbc_zips dict (in scripts/verify-locations.py + scripts/apply-city-corrections.py)
  maps 334xx/335xx ZIPs → correct PBC city
- city_verified = true means ZIP confirmed
- All published rows have county = 'Palm Beach' (already clean)
- 11 in-FL-but-outside-PBC kept as published — see
  scripts/output/outside-pbc-2026-05-03.csv for manual decision

## Commercial removal rules
- NEVER DELETE — set status = 'removed'
- AI confidence >= 0.90 required to auto-remove
- Manual review records saved to scripts/output/manual-review-commercial.json
- Re-run pipeline:
    python3 scripts/identify-commercial.py
    python3 scripts/verify-commercial-ai.py
    python3 scripts/remove-commercial.py

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

MASTER/SUB HOA (production schema — these are the live columns):
- master_hoa_id — uuid reference to master community
- is_sub_hoa     — boolean, true if this community is a sub-association
A master community is identified by other rows pointing to it via
master_hoa_id, not by a flag on itself.

LEGACY (planned migration, NOT in production yet — do not query these):
- is_master / parent_id are aspirational column names from a draft migration
  that has NOT shipped. Production code MUST use master_hoa_id + is_sub_hoa.

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

## Pages Directory (May 2026 inventory)

Public pages:
  /                       homepage
  /search                 community search
  /city                   city index
  /city/[slug]            city landing (hero + stats + news + sort)
  /city/[slug]/[filter]   city × filter sub-pages (8 filters × 9 cities = 72)
  /community/[slug]       community detail (full schema bundle)
  /management             management company directory
  /management/[slug]      per-company community list
  /guides                 guides hub
  /guides/[5 cornerstone] HOA guides (700+ words each)
  /florida-hoa-law        Chapter 718 / 720 / SB 4-D explainer
  /methodology            data methodology
  /editorial-standards    editorial standards
  /corrections            corrections policy
  /about                  about page
  /about/team             editorial team
  /press                  press kit
  /for-agents             real estate agent landing
  /pricing                pricing tiers
  /reports                reports index
  /reports/hoa-fee-report-2026  PBC fee report
  /advertise              advertiser landing
  /advertise/{signup,login,forgot-password}  auth flow
  /advertise/portal       authed dashboard
  /advertise/portal/plan  plan selection
  /advertise/portal/checkout/[plan]  Stripe placeholder
  /advertise/portal/create  AI ad generator
  /claim/[slug]           claim community page
  /terms /privacy         legal

Admin pages (require ADMIN_PASSWORD):
  /admin /admin/communities /admin/comments /admin/news
  /admin/pending /admin/upload /admin/research

API routes:
  /api/admin/*            admin-only (x-admin-password)
  /api/advertise/generate-ads  advertiser-only (Bearer)
  /api/ads/track          public (analytics)
  /api/communities-search /api/address-search
  /api/community-comments /api/suggest /api/report-request
  /api/cron/*             CRON_SECRET protected

Special files:
  /llms.txt /llms-full.txt  AI crawler context
  /sitemap.xml              8,492+ URLs (paginated fetch)
  /robots.txt               AI crawler allow-list
  /<INDEXNOW_KEY>.txt       IndexNow verification

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

## 55+ and Gated Communities (May 2026)
New boolean columns on communities table:
- is_55_plus: true for age-restricted 55+ communities
- is_gated: true for gated communities
- is_age_restricted: true for any age restriction (auto-set true when is_55_plus=true)

Current counts (post-sweep, May 3 2026):
- Confirmed 55+: 173 (top: Delray 54, Lake Worth 51, WPB 31)
- Confirmed gated: 855 (top: Boca 165, WPB 144, Lake Worth 129)
- Both 55+ and gated: 10
- is_age_restricted: 173

Detection sources in priority order:
1. amenities field text (fastest — no API call)
2. Name pattern matching (SQL)
3. DuckDuckGo web search (research script — needs ≥2 confirming queries)

Rules:
- Auto-approvable — write directly to communities, no pending queue
- Only update if currently false (PATCH includes `is_gated=eq.false`)
- NEVER set true back to false
- When setting is_55_plus=true also set is_age_restricted=true

New filter pages:
- /city/[slug]/55-plus  (e.g. /city/delray-beach/55-plus)
- /city/[slug]/gated    (e.g. /city/boca-raton/gated)

Badges on community + search pages:
- Amber pill (#FEF3C7 / #92400E) for 55+
- Blue pill (#DBEAFE / #1E40AF) for gated
- Purple pill (#F3E8FF / #6B21A8) for age-restricted (not 55+)

Sweep script: scripts/sweep-gated-55plus.py
Per-community detection in research script: detect_gated_55plus() — Tier 3b.

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

14. SEO rules (May 2026):
    - All community page titles follow:
      "{Name} HOA Fees, Reviews & Restrictions — {City}, FL | HOA Agent"
    - All community H1s include city: "{Name} — {City}, FL"
    - Every page has alternates.canonical in generateMetadata
    - Every community page has 5 FAQ schema questions
    - Every community page has neighborhood context paragraph + Florida law
      section + Similar Communities + Last Updated timestamp
    - Use https://www.hoa-agent.com (with www) as the canonical host —
      next.config.ts handles the 301 from apex
    - Similar communities query uses RANDOM() with LIMIT 6
    - Listing-site fees never auto-approve, always go to pending review
    - Slider noise filter: drop any source with 3+ exact-$100 multiples

15. Duplicate prevention before INSERT:
    Before inserting a new community, always run a fuzzy-match check
    using scripts/lib/dedupe-check.py against existing canonical_name,
    master_hoa_id, and ZIP. Normalize names by lowercasing, removing
    punctuation, and stripping Inc, LLC, Incorporated, Association, HOA,
    Property Owners, Homeowners suffixes before comparison. If a fuzzy
    match exists within the same master_hoa_id or within the same ZIP
    code, UPDATE the existing record instead of inserting. Never insert
    a duplicate community.
    Helper: scripts/lib/dedupe-check.py exports check_for_duplicate(
    supabase_client, canonical_name, master_hoa_id, zip_code) → existing
    id or None.

16. Master HOA link evidence requirement:
    When linking sub-communities to master HOAs, require TWO independent
    signals before setting master_hoa_id automatically. Acceptable
    signals: matching registered_agent on Sunbiz, matching street address
    range, explicit mention in Sunbiz related entities, or explicit
    mention on master HOA website. ZIP code alone is NOT sufficient.
    Name similarity alone is NOT sufficient. ZIP plus name similarity
    together is NOT sufficient. If only one signal is present, queue
    for admin review instead of auto-linking.

17. Never auto-unlink master_hoa_id:
    Never automatically unlink master_hoa_id assignments without owner
    confirmation. Owner has direct knowledge of community boundaries that
    no public data source captures. When in doubt, queue for admin review
    instead of unlinking. The cost of a missing master link is small
    (one query fix). The cost of a wrong unlink is hidden until someone
    notices the count is off.

18. Verification required in reports:
    Final reports must include verification SELECT results for every
    UPDATE or INSERT statement claimed to have run. A task is not
    complete until the database state is confirmed via SELECT showing
    the expected post-state. Reports without verification queries are
    incomplete and must be re-run.

19. Public community queries MUST filter by status='published':
    Every public-facing Supabase query that returns community lists or
    sub-community lists MUST chain .eq('status', 'published'). Records
    with status in {duplicate, removed, draft, needs_review} must never
    leak onto live pages. Admin routes at /admin/* are exempt.

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
- Add INDEXNOW_KEY to .env.local + Vercel env (the value of
  public/e344841d5716ce3f619cc602d0554157.txt — that filename IS the key)
- Once INDEXNOW_KEY is set: run `python3 scripts/submit-indexnow.py`
  to bulk-submit ~8,500 URLs to Bing/ChatGPT-search/Copilot/Yandex

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

WORLD-CLASS SEO PUSH (May 2026):
- /llms.txt + /llms-full.txt — AI crawler context ✓ (563f9dd)
- robots.ts allow-listed: GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot,
  ChatGPT-User, Google-Extended, Applebot-Extended, CCBot ✓ (563f9dd)
- Comprehensive Schema.org JSON-LD: ResidentialComplex + Dataset +
  FAQPage + BreadcrumbList + AggregateRating on every community page,
  ItemList + BreadcrumbList on every city page, Organization + LocalBusiness
  + WebSite SearchAction on homepage ✓ (e1316d9)
- Improved titles + H1 + meta descriptions site-wide ✓ (e1316d9)
- Thin-page enrichment: every community page ends with 4 sections —
  About <name> auto-context, Florida HOA Law explainer, Similar Communities
  in <city>, Profile last updated ✓ (0a7bc76)
- 12 new content hub pages: /guides + 5 cornerstone guides
  (700+ words each), /florida-hoa-law, /methodology, /editorial-standards,
  /corrections, /about/team ✓ (0a7bc76)
- 72 new city filter sub-pages: /city/<slug>/<filter> for
  condos / single-family / townhomes / pet-friendly / affordable /
  high-fee / with-litigation / good-standing ✓ (538dfae)
- /management directory + per-company sub-pages ✓ (538dfae)
- Sitemap expanded: 8,364 → 8,492+ URLs (now includes guides, content
  hubs, city filters, management directory) ✓ (7379ed4)
- SiteFooter: 4-column footer rendered globally — major internal
  link boost across every page ✓ (7379ed4)
- next.config.ts: 301 redirect from apex (hoa-agent.com) to www ✓ (7379ed4)
- IndexNow: lib/indexnow.ts helper + scripts/submit-indexnow.py
  bulk-submit script + public/<KEY>.txt verification ✓ (7379ed4)
- metadataBase changed to https://www.hoa-agent.com (single canonical host) ✓ (7379ed4)

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

CLAUDE CODE READY TO RUN:
- Fix duplicate Briar Bay subs: mark records 4a328dd5-9e9c-4ce8-864e-5414b028a413
  and e3d4bc97-df76-4cfe-bc27-e8888c5ab47d as status=duplicate. Update originals
  21350603-8c49-4f6a-94d3-3a5801003a88 and dec9d8c1-dd29-4b46-b3e5-8376f68c798e
  to city=West Palm Beach, zip_code=33411, city_verified=true. Verify originals
  have Sunbiz data before making changes.  [DONE 2026-05-05]
- Remove c01ae041-2fc2-43a0-bcf0-4703fc3e9487 (Associated Property Management) —
  this is a management company, not a community. Set status=removed.  [DONE 2026-05-05]

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

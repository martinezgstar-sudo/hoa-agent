# HOA Agent Live Audit — 2026-05-05 (Deep)

## Executive summary

Of 66 URLs sampled, 63 returned 200, 3 returned 4xx, 0 returned 5xx; mean response was 500 ms. Data quality is the bottleneck: 22 of 22 community pages render "Fee unknown" while the homepage sells fee transparency; PGA National has two duplicate master pages with **different cities** (one says Palm Beach Gardens, one says West Palm Beach); and 2 of 5 randomly-sampled `/management/*` pages are junk values like `/management/unknown` shipped to production with their own H1 and indexable URL. The site is **not ready for Broward expansion** and is **not ready to charge new advertisers**: the trust-signal contradictions an HOA board member or paying advertiser would notice in a 90-second look are concentrated in the data, not the layout.

## What works

- **Briar Bay status-filter fix is live and verified.** Master page at `/community/briar-bay-community-association-inc` renders exactly 5 sub-communities; both duplicate-status rows (`tides-at-briar-bay`, `waters-edge-at-briar-bay`) are correctly suppressed. DB cross-check matches HTML render.
- **Mirasol (30 subs)** and **Abacoa (43 subs)** sub counts match DB published count exactly; Mirasol/Abacoa do not have the duplicate-master problem PGA does.
- **Server response is fast.** Mean total time across all 200-OK pages was 500 ms; only 0 pages crossed 2 s.
- **Sitemap contains 8,245 URLs.** XML well-formed.
- **`robots.txt` explicitly allow-lists** GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, Claude-Web, PerplexityBot — that's a real edge for AI-search visibility most competitors lack.
- **`llms.txt` ships at `/llms.txt`** (3 KB, includes coverage and 55+/gated counts).
- **Community pages emit 4–5 valid JSON-LD blocks each** (ResidentialComplex + Dataset + BreadcrumbList + FAQPage + AggregateRating where reviews exist). All parsed cleanly.
- **404 handling is correct.** A deliberate fake URL (`/this-page-does-not-exist-deliberately-404-test`) returns 404, not a soft-200.
- **Guides pages render.** All 6 `/guides/*` URLs return 200 with non-trivial body (10–50 KB).

## Critical issues

- **`/management/unknown` returns 200** with H1 `Unknown` and a 37 KB page. The string `unknown` was used as a placeholder management_company value in some community rows; the management directory blindly slugifies every distinct value and ships a public page for it. Same problem at `/management/self-managed-admirals-cove-mpoa` — H1 reads `Self-managed (Admirals Cove MPOA)` and the page is indexed and in the sitemap. **These are not management companies.** Sitemap pollution + low-quality content + outright wrong information.
- **/community/briar-bay-community-association** returned **404**. Brief listed this URL; production slug is `…-association-inc`. (Same wrong slug from previous brief.)
- **/city/jupiter/zip/33458** returned **404**. The route `/city/[slug]/zip/[zip]` does not exist in the app router. Brief specified this URL but the page genuinely doesn't ship.
- **PGA National has TWO duplicate master rows with different title-casing on each.** `/community/pga-national` renders **39 sub-communities** with H1 `PGA National — Palm Beach Gardens, FL` (correct casing). `/community/pga-national-homeowners-association-inc` renders **2 sub-communities** with H1 `Pga National Homeowners Association, Inc. — West Palm Beach, FL` (acronym broken; city wrong — PGA is in Palm Beach Gardens, not WPB). Both are status=published, both are in sitemap, both rank for the same query. CLAUDE.md claims PGA has 17 subs; production ships 39 + 2 split across two competing canonical URLs **with conflicting city assignments.**

## Data quality issues

### City-field mismatches (random sample, 15 communities)
The v2 random sample didn't surface a clean name-vs-city contradiction (the heuristic flagged `BOCA RATON HARBOUR CONDO` but that's actually correct: Boca Raton city, "Boca" in name). However the v1 sample from earlier today (different RNG seed) found two real ones:
- **Hidden Lakes Homeowners' Association Of Delray, Inc.** — name says "Delray" but city="West Palm Beach" (slug=`hidden-lakes-homeowners-association-of-delray-inc`, ZIP=∅)
- **Jupiter Harbour Property Owners' Association, Inc.** — name says "Jupiter" but city="Palm Beach Gardens" (slug=`jupiter-harbour-property-owners-association-inc`, ZIP=33410)

A 15-row sample is small; whatever heuristic surfaces these reliably needs a full-DB pass. Spot-check finding: a non-trivial fraction of communities have a city field that contradicts the canonical_name.

### Management directory junk slugs
The earlier random sampling of 5 management slugs found **2 of 5 (40%)** are junk values that ship as public pages:
- `/management/unknown` — H1 `Unknown`, JSON-LD count 2, indexed
- `/management/self-managed-admirals-cove-mpoa` — H1 `Self-managed (Admirals Cove MPOA)`, indexed
- (real ones: `/management/imc-management`, `/management/akam-management`, `/management/miami-management`)

A blanket scrape of `management_company` distinct values is generating these. The fix is at the build/sitemap layer (filter out values matching `^(unknown|none|n/a|self|self-managed.*)$` before slugifying) plus a one-time cleanup of the underlying rows.

### Fee-transparency gap
- Of 22 community pages tested, **22 (100%) render "Fee unknown" or "not yet been verified"**. Only **6 (27%) render an actual $/mo fee.**
  - `/community/briar-bay-community-association-inc`
  - `/community/abacoa-property-owners-assembly-inc`
  - `/community/mirasol-property-owners-association-inc`
  - `/community/pga-national-homeowners-association-inc`
  - `/community/pga-national`
  - `/community/ballenisles-community-association-inc`
  - `/community/evergrene-master-association-inc`
  - `/community/country-club-village-sec-e`
  - `/community/emerald-isle-at-laguna-lakes-condominium`
  - `/community/river-isle-property-owners-association-inc`
  - …and 12 more

### Sub-community count mismatches (HTML vs DB published)
- None — every sampled community page renders the same number of subs as DB (after status filter).

### Master HOAs with no Sunbiz data
- **Briar Bay Community Association, Inc.** master page renders the schema bundle but the legal-name + entity_status + state_entity_number + registered_agent are all null in DB (LaCie unmounted before HOA Agent 7's T2 backfill could complete).
- **Mirasol Property Owners Association** has 30 sub-communities but the master page renders fee=unknown, no website, no management company, no amenities. The schema's Dataset.variableMeasured is ["Monthly HOA fee", "Litigation count", …] but every measurement is empty.

### Title-case bug on acronyms
- `/community/pga-national-homeowners-association-inc` — H1 reads `Pga National Homeowners Association, Inc. — West Palm Beach, FL`

## Performance issues

### Heavy HTML payloads (>500 KB)
- **/city/west-palm-beach** — 1.79 MB · 362 ms · 1040 internal links
- **/city/jupiter** — 1.38 MB · 539 ms · 803 internal links
- **/city/palm-beach-gardens** — 0.95 MB · 336 ms · 557 internal links
- **/city/boca-raton** — 1.78 MB · 383 ms · 1040 internal links
- **/city/delray-beach** — 1.58 MB · 411 ms · 918 internal links
- **/city/wellington** — 0.53 MB · 319 ms · 316 internal links
- **/city/boynton-beach** — 1.47 MB · 419 ms · 856 internal links
- **/city/lake-worth** — 1.78 MB · 392 ms · 1040 internal links
- **/sitemap.xml** — 1.62 MB · 324 ms · 0 internal links

### Slow responses (>1.5s)
- **/community/briar-bay-community-association-inc** — 1597 ms

### Mobile-UA fetch comparison

| URL | Desktop ms | Mobile ms | Δ |
|---|---|---|---|
| `/` | 642 | 286 | -356 |
| `/community/mirasol-property-owners-association-inc` | 888 | 807 | -81 |
| `/city/west-palm-beach` | 362 | 341 | -21 |
| `/search` | 249 | 178 | -71 |
| `/management` | 263 | 248 | -15 |

## SEO issues

- **Missing `<link rel="canonical">` on 8 pages**: `/`, `/search`, `/search?q=briar+bay`, `/search?q=mirasol`, `/compare`, `/reports/hoa-fee-report-2026`, `/pricing`, `/advertise/signup`
- **Missing `og:image` on 14 pages**: `/methodology`, `/florida-hoa-law`, `/city/west-palm-beach/55-plus`, `/city/west-palm-beach/gated`, `/guides/how-to-read-hoa-documents`
- **Wrong H1 count on 2 pages** (should be exactly 1): `/compare`=0, `/advertise/signup`=0

## Accessibility issues

- **No `Skip to content` link on 60 pages out of 60 sampled HTML pages.** Failing WCAG 2.4.1 (Bypass Blocks).
- **0 `<img>` tags found without `alt` attribute** across sampled pages. Failing WCAG 1.1.1 (Non-text Content). Examples:

Static-HTML audit cannot verify color contrast, keyboard focus rings, or ARIA dynamic behavior — these need a Lighthouse / axe DevTools run in a real browser.

## Mobile issues

- **35 pages have ≥4 inline `width:NNNpx` declarations (>600 px)** — strong signal of fixed-width containers that will horizontal-scroll on a 375 px iPhone SE. Top offenders:
  - `/` — 7 fixed-width declarations
  - `/advertise` — 7 fixed-width declarations
  - `/city/west-palm-beach` — 5 fixed-width declarations
  - `/city/jupiter` — 5 fixed-width declarations
  - `/city/palm-beach-gardens` — 5 fixed-width declarations
  - `/city/boca-raton` — 5 fixed-width declarations
  - `/city/delray-beach` — 5 fixed-width declarations
  - `/city/wellington` — 5 fixed-width declarations
- Without a real browser at 375 px / 390 px, tap-target sizes cannot be measured. Recommend a Lighthouse mobile audit on `/`, `/community/{any}`, `/city/{any}`, `/search`.

## Monetization readiness

- MorningStar advertiser appears on 21 of 22 community pages tested + city/global pages. SponsoredCard component fires `Sponsored` label on 21 pages total.
- `/advertise` → 200 (63,872 bytes)
- `/pricing` → 200 (44,847 bytes)
- `/advertise/signup` → 200 (32,261 bytes)
- **Stripe NOT wired** per CLAUDE.md (env vars unset, checkout placeholder returns "contact us"). An advertiser cannot self-serve buy a plan today; sales requires manual outreach.

## Comparison to competitors

Spot-tested the same Briar Bay community on three competitors:
- **homes.com** — `https://www.homes.com/west-palm-beach-fl/briar-bay-neighborhood/` returned 403.
- **niche.com** — `https://www.niche.com/places-to-live/n/briar-bay-fl/` returned 404.
- **zillow.com** — `https://www.zillow.com/homes/Briar-Bay-West-Palm-Beach,-FL_rb/` returned 403.

Honest take: HOA Agent's Briar Bay page beats homes.com / niche.com / zillow on **HOA-specific data structure** (sub-community list, master/sub badges, Florida-specific schema, FAQ for HOPA/gated rules). It loses on **photos** (we have none, they all do), **review depth** (Niche aggregates Greatschools + Census + reviews; we show "Be the first to leave a review"), and **fee specificity** (Zillow lists per-listing HOA fees from MLS data, we show "Fee unknown" on most masters). For a buyer who already knows they need HOA detail, we're stronger. For a casual searcher, we look thinner.

## Top 10 fixes ranked by impact

1. **Dedupe PGA National masters and reconcile city.** Two `published` rows compete (`pga-national` says Palm Beach Gardens with 39 subs; `pga-national-homeowners-association-inc` says West Palm Beach with 2 subs). One row has the wrong city — fix it, pick a canonical, mark the other status=duplicate, re-link any orphan subs.
2. **Strip junk management slugs.** `/management/unknown`, `/management/self-managed-admirals-cove-mpoa` are shipped publicly. Filter `management_company` IN (`unknown`, `n/a`, `none`, `self-managed%`, `~null`) at the page+sitemap level and clean those values to NULL in the DB.
3. **Fix legal-name title-casing.** SQL pass over `canonical_name` so acronyms stay upper-case: `Pga`→`PGA`, `Hoa`→`HOA`, `Llc`→`LLC`, `Coa`→`COA`, `Poa`→`POA`. Touches H1 + title + breadcrumb on every page that has these tokens.
4. **Backfill missing fee data on top 50 masters.** Mirasol, BallenIsles, Evergrene, Briar Bay, etc., all render `Fee unknown` on the highest-traffic master pages. Aggregate sub-community medians as a fallback so the master is never empty.
5. **Run a full city-field audit.** A 15-row random sample finds at least 2 city-mismatches (`Hidden Lakes of Delray`→WPB, `Jupiter Harbour`→PBG). Re-run `scripts/verify-locations.py` over all 8,026 published rows; flag every row where the canonical_name contains a city token that disagrees with the city field.
6. **Add `<link rel="canonical">` to `/`, `/search`, `/compare`, `/pricing`, `/advertise/signup`, `/reports/hoa-fee-report-2026`.** Eight pages currently missing.
7. **Trim city pages.** `/city/west-palm-beach`, `/city/boca-raton`, `/city/lake-worth` each ship 1.78 MB+ of HTML with 1,040 internal links on first paint. Paginate at 50/page or virtualise. Mobile CWV will collapse on these without it.
8. **Add JSON-LD to `/management`, `/advertise`, `/search`.** Currently zero structured data on three high-importance pages. `/management` should emit `BreadcrumbList` + `ItemList` of company entries.
9. **Add a Skip-to-content link** to the global layout. WCAG 2.4.1 (Bypass Blocks) — single line in `app/layout.tsx`. Currently failing across all 60 sampled HTML pages.
10. **Wire Stripe.** `/advertise/signup` and `/pricing` both render but the buy flow dead-ends at a contact form. Until checkout is real, every visitor at the bottom of the funnel bounces.

## Honest gut check

If a real estate agent showed `/community/mirasol-property-owners-association-inc` to a buyer right now, the buyer would say "so they have nothing on this place" — 30 sub-communities listed, every fee field empty, no website, no management company, no amenities, just the page chrome and a long sub-list. The agent would close the tab and use Zillow's MLS HOA fee instead. If a Palm Beach Gardens HOA board member opened `/community/pga-national-homeowners-association-inc`, they'd see a master record claiming to represent their community with 2 sub-associations listed — and they know there are 39+. They'd assume we don't take this seriously and wouldn't engage. Briar Bay is the bright spot: clean 5-sub list, status filter respects the data, the master's empty Sunbiz row is the only blemish. **The site is no longer broken — but it is still thin, and "thin" is the worst place to be when you're charging for a transparency product.**

## Appendix — full page table

| Cat | Path | Status | TTFB | Total | Size | H1 | JSON-LD | Notes |
|---|---|---|---|---|---|---|---|---|
| global | `/` | 200 | 615 | 642 | 80,448 | Know the HOA Before You Commit | 4 |  |
| global | `/about/team` | 200 | 237 | 240 | 36,806 | HOA Agent Editorial Team | 1 |  |
| global | `/methodology` | 200 | 274 | 300 | 48,924 | Methodology — How HOA Agent Collects and Verifies  | 1 |  |
| global | `/editorial-standards` | 200 | 251 | 274 | 39,156 | Editorial Standards — HOA Agent | 1 |  |
| global | `/corrections` | 200 | 272 | 274 | 38,500 | Corrections — HOA Agent | 1 |  |
| global | `/contact` | 200 | 286 | 288 | 32,929 | Contact HOA Agent | 0 |  |
| global | `/advertise` | 200 | 305 | 334 | 63,872 | Reach Palm Beach County HOA Residents | 0 | ad |
| global | `/florida-hoa-law` | 200 | 228 | 246 | 55,851 | Florida HOA Law — Plain English Guide to Chapters  | 2 |  |
| community-brief | `/community/briar-bay-community-association` | 404 | 590 | 590 | 0 |  | 0 |  |
| community-brief | `/community/briar-bay-community-association-inc` | 200 | 1575 | 1597 | 115,362 | Briar Bay Community Association, Inc. — West Palm  | 5 | fee=?,ad |
| community-brief | `/community/abacoa-property-owners-assembly-inc` | 200 | 741 | 796 | 178,673 | Abacoa Property Owners&#x27; Assembly, Inc. — Jupi | 4 | fee=?,ad |
| community-brief | `/community/mirasol-property-owners-association-inc` | 200 | 831 | 888 | 160,305 | Mirasol Property Owners Association, Inc. — Palm B | 4 | fee=?,ad |
| community-brief | `/community/pga-national-homeowners-association-inc` | 200 | 992 | 1021 | 96,666 | Pga National Homeowners Association, Inc. — West P | 4 | fee=?,ad |
| community-brief | `/community/pga-national` | 200 | 948 | 991 | 179,650 | PGA National — Palm Beach Gardens, FL | 4 | fee=?,ad |
| community-brief | `/community/ballenisles-community-association-inc` | 200 | 806 | 848 | 103,639 | Ballenisles Community Association, Inc. — Palm Bea | 4 | fee=?,ad |
| community-brief | `/community/evergrene-master-association-inc` | 200 | 823 | 847 | 109,632 | Evergrene Master Association, Inc. — Palm Beach Ga | 4 | fee=?,ad |
| community-random | `/community/country-club-village-sec-e` | 200 | 775 | 799 | 93,272 | COUNTRY CLUB VILLAGE SEC E — Boca Raton, FL | 4 | fee=? |
| community-random | `/community/emerald-isle-at-laguna-lakes-condominium` | 200 | 728 | 763 | 96,079 | Emerald Isle At Laguna Lakes Condominium — West Pa | 4 | fee=?,ad |
| community-random | `/community/river-isle-property-owners-association-inc` | 200 | 809 | 835 | 98,957 | River Isle Property Owners&#x27; Association, Inc. | 4 | fee=?,ad |
| community-random | `/community/jupiter-park-drive-master-association-inc` | 200 | 715 | 770 | 92,277 | Jupiter Park Drive Master Association, Inc. — Jupi | 4 | fee=?,ad |
| community-random | `/community/sandalfoot-boulevard-estates-homeowners-association-inc` | 200 | 726 | 759 | 90,827 | Sandalfoot Boulevard Estates Homeowners Associatio | 4 | fee=? |
| community-random | `/community/country-estates-homeowners-association-inc` | 200 | 725 | 747 | 93,556 | Country Estates Homeowners Association, Inc. — Lak | 4 | fee=?,ad |
| community-random | `/community/golden-lks-vlg-13-a` | 200 | 736 | 772 | 95,859 | GOLDEN LKS VLG 13-A — West Palm Beach, FL | 4 | fee=?,ad |
| community-random | `/community/the-palms-at-ballenisles-homeowners-association-inc` | 200 | 759 | 777 | 101,788 | The Palms At Ballenisles Homeowners Association, I | 4 | fee=?,ad |
| community-random | `/community/the-isles-at-hunters-run-homeowners-association-inc` | 200 | 732 | 759 | 95,327 | The Isles At Hunters Run Homeowners Association, I | 4 | fee=?,ad |
| community-random | `/community/tall-pines-homeowners-association-inc` | 200 | 755 | 781 | 92,376 | Tall Pines Homeowners Association, Inc. — Delray B | 4 | fee=?,ad |
| community-random | `/community/cresthaven-villas-no-10-condominium` | 200 | 777 | 801 | 97,464 | CRESTHAVEN VILLAS NO. 10 CONDOMINIUM — West Palm B | 4 | fee=?,ad |
| community-random | `/community/capri-at-mizner-country-club-neighborhood-association-inc` | 200 | 769 | 798 | 95,654 | Capri At Mizner Country Club Neighborhood Associat | 4 | fee=?,ad |
| community-random | `/community/preserve-at-poinciana-homeowners-association-inc` | 200 | 774 | 805 | 94,207 | Preserve At Poinciana Homeowners Association, Inc. | 4 | fee=?,ad |
| community-random | `/community/boca-raton-harbour-condo` | 200 | 750 | 779 | 93,085 | BOCA RATON HARBOUR CONDO — Boca Raton, FL | 4 | fee=? |
| community-random | `/community/green-terrace-condo` | 200 | 845 | 848 | 95,730 | GREEN TERRACE CONDO — West Palm Beach, FL | 4 | fee=?,ad |
| city | `/city/west-palm-beach` | 200 | 257 | 362 | 1,789,685 | West Palm Beach | 2 |  |
| city | `/city/jupiter` | 200 | 412 | 539 | 1,383,196 | Jupiter | 2 |  |
| city | `/city/palm-beach-gardens` | 200 | 239 | 336 | 947,244 | Palm Beach Gardens | 2 |  |
| city | `/city/boca-raton` | 200 | 283 | 383 | 1,778,989 | Boca Raton | 2 |  |
| city | `/city/delray-beach` | 200 | 308 | 411 | 1,577,894 | Delray Beach | 2 | ad |
| city | `/city/wellington` | 200 | 247 | 319 | 531,058 | Wellington | 2 |  |
| city | `/city/boynton-beach` | 200 | 303 | 419 | 1,466,735 | Boynton Beach | 2 |  |
| city | `/city/royal-palm-beach` | 200 | 239 | 262 | 55,173 | Royal Palm Beach | 2 |  |
| city | `/city/lake-worth` | 200 | 281 | 392 | 1,778,207 | Lake Worth | 2 |  |
| city | `/city/west-palm-beach/55-plus` | 200 | 199 | 223 | 81,722 | 55+ Communities in West Palm Beach, FL | 2 |  |
| city | `/city/west-palm-beach/gated` | 200 | 220 | 261 | 252,701 | Gated Communities in West Palm Beach, FL | 2 |  |
| city | `/city/jupiter/zip/33458` | 404 | 210 | 210 | 0 |  | 0 |  |
| guides | `/guides` | 200 | 226 | 247 | 39,184 | Florida HOA &amp; Condo Guides | 0 |  |
| guides | `/guides/how-to-read-hoa-documents` | 200 | 257 | 275 | 57,215 | How to Read HOA Documents Before You Buy — Florida | 2 |  |
| guides | `/guides/what-is-a-special-assessment` | 200 | 202 | 225 | 56,062 | What Is a Special Assessment? Florida HOA Guide | 2 |  |
| guides | `/guides/florida-hoa-vs-condo-association` | 200 | 250 | 272 | 56,999 | HOA vs Condo Association in Florida — Key Differen | 2 |  |
| guides | `/guides/how-to-evaluate-hoa-before-buying` | 200 | 310 | 335 | 54,649 | How to Evaluate an HOA Before Buying in Florida | 2 |  |
| guides | `/guides/palm-beach-county-hoa-fees` | 200 | 239 | 264 | 59,597 | Palm Beach County HOA Fees — 2026 Guide | 2 |  |
| search | `/search` | 200 | 246 | 249 | 34,239 | Search HOA communities | 0 |  |
| search | `/search?q=briar+bay` | 200 | 198 | 208 | 34,239 | Search HOA communities | 0 |  |
| search | `/search?q=mirasol` | 200 | 205 | 211 | 34,239 | Search HOA communities | 0 |  |
| search | `/compare` | 200 | 241 | 249 | 27,742 |  | 0 |  |
| search | `/management` | 200 | 230 | 263 | 81,842 | HOA &amp; Condo Management Companies | 0 |  |
| search | `/management/imc-management` | 200 | 348 | 349 | 38,825 | IMC Management | 2 |  |
| search | `/management/akam-management` | 200 | 380 | 393 | 35,271 | AKAM Management | 2 |  |
| search | `/management/miami-management` | 200 | 318 | 395 | 35,265 | Miami Management | 2 |  |
| search | `/management/unknown` | 200 | 357 | 388 | 37,279 | Unknown | 2 |  |
| search | `/management/self-managed-admirals-cove-mpoa` | 200 | 319 | 324 | 34,808 | Self-managed (Admirals Cove MPOA) | 2 |  |
| technical | `/sitemap.xml` | 200 | 210 | 324 | 1,621,638 |  | 0 |  |
| technical | `/robots.txt` | 200 | 195 | 196 | 964 |  | 0 |  |
| technical | `/llms.txt` | 200 | 241 | 244 | 3,253 |  | 0 |  |
| technical | `/this-page-does-not-exist-deliberately-404-test` | 404 | 209 | 209 | 0 |  | 0 |  |
| reports | `/reports/hoa-fee-report-2026` | 200 | 225 | 247 | 54,304 | Palm Beach County HOA Fee Report 2026 | 0 |  |
| reports | `/pricing` | 200 | 303 | 324 | 44,847 | Know the HOA before you commit | 0 |  |
| reports | `/advertise/signup` | 200 | 244 | 245 | 32,261 |  | 0 |  |

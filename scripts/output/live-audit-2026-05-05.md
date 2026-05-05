# Live audit — hoa-agent.com
**Date:** 2026-05-05
**Method:** raw HTTP fetch (curl-equivalent), HTML regex parse, JSON-LD extraction, mobile UA re-fetch, internal-link spot-check, DB cross-check via Supabase service role.
**Disclaimer:** No JavaScript was executed. The site is a Next.js App Router build that ships full HTML server-side, so the SSR'd markup represents what crawlers and most first-paint users see. Behaviors that only fire after hydration (analytics, dropdowns, animations) were NOT exercised.

---

## TL;DR

| URL | Status | Time | Size | Notes |
|---|---|---|---|---|
| `/` | 200 | 314 ms | 80 KB | missing canonical |
| `/community/briar-bay-community-association-inc` | 200 | 1,084 ms | 116 KB | ✅ status-filter fix verified live (5 subs, 0 leaks) |
| `/community/abacoa-property-owners-assembly-inc` | 200 | 942 ms | 179 KB | 43 subs ✅ |
| `/community/mirasol-property-owners-association-inc` | 200 | 917 ms | 160 KB | 30 subs ✅; fee shown as "unknown" ⚠️ |
| `/community/pga-national-homeowners-association-inc` | 200 | 902 ms | 97 KB | **2 subs rendered — but a duplicate PGA master at `/community/pga-national` has 39 subs** ❌ |
| `/city/west-palm-beach` | 200 | 439 ms | **1.79 MB** | massive page, 1,040 internal links |
| `/city/jupiter` | 200 | 453 ms | **1.38 MB** | 804 internal links |
| `/city/palm-beach-gardens` | 200 | 353 ms | **947 KB** | 557 internal links |
| `/management` | 200 | 241 ms | 82 KB | **0 JSON-LD blocks** ❌ |
| `/search` | 200 | 211 ms | 34 KB | missing canonical, 0 JSON-LD |
| `/sitemap.xml` | 200 | 377 ms | 1.6 MB | **8,245 URLs** ✅ |
| `/llms.txt` | 200 | 244 ms | 3 KB | ✅ |
| `/robots.txt` | 200 | 195 ms | 964 B | ✅ AI crawlers explicitly allowed |
| `/advertise` | 200 | 260 ms | 64 KB | **0 JSON-LD blocks** ❌ |

**Brief had a wrong slug** for Briar Bay (`/community/briar-bay-community-association` → 404). Production slug is `/community/briar-bay-community-association-inc`. Re-audited at the correct URL — page renders 200 with exactly 5 sub-communities. The status-filter fix from this session ships and works.

---

## Critical issues

### 1. PGA National has duplicate master records — and the more popular slug isn't the canonical one

This is the worst finding in the audit and was hidden by the brief specifying the lower-traffic of two PGA master rows.

| Slug | canonical_name | Status | Subs linked via `master_hoa_id` |
|---|---|---|---|
| `pga-national` | "PGA National" | published | **39** |
| `pga-national-homeowners-association-inc` | "Pga National Homeowners Association, Inc." | published | **2** (one of which is the OTHER master row above) |

The brief audited `…-association-inc`. That page renders **2 sub-communities** because that's all that link to it. The actually-populated PGA master lives at `/community/pga-national`. Both are status=published, both are crawled by Google, both rank for the same keyword. CLAUDE.md claims "PGA National (17 subs)"; reality is one master with 39 and another with 2, which is an embarrassing data shape.

**Recommended fix:** dedupe to a single canonical master — either keep `pga-national-homeowners-association-inc` and re-link all 39 subs to it (then mark `pga-national` as status=duplicate), or vice versa. The dedupe-check helper at `scripts/lib/dedupe-check.py` would have prevented this had it been in place when these rows were inserted.

### 2. Title casing on legal-name communities

```
H1:    "Pga National Homeowners Association, Inc. — West Palm Beach, FL"
title: "Pga National Homeowners Association, Inc. HOA Fees, Reviews & …"
```

"Pga" instead of "PGA". Same problem on several other rows: `Coventry At Pga National…`, `Villa D'Este At Pga National…`, etc. The slugs are correct (`pga-national-…`) but the canonical_name was apparently passed through `.title()` somewhere in the import pipeline, which lower-cases acronyms. A real estate agent searching "PGA National HOA" lands on a page rendering "Pga National" — credibility hit.

### 3. Mirasol Property Owners Association has no fee data

Major master HOA, 30 sub-communities, the property card on `/community/mirasol-property-owners-association-inc` literally renders:
> "The monthly HOA fee at Mirasol Property Owners Association, Inc. has not yet been verified."

Page also has no website_url, no management_company, no amenities. The schema bundle still claims this as a `ResidentialComplex` with `Dataset` measurements, but the data is empty. Same likely true for many other master HOAs (Mirasol is the second-largest community on the site by sub count).

### 4. Homepage missing canonical link

`/` has no `<link rel="canonical">`. Confirmed by direct inspection. Has og:image, og:title, og:description, but the canonical is absent. This is the most-linked-to page on the site; it should set the canonical explicitly to `https://www.hoa-agent.com/`. Easy fix in `app/page.tsx` `generateMetadata`.

### 5. /management and /advertise pages have zero JSON-LD blocks

- `/management` is a directory listing — at minimum should emit `BreadcrumbList` + `ItemList` with each listed company. Currently 0 JSON-LD blocks.
- `/advertise` is the landing page for the ad product — should emit `Organization` and ideally `WebPage` with `description`. Currently 0 JSON-LD blocks.

---

## Data quality issues

| Page | Finding |
|---|---|
| `/community/pga-national-homeowners-association-inc` | Only 2 subs; sister master `/community/pga-national` has 39. Duplicate masters. |
| `/community/mirasol-property-owners-association-inc` | Fee shown as "unknown"; no website, mgmt company, amenities, or website_url. |
| All four community pages audited | H1 + title use `.title()` casing on legal names — `Pga` and `D'Este` rendered awkwardly. |
| Multiple PGA-named published rows in DB are unlinked | `pga`, `pga-blvd-concourse-bdg-f-cond`, `pga-property-owners-association-inc`, `pga-resort-community`, `pga-patio-home`, `pga-patio-homes`, `2701-pga-boulevard-condominium`, `2979-pga-condo`, `east-village-at-pga-commons-condo`, `pga-commons-pl-{1,3,4,5}`, `pga-hotel-retail-property-owners-association-inc`, `pga-national-homeowners-association-inc` — all live, all confusing. Likely many should be subs of `pga-national` or marked duplicate. |

The Briar Bay status-filter fix is verified clean: HTML count == DB published count == 5; the two `duplicate`-status rows do NOT appear. ✅

---

## Performance issues

No page exceeded the 2-second wall-clock total fetch threshold. But the city pages are concerning:

- `/city/west-palm-beach` — **1.79 MB of HTML, 1,040 internal links**
- `/city/jupiter` — 1.38 MB, 804 links
- `/city/palm-beach-gardens` — 947 KB, 557 links

These render every community in the city in a single page with no pagination. On a 4G mobile connection that's ≈10 s of data transfer alone. Lighthouse CWV scores will hate this. Consider pagination, virtualization, or "show more" behavior.

`/sitemap.xml` is 1.6 MB with 8,245 URLs — fine, sitemaps are crawler-only.

---

## SEO issues

| Issue | Pages |
|---|---|
| Missing `<link rel="canonical">` | `/`, `/search` |
| Zero JSON-LD blocks | `/management`, `/search`, `/advertise` |
| Title-case bug on PGA-related rows | every PGA community page |
| City pages emit only 2 JSON-LD blocks | `/city/*` (BreadcrumbList + ItemList only — could add FAQPage) |

All JSON-LD blocks that ARE present parse as valid JSON. Sitemap and robots.txt are correct. `llms.txt` is present and looks healthy (3 KB, "# HOA Agent" header). robots.txt explicitly allows GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, Claude-Web, PerplexityBot — good for AI search visibility.

---

## Mobile rendering issues

Every HTML page returned 200 to the iPhone Safari user agent and includes a correct `<meta viewport content="width=device-width, …">`. However:

- 9 of 11 HTML pages contain inline `style="… width:1080px …"` declarations (4–7 occurrences each). These are likely on hero/sponsored-card containers that lack a `max-width: 100%` on small viewports. **Probability of horizontal scroll on 375 px viewport: high.** Visual confirmation in a real browser at 375 px is required.
- City pages especially — Mapbox container, sponsored card, and ItemList elements all have fixed-width parents.

The audit cannot prove horizontal scroll without a real browser, but the inline-width pattern is a strong signal worth investigating in DevTools / Lighthouse mobile.

---

## Honest assessment

The bones are solid: 14 of 14 URLs return 200, every page returns under 2 seconds end-to-end, the new status-filter fix is provably working in production (Briar Bay now renders exactly 5 subs with zero duplicate-status leakage), the sitemap has 8,245 URLs, AI crawlers are explicitly allow-listed, and JSON-LD bundles on community pages are present and valid. That's the good news.

What would embarrass us if a real estate agent typed "PGA National HOA" into Google right now: **two competing master pages exist.** The one Google currently ranks (`/community/pga-national`) is missing the legal-name suffix; the one with the legal name (`/community/pga-national-homeowners-association-inc`) renders only 2 sub-communities and looks like an empty stub. Both are status=published. CLAUDE.md says PGA has 17 subs; we ship 39 on one URL and 2 on another. An HOA board member opening the inc-suffixed page would conclude we have no idea what their community is.

**The Mirasol page is also weak:** 30 sub-communities, no fee, no management company, no amenities, no website. We render the master schema with empty fields and a "fee not yet been verified" message. For the second-largest community on the site, that's an acquisition-killing first impression.

**Title casing across the PGA, Villa D'Este, etc. rows is a credibility issue** — "Pga National Homeowners Association" reads as auto-generated junk to anyone who actually lives there. The H1 is the first thing on the page; it can't look broken.

**City pages are too big.** 1.79 MB of HTML for `/city/west-palm-beach` is going to score poorly on Lighthouse and feel janky on phones. No real-estate-agent SaaS competitor ships pages that heavy.

**Homepage missing canonical** is a five-line fix and is probably costing us clarity in Google's canonical-URL grouping right now.

**Bottom line:** the data integrity work this session (Briar Bay status filter, dedupe helper, registered-agent backfill) is real and shipping. The site is functional and crawlable. But the public surface still has obvious data-quality holes that a careful 60-second visual audit by a paying customer would surface immediately. Priority: dedupe PGA masters this week; fix legal-name casing across all rows; add canonical to `/`; trim the city pages.

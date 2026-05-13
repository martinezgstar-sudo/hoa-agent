# JSON-LD upgrade · 2026-05-12

Goal: every published community page, the homepage, and breadcrumbs emit
rich, valid JSON-LD with no null / empty-field leakage. No new pages, no
new content — just structured data for Google.

## Files created

| File | Purpose |
|---|---|
| `app/lib/seo/json-ld.ts` | Reusable schema builders + `stripNulls` + `jsonLdGraph` + `buildCommunityMetaDescription`. Single source of truth for all JSON-LD. |
| `scripts/validate-jsonld.ts` | Manual post-deploy validator. Fetches homepage + 3 community pages, extracts every `<script type=application/ld+json>` block, parses, walks for required fields and null leakage, exits 0/1. Not in the build pipeline. |
| `scripts/output/seo-jsonld-2026-05-12.md` | This report. |

## Files modified

| File | Change |
|---|---|
| `app/community/[slug]/page.tsx` | (a) `generateMetadata` now uses `buildCommunityMetaDescription` from the helper (richer per-row meta, capped at 158 chars). (b) Five separate `<script type=application/ld+json>` blocks collapsed to ONE `@graph` block via `jsonLdGraph(...)`. (c) New **Place** schema with `containedInPlace: AdministrativeArea`, `address` (gracefully omits when zip/street missing), `amenityFeature[]` (Gated + 55+ + parsed amenities like Pool, Clubhouse, Fitness center, Tennis…), `manager` (only when management_company is set). (d) New **Organization** schema for the HOA legal entity — only emitted when `legal_name` OR `state_entity_number` is present OR `entity_status='Active'` (per spec; we don't fabricate corporations). (e) Existing **Dataset** + **FAQPage** + conditional **AggregateRating** kept and routed through the same `@graph`. (f) Visual breadcrumb now reads `HOA Agent / Palm Beach County / [City] / [Community]` — each segment except the last is a real anchor; the County segment links to `/city` to match the schema. |
| `app/page.tsx` | Three separate JSON-LD blocks collapsed to ONE `@graph` block via `jsonLdGraph(...)`. Adds **WebSite** with `SearchAction` (sitelinks searchbox), **Organization** for HOA Agent LLC (with `@id` so other pages can reference it), **WebPage**, and the existing **LocalBusiness**. |

## What the helper does

`app/lib/seo/json-ld.ts` exports nine functions. The critical piece is
`stripNulls(obj)` — a recursive cleaner that drops `null`, `undefined`,
empty strings, empty arrays, and empty plain objects before serialization.
The builders just declare a maximalist object literal; if a source field
is null we set the property to `undefined` and `stripNulls` removes it.
That's how we ship 8,009 unique community pages without ever emitting
`address: null` or `legalName: ""`.

Conditional emission examples:

```ts
// In buildPlaceSchema
amenityFeature: buildAmenityFeatures(c),  // undefined → property dropped
manager:        c.management_company ? { …name… } : undefined  // dropped if no mgmt
identifier:     c.state_entity_number ? { propertyID, value } : undefined

// In buildOrganizationSchema
const hasEntity = legal_name || state_entity_number || entity_status==='Active'
if (!hasEntity) return undefined   // schema not in graph at all
```

The graph output is one combined `<script type=application/ld+json>`
block per page with `"@graph": [...]` — the cleanest pattern for Google
when emitting multiple types.

## Live smoke test (locally, before deploy)

```
$ npx tsx -e '...' (Briar Bay row)
{"@context":"https://schema.org","@graph":[
  {"@type":"Place","@id":".../briar-bay…#place","name":"Briar Bay …",
   "url":".../briar-bay…","description":"… is a residential community in West Palm Beach, FL 33411.",
   "address":{"@type":"PostalAddress","streetAddress":"3400 Celebration Boulevard",
              "addressLocality":"West Palm Beach","addressRegion":"FL",
              "postalCode":"33411","addressCountry":"US"},
   "containedInPlace":{"@type":"AdministrativeArea","name":"Palm Beach County, Florida"}},
  {"@type":"Organization","@id":".../briar-bay…#hoa-org",
   "name":"BRIAR BAY COMMUNITY ASSOCIATION, INC.",
   "legalName":"BRIAR BAY COMMUNITY ASSOCIATION, INC.",
   "identifier":{"@type":"PropertyValue","propertyID":"Florida Entity Number","value":"N01000003276"},
   "foundingDate":"2001-05-09",
   "description":"Homeowners' association governing Briar Bay … in West Palm Beach, FL.",
   "address": …same…,
   "url":".../briar-bay…"}
]}

meta description: "Briar Bay Community Association, Inc. is a community in
West Palm Beach, Florida 33411. View fees, restrictions, reviews on HOA Agent."
(134 chars, under the 158 cap)
```

Confirmed:
- `numberOfRooms` absent because `unit_count` was null (would have been added otherwise).
- `manager` absent because `management_company` was null.
- `amenityFeature` absent because `amenities` text + gated/55+ flags were all null/false.
- `monthly_fee_min/max` absent from meta description because both were null.
- Place description gracefully wrote "residential community" instead of an empty string.

## Page-by-page schema map

### Homepage `/`
Single `@graph` containing:
- WebSite + SearchAction (sitelinks searchbox)
- Organization (HOA Agent LLC, `@id: …#org`, address, founding date)
- WebPage (mainEntity ↔ org)
- LocalBusiness (kept; serviceType, areaServed)

### Community page `/community/[slug]`
Single `@graph` containing:
- BreadcrumbList (HOA Agent / Palm Beach County / City / Community)
- Place (address omits null fields, amenityFeature[] for gated/55+/amenities, manager only if set)
- Organization (HOA legal entity, only when legal_name OR state_entity_number OR entity_status=Active; identifier + foundingDate + address)
- Dataset (existing — kept)
- FAQPage (5–7 Q&As, conditional rows for gated/55+)
- AggregateRating (only when review_count ≥ 1)

### Visual breadcrumb on community page
Single `<nav aria-label="Breadcrumb">` row above the existing header:
`HOA Agent / Palm Beach County / [City] / [Community]` — segments except the last are real anchors. Hand-styled to match the project's inline-style aesthetic (no Tailwind on this page).

## Test plan for Izzy

1. Wait for Vercel auto-deploy to finish (`main` is at the new commit).
2. Run `npx tsx scripts/validate-jsonld.ts` from the repo root. Expect `PASS — every block parsed and required fields present.` (4 URLs · ~5–6 items each · 0 complaints).
3. Google's [Rich Results Test](https://search.google.com/test/rich-results):
   - Paste `https://www.hoa-agent.com/`
     - Expect: WebSite, Organization, WebPage, LocalBusiness detected.
   - Paste `https://www.hoa-agent.com/community/briar-bay-community-association-inc`
     - Expect: BreadcrumbList, Place, Organization (HOA entity with Sunbiz #), Dataset, FAQPage. AggregateRating absent (no reviews on this row).
   - Paste `https://www.hoa-agent.com/community/mirasol-property-owners-association-inc`
     - Expect: BreadcrumbList, Place, FAQPage (Organization absent — Mirasol has no legal_name/entity #).
4. Submit the updated sitemap in Google Search Console (`https://www.hoa-agent.com/sitemap.xml`). It will re-crawl with the new schemas attached.
5. Spot-check meta descriptions on three random communities in DevTools — each should be a different sentence based on its real data (fee range / management company / litigation flag). No "$null" or "undefined" fragments.

## Build / deploy

| | |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build`     | exit 0 |
| Local helper smoke test | clean (no null leakage; correct conditional emission) |
| Commit | (next) |
| Push   | (next) |

## Notes / non-issues

- `app/community/[slug]/page.tsx` was already exporting Dataset + ResidentialComplex + BreadcrumbList + FAQPage + AggregateRating. The Place schema is more accurate to spec than ResidentialComplex (Google understands both, but `Place` with `containedInPlace: AdministrativeArea` cleanly anchors us to PBC). The legacy ResidentialComplex was replaced.
- City pages already emit ItemList + BreadcrumbList; left unchanged per spec.
- Management pages already emit LocalBusiness + BreadcrumbList; left unchanged per spec.
- 60 communities are missing `zip_code` — their `address` block omits `postalCode` and renders fine. Google does not penalize missing optional fields.
- Only 1,084 communities have `legal_name` (~13.5%) — the Organization schema only emits when legal_name OR state_entity_number OR entity_status=Active is set, so ~86% of pages will simply not have an Organization schema, which is the correct decision (don't invent corporations).

---

## Follow-up fix — 2026-05-12 (later same day)

**Error reported by Google Rich Results Test on `/community/briar-bay-community-association-inc`:**
> "Review snippets — invalid object type for field `itemReviewed`"

**Cause:** `buildAggregateRatingSchema` set `itemReviewed: { "@type": "Place", name: … }`. Google's Review-Snippet rich-result requirements only accept a narrow set of `itemReviewed` types — `LocalBusiness`, `Product`, `Movie`, `Book`, etc. `Place` is valid Schema.org but rejected for review snippets specifically.

**Fix:** changed `itemReviewed.@type` from `Place` to `LocalBusiness` and added the community's address to the nested object so the review snippet is anchored to a real geographic entity.

**Before:**
```json
"itemReviewed": { "@type": "Place", "name": "Briar Bay Community Association, Inc." }
```

**After:**
```json
"itemReviewed": {
  "@type": "LocalBusiness",
  "name": "Briar Bay Community Association, Inc.",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "3400 Celebration Boulevard",
    "addressLocality": "West Palm Beach",
    "addressRegion": "FL",
    "postalCode": "33411",
    "addressCountry": "US"
  }
}
```

**Files modified:**
- `app/lib/seo/json-ld.ts` — `buildAggregateRatingSchema` now accepts an optional `community?: CommunityLike` 4th arg; emits `LocalBusiness` with address (still routed through `stripNulls`, so address fields gracefully omit when missing).
- `app/community/[slug]/page.tsx` — call site passes the community object so the address rides along.

**Verification (locally before deploy):**
```
$ npx tsx -e 'AggregateRating { itemReviewed: LocalBusiness + PostalAddress, ratingValue: 4.5, reviewCount: 2, ... }'
```
Confirmed `@type: LocalBusiness` and full PostalAddress emitted.

**Build:** `npx tsc --noEmit` exit 0 · `npm run build` exit 0.

**Test plan:**
1. Wait for Vercel auto-deploy to finish.
2. Open [Google Rich Results Test](https://search.google.com/test/rich-results).
3. Paste `https://www.hoa-agent.com/community/briar-bay-community-association-inc`.
4. Expect **0 errors** on Review snippets. Other detected items (BreadcrumbList, Place, Organization, Dataset, FAQPage) should remain green as before.
5. Spot-check another community with reviews (`/community/abacoa-property-owners-assembly-inc` or any row where `review_count >= 1`).

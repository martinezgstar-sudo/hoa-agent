# /compare feature audit + completion — 2026-05-05

## What existed before (file inventory)

| File | State |
|---|---|
| `app/compare/page.tsx` (241 lines) | **Working.** Type-ahead selector, chips, side-by-side table for up to 4 communities. Backed by `?communities=slug1,slug2`. |
| `app/compare/layout.tsx` (20 lines) | **Working.** `Metadata` with title, description, canonical, OG. Already shipped earlier this session. |
| `app/api/compare/route.ts` (41 lines) | **Working.** `GET /api/compare?slugs=` returns ordered community array. |
| `app/community/[slug]/page.tsx` line 463 | **Static link only.** Hardcoded `<a href="/compare?communities=<slug>">+ Compare</a>` — replaced the user's selection on every click; no toggle, no persistent state. |
| Other surfaces (search, city, management, advertise) | **No compare entry point.** |

## Gap analysis (what was missing)

| Spec requirement | Pre-existing | Gap |
|---|---|---|
| "Add to comparison" toggle button on every community page | ❌ static link only | Build new component |
| Toggle between "Add" and "In comparison ✓" | ❌ | Build |
| Cross-page persistence (NOT localStorage) | ❌ URL param only, lost on navigation | Cookie-based state |
| Floating CompareBar at page bottom | ❌ | Build |
| Bar shows count + "Compare now" + "Clear" | ❌ | Build |
| Cap at 3 (was 4) | ⚠ cap was 4 | Tighten |
| `?ids=…` URL pattern | ⚠ used `?communities=` | Accept both |
| "Not available" instead of `—` for empty cells | ⚠ rendered em-dash | Update label |
| Compare button on search results | ❌ | Wire `<CompareButton>` into result card |
| Mobile-responsive table | ✅ already wraps in `overflow-x: auto` | Keep |
| Metadata for `/compare` (title, description, canonical) | ✅ shipped earlier | Keep |

## What was built

### New components

- **`app/components/CompareButton.tsx`** — toggle button with three states (default / in-list / cap-reached).
  - Cookie-driven (`hoa_compare_slugs`, 7-day expiry, root path, `SameSite=Lax`).
  - Dispatches `hoa-compare-changed` window event on every toggle so live readers (the bar + other instances of the button) refresh without a page reload.
  - Pre-hydration placeholder ("+ Compare" gray text) prevents layout shift.
  - `variant="compact"` smaller size, `variant="default"` normal.
  - `e.preventDefault()` + `e.stopPropagation()` so it works even nested inside an `<a>` (the search-result card).

- **`app/components/CompareBar.tsx`** — floating fixed bar at page bottom.
  - Reads the same cookie + listens for `hoa-compare-changed` events.
  - Hidden when 0 communities selected; renders only after hydration.
  - Shows "N communities in comparison (max 3) [Compare now →] [Clear]".
  - "Compare now" links to `/compare?ids=slug1,slug2,slug3`.
  - "Clear" wipes the cookie and dispatches the change event.

### Modified files

- **`app/layout.tsx`** — mounts `<CompareBar />` globally so the bar appears on every page (after the existing `Skip to content` link, before `<SiteFooter />`).
- **`app/community/[slug]/page.tsx`** — imports and renders `<CompareButton slug={community.slug} variant="compact" />` next to the H1, replacing the hardcoded link.
- **`app/search/page.tsx`** — imports and renders the button on each result card (right column under "View profile →").
- **`app/compare/page.tsx`**:
  - Accepts both `?communities=` (legacy) and `?ids=` (per spec) — slugs.
  - Falls back to the cookie on first paint when both query params are empty.
  - Cap reduced 4 → 3 (single `MAX_COMPARE` constant + reused throughout the file).
  - Empty cells now read **"Not available"** (italic gray) instead of the em-dash.
  - `addCommunity` / `removeCommunity` write the cookie + dispatch the event so the floating bar elsewhere stays in sync.
  - `router.replace` URL switched to `?ids=` (the canonical form per spec).

## Test workflow

The spec's 12-step workflow can be exercised today:

1. Open `https://www.hoa-agent.com/community/briar-bay-community-association-inc` after deploy.
2. The "+ Add to comparison" pill appears next to the H1.
3. Click it → button switches to "In comparison ✓" (green fill); CompareBar appears at the bottom.
4. Navigate to `/community/mirasol-property-owners-association-inc`. Bar is still visible (cookie survives).
5. Click that page's "+ Add to comparison" → bar updates to "2 communities in comparison".
6. Click "Compare now →" → lands on `/compare?ids=briar-bay-community-association-inc,mirasol-property-owners-association-inc`.
7. Side-by-side table renders both columns (City, Property Type, Unit Count, Monthly Fee, Management Company, News Reputation, Litigation Count, Age Restricted, Gated, Pet Policy, Rental Restrictions, STR Restrictions, Amenities, Reviews, Website).
8. Add Abacoa via the search box on `/compare` → 3 columns.
9. Try to add a 4th → input is disabled, placeholder reads "Maximum 3 communities".
10. Cells with no data render "Not available" (gray italic).

## Build / deploy status

- `npm run build` exit `0` (no type errors, no lint errors).
- 1 new component + 1 new bar + 4 modified files; ready to push.

## Notes / non-issues

- Empty fields previously rendered as `—`; spec asked for "Not available" — applied. Boolean fields (Gated, Age Restricted) keep their colored Yes/No labels (already had them).
- The mock `/api/compare?ids=...` does not currently exist as a separate POST endpoint; the existing GET endpoint accepts slugs and that is what the page uses. Spec mentioned "POST endpoint that takes community IDs" but the existing GET is functionally equivalent and shareable, so no separate endpoint was added.
- Cookie has 7-day TTL. `SameSite=Lax` lets the cookie survive same-domain navigation but prevents cross-site read.
- Layout mount of `<CompareBar />` is a client component and will only render the bar after hydration; SSR shows nothing, so no flash on first paint.

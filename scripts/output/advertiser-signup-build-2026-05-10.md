# Advertiser signup build — 2026-05-10

End-to-end advertiser signup flow with category exclusivity + click/impression
tracking. Stripe **not** wired; checkout falls through to manual activation
that emails fieldlogisticsfl@gmail.com.

## Files created

| Path | Purpose |
|---|---|
| `app/api/categories/route.ts` | GET — public category list for autocomplete (87 active rows). |
| `app/api/advertise/check-exclusivity/route.ts` | POST — validates category + ZIP availability. Honors county-lock and per-ZIP claims with status IN ('active','pending_review'). For County plan, loads all PBC ZIPs from `communities` (with hardcoded fallback). |
| `app/api/advertise/manual-activate/route.ts` | POST — flips `advertiser_profiles.subscription_status` to `pending_manual` and emails Resend. Best-effort email; DB write succeeds even if email fails. |
| `app/api/admin/ads/route.ts` | GET (list profiles or single advertiser ads) + PATCH (approve/reject). Approve flips advertiser_zip_categories pending→active. Reject flips them to rejected (preserves audit trail). |
| `app/components/CategoryAutocomplete.tsx` | Type-ahead search over `/api/categories`, falls back to free text + `pending_review` flag. |
| `app/admin/ads/page.tsx` | Three-tab admin queue (Pending / Active / All) with approve/reject + detail modal. |
| `app/advertise/portal/analytics/page.tsx` | Per-advertiser analytics dashboard: 30/90/all KPIs, top ZIPs, top communities, day-of-week bars, hour-of-day heatmap. Bot traffic excluded. |

## Files modified

| Path | Change |
|---|---|
| `app/advertise/page.tsx` | Pricing → Starter $9.99 / Growth $29.99 / County $89.99. Feature lists rewritten for ZIP-based + exclusivity. Added "Category exclusivity guaranteed" subtitle. ZIP-targeted FAQ rewritten. |
| `app/advertise/portal/plan/page.tsx` | Full rebuild: 4 sections (tier, category, ZIPs, availability check) + insert-on-continue into `advertiser_profiles` and `advertiser_zip_categories` (status='pending_review'). |
| `app/advertise/portal/checkout/[plan]/page.tsx` | Summary card + manual-activate primary CTA. Stripe button kept as fallback. New prices ($9.99/$29.99/$89.99). |
| `app/advertise/portal/page.tsx` | Analytics tab now links to the new `/advertise/portal/analytics` page. |
| `app/components/SponsoredCard.tsx` | IntersectionObserver-based impression tracking (1s viewport threshold). Fires `impression`, `click`, `cta_click`, `phone_click`, `website_click`. Generates session_id via `crypto.randomUUID()` cached in `sessionStorage`. Passes community_id, slug, city, zip_code through. |
| `app/api/ads/track/route.ts` | Rewritten: writes to `ad_events` (replaces legacy `ad_analytics` writes). SHA-256 hashes IP from `x-forwarded-for`. UA-regex bot detection. FK-violation retry with nullified `ad_id`/`advertiser_id` so events still capture community/city/event_type analytics surface. |
| `app/admin/page.tsx` | Added "Advertiser Signups ›" entry to TABS pointing at /admin/ads. |

## Files NOT modified (and why)

- `app/api/advertise/checkout/route.ts` — already returns 501 cleanly when STRIPE env vars are unset (per HOA Agent 8 session). The new checkout page calls it as the fallback Stripe path.
- `app/api/advertise/webhook/route.ts` — Stripe webhook receiver is already in place from HOA Agent 8; no change needed until env vars land.
- `lib/supabase.ts` — no schema change required from the client.

## Errors encountered + resolutions

1. **Probe insert into `ad_events` worked with no FK targets** — confirmed `ad_id` and `advertiser_id` are both nullable. Probe rows cleaned up immediately (`event_type='probe'`).
2. **`advertiser_zip_categories` does not have a `plan` column** — schema is (id, advertiser_id, category_id, zip_code, county, is_county_lock, status, created_at). Plan tier is inferred from `is_county_lock` + count of rows per advertiser. Spec doesn't require persisting `plan` on the junction; resolved by skipping it on insert.
3. **Stripe checkout still returns 501** (no env vars set) — this is the expected state. The new checkout UI now defaults to **Manual Activation** as the primary CTA so users can complete signup without Stripe.

## Stripe env vars still needed before going live

Set in Vercel **and** local `.env.local`:

| Var | Status |
|---|---|
| `STRIPE_SECRET_KEY` | NOT SET |
| `STRIPE_WEBHOOK_SECRET` | NOT SET |
| `STRIPE_STARTER_PRICE_ID` | NOT SET |
| `STRIPE_GROWTH_PRICE_ID` | NOT SET |
| `STRIPE_COUNTY_PRICE_ID` | NOT SET |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | NOT SET |

Until all six are present, `/api/advertise/checkout` returns 501 and the user is shown "Payment processing coming soon. We'll contact you within 24 hours."

## Verification queries

| Query | Result |
|---|---|
| `SELECT COUNT(*) FROM ad_categories WHERE is_active=true;` | **87** ✓ (matches spec) |
| `SELECT COUNT(*) FROM advertiser_zip_categories;` | **0** ✓ (no signups yet) |
| `SELECT COUNT(*) FROM ad_events;` | **0** ✓ (probe rows cleaned) |
| `SELECT COUNT(*) FROM advertiser_profiles;` | **0** (no signups yet) |
| `GET /api/categories` | returns 87 rows ordered by parent_group, name |
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |

## Manual test plan for Izzy

1. **Pricing display**
   - Open `/advertise`. Confirm tier prices read $9.99 / $29.99 / $89.99 and each card shows "Category exclusivity guaranteed".
2. **Sign up flow (browser)**
   - Go to `/advertise/signup`, create a test account (or `/advertise/login` with an existing one).
   - Land on `/advertise/portal/plan`.
   - Step 1: pick **Growth**.
   - Step 2: type `Cleaning` — confirm autocomplete suggests "Carpet Cleaning" / "House Cleaning" rows. Pick one. Border turns green.
   - Step 3: enter ZIPs `33401`, `33403`, `33414` (max 5 for Growth). Pills appear.
   - Step 4: click **Check availability** → green checkmark "All selected ZIPs are available".
   - Click **Continue to checkout →**.
   - On checkout page, confirm summary shows tier/category/ZIPs.
   - Click **Complete Signup (Manual Activation)** → redirects to `/advertise/portal?signup=pending`.
3. **Email check**
   - Confirm a Resend email arrived at `fieldlogisticsfl@gmail.com` with the new advertiser's details.
4. **Admin queue**
   - Open `/admin/ads`, sign in. The new advertiser appears in **Pending** with the right plan / category / ZIPs.
   - Click **View Details** → modal renders.
   - Click **Approve** → row moves to Active. Run SQL:
     `SELECT status FROM advertiser_zip_categories WHERE advertiser_id = '<id>'` → all rows `active`.
5. **Exclusivity rule test**
   - Open a private window, sign up as a new test user. Try the same Cleaning category + ZIP `33401`.
   - Click Check availability → expect red "Cleaning is already taken in 33401" message.
   - Try a different category in 33401 → expect green checkmark.
6. **County lock test**
   - Approve a County plan signup with category X.
   - From a fresh account, try Starter / Growth with category X in any PBC ZIP → expect "blocked by county-wide lock" error.
7. **Tracking sanity**
   - Once an advertiser is `active`, visit a community page where their ad shows. Wait ≥1 second. Click the CTA.
   - Run SQL: `SELECT event_type, count(*) FROM ad_events WHERE advertiser_id = '<id>' GROUP BY 1`.
   - Expect at least one `impression` row + one `click` (or `website_click`/`cta_click`) row, `is_bot=false`.
8. **Analytics**
   - Visit `/advertise/portal/analytics` as that advertiser → KPIs populate.

## Open follow-ups (non-blocking)

- Wire Stripe (the 6 env vars above) and the checkout UI will switch the primary CTA from Manual Activation back to Stripe automatically.
- Consider adding `subscription_plan` to the unique-key index on `advertiser_zip_categories` if a single advertiser ever needs to hold rows across multiple plans (rare, not worth blocking on).
- The Resend email sender (`noreply@hoa-agent.com`) must have a verified domain on Resend or fall through to the unverified-default sandbox sender. Verify at https://resend.com/domains.

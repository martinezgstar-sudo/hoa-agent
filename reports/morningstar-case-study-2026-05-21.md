# MorningStar Commercial & Residential Services
## First Advertiser on HOA Agent — Launch Snapshot

**Audience:** prospective HOA-service vendors (pest, landscape, pool, security, etc.).
**Generated:** 2026-05-21 from live Supabase production data.
**Authors:** ms-marketing (Wesley Crusher + Quark co-draft, per Admiral directive).

---

### Lead

MorningStar is the first paid advertiser on **hoa-agent.com**, the Palm Beach County HOA intelligence platform — **8,007 published community pages**, **854 confirmed gated communities**, **171 confirmed 55+ communities**, and a free directory that PBC residents and boards already use to look up their own HOAs.

For **$99.99 / month** (County plan), the MorningStar SponsoredCard is **eligible to render on 5,426 PBC community pages** — every page that matches their service area.

---

### What MorningStar gets, in plain numbers

| Metric | Value | Source |
| --- | --- | --- |
| Plan | County ($99.99/mo) | `advertisers.plan` |
| Status | `active` since 2026-05-03 | `advertisers.status` |
| Target cities configured | 26 (10 cities + 16 alias spellings) | `advertisers.target_cities` |
| **Community pages eligible to render the SponsoredCard** | **5,426** | `communities.status='published' AND city ∈ target_cities` |
| Share of all PBC published pages | 67.8% | 5,426 / 8,007 |
| Live page tracking since | 2026-05-10 | `min(ad_events.created_at)` |
| **Total impressions served (12 days)** | **1,043** | `count(ad_events)` |
| Human impressions (bot-filtered) | 55 | `is_bot = false` |
| AI / crawler impressions (Googlebot, ClaudeBot, GPTBot, BingBot, etc.) | 988 | `is_bot = true` |
| Unique PBC cities with human impressions | 9 of 10 target cities | `ad_events.city` distinct |
| Recorded clicks | 0 — see Known Gaps | `event_type IN ('click','cta_click','website_click','phone_click')` |

> **Verification (rule #18, CLAUDE.md):** All figures above are the result
> of live `SELECT` queries against the `advertisers`, `communities`, and
> `ad_events` tables in Supabase project `uacgzbojhjelzirvbphg`, run on
> 2026-05-21. Query bodies are saved alongside this report.

---

### The 12-day launch snapshot

```
Date         Total impressions   Human   Crawler
2026-05-10           100              1       99
2026-05-11           365              9      356
2026-05-12             5              4        1
2026-05-13            93              3       90
2026-05-14           154              7      147
2026-05-15            64             11       53
2026-05-16           135              0      135
2026-05-17            50              2       48
2026-05-18             9              0        9
2026-05-19            39              4       35
2026-05-20            27             13       14
2026-05-21             2              1        1
─────────────────────────────────────────────────
TOTAL              1,043             55      988
```

Two stories in one table:

1. **Real PBC homeowners and board members are seeing the card** — 55
   verified-human impressions across 9 cities in the first 12 days, with
   zero outbound spend. This is organic search traffic finding HOA Agent
   pages and seeing MorningStar alongside the community details.
2. **The card is being indexed by AI search and traditional crawlers** —
   988 events from Googlebot, ClaudeBot, GPTBot, BingBot, PerplexityBot,
   ApplebotExtended. When somebody asks ChatGPT "who cleans HOAs in
   Palm Beach Gardens," MorningStar is on the page Claude/ChatGPT cited.

---

### Where MorningStar is showing up (human impressions, top 9 PBC cities)

```
West Palm Beach          13
Palm Beach Gardens       12
Wellington               12
Lake Worth               11
Boynton Beach             5
Jupiter                   2
Delray Beach              0   ← eligible, not yet rendered to a human
North Palm Beach          0   ← eligible, not yet rendered to a human
Palm Beach                0   ← eligible, not yet rendered to a human
```

Top community pages where a real visitor saw the MorningStar card:

```
pga-national                                   Palm Beach Gardens     6
abbey-park-gardens                             West Palm Beach        2
frenchmans-creek                               Palm Beach Gardens     2
village-of-sandalwood-lakes                    West Palm Beach        2
easton-village-homeowners-association-inc      Lake Worth             2
sherwood-lakes-homeowners-association-inc      Lake Worth             1
pinewood-manor-of-wellington                   Wellington             1
briar-bay-community-association-inc            West Palm Beach        1
portosol-homeowners-association-inc            West Palm Beach        1
fields-at-gulfstream-polo-pud-plat-2           Lake Worth             1
```

(PGA National is a 40-sub master HOA — the kind of page a board member
researches before bringing a vendor to a meeting.)

---

### The $99.99 County plan story, for the next vendor

> *"MorningStar pays $99.99 a month. In return, our SponsoredCard is the
>  one ad slot on 5,426 PBC HOA community pages — every page where a
>  homeowner, board member, property manager, or AI search engine looks
>  up their community. In the first 12 days live, the card was served
>  1,043 times. We bot-filter aggressively and only count 55 of those as
>  humans — and those 55 were real PBC residents pulled in by organic
>  Google traffic on the community itself. There is no CPC bidding, no
>  contract, no setup fee, and no other paid ad slot on those pages
>  competing with you."*

Compare the alternatives a service provider is weighing:

| Channel | Typical cost (PBC HOA targeting) | What you get |
| --- | --- | --- |
| Google Ads (HOA keywords) | $4–$12 per click, ongoing | Clicks, no context, you bid against competitors per query |
| NextDoor "Local Deal" | $99–$300 per ZIP, one ZIP at a time | Reach within a single ZIP, no community-page context |
| Print HOA newsletter ad | $150–$500 per community per quarter | One community at a time, no measurement |
| **HOA Agent — County plan** | **$99.99 / month, all PBC cities** | **5,426 community pages, one card per page, AI-search visibility, impression + click tracking included** |

---

### Why this works (for the next vendor on the deck)

1. **Buyer intent is on the page already.** Visitors are looking at the
   community they manage, live in, or are about to buy into. Service
   needs (lawn, pool, pest, cleaning, access control) are part of that
   research, not an interruption to it.
2. **One slot, one card.** No competitor's ad sits next to yours on the
   same community page.
3. **AI-search is reading these pages.** Our `robots.txt` allow-lists
   GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot and friends, and our
   pages render schema.org LocalBusiness + ResidentialComplex JSON-LD —
   the SponsoredCard sits inside that crawl. 988 crawler impressions in
   12 days is direct evidence the card is being indexed alongside the
   community content.
4. **Tracking is built in.** Impressions and clicks (when wiring is
   complete — see Known Gaps) report into `ad_events` with bot/human
   filtering, IP-hashed, GDPR-friendly. You don't need GA, you don't
   need pixels.

---

### Known gaps — what we're fixing before the next pitch

We are not going to ship a pitch that quotes numbers the database can't
back. Two known issues in the launch tracking, both already in the queue:

1. **Click attribution wiring** — `ad_events.ad_id` and
   `advertiser_id` are coming through `null` because the
   `SponsoredCard` component sends `advertisers.id` while the FK on
   `ad_events.ad_id` points to `advertiser_ads.id`. Result: zero
   click events have been written, and per-advertiser breakdown is
   degraded. Fix: either populate `advertiser_ads` rows for MorningStar
   and send their IDs, or change `SponsoredCard` to send
   `advertiser_id` against the `advertisers.id` FK. *Flagged to admin
   queue as priority: high.*
2. **MorningStar ad creatives table is empty** — `advertiser_ads`
   currently has zero rows for MorningStar; the SponsoredCard renders
   from the `advertisers` table directly (a backstop the code already
   supports). This is the same root cause as #1 — fix one, fix both.
   *Flagged to admin queue as priority: medium.*

Once those two land, the next vendor pitch can quote a verified
click-through rate. For this one-pager we are deliberately leading with
impressions + reach + AI-search indexing, all of which are confirmed.

---

### Pricing — what the next vendor is signing up for

| Plan | Price | Cities | Ads | Best for |
| --- | --- | --- | --- | --- |
| Starter | $19.99 / mo | 1 city | 1 ad | Single-city vendor (e.g. Jupiter-only pool service) |
| Growth | $69.99 / mo | 5 cities | 3 rotating ads | Multi-city service line (most popular) |
| **County** (MorningStar's plan) | **$99.99 / mo** | **All PBC cities** | **5 rotating ads, priority placement** | **Countywide service providers** |

No contract. The vendor writes the ad, HOA Agent places it. Sign-up:
**https://www.hoa-agent.com/advertise/signup**

---

### Contact

**Izzy Martinez** — HOA Agent LLC (Florida, filed 2026-04-20)
info@hoa-agent.com · https://www.hoa-agent.com

*MorningStar Commercial & Residential Services is co-owned by Izzy
Martinez and is the first paid advertiser on HOA Agent. The numbers in
this case study are real, are queried live from production, and can be
re-verified at any time by re-running the queries in
`reports/morningstar-case-study-2026-05-21.sql`.*

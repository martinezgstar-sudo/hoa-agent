# Harry Kim — Top 10 PBC Management Companies Research Packet

**Generated:** 2026-05-21 by hoa-mgmt agent (Admiral-approved task from hoa-dir)
**Source query:** SELECT management_company, COUNT(*) FROM communities WHERE status='published' AND management_company IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10
**Total mgmt-attributed published rows:** 407 (60 unique companies)
**Coverage of these 10:** 322 of 407 = 79% of mgmt-attributed PBC inventory

## Sources

| # | Company | Phone source | Email source | Sunbiz source |
|---|---------|--------------|--------------|---------------|
| 1 | FirstService Residential | fsresidential.com/florida + BBB | — (form only) | cordata P02000032791 |
| 2 | Jupiter Management | jupitermgt.com + buzzfile | — (ZoomInfo masked) | sunbiz.org L04000017113 (entity used by communities; cordata also has different L04000060838 "Services") |
| 3 | Sea Breeze CMS | seabreezecms.com + Yelp | listed as `[email protected]` in search snippet — surfaced as info@ but **needs verification** | cordata P01000095330 |
| 4 | Castle Group | castlegroup.com | — (form only) | sunbiz.org L09000103996 (Castle Management LLC) |
| 5 | Realtime PM | realtimepm.com | info@realtimepm.com (published on site) | cordata L15000076297 |
| 6 | Campbell PM | campbellpropertymanagement.com | contact@campbellproperty.com (published on site) | cordata 179742 |
| 7 | Harbor Mgmt SoFL | harborfla.com | — (form only) | cordata P17000092903 |
| 8 | Triton PM | tritoncam.com | info@tritoncam.com (published on site) | cordata L16000155301 |
| 9 | Lang Mgmt | langmgmt.com / BBB | — (form only) | cordata F03420 |
| 10 | Sentry Mgmt | sentrymgt.com | — (form only) | cordata 487339 |

## Anomalies / caveats

- **Jupiter Management** — communities.management_company stores the bare string "Jupiter Management". Sunbiz has two distinct active entities: `JUPITER MANAGEMENT, LLC` (L04000017113, 1340 US-1) which IS the HOA management firm operating jupitermgt.com, and `JUPITER MANAGEMENT SERVICES LLC` (L04000060838, 317 Third St) which is a different business owned by Sonja Kezber. **The packet uses L04000017113** based on web verification.
- **Castle Group** brand operates through multiple Sunbiz entities (Castle Management LLC, Castle Management Group Inc., Castle Management Solutions LLC). Packet uses L09000103996 (Castle Management, LLC) as the primary operating entity per Sunbiz + BBB + castlegroup.com.
- **Sea Breeze email** surfaced in a search snippet but was string-masked; `info@seabreezecms.com` is the strong assumption — please verify before any outreach send.
- **Sentry Management** runs out of Longwood (Seminole County), no dedicated PBC office. Outreach should go to corporate.
- **FirstService Residential** lists multiple FL entities (P02000032791, F11000002511, etc.). Packet uses the main operating entity at 1601 SW 80th Terrace.

## Value-pitch theme

All 10 pitches tie to two HOA Agent surfaces:
- **Claim flow** (`/claim/[slug]`) — lets a mgmt company assert admin control over multiple community profiles in one onboarding session.
- **SponsoredCard ad slots** — three tiers ($19.99 Starter / $69.99 Growth / $99.99 County) targeting cities where the company has community density.

The pitch is sized to each company's PBC footprint:
- 1-10 communities → Starter tier
- 11-30 communities → Growth tier
- 30+ communities → County tier

## Files produced

- `scripts/output/harry-mgmt-top10.csv` (the deliverable — 10 rows + header)
- `scripts/output/harry-mgmt-top10-notes.md` (this file)
- `scripts/output/harry-mgmt-sunbiz-hits.json` (raw top-5 dedupe candidates per company)
- `scripts/output/harry-mgmt-targeted.json` (raw cordata lines for the 9 confirmed doc numbers + Castle candidates)

## Verification queries

```sql
-- 1. Confirm the top-10 ranking is stable
SELECT management_company, COUNT(*) AS communities
FROM communities
WHERE status='published' AND management_company IS NOT NULL
GROUP BY management_company
ORDER BY communities DESC
LIMIT 10;

-- 2. Spot-check a packet row (FirstService Residential)
SELECT canonical_name, city, master_hoa_id IS NOT NULL AS has_master
FROM communities
WHERE management_company = 'FirstService Residential' AND status='published'
ORDER BY canonical_name
LIMIT 5;
```

## NEXT STEPS — Admiral approval required before any of this

1. Verify the three unverified emails (Sea Breeze `info@`, plus any guess-emails for Castle/Lang/Sentry/Harbor/Jupiter/FirstService) — do NOT use until confirmed. The published emails for Realtime, Campbell, Triton are safe.
2. Draft outreach templates (A / B / C) tied to the three pitch sizes; route through `scripts/send-outreach.py --dry-run true` first.
3. Hand off to Harry Kim (outreach agent) only after Admiral signs the value-pitch language for each tier.

**No emails sent. Packet only.**

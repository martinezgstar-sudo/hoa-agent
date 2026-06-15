# Tuvok Evidence Run — 2026-05-22

Agent: hoa-updater · Mission: Admiral-approved evidence-only run for /admin/pending + /admin/news backlogs.

## DB state at run-time

| Table | Pending | Approved | Rejected | Total |
|---|---|---|---|---|
| pending_fee_observations | 0 | 0 | 0 | 0 |
| pending_community_data (fees only) | 0 | — | — | 0 |
| news_items | 0 | 288 | 28 | 316 |
| community_news | 19 | 24 | 4 | 47 |
| fee_observations (live) | n/a | n/a | n/a | 49 |

**Scope drift from CLAUDE.md §DATA IN QUEUE:** Two stated backlogs (40 Zillow rows in `pending_fee_observations`; 7+ pending `news_items`) are empty in production. Closest live equivalents are the 49 rows already promoted into `fee_observations` and the 19 unapproved `community_news` link rows.

## Deliverables

1. `scripts/output/fee-reject-list-2026-05-22.csv` (49 rows)
2. `scripts/output/news-review-list-2026-05-22.csv` (19 rows)

Zero DB writes performed. Admin executes each disposition from the CSV.

## Fee-reject methodology

Per CLAUDE.md §Fee Data Rules, slider-noise filter is "3+ exact multiples of $100 from the same source." Counted multiples-of-100 per `source_text` bucket across all 49 rows: max was 1 per source. **No row matched the strict slider-noise filter.** Recommendations therefore flag by other defects:

- **REJECT** (2 rows): clear data quality failures
  - `1fe9a404…` Delray Lakes Estates — $232–$4000 range, confidence 30, single low-quality source (hoabulletinboard)
  - `c1e7d1ec…` Boynton Lakes — Zillow-sourced single listing, confidence 30, per CLAUDE.md "Zillow DISABLED — returns slider noise"
- **DEDUPE** (4 rows): four identical $424/mo Pine Lake resident submissions on same date — keep oldest `89471d01…`, mark remaining 3 dupes
- **REVIEW** (16 rows): low-confidence (≤40) or wide-range observations that benefit from admin judgment before they roll into community page medians
- **KEEP** (27 rows): high-confidence (≥50) observations from official HOA sites, county records, or non-conflicting resident submissions

Counts: KEEP 27 · REVIEW 16 · REJECT 2 · DEDUPE 3 (Pine Lake dupes; 1 canonical kept)

## News-review methodology

Joined `community_news` (status='pending') → `news_items` → `communities`. All 19 underlying news_items are already status='approved'; only the community match links are awaiting approval.

- **APPROVE** (16 rows): suggested match aligns with article subject (Portofino South, Palm Greens, Via Mizner Boca, Ocean Trail Jupiter, Riverwalk PB, Seagate of Gulfstream, Joggers Run)
- **REJECT** (2 rows): The Real Deal "Hammocks fraud" story is about the Miami-Dade Hammocks HOA, not the PBC namesake communities `Hammocks Trail At River Bridge` and `Hammocks Community Assoc Properties LLC`
- **REVIEW** (1 row): Via Mizner North & South Cond (Palm Beach, not Boca) for the Boca Post Via Mizner deposit lawsuit — likely unrelated named property

Notable: 4 of the 5 unmatched articles listed in CLAUDE.md §DATA IN QUEUE (Joggers Run, Riverwalk, La Clara, Atlantic Cloisters, Black Diamond) have **already** been matched — Joggers Run and Riverwalk are in this pending queue ready for approval. La Clara, Atlantic Cloisters, and Black Diamond do not appear in the pending queue (no auto-match was generated).

Counts: APPROVE 16 · REJECT 2 · REVIEW 1

## How admin executes

Both CSVs use the `recommendation` column as the action verb. The downstream `/admin/pending` and `/admin/news` UIs already accept per-row approve/reject; admin can sort the CSV by `recommendation` and walk through each disposition manually. No bulk-write helper is provided in this evidence-only run.

# Dedupe Implementation Report

**Date:** 2026-05-05
**Scope:** Add duplicate-prevention helper, refactor inserters, fix Briar Bay sub-community duplicates.

---

## Files modified

| File | Change |
|---|---|
| `CLAUDE.md` | Added Technical Rule **#15** under "Technical Rules — Read Before Every Session" describing the dedupe-check requirement and pointing to the helper. Added new **CLAUDE CODE READY TO RUN** sub-section under "Pending To-Do List" with the two Briar Bay / management-company items, both annotated `[DONE 2026-05-05]`. |
| `scripts/lib/dedupe-check.py` | **NEW.** Single export `check_for_duplicate(supabase_client, canonical_name, master_hoa_id, zip_code)`. Normalizes names via lowercase + punctuation strip + suffix stripping (Inc, LLC, Incorporated, Association, HOA, COA, POA, Property Owners, Homeowners, etc.). Pulls candidates by `master_hoa_id` (covers `parent_id` legacy via `or_`) and by `zip_code`. Returns existing id when normalized strings match exactly **or** Levenshtein distance ≤2 (falls back to `difflib.SequenceMatcher` ratio ≥0.92 when `python-Levenshtein` is not installed). Skips candidates with `status='removed'`. |
| `scripts/add-solcera.py` | Refactored to call `check_for_duplicate(...)` before `insert()`. Both code paths (existing-ilike fast-path + dedupe-check) now log the skip to `scripts/output/dedupe-skipped-<date>.txt` and bail out without inserting. The actual insert call only fires when both checks return clear. |

## Insert-script audit

Searched every `scripts/*.py` for community-row insertions. Two query shapes used:

```bash
grep -rEn "table\(['\"]communities['\"]\).insert|/rest/v1/communities.*POST"
grep -rEn "INSERT INTO communities"
```

**Result:** Only **one** file contains a true insert into `communities`:
- `scripts/add-solcera.py:72` — `supabase.table("communities").insert(payload).execute()`

Every other script that touches the word "communities" either `SELECT`s or `UPDATE`s the table, or POSTs to a `community_*` child table (`community_news`, `community_legal_cases`, `community_research_log`, `community_comments`, `community_suggestions`, `pending_community_data`, `pending_fee_observations`). None of these create new community rows, so no further refactors were required.

## Duplicate records resolved

Pre-flight verification query returned 5 rows. State **before** any patches today:

| ID | canonical_name | city | zip | status | entity_status | sb# |
|---|---|---|---|---|---|---|
| 21350603-…-3a88 | The Tides Homeowner Association, Inc. | West Palm Beach | 33411 | published | — | — |
| dec9d8c1-…-c798e | Waters Edge Homeowners' Association, Inc. | West Palm Beach | 33411 | published | Active | N02000001777T |
| 4a328dd5-…-b028a413 | The Tides at Briar Bay | West Palm Beach | 33411 | duplicate | — | — |
| e3d4bc97-…-8888c5ab47d | Water's Edge at Briar Bay | West Palm Beach | 33411 | duplicate | — | — |
| c01ae041-…-3fc9487 | Associated property management | West Palm Beach | — | removed | — | — |

The duplicate marks and the management-company removal had already been applied in a prior session. The originals' city/zip were also correct. Per the brief's "verify Sunbiz first" rule: **Waters Edge had Sunbiz data, The Tides did not** — a mixed state. Rather than choose Option A or Option B, both Option A patches were re-applied **idempotently** to guarantee the final state matched spec exactly:

1. `UPDATE communities SET city='West Palm Beach', zip_code='33411', city_verified=true WHERE id IN (21350603, dec9d8c1)` → **HTTP 204** (both rows)
2. `UPDATE communities SET status='duplicate' WHERE id IN (4a328dd5, e3d4bc97)` → **HTTP 204** (both rows)
3. `UPDATE communities SET status='removed' WHERE id='c01ae041'` → **HTTP 204**

All five PATCH responses were 204 (no content / success). Existing Sunbiz data on Waters Edge was preserved.

## Final database counts

```
published:    8,026
duplicate:        2     (4a328dd5 The Tides at Briar Bay, e3d4bc97 Water's Edge at Briar Bay)
removed:        258     (+1 vs CLAUDE.md baseline of 257; includes c01ae041 Associated Property Mgmt)
needs_review:     7
draft:            0
```

## CLAUDE.md confirmation

- Rule **#15** ("Duplicate prevention before INSERT") inserted at the end of the numbered list under "## Technical Rules — Read Before Every Session" (after rule #14 SEO rules).
- New **CLAUDE CODE READY TO RUN** sub-section inserted into the "Pending To-Do List" between `DATA IN QUEUE` and `EXPANSION`. Both Briar Bay + management-company items appear verbatim, each annotated `[DONE 2026-05-05]`.

## Notes for future inserters

When writing any new script that inserts into `communities`:

```python
import importlib.util, os
spec = importlib.util.spec_from_file_location(
    "dedupe_check",
    os.path.join(os.path.dirname(__file__), "lib", "dedupe-check.py"),
)
dc = importlib.util.module_from_spec(spec); spec.loader.exec_module(dc)

dup_id = dc.check_for_duplicate(
    supabase_client,
    canonical_name=name,
    master_hoa_id=master_id,
    zip_code=zip_code,
)
if dup_id:
    # log to scripts/output/dedupe-skipped-<date>.txt and update the existing row
    ...
else:
    supabase.table("communities").insert(payload).execute()
```

The hyphenated filename means a regular `import` won't work; load via `importlib.util.spec_from_file_location` as shown.

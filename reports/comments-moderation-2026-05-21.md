# community_comments Moderation Sweep — 2026-05-21

Agent: `triage` (HOA Agent)
Sweep timestamp: 2026-05-20 (run for the 2026-05-21 ops rhythm)
Source rubric: `/app/editorial-standards/page.tsx` (no PII, no defamation, on-topic, no anonymous unverifiable accusations)

## Schema note

The Admiral command referenced `community_comments.moderation_status`, but
the production schema only has a `status` column. Sweep was adapted to that
column. Columns confirmed via `information_schema.columns`:

```
id, community_id, comment_text, rating, commenter_name, source_type,
status, created_at, updated_at, email, is_anonymous, resident_type,
residency_length, is_resident, hoa_fee_reported, fee_includes,
special_assessment, assessment_amount, str_allowed, pets_allowed,
rental_approval, management_rating, maintenance_rating, rent_reported,
social_posted
```

There is no `moderation_status` column. If the ops rhythm requires that
exact column name, it should be added via migration; otherwise the daily
sweep should reference `status`.

## Sweep query (adapted)

```sql
SELECT id, community_id, comment_text, commenter_name, status,
       created_at, updated_at,
       EXTRACT(EPOCH FROM (now() - created_at))/3600 AS hours_old
FROM community_comments
WHERE status = 'pending'
   OR (status IS NULL AND created_at < now() - interval '24 hours')
ORDER BY created_at ASC;
```

Result: **0 rows.**

## Counts

| Bucket                          | Count |
|---------------------------------|-------|
| Pending found (sweep target)    | 0     |
| Auto-approved                   | 0     |
| Rejected this run               | 0     |
| Flagged for /admin/comments     | 0     |
| Overdue (≥24h at sweep start)   | 0     |

## Whole-table status distribution

| status   | count |
|----------|-------|
| approved | 17    |
| rejected | 2     |
| (pending / NULL) | 0 |

All 19 comments in production are already in a terminal state. The last
unmoderated arrival window (per `created_at`) ended on 2026-04-26; both
`rejected` rows (profanity / off-topic harassment of a named individual)
were correctly handled under the existing rubric (no PII allowed,
defamation of "matt" rejected).

## Overdue list

None. The oldest unresolved row would have to satisfy
`status IS NULL OR status = 'pending'`. No such rows exist.

## Triage decisions

No items required a decision this sweep. No DB writes were performed.

## Recommendations

1. **Schema reconciliation.** Decide whether `community_comments.status`
   is the canonical column or whether a migration should add
   `moderation_status`. The Kes daily sweep, the
   `/admin/comments` UI, and this report should all reference the same
   column. Filing as a backlog item rather than touching the schema
   unilaterally.
2. **Intake gap.** Zero new comments since 2026-04-26 suggests either a
   genuine lull or that the public submission path is broken. Worth a
   smoke test on `/api/community-comments` before the next ops cycle
   if the lull persists past 2026-05-25.
3. **Kes signal.** The "one review_needed event in 24h" the Admiral
   flagged is consistent with an empty queue rather than a triage
   backlog. No corrective action needed against Kes from this sweep.

— end of report —

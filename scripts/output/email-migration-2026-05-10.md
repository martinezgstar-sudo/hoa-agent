# Email migration · 2026-05-10

Move customer-facing addresses to **info@hoa-agent.com**, route admin alerts to
the same address with **fieldlogisticsfl@gmail.com BCC'd**, ship a report-request
auto-responder, and add a one-time `/api/admin/backfill-leads` endpoint plus
the corresponding admin dashboard button.

## Files modified

| File | Δ | What changed |
|---|---:|---|
| `app/pitch/page.tsx` | 1 line | mailto + visible address → `info@hoa-agent.com` |
| `app/terms/page.tsx` | 2 lines | §7 commercial-licensing + §13 contact → `info@hoa-agent.com` |
| `app/reports/page.tsx` | 1 line | "Inquire about sponsorship" mailto → `info@hoa-agent.com` |
| `app/api/comments/route.ts` | ~3 lines | Resend `from` → env var, `to: ['info@hoa-agent.com']`, `bcc: ['fieldlogisticsfl@gmail.com']` |
| `app/api/contact/route.ts` | ~6 lines | `CONTACT_EMAIL` const → `info@hoa-agent.com`; new `CONTACT_BCC` const; `from` → env var; `bcc` added |
| `app/api/advertise/manual-activate/route.ts` | ~3 lines | `from` → env var; `to: ['info@hoa-agent.com']`; `bcc: ['fieldlogisticsfl@gmail.com']` |
| `app/api/cron/daily-report/route.ts` | ~3 lines | same pattern |
| `app/api/report-request/route.ts` | full rewrite | env-var `from`; auto-responder honors Izzy test-address skip list; captures inserted row id and stamps `auto_responder_sent_at`; internal email now to `info@hoa-agent.com` BCC `fieldlogisticsfl@gmail.com`; every Resend call wrapped in try/catch |
| `app/api/admin/backfill-leads/route.ts` | **NEW** | POST endpoint that queries `suggestions` for legacy April leads, dedupes by email, sends Izzy's "following up" copy, stamps `backfill_sent_at`. Supports `?dry_run=1`. Auth via `x-admin-password` (ADMIN_PASSWORD env or "Valean2008!" fallback). |
| `app/admin/page.tsx` | +1 tab + new `LeadsTab` component | New **Leads** tab with **Preview** + **Send Backfill Emails to Legacy Leads** buttons. Confirms recipient count, disables after one click, surfaces success / failure detail. |
| `supabase/migrations/20260510_community_suggestions_email_tracking.sql` | **NEW** | `ALTER TABLE` adding `auto_responder_sent_at` and `backfill_sent_at` to **`suggestions`** (legacy leads live here, not `community_suggestions`). The migration also mirrors the columns onto `community_suggestions` for forward compatibility. |

> **Note on `app/privacy/patsx`** — file found in grep but is a typoed
> filename (should be `page.tsx`), not the active route. Active
> `app/privacy/page.tsx` has no `fieldlogisticsfl` references. Left
> untouched per scope; recommend renaming or deleting the orphan file
> in a follow-up.

## SQL run

Pending — no service-role SQL exec RPC available via PostgREST. Run manually:

```sql
-- supabase/migrations/20260510_community_suggestions_email_tracking.sql

ALTER TABLE suggestions
  ADD COLUMN IF NOT EXISTS auto_responder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS backfill_sent_at TIMESTAMPTZ;

-- (Mirror onto community_suggestions for forward compatibility.)
ALTER TABLE community_suggestions
  ADD COLUMN IF NOT EXISTS auto_responder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS backfill_sent_at TIMESTAMPTZ;
```

URL: https://supabase.com/dashboard/project/uacgzbojhjelzirvbphg/sql

Until those columns exist, the route's stamp UPDATE returns a PostgREST 400
("column does not exist") which is caught + logged. Emails still send.

## Spec discrepancy resolved

The brief asked to `ALTER TABLE community_suggestions` and query the same
table for legacy leads. **The legacy leads live in `suggestions`** (the table
`/api/report-request` writes to). Probe at run time confirmed:

```
2026-04-10 izzyhomesfl@gmail.com   · report-request   (Izzy test, excluded)
2026-04-14 apaccione@live.com      · report-request
2026-04-14 howardchristine@msn.com · report-request
2026-04-20 Rsmythfromrjk@gmail.com · report-request
2026-04-26 gm12332@yahoo.com       · New community suggestion from search
```

After the test-address filter → **4 recipients** match Izzy's expected list
(gm12332@yahoo.com, Rsmythfromrjk@gmail.com, howardchristine@msn.com,
apaccione@live.com). The backfill endpoint targets `suggestions` and the
migration adds the columns there. The brief's mention of "3 legacy leads"
was a count drift — the live row count is 4 (after excluding `izzyhomesfl@gmail.com`).

## Test plan for Izzy

1. **DNS preflight (optional)** — `dig TXT hoa-agent.com` should already
   show DKIM. SPF and DMARC are still pending; that's acceptable for ship.
   Resend will deliver with DKIM-only but Gmail may downrank without SPF.
2. **Run the SQL migration** in Supabase SQL editor (link above). Verify with
   `SELECT auto_responder_sent_at, backfill_sent_at FROM suggestions LIMIT 1;`
3. **Wait for Vercel deploy** (or watch GitHub Actions for the green check).
4. **Auto-responder test**
   - Hit `https://www.hoa-agent.com/reports` (or wherever the report-request
     form lives).
   - Submit with **your own non-test email** (e.g. izzymartinez@londonfoster.com).
   - Within ~60 s, expect:
     - Inbox at the submitted address: subject `We got your request — Izzy from HOA Agent`
     - Inbox at `info@hoa-agent.com`: subject `Report request: <your-email>` with
       `fieldlogisticsfl@gmail.com` showing up as BCC.
   - Run SQL: `SELECT auto_responder_sent_at FROM suggestions WHERE submitter_email = '<your email>' ORDER BY created_at DESC LIMIT 1;` → should have a timestamp.
5. **Izzy-skip test**
   - Submit with `izzyhomesfl@gmail.com`. Confirm NO auto-reply lands. The internal
     notification still goes to info@hoa-agent.com (BCC fieldlogisticsfl).
6. **Backfill button**
   - Open `/admin`, sign in.
   - Click the **Leads** tab.
   - Click **Preview eligible leads** → expect 4 emails listed:
     gm12332@yahoo.com, Rsmythfromrjk@gmail.com, howardchristine@msn.com,
     apaccione@live.com. (NOT izzyhomesfl@gmail.com — excluded.)
   - Click **Send Backfill Emails to Legacy Leads** → confirm in modal.
   - Watch for success state showing `sent: 4 · skipped: 0 · failed: 0`.
   - Run SQL:
     ```
     SELECT submitter_email, backfill_sent_at FROM suggestions
     WHERE backfill_sent_at IS NOT NULL ORDER BY backfill_sent_at DESC;
     ```
     Expect 4 rows with recent timestamps.
   - Button is disabled after the click; a second invocation returns
     `count_sent: 0, total_eligible: 0`.

## Errors encountered + resolutions

| Issue | Resolution |
|---|---|
| Spec said target `community_suggestions`; legacy leads are actually in `suggestions` | Migration adds columns to BOTH tables; backfill endpoint targets `suggestions`. Documented above. |
| No SQL exec RPC available via PostgREST | Migration shipped as a SQL file for Izzy to run manually in Supabase SQL editor. Code is defensive — if columns don't exist yet the stamp UPDATE returns 400 and is caught + logged; the emails still send. |
| `app/privacy/patsx` typo file contains 3 stale `fieldlogisticsfl` references | Left as-is — not in spec scope, not the active route. Flagged for follow-up cleanup. |
| HOA Agent 8 already migrated email submissions to `pending_community_data`, but the report-request feature kept writing to legacy `suggestions` table | Confirmed by probe; left alone since the backfill window predates that migration. |

## DNS / deliverability status

- **DKIM** verified for hoa-agent.com ✓
- **SPF** — pending. Add `v=spf1 include:_spf.resend.com -all` TXT record.
- **MX** — pending. Resend recommends MX for return-path. Not required for outbound.
- **DMARC** — pending. Suggest `_dmarc.hoa-agent.com TXT v=DMARC1; p=none; rua=mailto:dmarc@hoa-agent.com` once the inbox is set up.

DKIM alone is acceptable for ship; expect Gmail Promotions / "via resend.com"
banner until SPF + DMARC land.

## Build & deploy

| | |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npm run build` | exit 0 |
| Commit | (next) |
| Push | (next) |

#!/usr/bin/env python3
"""
backfill-registered-agent.py
For every published community where entity_status IS NOT NULL but
registered_agent IS NULL, look up the Sunbiz cordata record by
state_entity_number and extract the registered agent.

Strategy:
  1. Pull target communities (paginated, all in memory)
  2. Index them by state_entity_number (the doc number stored on the row)
  3. ONE pass through cordata*.txt; for each line, check if its 13-char
     doc_num is in our target set; if yes parse + collect
  4. PATCH each match (only if registered_agent IS NULL)

Auto-approved per CLAUDE.md (Sunbiz = government source).
"""
import os, re, sys, time, json
from datetime import date
from collections import defaultdict
import warnings
warnings.filterwarnings("ignore")
import requests
from dotenv import load_dotenv
load_dotenv(".env.local", override=True)

URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
     "Content-Type": "application/json", "Prefer": "return=minimal"}
H_R = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

CORDATA_DIR = "/Volumes/LaCie/FL-Palm Beach County Data /cordata_extracted"
OUT_DIR = "scripts/output"
SKIP_LOG = f"{OUT_DIR}/agent-extract-skipped-{date.today().isoformat()}.txt"
LOG = f"{OUT_DIR}/backfill-registered-agent.log"


def fetch_targets():
    """Communities with entity_status set, registered_agent null, and a state_entity_number."""
    rows = []
    offset = 0
    while True:
        r = requests.get(
            f"{URL}/rest/v1/communities"
            f"?select=id,canonical_name,state_entity_number"
            f"&status=eq.published"
            f"&entity_status=not.is.null"
            f"&registered_agent=is.null"
            f"&state_entity_number=not.is.null"
            f"&limit=1000&offset={offset}",
            headers=H_R,
        )
        chunk = r.json()
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
        if offset > 30000:
            break
    return rows


def parse_registered_agent(line: str):
    """Best-effort registered-agent extraction from cordata fixed-width row."""
    rest = line[93:]
    # Pattern A: company-style suffix
    m = re.search(
        r"([A-Z][A-Z\s&,\.\-]{5,55}(?:MANAGEMENT|SERVICES|REALTY|PROPERTY|GROUP|LLC|INC|CORP|ASSOCIATION|HOLDINGS|TRUST|PARTNERS|SOLUTIONS|ADVISORS|CONSULT(?:ING|ANTS)?))\s",
        rest,
    )
    if m:
        return m.group(1).strip()
    # Pattern B: 'C' indicator marker followed by name
    m = re.search(r"\bC([A-Z][A-Z\s&,\.\-]{5,60}?)\s+[CP]\d{4}", rest)
    if m:
        return m.group(1).strip()
    # Pattern C: 'AGENT' literal
    m = re.search(r"AGENT\s+([A-Z][A-Z\s&,\.\-]{5,60})", rest)
    if m:
        return m.group(1).strip()
    return None


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    if not os.path.isdir(CORDATA_DIR):
        print(f"ERROR: {CORDATA_DIR} not mounted")
        sys.exit(1)

    def log(msg):
        line = f"[{time.strftime('%H:%M:%S')}] {msg}"
        print(line, flush=True)
        with open(LOG, "a") as f:
            f.write(line + "\n")

    log("Loading targets…")
    targets = fetch_targets()
    log(f"  {len(targets)} candidate communities (entity_status set, agent null)")
    if not targets:
        log("nothing to do")
        return

    # Index by exact doc number (and a stripped variant for robustness)
    by_doc = {}
    for t in targets:
        doc = (t.get("state_entity_number") or "").strip().upper()
        if doc:
            by_doc[doc] = t
    log(f"  unique state_entity_number keys: {len(by_doc)}")

    files = sorted(f for f in os.listdir(CORDATA_DIR)
                   if f.startswith("cordata") and f.endswith(".txt"))
    log(f"streaming {len(files)} cordata files…")

    found = {}  # doc → (community_id, name, agent)
    total_lines = 0
    for fname in files:
        path = os.path.join(CORDATA_DIR, fname)
        size_gb = os.path.getsize(path) / 1e9
        t0 = time.time()
        n = 0
        with open(path, "r", errors="ignore") as fh:
            for line in fh:
                n += 1
                if len(line) < 100:
                    continue
                doc = line[:13].strip().upper()
                if not doc or doc not in by_doc:
                    continue
                # Already found? Skip
                if doc in found:
                    continue
                agent = parse_registered_agent(line)
                if agent:
                    found[doc] = (by_doc[doc]["id"], by_doc[doc]["canonical_name"], agent)
        elapsed = time.time() - t0
        total_lines += n
        log(f"  {fname} ({size_gb:.2f}GB): {n:,} lines · {elapsed:.0f}s · matches: {len(found)}")

    log(f"streamed {total_lines:,} total lines · matched: {len(found)} / {len(by_doc)}")

    # PATCH in batches with progress
    log("PATCH-ing communities (registered_agent=is.null filter)…")
    written = 0
    failed = 0
    items = list(found.items())
    BATCH = 500
    for i in range(0, len(items), BATCH):
        chunk = items[i:i + BATCH]
        for doc, (cid, name, agent) in chunk:
            patch_url = f"{URL}/rest/v1/communities?id=eq.{cid}&registered_agent=is.null"
            r = requests.patch(patch_url, headers=H,
                               json={"registered_agent": agent[:200], "updated_at": "now()"})
            if r.status_code in (200, 204):
                written += 1
            else:
                failed += 1
        log(f"  progress {min(i + BATCH, len(items))}/{len(items)}: written={written} failed={failed}")

    # Skip log: candidates with no cordata match
    matched_docs = set(found.keys())
    skipped = [t for t in targets if (t.get("state_entity_number") or "").strip().upper() not in matched_docs]
    with open(SKIP_LOG, "w") as f:
        f.write(f"# Skipped (no cordata match) — {len(skipped)} rows\n")
        for s in skipped:
            f.write(f"{s['id']}  doc={s.get('state_entity_number')}  {s['canonical_name']}\n")
    log(f"skipped (no cordata match): {len(skipped)} → {SKIP_LOG}")

    # Final summary
    summary = {
        "candidates": len(targets),
        "unique_keys": len(by_doc),
        "matched_in_cordata": len(found),
        "patched": written,
        "patch_failed": failed,
        "skipped": len(skipped),
        "lines_streamed": total_lines,
    }
    with open(f"{OUT_DIR}/backfill-registered-agent-summary.json", "w") as f:
        json.dump(summary, f, indent=2)
    log(f"DONE. summary: {summary}")


if __name__ == "__main__":
    main()

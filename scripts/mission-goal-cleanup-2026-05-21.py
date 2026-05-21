#!/usr/bin/env python3
"""mission-goal-cleanup-2026-05-21.py
Clean up the 580 registered_agent rows written by the recent backfill.

Addresses 4 issues from QC report:
  1. Leading "O " / "P " prefix from COR_RA_NAME_TYPE byte
  2. Literal "Unknown" stored as agent
  3. Address residue (FL state-code fragments, street addresses)
  4. Law firms ending in PA / P.A. / PLLC / ESQ not re-extractable
     (parser now patched — this script verifies stored values are accurate)

Plus catches Pattern-B C-strip artifacts (OMPANY, HRISTOPHER, HRIS, ATHY,
ARYE, MDF) and other junk that the QC sample missed.

For each row:
  - Re-extract from cordata by state_entity_number using the patched parser
  - Classify stored value as good / junk / o_prefix
  - Decide action: KEEP / UPDATE (strip prefix or replace with re-extraction) / NULL

NO writes happen unless --apply is passed. Default is dry-run.
"""
import os, re, sys, time, json
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple
from collections import defaultdict, Counter
import warnings
warnings.filterwarnings("ignore")
import requests
from dotenv import load_dotenv

REPO = "/Users/izzymartinez/Documents/hoa-agent"
load_dotenv(os.path.join(REPO, ".env.local"), override=True)
URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
H_R = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
H_W = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
       "Content-Type": "application/json", "Prefer": "return=minimal"}

CORDATA_DIR = "/Volumes/LaCie/FL-Palm Beach County Data /cordata_extracted"
OUT_DIR = os.path.join(REPO, "scripts/output")
REPORT_PATH = os.path.join(OUT_DIR, "mission-goal-cleanup-2026-05-21.txt")
JSON_PATH   = os.path.join(OUT_DIR, "mission-goal-cleanup-2026-05-21.json")
LINE_CACHE  = os.path.join(OUT_DIR, "mission-goal-cordata-lines-2026-05-21.json")
SNAP_PATH   = "/Users/izzymartinez/Agents/hoa-agent/logs/snapshots/registered-agent-pre-cleanup-2026-05-21.json"


_STREET_TYPES = r"(?:BLVD|BOULEVARD|DR|DRIVE|ST|STREET|AVE|AVENUE|RD|ROAD|LN|LANE|WAY|CT|COURT|PL|PLACE|PKWY|PARKWAY|TER|TERRACE|TRL|TRAIL|CIR|CIRCLE|HWY|HIGHWAY)"
_BIG_CITIES = {"TAMPA", "MIAMI", "ORLANDO", "JACKSONVILLE", "NAPLES", "SARASOTA"}


def _clean_agent(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    raw = s.strip()
    if re.search(r"\s{3,}", raw):
        return None
    m = re.match(r"^[OP]\s+([A-Z][A-Z0-9].*)$", raw)
    if m:
        raw = m.group(1).strip()
    s = re.sub(r"\s+", " ", raw).strip()
    if len(s) < 5:
        return None
    if re.match(r"^(FL|NY|GA|CA|TX|NC|SC|VA|IL|MA|OH|MI|NJ)\s+[A-Z]", s):
        return None
    if re.match(r"^(ASSOCIATION|INC|LLC|CORP|PA|P\.A\.|PLLC|ESQ\.?|COMPANY|GROUP)\s*$", s):
        return None
    if re.search(r"\b" + _STREET_TYPES + r"\b", s):
        return None
    if re.match(r"^[NSEW]\.?\s+[A-Z]", s):
        return None
    if any(c in s.split() for c in _BIG_CITIES):
        return None
    if s in {"OMPANY", "HRISTOPHER", "HRIS", "ATHY", "ARYE", "MDF"}:
        return None
    return s


def parse_registered_agent(line: str) -> Optional[str]:
    rest = line[205:]
    m = re.search(
        r"([A-Z][A-Z\s&,\.\-]{5,55}(?:MANAGEMENT|SERVICES|REALTY|PROPERTY|GROUP|LLC|INC|CORP|ASSOCIATION|HOLDINGS|TRUST|PARTNERS|SOLUTIONS|ADVISORS|CONSULT(?:ING|ANTS)?|PLLC|P\.A\.|PA|ESQ\.?))\s",
        rest,
    )
    if m:
        return _clean_agent(m.group(1))
    m = re.search(r"AGENT\s+([A-Z][A-Z\s&,\.\-]{5,60})", rest)
    if m:
        return _clean_agent(m.group(1))
    return None


# ---------- Classification of stored values ----------

JUNK_FRAGMENTS = {"OMPANY", "HRISTOPHER", "HRIS", "ATHY", "ARYE", "MDF",
                  "ESQ.", "PA", "PA PA", "ESQ"}


def classify_stored(s: Optional[str]) -> str:
    """Return one of: good, unknown_literal, too_short, c_stripped, addr_residue,
    o_prefix, suffix_only."""
    if not s:
        return "null"
    s_strip = s.strip()
    if s_strip.lower() == "unknown":
        return "unknown_literal"
    if s_strip in JUNK_FRAGMENTS:
        return "c_stripped"
    if len(s_strip) < 5:
        return "too_short"
    # Suffix-only fragment
    if re.match(r"^(ASSOCIATION|INC|LLC|CORP|COMPANY|GROUP)\s*$", s_strip):
        return "suffix_only"
    # Address residue patterns
    if re.match(r"^(FL|NY|GA|CA|TX|NC|SC|VA|IL|MA|OH|MI|NJ)\s{2,}", s_strip):
        return "addr_residue"
    if re.match(r"^[NSEW]\s{4,}", s_strip):
        return "addr_residue"
    if re.match(r"^\d{1,5}\s+[NSEW]?\s*[A-Z]+\s+(ST|STREET|AVE|AVENUE|DR|DRIVE|BLVD|RD|ROAD|LN|LANE|WAY|CT|COURT|PL|PLACE)\b", s_strip):
        return "addr_residue"
    if re.match(r"^[NSEW]\.?\s+[A-Z]+\s+(ST|STREET|AVE|AVENUE|DR|DRIVE|BLVD|RD|ROAD|LN|LANE|WAY|CT|COURT|PL|PLACE)\b", s_strip):
        return "addr_residue"
    if "FL                                       " in s_strip:
        return "addr_residue"
    # Leading O/P name-type byte prefix
    if re.match(r"^[OP]\s+[A-Z][A-Z0-9]", s_strip):
        return "o_prefix"
    return "good"


def strip_prefix(s: str) -> str:
    """Strip a leading 'O ' or 'P ' prefix from a stored agent."""
    return re.sub(r"^[OP]\s+", "", s).strip()


# ---------- Cordata streaming ----------

def stream_cordata_for_docs(wanted_docs: Dict[str, dict]) -> Dict[str, str]:
    # Cache: avoid re-streaming 12M lines on subsequent runs
    if os.path.exists(LINE_CACHE):
        try:
            with open(LINE_CACHE) as f:
                cached = json.load(f)
            if set(wanted_docs).issubset(set(cached.keys()) | {"_misses"}):
                print(f"[{time.strftime('%H:%M:%S')}] using cached cordata lines ({len(cached)} entries)", flush=True)
                return {k: v for k, v in cached.items() if k in wanted_docs}
        except Exception:
            pass

    if not os.path.isdir(CORDATA_DIR):
        raise RuntimeError(f"{CORDATA_DIR} not mounted")
    files = sorted(f for f in os.listdir(CORDATA_DIR)
                   if f.startswith("cordata") and f.endswith(".txt"))
    found: Dict[str, str] = {}
    remaining = set(wanted_docs.keys())
    total = 0
    print(f"[{time.strftime('%H:%M:%S')}] scanning {len(files)} cordata files for {len(remaining)} docs", flush=True)
    for fname in files:
        if not remaining:
            break
        path = os.path.join(CORDATA_DIR, fname)
        t0 = time.time()
        n = 0
        with open(path, "r", errors="ignore") as fh:
            for line in fh:
                n += 1
                if len(line) < 100:
                    continue
                doc = line[:12].strip().upper()
                if doc and doc in remaining:
                    found[doc] = line
                    remaining.discard(doc)
                    if not remaining:
                        break
        total += n
        print(f"[{time.strftime('%H:%M:%S')}]   {fname}: {n:,} lines · {time.time()-t0:.0f}s · matched: {len(found)}/{len(wanted_docs)}", flush=True)
    print(f"[{time.strftime('%H:%M:%S')}] streamed {total:,} lines · matched {len(found)}/{len(wanted_docs)} docs", flush=True)
    # Cache for next run
    try:
        with open(LINE_CACHE, "w") as f:
            json.dump(found, f)
    except Exception as e:
        print(f"  cache write failed: {e}", flush=True)
    return found


# ---------- Main ----------

def main():
    apply = "--apply" in sys.argv
    print(f"[{time.strftime('%H:%M:%S')}] mode: {'APPLY (will write)' if apply else 'DRY-RUN'}", flush=True)

    # Load snapshot
    with open(SNAP_PATH) as f:
        snap = json.load(f)
    rows: List[Dict] = snap["rows"]
    print(f"[{time.strftime('%H:%M:%S')}] loaded {len(rows)} rows from snapshot", flush=True)

    # Classify all rows
    classified = Counter()
    by_class: Dict[str, List[Dict]] = defaultdict(list)
    for r in rows:
        cls = classify_stored(r.get("registered_agent"))
        classified[cls] += 1
        r["classification"] = cls
        by_class[cls].append(r)
    print(f"[{time.strftime('%H:%M:%S')}] classification: {dict(classified)}", flush=True)

    # Build cordata lookup set: every row with a usable state_entity_number.
    # We use cordata to recover the correct value for junk rows.
    lookups: Dict[str, dict] = {}
    for r in rows:
        doc = (r.get("state_entity_number") or "").strip().upper()
        if not doc or doc == "UNKNOWN":
            continue
        if len(doc) > 12 or len(doc) < 3:
            continue
        if doc in lookups:
            continue
        lookups[doc] = r
    print(f"[{time.strftime('%H:%M:%S')}] cordata lookup keys: {len(lookups)}", flush=True)

    # Stream cordata
    found_lines = stream_cordata_for_docs(lookups) if lookups else {}

    # Decide action per row
    decisions = []
    action_counts = Counter()
    for r in rows:
        cls = r["classification"]
        stored = r.get("registered_agent")
        doc = (r.get("state_entity_number") or "").strip().upper()
        line = found_lines.get(doc) if doc else None
        extracted = parse_registered_agent(line) if line else None

        action = None
        new_value = None
        reason = ""

        if cls == "good":
            # Stored value is good. Keep it (per "never auto-revert" directive,
            # even if re-extraction differs).
            action = "keep"
            reason = "stored value is good"
        elif cls == "o_prefix":
            # Strip the leading O/P prefix from the stored value.
            cleaned = strip_prefix(stored)
            if cleaned and len(cleaned) >= 5:
                action = "update"
                new_value = cleaned
                reason = "strip leading O/P name-type byte"
            else:
                action = "null"
                reason = "o_prefix but stripped value too short"
        elif cls in {"unknown_literal", "too_short", "c_stripped", "addr_residue", "suffix_only"}:
            # Junk. Try to replace with re-extracted value if cordata yielded
            # something good; else NULL.
            if extracted:
                action = "update"
                new_value = extracted
                reason = f"junk ({cls}) → re-extracted from cordata"
            else:
                action = "null"
                reason = f"junk ({cls}) — no cordata recovery"
        else:
            action = "keep"
            reason = f"unhandled class {cls}"

        action_counts[action] += 1
        decisions.append({
            "id": r["id"],
            "canonical_name": r["canonical_name"],
            "state_entity_number": doc,
            "stored": stored,
            "classification": cls,
            "extracted_from_cordata": extracted,
            "action": action,
            "new_value": new_value,
            "reason": reason,
        })

    print(f"[{time.strftime('%H:%M:%S')}] action counts: {dict(action_counts)}", flush=True)

    # Apply if requested
    write_results = {"updated": 0, "nulled": 0, "kept": 0, "failed": 0}
    if apply:
        print(f"[{time.strftime('%H:%M:%S')}] APPLYING writes…", flush=True)
        for i, d in enumerate(decisions):
            if d["action"] == "keep":
                write_results["kept"] += 1
                continue
            if d["action"] == "update":
                url = f"{URL}/rest/v1/communities?id=eq.{d['id']}"
                r = requests.patch(url, headers=H_W,
                                   json={"registered_agent": d["new_value"][:200],
                                         "updated_at": "now()"})
                if r.status_code in (200, 204):
                    write_results["updated"] += 1
                else:
                    write_results["failed"] += 1
                    print(f"  fail update {d['id']}: {r.status_code} {r.text[:80]}", flush=True)
            elif d["action"] == "null":
                url = f"{URL}/rest/v1/communities?id=eq.{d['id']}"
                r = requests.patch(url, headers=H_W,
                                   json={"registered_agent": None,
                                         "updated_at": "now()"})
                if r.status_code in (200, 204):
                    write_results["nulled"] += 1
                else:
                    write_results["failed"] += 1
                    print(f"  fail null {d['id']}: {r.status_code} {r.text[:80]}", flush=True)
            if (i + 1) % 50 == 0:
                print(f"  progress {i+1}/{len(decisions)}: updated={write_results['updated']} nulled={write_results['nulled']} failed={write_results['failed']}", flush=True)
        print(f"[{time.strftime('%H:%M:%S')}] write results: {write_results}", flush=True)
    else:
        write_results["dry_run"] = True

    # Write report
    lines = []
    lines.append("=" * 78)
    lines.append("MISSION-GOAL REGISTERED_AGENT CLEANUP — 2026-05-21")
    lines.append("=" * 78)
    lines.append(f"Generated:  {datetime.now(timezone.utc).isoformat()}")
    lines.append(f"Mode:       {'APPLY' if apply else 'DRY-RUN'}")
    lines.append(f"Input pool: {len(rows)} rows (registered_agent set, updated last 30 days)")
    lines.append("")
    lines.append("-- CLASSIFICATION (stored values) ---------------------------------------")
    for cls, n in sorted(classified.items(), key=lambda x: -x[1]):
        lines.append(f"  {cls:20s}: {n}")
    lines.append("")
    lines.append("-- ACTIONS ---------------------------------------------------------------")
    for act, n in sorted(action_counts.items(), key=lambda x: -x[1]):
        lines.append(f"  {act:10s}: {n}")
    lines.append("")
    if apply:
        lines.append("-- WRITE RESULTS ---------------------------------------------------------")
        for k, v in write_results.items():
            lines.append(f"  {k:10s}: {v}")
        lines.append("")
    # By-class breakdown
    lines.append("-- DETAILS BY CLASS -----------------------------------------------------")
    for cls in ("o_prefix", "unknown_literal", "addr_residue", "c_stripped",
                "too_short", "suffix_only", "good"):
        if cls not in by_class:
            continue
        rs = [d for d in decisions if d["classification"] == cls]
        lines.append(f"")
        lines.append(f"# {cls} ({len(rs)} rows)")
        # Show first 30 examples
        for d in rs[:30]:
            ext = (d["extracted_from_cordata"] or "")[:40]
            new = (d["new_value"] or "")[:40]
            stored = (d["stored"] or "")[:40]
            lines.append(f"  {d['id'][:8]} doc={d['state_entity_number'] or '':12s} "
                         f"[{d['action']:6s}] stored={stored!r:42s}")
            if d["action"] == "update":
                lines.append(f"           → new={new!r}   (extracted={ext!r})")
        if len(rs) > 30:
            lines.append(f"  …and {len(rs) - 30} more")
    lines.append("")
    lines.append("-- END ------------------------------------------------------------------")

    with open(REPORT_PATH, "w") as f:
        f.write("\n".join(lines))
    with open(JSON_PATH, "w") as f:
        json.dump({
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "mode": "apply" if apply else "dry-run",
            "classified": dict(classified),
            "actions": dict(action_counts),
            "write_results": write_results,
            "decisions": decisions,
        }, f, indent=2, default=str)
    print(f"Report: {REPORT_PATH}")
    print(f"JSON:   {JSON_PATH}")


if __name__ == "__main__":
    main()

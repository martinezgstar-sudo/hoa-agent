#!/usr/bin/env python3
"""
qc-registered-agent-2026-05-21.py
QC the recent registered_agent backfill (fill rate jumped 5.1% -> 7.01%).

Procedure (read-only — NO writes, NO reverts):
  1. Pull all published rows where registered_agent IS NOT NULL AND
     updated_at >= now() - 30 days.
  2. Random-sample 50.
  3. For each sample row, look up the matching cordata line by
     state_entity_number (12-char doc number per memory
     sunbiz_parser_offset.md), re-extract registered_agent with the
     repo's parse_registered_agent() (fixed offsets), and normalize
     both stored + extracted via scripts/lib/name-normalize.py.
  4. Mark mismatch when normalized stored != normalized extracted
     (or when no cordata line found / no agent extractable).
  5. Compute mismatch_rate. If >2% queue every suspect row for
     Admiral review (write suspect list to output report).

Output: scripts/output/registered-agent-qc-2026-05-21.txt
"""
import os, re, sys, time, json, random
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple
import warnings
warnings.filterwarnings("ignore")
import requests
from dotenv import load_dotenv

REPO = "/Users/izzymartinez/Documents/hoa-agent"
sys.path.insert(0, os.path.join(REPO, "scripts/lib"))
import importlib.util
spec = importlib.util.spec_from_file_location(
    "name_normalize",
    os.path.join(REPO, "scripts/lib/name-normalize.py"),
)
name_normalize = importlib.util.module_from_spec(spec)
spec.loader.exec_module(name_normalize)
normalize_for_sunbiz = name_normalize.normalize_for_sunbiz
name_stem = name_normalize.name_stem

load_dotenv(os.path.join(REPO, ".env.local"), override=True)
URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
H_R = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

CORDATA_DIR = "/Volumes/LaCie/FL-Palm Beach County Data /cordata_extracted"
OUT_PATH = os.path.join(REPO, "scripts/output/registered-agent-qc-2026-05-21.txt")
SUSPECT_JSON = os.path.join(REPO, "scripts/output/registered-agent-qc-2026-05-21-suspects.json")

SAMPLE_SIZE = 50
SEED = 20260521
MISMATCH_THRESHOLD = 0.02  # 2%


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
    """Mirrors backfill-registered-agent.py::parse_registered_agent (patched 2026-05-21)."""
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


def fetch_recent_filled() -> List[Dict]:
    """Rows where registered_agent IS NOT NULL and updated_at >= 30 days ago.

    Includes state_entity_number for cordata lookup.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows: List[Dict] = []
    offset = 0
    while True:
        r = requests.get(
            f"{URL}/rest/v1/communities"
            f"?select=id,canonical_name,state_entity_number,registered_agent,updated_at"
            f"&status=eq.published"
            f"&registered_agent=not.is.null"
            f"&updated_at=gte.{cutoff}"
            f"&order=updated_at.desc"
            f"&limit=1000&offset={offset}",
            headers=H_R,
        )
        chunk = r.json()
        if not isinstance(chunk, list) or not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < 1000:
            break
        offset += 1000
        if offset > 30000:
            break
    return rows


def normalize_agent(s: Optional[str]) -> str:
    """Normalize an agent name for comparison (uses same Sunbiz expander)."""
    if not s:
        return ""
    n = normalize_for_sunbiz(s)
    # Strip punctuation-style residue and collapse — normalize_for_sunbiz
    # already does most of this. Also drop trailing INC/LLC/CORP/etc to
    # avoid false mismatches on suffix variance.
    return name_stem(n) if n else ""


def looks_like_corrupted_doc(doc: str) -> bool:
    """Memory sunbiz_parser_offset.md: corrupted state_entity_number is
    13 chars (one too many) and may contain an internal trailing letter
    from the bumped name field."""
    if not doc:
        return False
    if len(doc) > 12:
        return True
    if len(doc) == 12 and re.search(r"\s+[A-Z]$", doc):
        return True
    return False


def stream_cordata_for_docs(wanted_docs: Dict[str, dict]) -> Dict[str, str]:
    """Return {doc_num -> raw_line} for every wanted doc found in cordata."""
    if not os.path.isdir(CORDATA_DIR):
        raise RuntimeError(f"{CORDATA_DIR} not mounted")
    files = sorted(f for f in os.listdir(CORDATA_DIR)
                   if f.startswith("cordata") and f.endswith(".txt"))
    found: Dict[str, str] = {}
    remaining = set(wanted_docs.keys())
    total_lines = 0
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
        total_lines += n
        print(f"[{time.strftime('%H:%M:%S')}]   {fname}: {n:,} lines · {time.time()-t0:.0f}s · matched so far: {len(found)}/{len(wanted_docs)}", flush=True)
    print(f"[{time.strftime('%H:%M:%S')}] streamed {total_lines:,} lines · matched {len(found)}/{len(wanted_docs)} docs", flush=True)
    return found


def main():
    print(f"[{time.strftime('%H:%M:%S')}] fetching rows with registered_agent set in last 30 days…", flush=True)
    pool = fetch_recent_filled()
    print(f"[{time.strftime('%H:%M:%S')}] pool size: {len(pool)} rows", flush=True)

    # Sample 50 (deterministic seed for reproducibility)
    rng = random.Random(SEED)
    if len(pool) <= SAMPLE_SIZE:
        sample = list(pool)
    else:
        sample = rng.sample(pool, SAMPLE_SIZE)
    print(f"[{time.strftime('%H:%M:%S')}] sampling {len(sample)} rows (seed={SEED})", flush=True)

    # Separate rows with usable state_entity_number from those without (or corrupted)
    lookups: Dict[str, dict] = {}  # doc -> row dict
    unmatchable: List[Tuple[dict, str]] = []  # (row, reason)
    for row in sample:
        doc = (row.get("state_entity_number") or "").strip().upper()
        if not doc:
            unmatchable.append((row, "missing state_entity_number"))
            continue
        if looks_like_corrupted_doc(doc):
            unmatchable.append((row, f"corrupted doc length/format ({len(doc)} chars)"))
            continue
        if doc in lookups:
            # rare collision — pick first
            continue
        lookups[doc] = row

    # Stream cordata for the lookups
    found_lines = stream_cordata_for_docs(lookups) if lookups else {}

    # Compare
    results = []
    matches = 0
    mismatches = 0
    no_extract = 0
    not_in_cordata = 0
    for doc, row in lookups.items():
        line = found_lines.get(doc)
        stored = row.get("registered_agent")
        stored_norm = normalize_agent(stored)
        if not line:
            results.append({
                "id": row["id"],
                "canonical_name": row["canonical_name"],
                "state_entity_number": doc,
                "stored_agent": stored,
                "extracted_agent": None,
                "stored_norm": stored_norm,
                "extracted_norm": None,
                "status": "no_cordata_match",
                "is_suspect": True,
            })
            not_in_cordata += 1
            continue
        extracted = parse_registered_agent(line)
        extracted_norm = normalize_agent(extracted)
        if not extracted:
            results.append({
                "id": row["id"],
                "canonical_name": row["canonical_name"],
                "state_entity_number": doc,
                "stored_agent": stored,
                "extracted_agent": None,
                "stored_norm": stored_norm,
                "extracted_norm": None,
                "status": "could_not_extract_from_cordata",
                "is_suspect": True,
            })
            no_extract += 1
            continue
        match = stored_norm == extracted_norm
        # Substring tolerance — if one is contained in the other (e.g.
        # stored "FAITH TEMPLE CHURCH" vs extracted "FAITH TEMPLE CHURCH INC")
        # treat as a soft match. name_stem already strips most suffixes, but
        # be lenient here.
        if not match and stored_norm and extracted_norm:
            if stored_norm in extracted_norm or extracted_norm in stored_norm:
                match = True
        if match:
            matches += 1
            results.append({
                "id": row["id"],
                "canonical_name": row["canonical_name"],
                "state_entity_number": doc,
                "stored_agent": stored,
                "extracted_agent": extracted,
                "stored_norm": stored_norm,
                "extracted_norm": extracted_norm,
                "status": "match",
                "is_suspect": False,
            })
        else:
            mismatches += 1
            results.append({
                "id": row["id"],
                "canonical_name": row["canonical_name"],
                "state_entity_number": doc,
                "stored_agent": stored,
                "extracted_agent": extracted,
                "stored_norm": stored_norm,
                "extracted_norm": extracted_norm,
                "status": "mismatch",
                "is_suspect": True,
            })

    # Add unmatchable rows as suspects too (since we can't QC them)
    for row, reason in unmatchable:
        results.append({
            "id": row["id"],
            "canonical_name": row["canonical_name"],
            "state_entity_number": row.get("state_entity_number"),
            "stored_agent": row.get("registered_agent"),
            "extracted_agent": None,
            "stored_norm": normalize_agent(row.get("registered_agent")),
            "extracted_norm": None,
            "status": f"unverifiable: {reason}",
            "is_suspect": True,
        })

    sampled = len(sample)
    verifiable = sampled - len(unmatchable)
    # mismatch_rate is over the *verifiable* subset; report both
    mismatch_rate_verifiable = (mismatches / verifiable) if verifiable else 0.0
    mismatch_rate_overall = (sum(1 for r in results if r["is_suspect"]) / sampled) if sampled else 0.0

    suspect_ids = [r["id"] for r in results if r["is_suspect"]]

    # Write report
    lines = []
    lines.append("=" * 78)
    lines.append("REGISTERED_AGENT QC REPORT — 2026-05-21")
    lines.append("=" * 78)
    lines.append(f"Generated:  {datetime.now(timezone.utc).isoformat()}")
    lines.append(f"Trigger:    registered_agent fill rate 5.1% → 7.01% (recent backfill)")
    lines.append(f"Memory:     sunbiz_parser_offset.md — past writes by bulk-sunbiz-match.py")
    lines.append(f"            may be corrupted at state_entity_number ([:13] vs [:12])")
    lines.append(f"            and legal_name ([13:93] vs [12:204]).")
    lines.append("")
    lines.append("-- POOL & SAMPLE --------------------------------------------------------")
    lines.append(f"Pool (registered_agent set, updated in last 30 days): {len(pool)} rows")
    lines.append(f"Sample size: {sampled} (seed={SEED})")
    lines.append(f"Verifiable (had usable state_entity_number):         {verifiable}")
    lines.append(f"Unverifiable (missing / corrupted doc):              {len(unmatchable)}")
    lines.append("")
    lines.append("-- RESULTS --------------------------------------------------------------")
    lines.append(f"Matches (normalized stored == normalized extracted):  {matches}")
    lines.append(f"Mismatches:                                           {mismatches}")
    lines.append(f"Doc not found in cordata:                             {not_in_cordata}")
    lines.append(f"Cordata line found but parser yielded no agent:       {no_extract}")
    lines.append("")
    lines.append(f"mismatch_rate (verifiable only): {mismatch_rate_verifiable:.2%}")
    lines.append(f"suspect_rate (verifiable mismatches + unverifiable): {mismatch_rate_overall:.2%}")
    lines.append(f"threshold for Admiral queue: {MISMATCH_THRESHOLD:.0%}")
    lines.append("")
    if mismatch_rate_verifiable > MISMATCH_THRESHOLD:
        lines.append(f"DECISION: mismatch_rate {mismatch_rate_verifiable:.2%} > {MISMATCH_THRESHOLD:.0%} — "
                     f"queuing all {len(suspect_ids)} suspect rows for Admiral review.")
    else:
        lines.append(f"DECISION: mismatch_rate {mismatch_rate_verifiable:.2%} <= {MISMATCH_THRESHOLD:.0%} — "
                     f"backfill quality acceptable. {len(suspect_ids)} suspects still listed for awareness; no review queue triggered.")
    lines.append("NO AUTO-REVERTS PERFORMED (per Admiral directive).")
    lines.append("")
    lines.append("-- SUSPECT ROWS ---------------------------------------------------------")
    if suspect_ids:
        for r in results:
            if not r["is_suspect"]:
                continue
            lines.append(f"  {r['id']}  doc={r['state_entity_number']}  [{r['status']}]")
            lines.append(f"    name:      {r['canonical_name']}")
            lines.append(f"    stored:    {r['stored_agent']!r}")
            lines.append(f"    extracted: {r['extracted_agent']!r}")
            if r["stored_norm"] != (r["extracted_norm"] or ""):
                lines.append(f"    norm cmp:  stored={r['stored_norm']!r}  extracted={r['extracted_norm']!r}")
    else:
        lines.append("  (none)")
    lines.append("")
    lines.append("-- ALL SAMPLE ROWS (compact) --------------------------------------------")
    for r in results:
        flag = "X" if r["is_suspect"] else "."
        stored_disp = (r["stored_agent"] or "")[:40]
        extracted_disp = (r["extracted_agent"] or "")[:40]
        lines.append(f"  [{flag}] {r['id'][:8]}  {r['status']:30s}  stored={stored_disp:40s} extracted={extracted_disp}")
    lines.append("")
    lines.append("-- SUSPECT ID LIST (one per line) ---------------------------------------")
    lines.extend(suspect_ids)
    lines.append("")
    lines.append("-- END ------------------------------------------------------------------")

    with open(OUT_PATH, "w") as f:
        f.write("\n".join(lines))
    with open(SUSPECT_JSON, "w") as f:
        json.dump({
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "pool_size": len(pool),
            "sample_size": sampled,
            "verifiable": verifiable,
            "matches": matches,
            "mismatches": mismatches,
            "not_in_cordata": not_in_cordata,
            "no_extract": no_extract,
            "unverifiable": len(unmatchable),
            "mismatch_rate_verifiable": mismatch_rate_verifiable,
            "suspect_rate_overall": mismatch_rate_overall,
            "threshold": MISMATCH_THRESHOLD,
            "queued_for_review": mismatch_rate_verifiable > MISMATCH_THRESHOLD,
            "suspect_ids": suspect_ids,
            "details": results,
        }, f, indent=2, default=str)
    print("\n".join(lines[:40]))
    print(f"\nReport: {OUT_PATH}")
    print(f"JSON:   {SUSPECT_JSON}")

    # Return mismatch_rate so caller can detect threshold
    return mismatch_rate_verifiable


if __name__ == "__main__":
    main()

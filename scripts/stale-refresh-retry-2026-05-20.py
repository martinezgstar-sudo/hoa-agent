"""
Retry Tuvok's 2026-05-20 stale-refresh 'no signal' rows with the new
name normalizer + the CORRECTED cordata slicing (line[:12]/[12:204]).

Flow:
  1. Load flagged_for_admiral rows from stale-refresh-2026-05-20-report.json
  2. Snapshot current DB state of those rows to a pre-state JSON
  3. Build normalized name patterns (SEC→SECTION, COND/CONDO→CONDOMINIUM, etc.)
  4. Grep cordata files (CORRECTED slicing per sunbiz_parser_offset memory)
  5. Score candidates with SequenceMatcher on the stem
  6. For each row:
       - hit  → null-only PATCH (state_entity_number, entity_status,
                registered_agent, incorporation_date, street_address, zip_code)
                AND update data_freshness_date='2026-05-20', verification_status='verified'
       - miss → record attempted_normalized_name + outcome='miss' in retry report
  7. Verification SELECT on every patched row
  8. Write retry report alongside snapshot

Per CLAUDE.md rule #18: verification SELECTs are required for every UPDATE.
Per rule #17: never auto-unlink master_hoa_id (not touched here anyway).
Per memory sunbiz_parser_offset: use line[:12]/[12:204] — NOT [:13]/[13:93].
"""
from __future__ import annotations
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from dotenv import load_dotenv
import requests

import importlib.util
_NN_PATH = Path(__file__).resolve().parent / "lib" / "name-normalize.py"
_spec = importlib.util.spec_from_file_location("name_normalize", str(_NN_PATH))
name_normalize = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(name_normalize)
normalize_for_sunbiz = name_normalize.normalize_for_sunbiz
name_stem = name_normalize.name_stem
candidate_patterns = name_normalize.candidate_patterns

load_dotenv(dotenv_path="/Users/izzymartinez/Documents/hoa-agent/.env.local")

URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H_READ = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
H_WRITE = {
    "apikey": KEY,
    "Authorization": f"Bearer {KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

CORDATA_DIR = "/Volumes/LaCie/FL-Palm Beach County Data /cordata_extracted"
SOURCE_REPORT = "/Users/izzymartinez/Agents/hoa-agent/logs/snapshots/stale-refresh-2026-05-20-report.json"
SNAPSHOT_PRE = "/Users/izzymartinez/Agents/hoa-agent/logs/snapshots/stale-refresh-retry-2026-05-20-pre.json"
RETRY_REPORT = "/Users/izzymartinez/Agents/hoa-agent/logs/snapshots/stale-refresh-retry-2026-05-20.json"
TODAY = "2026-05-20"
PBC_ZIP_PREFIXES = ("334", "335")
MIN_SCORE = 0.78  # slightly more permissive than bulk pass since we're rescuing tail


# Pre-filter: which flagged rows should we retry? The Admiral targets rows whose
# names contain abbreviated tokens (SEC, COND/CONDO, NA, PUD, Prcl). We still
# include the others in the retry — the normalizer is a no-op on them so they
# carry no risk, and re-running with corrected slicing might still help.
ABBREVIATION_RE = re.compile(r"\b(SEC|SECT|CONDO?S?|COND|PUD|PRCL|PCL|NA)\b", re.IGNORECASE)


def load_flagged() -> List[dict]:
    with open(SOURCE_REPORT) as f:
        rep = json.load(f)
    return rep.get("flagged_for_admiral", [])


def snapshot_pre(ids: List[str]) -> List[dict]:
    if not ids:
        return []
    id_list = ",".join(f'"{i}"' for i in ids)
    r = requests.get(
        f"{URL}/rest/v1/communities"
        f"?select=id,canonical_name,slug,city,zip_code,street_address,website_url,"
        f"state_entity_number,entity_status,legal_name,registered_agent,"
        f"incorporation_date,data_freshness_date,verification_status,updated_at"
        f"&id=in.({id_list})",
        headers=H_READ,
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def parse_cordata_line(line: str) -> dict:
    """CORRECTED slicing per sunbiz_parser_offset memory.

    [0:12]    state_entity_number
    [12:204]  legal_name (padded with trailing spaces)
    [204]     status char (A=Active, I=Inactive)
    [205:]    payload (filing date, addresses, registered agent, officers)
    """
    if len(line) < 205:
        return {}
    doc_num = line[0:12].strip()
    legal_name = line[12:204].strip()
    status_char = line[204:205]
    rest = line[205:]

    # Address (street + city + ZIP) — mirror bulk-sunbiz-match.py regex
    addr_re = re.compile(
        r"(\d{2,5}\s+[A-Z][A-Z0-9\s]+(?:DR|DRIVE|BLVD|BOULEVARD|AVE|AVENUE|ST|STREET|RD|ROAD|"
        r"LN|LANE|WAY|CT|COURT|PL|PLACE|PKWY|PARKWAY|TER|TERRACE|TRL|TRAIL|CIR|CIRCLE))"
        r"\s+([A-Z][A-Z\s]+?)\s+FL\s*(\d{5})",
        re.IGNORECASE,
    )
    addr = addr_re.search(rest)
    street = addr.group(1).strip() if addr else None
    city = addr.group(2).strip() if addr else None
    zipc = addr.group(3) if addr else None

    # Filing date (MMDDYYYY before a long numeric run)
    inc_date = None
    m = re.search(r"(\d{8})(?=\d{9})", rest)
    if m:
        d = m.group(1)
        try:
            year, mm, dd = int(d[4:8]), int(d[0:2]), int(d[2:4])
            if 1850 <= year <= 2100 and 1 <= mm <= 12 and 1 <= dd <= 31:
                inc_date = f"{year:04d}-{mm:02d}-{dd:02d}"
        except Exception:
            pass

    # Registered agent — best-effort
    ra_re = re.search(
        r"([A-Z][A-Z\s&,\.\-]{5,55}(?:MANAGEMENT|SERVICES|REALTY|PROPERTY|GROUP|LLC|INC|CORP))\s",
        rest,
    )
    reg_agent = ra_re.group(1).strip() if ra_re else None

    return {
        "state_entity_number": doc_num or None,
        "legal_name": legal_name or None,
        "entity_status": "Active" if status_char == "A" else "Inactive",
        "incorporation_date": inc_date,
        "registered_agent": reg_agent,
        "street_address": street,
        "address_city": city,
        "zip_code": zipc,
        "status_char": status_char,
    }


def build_grep_patterns(rows: List[dict]) -> Tuple[str, Dict[str, List[dict]]]:
    """Write all candidate patterns to a tmp file, return (path, pattern→[rows])."""
    pattern_path = "/tmp/stale-retry-patterns.txt"
    pat_map: Dict[str, List[dict]] = {}
    with open(pattern_path, "w") as f:
        for r in rows:
            for p in candidate_patterns(r["canonical_name"]):
                if p in pat_map:
                    # Multiple flagged rows could share a pattern (unlikely but possible)
                    if r not in pat_map[p]:
                        pat_map[p].append(r)
                else:
                    pat_map[p] = [r]
                    f.write(p + "\n")
    return pattern_path, pat_map


def scan_cordata(pattern_file: str) -> List[str]:
    import subprocess
    files = sorted(Path(CORDATA_DIR).glob("cordata*.txt"))
    all_lines: List[str] = []
    for fp in files:
        size_mb = fp.stat().st_size // 1024 // 1024
        print(f"  scanning {fp.name} ({size_mb} MB)…", flush=True)
        proc = subprocess.run(
            ["grep", "-a", "-F", "-f", pattern_file, str(fp)],
            capture_output=True, text=True, errors="replace", check=False,
        )
        lines = proc.stdout.splitlines()
        print(f"    {len(lines)} hits", flush=True)
        all_lines.extend(lines)
    return all_lines


def in_pbc(parsed: dict, row: dict) -> bool:
    zipc = parsed.get("zip_code") or ""
    city = (parsed.get("address_city") or "").upper()
    row_city = (row.get("city") or "").upper()
    if zipc.startswith(PBC_ZIP_PREFIXES):
        return True
    if row_city and city and city.startswith(row_city.split()[0]):
        return True
    return False


def best_match_for_row(row: dict, candidates: List[dict]) -> Optional[Tuple[float, dict]]:
    """Score each cordata candidate vs the row's stem; return best ≥ MIN_SCORE."""
    stem = name_stem(row["canonical_name"])
    if not stem:
        return None
    best: Optional[Tuple[float, dict]] = None
    for c in candidates:
        legal_stem = name_stem(c.get("legal_name") or "")
        if not legal_stem:
            continue
        score = SequenceMatcher(None, stem[:90], legal_stem[:90]).ratio()
        # Prefer PBC hits — boost slightly so a PBC hit at 0.79 beats a non-PBC at 0.81 only if close
        if in_pbc(c, row):
            score += 0.02
        if score >= MIN_SCORE:
            if best is None or score > best[0]:
                best = (score, c)
    return best


def apply_hit(row: dict, parsed: dict) -> Tuple[Dict[str, int], List[dict]]:
    """Null-only PATCH for auto-approvable fields + freshness + verified status.

    Returns (fields_updated, patch_responses).
    """
    field_writes: Dict[str, int] = {}
    responses: List[dict] = []
    cid = row["id"]

    # Auto-approvable null-only field map: { db_field: parsed_key }
    auto_fields = {
        "state_entity_number": "state_entity_number",
        "entity_status":       "entity_status",
        "registered_agent":    "registered_agent",
        "incorporation_date":  "incorporation_date",
        "street_address":      "street_address",
        "zip_code":            "zip_code",
        "legal_name":          "legal_name",
    }
    for db_field, src_key in auto_fields.items():
        val = parsed.get(src_key)
        if not val:
            continue
        # Null-only filter — never overwrite existing
        patch_url = f"{URL}/rest/v1/communities?id=eq.{cid}&{db_field}=is.null"
        resp = requests.patch(
            patch_url, headers=H_WRITE,
            json={db_field: str(val)[:300], "updated_at": "now()"},
            timeout=20,
        )
        if resp.status_code in (200, 204):
            body = resp.json() if resp.text else []
            if body:
                field_writes[db_field] = field_writes.get(db_field, 0) + 1
            responses.append({"field": db_field, "status": resp.status_code, "wrote": bool(body)})
        else:
            responses.append({"field": db_field, "status": resp.status_code, "error": resp.text[:200]})

    # Freshness + verified (always, since we now have a confirmed Sunbiz hit)
    patch_url = f"{URL}/rest/v1/communities?id=eq.{cid}"
    resp = requests.patch(
        patch_url, headers=H_WRITE,
        json={
            "data_freshness_date": TODAY,
            "verification_status": "verified",
            "updated_at": "now()",
        },
        timeout=20,
    )
    responses.append({"field": "freshness+verified", "status": resp.status_code, "wrote": resp.status_code in (200, 204)})

    return field_writes, responses


def main() -> None:
    started = datetime.now(timezone.utc).isoformat()
    print(f"=== stale-refresh-retry-2026-05-20 ===")
    print(f"started_at = {started}")

    # 1. Load flagged rows
    flagged = load_flagged()
    print(f"flagged_for_admiral rows = {len(flagged)}")
    ids = [f["id"] for f in flagged]

    # 2. Snapshot pre-state
    pre = snapshot_pre(ids)
    Path(SNAPSHOT_PRE).parent.mkdir(parents=True, exist_ok=True)
    with open(SNAPSHOT_PRE, "w") as f:
        json.dump({"captured_at": started, "rows": pre}, f, indent=2, default=str)
    print(f"snapshot pre → {SNAPSHOT_PRE} ({len(pre)} rows)")

    # Hydrate canonical_name etc. into flagged list from pre snapshot
    by_id = {r["id"]: r for r in pre}
    rows: List[dict] = []
    for f_ in flagged:
        r = by_id.get(f_["id"], {})
        merged = {**f_, **r}
        merged["attempted_normalized_name"] = normalize_for_sunbiz(merged.get("canonical_name") or "")
        merged["abbrev_token_present"] = bool(ABBREVIATION_RE.search(merged.get("canonical_name") or ""))
        rows.append(merged)

    abbrev_count = sum(1 for r in rows if r["abbrev_token_present"])
    print(f"rows with abbreviation tokens (SEC/CONDO/COND/NA/PUD/Prcl) = {abbrev_count}")

    # 3. Build patterns and scan cordata
    pattern_path, pat_map = build_grep_patterns(rows)
    n_patterns = sum(1 for _ in open(pattern_path))
    print(f"patterns written: {n_patterns}")

    print("scanning cordata files…")
    hits = scan_cordata(pattern_path)
    print(f"raw cordata hit lines: {len(hits)}")

    # 4. Attribute each cordata hit to candidate rows
    parsed_hits: List[dict] = []
    for line in hits:
        p = parse_cordata_line(line)
        if not p:
            continue
        upper_legal = (p.get("legal_name") or "").upper()
        for pat, row_list in pat_map.items():
            if pat in upper_legal:
                for r in row_list:
                    parsed_hits.append({"row_id": r["id"], "parsed": p, "matched_pattern": pat})

    print(f"parsed candidate hits: {len(parsed_hits)}")

    candidates_by_row: Dict[str, List[dict]] = {}
    for h in parsed_hits:
        candidates_by_row.setdefault(h["row_id"], []).append(h["parsed"])

    # 5. Score + apply
    results: List[dict] = []
    hits_applied = 0
    misses = 0
    total_field_writes: Dict[str, int] = {}

    for r in rows:
        candidates = candidates_by_row.get(r["id"], [])
        best = best_match_for_row(r, candidates) if candidates else None
        entry = {
            "id": r["id"],
            "canonical_name": r.get("canonical_name"),
            "city": r.get("city"),
            "zip_code": r.get("zip_code"),
            "attempted_normalized_name": r["attempted_normalized_name"],
            "abbrev_token_present": r["abbrev_token_present"],
            "candidate_count": len(candidates),
        }
        if best:
            score, parsed = best
            field_writes, patch_resps = apply_hit(r, parsed)
            for k, v in field_writes.items():
                total_field_writes[k] = total_field_writes.get(k, 0) + v
            entry.update({
                "outcome": "hit",
                "match_score": round(score, 3),
                "matched_legal_name": parsed.get("legal_name"),
                "matched_state_entity_number": parsed.get("state_entity_number"),
                "in_pbc": in_pbc(parsed, r),
                "field_writes": field_writes,
                "patch_responses": patch_resps,
            })
            hits_applied += 1
            print(f"  HIT  {r['canonical_name']!r:45s} → {parsed.get('legal_name')!r} score={score:.3f} writes={field_writes}")
        else:
            entry.update({
                "outcome": "miss",
                "reason": "no candidate ≥ MIN_SCORE after normalization + corrected slicing",
            })
            misses += 1
            print(f"  miss {r['canonical_name']!r:45s} normalized={r['attempted_normalized_name']!r}")
        results.append(entry)

    # 6. Verification SELECT for every hit row
    hit_ids = [e["id"] for e in results if e["outcome"] == "hit"]
    verification = []
    if hit_ids:
        id_list = ",".join(f'"{i}"' for i in hit_ids)
        v = requests.get(
            f"{URL}/rest/v1/communities"
            f"?select=id,canonical_name,state_entity_number,entity_status,registered_agent,"
            f"incorporation_date,street_address,zip_code,legal_name,data_freshness_date,"
            f"verification_status,updated_at"
            f"&id=in.({id_list})",
            headers=H_READ, timeout=30,
        )
        v.raise_for_status()
        verification = v.json()

    report = {
        "started_at": started,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "flagged_total": len(rows),
        "hits": hits_applied,
        "misses": misses,
        "total_field_writes": total_field_writes,
        "results": results,
        "post_verification": verification,
        "snapshot_pre": SNAPSHOT_PRE,
        "notes": [
            "Used CORRECTED cordata slicing line[:12]/[12:204] per sunbiz_parser_offset memory.",
            "Null-only PATCHes — never overwrite existing community fields.",
            "Miss rows have attempted_normalized_name set; queue row never silently overwritten.",
        ],
    }
    with open(RETRY_REPORT, "w") as f:
        json.dump(report, f, indent=2, default=str)
    print(f"\nreport → {RETRY_REPORT}")
    print(f"hits applied: {hits_applied}  misses: {misses}  field writes: {total_field_writes}")


if __name__ == "__main__":
    main()

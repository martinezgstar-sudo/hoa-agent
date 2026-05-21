"""
Stale freshness refresh for the 50 oldest published communities.

Task: pull next 50 published rows ordered by data_freshness_date ASC NULLS first.
For each, verify it still resolves on Sunbiz cordata OR website_url.
One positive signal is sufficient (freshness, not a new claim).
On confirm: UPDATE data_freshness_date='2026-05-20', verification_status='verified'.
Otherwise: flag for Admiral.

Pre-state snapshotted before any write.
"""
from __future__ import annotations
import json
import os
import re
import sys
import subprocess
import urllib.request
import urllib.error
import socket
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path="/Users/izzymartinez/Documents/hoa-agent/.env.local")

SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

SNAPSHOT_PRE = "/Users/izzymartinez/Agents/hoa-agent/logs/snapshots/stale-refresh-2026-05-20.json"
SNAPSHOT_REPORT = "/Users/izzymartinez/Agents/hoa-agent/logs/snapshots/stale-refresh-2026-05-20-report.json"
CORDATA_DIR = "/Volumes/LaCie/FL-Palm Beach County Data /cordata_extracted"
TODAY = "2026-05-20"
PBC_ZIP_PREFIXES = ("334", "335")


def supa() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_rows(sb: Client) -> List[dict]:
    res = (
        sb.from_("communities")
        .select(
            "id, canonical_name, slug, city, zip_code, street_address, website_url, "
            "state_entity_number, entity_status, legal_name, registered_agent, "
            "data_freshness_date, verification_status, updated_at"
        )
        .eq("status", "published")
        .order("data_freshness_date", desc=False, nullsfirst=True)
        .order("updated_at", desc=False)
        .limit(50)
        .execute()
    )
    return res.data


def normalize_name(name: str) -> str:
    n = name.upper()
    n = re.sub(r"[^A-Z0-9 ]+", " ", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n


# Very generic names where a name-only Sunbiz hit could be coincidence;
# require a PBC city/ZIP match in the cordata address for these.
GENERIC_NAMES = {
    "PGA",
    "ABERDEEN",
    "POLO CLUB",
    "KINGS POINT",
    "LEISUREVILLE",
    "VERANO",
    "MODERNE",
    "PALOMA",
    "PALMA",
    "LA PALMA",
    "PALOMA",
    "PINE GROVE VILLAGE",
    "OSCEOLA PARK",
    "EASTVIEW MANOR",
    "GOLF VISTA",
    "DELRAY VILLAS",
}


def build_pattern_file(rows: List[dict], tmp_path: str) -> Dict[str, dict]:
    """Write fixed-string patterns to a file for grep -F -f.

    Returns a map from pattern → {id, canonical_name, ...} so we can attribute hits.
    """
    pattern_map: Dict[str, dict] = {}
    with open(tmp_path, "w") as f:
        for r in rows:
            norm = normalize_name(r["canonical_name"])
            if not norm:
                continue
            pattern_map[norm] = r
            f.write(norm + "\n")
    return pattern_map


def scan_cordata(pattern_file: str) -> List[str]:
    """Run grep -F -f patterns.txt against all cordata files. Return matching lines."""
    files = sorted(Path(CORDATA_DIR).glob("cordata*.txt"))
    all_lines: List[str] = []
    for fp in files:
        print(f"  scanning {fp.name} ({fp.stat().st_size // 1024 // 1024} MB)…", flush=True)
        # -a treat as text, -F fixed strings, -f pattern file
        try:
            proc = subprocess.run(
                ["grep", "-a", "-F", "-f", pattern_file, str(fp)],
                capture_output=True,
                text=True,
                errors="replace",
                check=False,
            )
            lines = proc.stdout.splitlines()
            print(f"    {len(lines)} hits", flush=True)
            all_lines.extend(lines)
        except Exception as e:
            print(f"    ERROR: {e}", flush=True)
    return all_lines


def parse_cordata_line(line: str) -> dict:
    """Cordata fixed-width layout (positions verified from raw inspection):
    - [0:12]   state_entity_number (12 chars)
    - [12:204] legal_name (192 chars, padded)
    - [204]    status char (A=Active, I=Inactive)
    Remainder is filing-type code + addresses + officers. We extract the principal
    city/state/zip by regex on the tail.
    """
    if len(line) < 205:
        return {}
    entity_no = line[0:12].strip()
    legal_name = line[12:204].strip()
    status_char = line[204:205]
    # Principal address starts ~217; city/state/ZIP appear at known offsets but
    # are variable due to optional address2. Use a regex on the tail for the first
    # FLZIP pattern.
    tail = line[205:]
    m = re.search(r"\b([A-Z][A-Z .'\-]+?)\s+FL(\d{5})", tail)
    city = m.group(1).strip() if m else ""
    zipcode = m.group(2) if m else ""
    return {
        "entity_no": entity_no,
        "legal_name": legal_name,
        "status_char": status_char,
        "address_city": city,
        "address_zip": zipcode,
    }


def http_check(url: str, timeout: float = 8.0) -> Tuple[bool, str]:
    """HEAD then GET fallback. Returns (resolves, detail)."""
    if not url:
        return False, "no_url"
    if not url.startswith("http"):
        url = "https://" + url
    headers = {"User-Agent": "Mozilla/5.0 (HOA-Agent freshness check)"}
    for method in ("HEAD", "GET"):
        try:
            req = urllib.request.Request(url, method=method, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                code = resp.getcode()
                if 200 <= code < 400:
                    return True, f"{method} {code}"
                return False, f"{method} {code}"
        except urllib.error.HTTPError as e:
            if e.code in (405, 403) and method == "HEAD":
                continue  # try GET
            return False, f"http_error {e.code}"
        except urllib.error.URLError as e:
            return False, f"url_error {e.reason}"
        except (socket.timeout, TimeoutError):
            return False, "timeout"
        except Exception as e:
            return False, f"err {type(e).__name__}"
    return False, "no_response"


def main():
    started = datetime.now(timezone.utc).isoformat()
    sb = supa()

    print("Fetching 50 stalest published rows…", flush=True)
    rows = fetch_rows(sb)
    print(f"  got {len(rows)}", flush=True)

    # ---- Snapshot pre-state (REQUIRED before any write) ----
    Path(SNAPSHOT_PRE).parent.mkdir(parents=True, exist_ok=True)
    with open(SNAPSHOT_PRE, "w") as f:
        json.dump({"captured_at": started, "rows": rows}, f, indent=2, default=str)
    print(f"  snapshot → {SNAPSHOT_PRE}", flush=True)

    # ---- Build cordata patterns ----
    pattern_file = "/tmp/stale-refresh-patterns.txt"
    pattern_map = build_pattern_file(rows, pattern_file)
    print(f"Built {len(pattern_map)} name patterns", flush=True)

    # ---- Scan cordata ----
    print("Scanning Sunbiz cordata files…", flush=True)
    hit_lines = scan_cordata(pattern_file)
    print(f"  total {len(hit_lines)} raw hits", flush=True)

    # ---- Attribute hits per pattern ----
    per_id_hits: Dict[str, List[dict]] = {r["id"]: [] for r in rows}
    for line in hit_lines:
        parsed = parse_cordata_line(line)
        upper_legal = parsed.get("legal_name", "").upper()
        for pat, row in pattern_map.items():
            if pat in upper_legal:
                per_id_hits[row["id"]].append(parsed)

    # ---- Decide signal per row ----
    results = []
    confirmed_ids: List[str] = []
    flagged: List[dict] = []

    for r in rows:
        canon = r["canonical_name"]
        norm = normalize_name(canon)
        city = (r.get("city") or "").upper()
        zipc = (r.get("zip_code") or "").strip()
        hits = per_id_hits[r["id"]]

        # Distinguish PBC-area hits from out-of-area coincidences
        pbc_hits = []
        active_pbc_hits = []
        for h in hits:
            in_pbc = h["address_zip"].startswith(PBC_ZIP_PREFIXES) or (
                city and h["address_city"] and h["address_city"].startswith(city.split()[0])
            )
            if in_pbc:
                pbc_hits.append(h)
                if h["status_char"] == "A":
                    active_pbc_hits.append(h)

        sunbiz_signal = False
        sunbiz_detail = ""
        if norm in GENERIC_NAMES:
            # Require PBC-area match for generic names
            if active_pbc_hits:
                sunbiz_signal = True
                sunbiz_detail = f"active_pbc:{len(active_pbc_hits)}"
            elif pbc_hits:
                sunbiz_signal = True
                sunbiz_detail = f"pbc:{len(pbc_hits)}"
        else:
            if active_pbc_hits:
                sunbiz_signal = True
                sunbiz_detail = f"active_pbc:{len(active_pbc_hits)}"
            elif pbc_hits:
                sunbiz_signal = True
                sunbiz_detail = f"pbc:{len(pbc_hits)}"
            elif hits:
                # Name-only hits — still a positive Sunbiz signal for non-generic names
                sunbiz_signal = True
                sunbiz_detail = f"name_only:{len(hits)}"

        # Website check (only if URL present)
        web_signal = False
        web_detail = ""
        if r.get("website_url"):
            ok, detail = http_check(r["website_url"])
            web_signal = ok
            web_detail = f"{r['website_url']} → {detail}"

        # Best example Sunbiz match to record
        sample = None
        for h in active_pbc_hits or pbc_hits or hits:
            sample = h
            break

        resolved = sunbiz_signal or web_signal
        signal_kind = (
            "sunbiz+web" if (sunbiz_signal and web_signal)
            else "sunbiz" if sunbiz_signal
            else "website" if web_signal
            else "none"
        )

        entry = {
            "id": r["id"],
            "canonical_name": canon,
            "city": r.get("city"),
            "zip_code": zipc,
            "website_url": r.get("website_url"),
            "name_pattern": norm,
            "is_generic_name": norm in GENERIC_NAMES,
            "cordata_hits_total": len(hits),
            "cordata_hits_pbc": len(pbc_hits),
            "cordata_hits_pbc_active": len(active_pbc_hits),
            "sunbiz_signal": sunbiz_signal,
            "sunbiz_detail": sunbiz_detail,
            "website_signal": web_signal,
            "website_detail": web_detail,
            "sample_match": sample,
            "resolved": resolved,
            "signal_kind": signal_kind,
        }
        results.append(entry)
        if resolved:
            confirmed_ids.append(r["id"])
        else:
            flagged.append({
                "id": r["id"],
                "canonical_name": canon,
                "city": r.get("city"),
                "zip_code": zipc,
                "reason": "no_signal — no Sunbiz cordata match in PBC and no website to check",
            })

    print(f"Resolved: {len(confirmed_ids)}/50  Flagged: {len(flagged)}", flush=True)

    # ---- Apply UPDATEs ----
    updates_applied = []
    for cid in confirmed_ids:
        upd = (
            sb.from_("communities")
            .update({
                "data_freshness_date": TODAY,
                "verification_status": "verified",
            })
            .eq("id", cid)
            .execute()
        )
        updates_applied.append({"id": cid, "ok": bool(upd.data), "data": upd.data})

    # ---- Verification SELECT ----
    if confirmed_ids:
        ver = (
            sb.from_("communities")
            .select("id, canonical_name, data_freshness_date, verification_status, updated_at")
            .in_("id", confirmed_ids)
            .execute()
        )
        verification = ver.data
    else:
        verification = []

    report = {
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "pulled": len(rows),
        "resolved": len(confirmed_ids),
        "flagged": len(flagged),
        "results": results,
        "updates_applied": updates_applied,
        "post_verification": verification,
        "flagged_for_admiral": flagged,
        "snapshot_pre": SNAPSHOT_PRE,
    }
    with open(SNAPSHOT_REPORT, "w") as f:
        json.dump(report, f, indent=2, default=str)
    print(f"Report → {SNAPSHOT_REPORT}", flush=True)
    print("DONE", flush=True)


if __name__ == "__main__":
    main()

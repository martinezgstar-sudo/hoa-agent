#!/usr/bin/env python3
"""
dedupe-sweep-by-zip.py
Sweep all 7,947 published communities with a zip_code, group by ZIP,
fuzzy-match all intra-ZIP pairs using scripts/lib/dedupe-check.py's
normalize_name + Levenshtein/difflib, rank pairs by similarity, emit
the top 25 to:
  1. scripts/output/dedupe-sweep-by-zip-<date>.json (full report)
  2. /Users/izzymartinez/Agents/hoa-agent/logs/snapshots/dedupe-sweep-<ts>.json
  3. agent_review_queue (one row per pair, agent_id=ms-adv, company=hoa-agent)

Per CLAUDE.md rules 16/17 this script NEVER auto-merges. Each pair is
flagged for Admiral merge decision.
"""
from __future__ import annotations
import os, sys, json, time
from datetime import datetime, timezone
from collections import defaultdict
from itertools import combinations
import importlib.util
import requests
from dotenv import load_dotenv

load_dotenv(".env.local", override=True)

URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
H_R = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
H_W = {**H_R, "Content-Type": "application/json", "Prefer": "return=representation"}

# Import the project's normalize_name / distance helpers from dedupe-check.py
spec = importlib.util.spec_from_file_location(
    "dedupe_check",
    os.path.join(os.path.dirname(__file__), "lib", "dedupe-check.py"),
)
dc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dc)

normalize_name = dc.normalize_name
_name_distance = dc._name_distance
_is_duplicate = dc._is_duplicate


def fetch_published_with_zip():
    rows = []
    offset = 0
    page = 1000
    while True:
        r = requests.get(
            f"{URL}/rest/v1/communities"
            f"?select=id,canonical_name,city,zip_code,master_hoa_id,is_sub_hoa,status,unit_count,street_address"
            f"&status=eq.published"
            f"&zip_code=not.is.null"
            f"&order=zip_code.asc,canonical_name.asc"
            f"&limit={page}&offset={offset}",
            headers=H_R,
            timeout=60,
        )
        r.raise_for_status()
        chunk = r.json()
        if not chunk:
            break
        rows.extend(chunk)
        if len(chunk) < page:
            break
        offset += page
    return rows


def score_pair(a: dict, b: dict) -> dict | None:
    na = normalize_name(a.get("canonical_name") or "")
    nb = normalize_name(b.get("canonical_name") or "")
    if not na or not nb:
        return None
    # Distinct from check_for_duplicate's hard yes/no — we want a *score*
    # so we can rank candidates. Lower distance = higher confidence.
    dist = _name_distance(na, nb)
    longer = max(len(na), len(nb))
    if longer == 0:
        return None
    ratio = 1 - (dist / longer)
    # Keep only meaningful candidates
    if ratio < 0.80 and dist > 3:
        return None
    return {
        "distance": dist,
        "ratio": round(ratio, 4),
        "norm_a": na,
        "norm_b": nb,
        "exact_norm_match": na == nb,
    }


def main():
    print("Fetching published communities with zip_code…", flush=True)
    rows = fetch_published_with_zip()
    print(f"Loaded {len(rows)} rows", flush=True)

    by_zip = defaultdict(list)
    for r in rows:
        by_zip[r["zip_code"]].append(r)

    print(f"Grouped into {len(by_zip)} distinct ZIPs", flush=True)

    candidate_pairs = []
    pairs_scanned = 0
    t0 = time.time()
    for zip_code, group in by_zip.items():
        if len(group) < 2:
            continue
        for a, b in combinations(group, 2):
            pairs_scanned += 1
            score = score_pair(a, b)
            if not score:
                continue
            candidate_pairs.append({
                "zip_code": zip_code,
                "city": a.get("city") or b.get("city"),
                "a": {
                    "id": a["id"],
                    "canonical_name": a["canonical_name"],
                    "city": a.get("city"),
                    "street_address": a.get("street_address"),
                    "master_hoa_id": a.get("master_hoa_id"),
                    "is_sub_hoa": a.get("is_sub_hoa"),
                    "unit_count": a.get("unit_count"),
                },
                "b": {
                    "id": b["id"],
                    "canonical_name": b["canonical_name"],
                    "city": b.get("city"),
                    "street_address": b.get("street_address"),
                    "master_hoa_id": b.get("master_hoa_id"),
                    "is_sub_hoa": b.get("is_sub_hoa"),
                    "unit_count": b.get("unit_count"),
                },
                **score,
            })

    elapsed = time.time() - t0
    print(
        f"Scanned {pairs_scanned} intra-ZIP pairs in {elapsed:.1f}s → "
        f"{len(candidate_pairs)} candidates above threshold",
        flush=True,
    )

    # Rank: exact normalized match first, then by distance asc, then by longest name first
    candidate_pairs.sort(
        key=lambda p: (
            0 if p["exact_norm_match"] else 1,
            p["distance"],
            -max(len(p["a"]["canonical_name"] or ""), len(p["b"]["canonical_name"] or "")),
        )
    )

    top25 = candidate_pairs[:25]

    # Persist full report
    out_dir = os.path.join(os.path.dirname(__file__), "output")
    os.makedirs(out_dir, exist_ok=True)
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    report_path = os.path.join(out_dir, f"dedupe-sweep-by-zip-{date}.json")
    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "rows_scanned": len(rows),
        "zips_with_2plus": sum(1 for g in by_zip.values() if len(g) >= 2),
        "pairs_scanned": pairs_scanned,
        "candidates_above_threshold": len(candidate_pairs),
        "top_25": top25,
        "all_candidates": candidate_pairs,
    }
    with open(report_path, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"Wrote {report_path}", flush=True)

    snap_dir = "/Users/izzymartinez/Agents/hoa-agent/logs/snapshots"
    os.makedirs(snap_dir, exist_ok=True)
    snap_path = os.path.join(snap_dir, f"dedupe-sweep-{ts}.json")
    with open(snap_path, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"Wrote snapshot {snap_path}", flush=True)

    print("\nTOP 25 candidate pairs:")
    for i, p in enumerate(top25, 1):
        print(
            f"  {i:>2}. ZIP {p['zip_code']} | dist={p['distance']} ratio={p['ratio']} "
            f"exact={p['exact_norm_match']}\n"
            f"      A: {p['a']['canonical_name']}  ({p['a']['id']})\n"
            f"      B: {p['b']['canonical_name']}  ({p['b']['id']})"
        )

    # Emit one agent_review_queue row per pair
    inserted = 0
    skipped_existing = 0
    for p in top25:
        title = (
            f"Dedupe candidate (ZIP {p['zip_code']}): "
            f"{p['a']['canonical_name']} ↔ {p['b']['canonical_name']}"
        )
        description = (
            f"Two published communities in ZIP {p['zip_code']} normalize to similar names "
            f"(distance={p['distance']}, ratio={p['ratio']}, exact_norm_match={p['exact_norm_match']}). "
            f"Admiral review required before any merge — per CLAUDE.md rules 16/17 we never "
            f"auto-merge or auto-unlink. Possible resolutions: (a) mark one status=duplicate and "
            f"keep the richer record, (b) confirm both are distinct sub-associations under a master "
            f"HOA, or (c) leave as-is if the names refer to different phases or buildings.\n\n"
            f"A: {p['a']['canonical_name']} (id={p['a']['id']}, city={p['a']['city']}, "
            f"units={p['a']['unit_count']}, master_hoa_id={p['a']['master_hoa_id']}, "
            f"is_sub_hoa={p['a']['is_sub_hoa']}, addr={p['a']['street_address']})\n"
            f"B: {p['b']['canonical_name']} (id={p['b']['id']}, city={p['b']['city']}, "
            f"units={p['b']['unit_count']}, master_hoa_id={p['b']['master_hoa_id']}, "
            f"is_sub_hoa={p['b']['is_sub_hoa']}, addr={p['b']['street_address']})"
        )

        # Skip if an identical-title open entry already exists
        chk = requests.get(
            f"{URL}/rest/v1/agent_review_queue"
            f"?select=id,status&title=eq.{requests.utils.quote(title)}&status=eq.pending",
            headers=H_R,
            timeout=30,
        )
        if chk.ok and chk.json():
            skipped_existing += 1
            continue

        body = {
            "agent_id": "ms-adv",
            "company": "hoa-agent",
            "priority": "medium",
            "title": title,
            "description": description,
            "context": {
                "kind": "dedupe_candidate_pair",
                "source": "dedupe-sweep-by-zip.py",
                "zip_code": p["zip_code"],
                "city": p["city"],
                "distance": p["distance"],
                "ratio": p["ratio"],
                "exact_norm_match": p["exact_norm_match"],
                "norm_a": p["norm_a"],
                "norm_b": p["norm_b"],
                "a": p["a"],
                "b": p["b"],
                "rules_referenced": ["CLAUDE.md rule 16", "CLAUDE.md rule 17"],
                "auto_action": "none",
                "report_path": report_path,
            },
        }
        r = requests.post(
            f"{URL}/rest/v1/agent_review_queue",
            headers=H_W,
            data=json.dumps(body),
            timeout=30,
        )
        if r.status_code >= 300:
            print(f"  ! insert failed for ZIP {p['zip_code']}: {r.status_code} {r.text}",
                  flush=True)
            continue
        inserted += 1

    print(f"\nInserted {inserted} agent_review_queue rows; "
          f"skipped {skipped_existing} as already-pending duplicates", flush=True)

    summary = {
        "rows_scanned": len(rows),
        "pairs_scanned": pairs_scanned,
        "candidates_above_threshold": len(candidate_pairs),
        "top_25_count": len(top25),
        "queue_inserted": inserted,
        "queue_skipped_existing": skipped_existing,
        "report_path": report_path,
        "snapshot_path": snap_path,
    }
    print("\nSUMMARY: " + json.dumps(summary))
    return summary


if __name__ == "__main__":
    sys.exit(0 if main() else 1)

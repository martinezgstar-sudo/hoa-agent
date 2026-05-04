#!/usr/bin/env python3
"""
bulk-sunbiz-match.py
ONE pass through all cordata*.txt files (~18GB).
- Build inverted index: significant-word → community ids
- Stream each line; intersect line's significant words with index → candidates
- Fuzzy-match candidate names with difflib (>=0.80)
- Parse status, doc_num, registered_agent, address, inc_date
- Write best match per community → patch communities (only null fields)
"""
import os, re, sys, time, json, urllib.parse, urllib.request, warnings
from difflib import SequenceMatcher
from collections import defaultdict
import requests
warnings.filterwarnings("ignore")
from dotenv import load_dotenv
load_dotenv(".env.local", override=True)

URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}",
     "Content-Type": "application/json", "Prefer": "return=minimal"}

CORDATA_DIR = "/Volumes/LaCie/FL-Palm Beach County Data /cordata_extracted"
OUT_DIR = "scripts/output"
LOG_PATH = f"{OUT_DIR}/bulk-sunbiz-match.txt"
MATCHES_PATH = f"{OUT_DIR}/bulk-sunbiz-matches.json"

STOPWORDS = {
    "HOMEOWNERS","HOMEOWNER","ASSOCIATION","ASSOCIATIONS","CONDOMINIUM","CONDO",
    "PROPERTY","PROPERTIES","OWNERS","OWNER","COMMUNITY","COMMUNITIES",
    "INC","INCORPORATED","LLC","CORP","LTD","CORPORATION","COMPANY",
    "AT","OF","IN","THE","AND","FOR","FLORIDA",
    "ESTATE","ESTATES","CLUB","HOA","COA","INCORP",
}

def tokenize(name: str):
    """Return set of significant words from an entity/community name."""
    return {w for w in re.split(r"\W+", name.upper()) if len(w) > 3 and w not in STOPWORDS}


def fetch_communities():
    rows = []
    offset = 0
    while True:
        r = requests.get(
            f"{URL}/rest/v1/communities"
            f"?select=id,canonical_name,city,zip_code,entity_status,state_entity_number,"
            f"registered_agent,incorporation_date,street_address"
            f"&status=eq.published&limit=1000&offset={offset}",
            headers={"apikey": KEY, "Authorization": f"Bearer {KEY}"},
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


def parse_record(line: str):
    """Parse a Sunbiz cordata fixed-width line into a dict."""
    doc_num  = line[:13].strip()
    ent_name = line[13:93].strip()
    rest     = line[93:]

    status_char = rest.strip()[:1] if rest.strip() else ""
    is_active   = status_char == "A"

    # Address (street + city + ZIP)
    addr_re = re.compile(
        r"(\d{2,5}\s+[A-Z][A-Z0-9\s]+(?:DR|DRIVE|BLVD|BOULEVARD|AVE|AVENUE|ST|STREET|RD|ROAD|LN|LANE|WAY|CT|COURT|PL|PLACE|PKWY|PARKWAY|TER|TERRACE|TRL|TRAIL|CIR|CIRCLE))\s+([A-Z][A-Z\s]+?)\s+FL\s*(\d{5})",
        re.IGNORECASE,
    )
    addr = addr_re.search(rest)
    street = addr.group(1).strip() if addr else None
    zipc   = addr.group(3) if addr else None

    # 8-digit filing date MMDDYYYY before a long numeric run
    date_match = re.search(r"(\d{8})(?=\d{9})", rest)
    inc_date = None
    if date_match:
        d = date_match.group(1)
        try:
            year, mm, dd = int(d[4:8]), int(d[0:2]), int(d[2:4])
            if 1850 <= year <= 2100 and 1 <= mm <= 12 and 1 <= dd <= 31:
                inc_date = f"{year:04d}-{mm:02d}-{dd:02d}"
        except Exception:
            pass

    # Registered agent — best-effort
    ra = re.search(r"([A-Z][A-Z\s&,\.\-]{5,55}(?:MANAGEMENT|SERVICES|REALTY|PROPERTY|GROUP|LLC|INC|CORP))\s", rest)
    reg_agent = ra.group(1).strip() if ra else None

    return {
        "state_entity_number": doc_num or None,
        "entity_name":         ent_name or None,
        "entity_status":       "Active" if is_active else "Inactive",
        "incorporation_date":  inc_date,
        "registered_agent":    reg_agent,
        "street_address":      street,
        "zip_code":            zipc,
    }


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    if not os.path.isdir(CORDATA_DIR):
        print(f"ERROR: {CORDATA_DIR} not mounted")
        sys.exit(1)

    print(f"[{time.strftime('%H:%M:%S')}] Loading communities…", flush=True)
    communities = fetch_communities()
    print(f"[{time.strftime('%H:%M:%S')}] {len(communities)} communities loaded", flush=True)

    # Build inverted index: word → list of (community_idx, words_set, name_upper)
    print(f"[{time.strftime('%H:%M:%S')}] Building inverted index…", flush=True)
    name_words = []   # list of (community_index_in_communities, words, name_upper)
    word_to_idxs = defaultdict(list)
    for ci_full, c in enumerate(communities):
        words = tokenize(c["canonical_name"])
        if len(words) < 2:
            continue
        nw_idx = len(name_words)
        name_words.append((ci_full, words, c["canonical_name"].upper()))
        for w in words:
            word_to_idxs[w].append(nw_idx)  # store nw_idx so lookup matches name_words
    print(f"[{time.strftime('%H:%M:%S')}] index: {len(word_to_idxs)} keys, "
          f"{sum(len(v) for v in word_to_idxs.values())} postings, "
          f"{len(name_words)} indexable communities", flush=True)

    # comm_idx → best match dict
    best = {}  # idx → {score, line, parsed}

    files = sorted(f for f in os.listdir(CORDATA_DIR) if f.startswith("cordata") and f.endswith(".txt"))
    print(f"[{time.strftime('%H:%M:%S')}] streaming {len(files)} files…", flush=True)

    total_lines = 0
    total_matches_examined = 0
    for fname in files:
        path = os.path.join(CORDATA_DIR, fname)
        size_gb = os.path.getsize(path) / 1e9
        t0 = time.time()
        line_count = 0
        with open(path, "r", errors="ignore") as fh:
            for line in fh:
                line_count += 1
                if len(line) < 100:
                    continue
                ent_field = line[13:93]
                ent_words = tokenize(ent_field)
                if len(ent_words) < 2:
                    continue
                # Find candidate community indices via inverted index
                candidates = set()
                for w in ent_words:
                    candidates.update(word_to_idxs.get(w, ()))
                if not candidates:
                    continue
                ent_norm = ent_field.strip().upper()
                for ci in candidates:
                    cidx, cwords, cname_upper = name_words[ci]
                    # Require ≥2 shared significant words to even score (cheap pre-filter)
                    if len(ent_words & cwords) < 2:
                        continue
                    total_matches_examined += 1
                    score = SequenceMatcher(None, ent_norm[:80], cname_upper[:80]).ratio()
                    if score >= 0.80:
                        prev = best.get(ci)
                        if not prev or score > prev["score"]:
                            best[ci] = {"score": round(score, 3), "line": line, "parsed": None}
        elapsed = time.time() - t0
        total_lines += line_count
        print(f"[{time.strftime('%H:%M:%S')}] {fname} ({size_gb:.2f}GB): "
              f"{line_count:,} lines · {elapsed:.0f}s · matches so far: {len(best)}",
              flush=True)

    print(f"[{time.strftime('%H:%M:%S')}] streamed {total_lines:,} total lines · "
          f"examined {total_matches_examined:,} candidate pairs · {len(best)} matches found",
          flush=True)

    # Parse all matches now (cheap)
    for ci, info in best.items():
        info["parsed"] = parse_record(info["line"])
        del info["line"]  # don't keep huge lines

    # Save matches
    enriched = []
    for nw_idx, info in best.items():
        ci_full, _, _ = name_words[nw_idx]
        c = communities[ci_full]
        enriched.append({
            "community_id": c["id"],
            "community_name": c["canonical_name"],
            "city": c.get("city"),
            "match_score": info["score"],
            "sunbiz": info["parsed"],
            "existing": {
                "entity_status": c.get("entity_status"),
                "state_entity_number": c.get("state_entity_number"),
                "registered_agent": c.get("registered_agent"),
                "incorporation_date": c.get("incorporation_date"),
                "street_address": c.get("street_address"),
                "zip_code": c.get("zip_code"),
            },
        })
    enriched.sort(key=lambda r: -r["match_score"])
    with open(MATCHES_PATH, "w") as f:
        json.dump(enriched, f, indent=2)
    print(f"[{time.strftime('%H:%M:%S')}] matches → {MATCHES_PATH}", flush=True)

    # PATCH null fields only
    print(f"[{time.strftime('%H:%M:%S')}] PATCH-ing communities (null-only)…", flush=True)
    field_updates = defaultdict(int)
    rows_updated  = 0
    for r in enriched:
        cid = r["community_id"]
        sb  = r["sunbiz"]
        ex  = r["existing"]
        for field in ("state_entity_number", "entity_status", "registered_agent",
                      "incorporation_date", "street_address", "zip_code"):
            new_val = sb.get(field)
            if not new_val:
                continue
            if ex.get(field):  # already set; never overwrite
                continue
            # PATCH with null-only filter
            patch_url = f"{URL}/rest/v1/communities?id=eq.{cid}&{field}=is.null"
            resp = requests.patch(patch_url, headers=H,
                                  json={field: str(new_val)[:200], "updated_at": "now()"})
            if resp.status_code in (200, 204):
                field_updates[field] += 1
                rows_updated += 1
    print(f"[{time.strftime('%H:%M:%S')}] field updates: {dict(field_updates)} "
          f"(total writes: {rows_updated})", flush=True)

    # Final report
    lines = []
    lines.append("=== BULK SUNBIZ MATCH REPORT ===")
    lines.append(f"Date: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"Source: {CORDATA_DIR}")
    lines.append(f"Files scanned:        {len(files)}")
    lines.append(f"Total lines streamed: {total_lines:,}")
    lines.append(f"Candidate pairs:      {total_matches_examined:,}")
    lines.append(f"Communities loaded:   {len(communities)}")
    lines.append(f"Indexable comms:      {len(name_words)}")
    lines.append(f"Communities matched:  {len(best)}")
    lines.append(f"Total field writes:   {rows_updated}")
    lines.append("")
    lines.append("Field updates:")
    for k, v in sorted(field_updates.items(), key=lambda x: -x[1]):
        lines.append(f"  {k:24s}: {v}")
    lines.append("")
    lines.append("Top 30 highest-scoring matches:")
    for r in enriched[:30]:
        lines.append(f"  {r['match_score']:.2f}  {r['community_name'][:60]:60s} ← "
                     f"{(r['sunbiz'].get('entity_name') or '')[:50]} "
                     f"[{r['sunbiz'].get('state_entity_number')}]")
    with open(LOG_PATH, "w") as f:
        f.write("\n".join(lines))
    print("\n".join(lines))
    print(f"\nReport: {LOG_PATH}")


if __name__ == "__main__":
    main()

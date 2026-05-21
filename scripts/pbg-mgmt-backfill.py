#!/usr/bin/env python3
"""
pbg-mgmt-backfill.py
Palm Beach Gardens management_company backfill via Sunbiz cordata.

Target: 411 published PBG communities with management_company IS NULL
  - 149 already carry a state_entity_number → fast exact lookup by doc num
  - 262 are name-only → fuzzy fixed-width name match

Strategy mirrors scripts/jupiter-mgmt-backfill.py but with the dual
lookup path and a slightly more permissive name-match threshold for
PBG village/condo name suffix noise.

Per CLAUDE.md auto-approval rules:
  - Sunbiz fields (entity_status, state_entity_number, registered_agent,
    incorporation_date, street_address) are auto-approvable from a
    government source when the matched entity classifies as 'assoc'.
  - management_company is auto-approvable ONLY when the registered
    agent strongly resembles a mgmt-company name (MANAGEMENT/SERVICES/
    REALTY/GROUP tokens). Otherwise queue for admin review.
  - All LLC/holding/other matches → queue everything in
    pending_community_data with auto_approvable=false.

Uses corrected cordata parser slices:
  doc_num   = line[:12]
  ent_name  = line[12:204]
  status    = line[204]
  payload   = line[205:]
(Per memory `sunbiz_parser_offset` — legacy [:13]/[13:93] is wrong.)

Inputs:
  /Users/izzymartinez/Agents/hoa-agent/logs/snapshots/pbg-mgmt-pre-<ts>.json
  (latest by mtime auto-detected)

Outputs:
  scripts/output/pbg-mgmt-matches.json
  scripts/output/pbg-mgmt-report.txt
"""
import os, re, sys, time, json, glob, warnings
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

CORDATA_DIR  = "/Volumes/LaCie/FL-Palm Beach County Data /cordata_extracted"
SNAPSHOT_DIR = "/Users/izzymartinez/Agents/hoa-agent/logs/snapshots"
OUT_DIR      = "scripts/output"
MATCHES_PATH = f"{OUT_DIR}/pbg-mgmt-matches.json"
REPORT_PATH  = f"{OUT_DIR}/pbg-mgmt-report.txt"

STOPWORDS = {
    "HOMEOWNERS","HOMEOWNER","ASSOCIATION","ASSOCIATIONS","CONDOMINIUM","CONDO",
    "PROPERTY","PROPERTIES","OWNERS","OWNER","COMMUNITY","COMMUNITIES",
    "INC","INCORPORATED","LLC","CORP","LTD","CORPORATION","COMPANY",
    "AT","OF","IN","THE","AND","FOR","FLORIDA","BEACH","GARDENS","PALM",
    "ESTATE","ESTATES","CLUB","HOA","COA","INCORP",
    "VILLAS","CONDOS","TOWNHOMES","TOWNHOUSES","THS","PUD","PLAT","PH",
    "VILLAGE","VILLAGES","NORTH","SOUTH","EAST","WEST",
}

ASSOC_TYPE_TOKENS = (
    "ASSOCIATION", "HOMEOWNERS", "CONDOMINIUM", " HOA", " COA",
    "PROPERTY OWNERS", "COMMUNITY ASSOCIATION", "TOWNHOUSE ASSOCIATION",
    "TOWNHOMES ASSOCIATION", "MAINTENANCE ASSOCIATION", "OWNERS ASSOCIATION",
    "MASTER ASSOCIATION", "NEIGHBORHOOD ASSOCIATION",
)
HOLDING_TYPE_TOKENS = (
    " LLC", "L.L.C", "HOLDINGS", "PROPERTIES INC", "REALTY",
    "INVESTMENTS", "DEVELOPMENT", "DEVELOPERS", "CAPITAL", "VENTURES",
    "PARTNERS", "BUILDERS",
)
MGMT_CO_TOKENS = (
    "MANAGEMENT", "PROPERTY MANAGEMENT", "MANAGEMENT INC", "MANAGEMENT LLC",
    "REALTY SERVICES", "PROPERTY SERVICES", "ASSOCIATION SERVICES",
    " GROUP", " SERVICES",
)


def tokenize(name: str):
    return {w for w in re.split(r"\W+", (name or "").upper())
            if len(w) > 3 and w not in STOPWORDS}


def classify_entity(entity_name: str) -> str:
    if not entity_name:
        return "other"
    upper = entity_name.upper()
    is_assoc = any(t in upper for t in ASSOC_TYPE_TOKENS)
    is_holding = any(t in upper for t in HOLDING_TYPE_TOKENS)
    if is_assoc and not is_holding:
        return "assoc"
    if is_assoc and is_holding:
        if "ASSOCIATION" in upper or "HOMEOWNERS" in upper or "CONDOMINIUM" in upper:
            return "assoc"
        return "holding"
    if is_holding:
        return "holding"
    return "other"


def looks_like_mgmt_co(name: str) -> bool:
    if not name:
        return False
    upper = name.upper()
    return any(t in upper for t in MGMT_CO_TOKENS)


def parse_record(line: str):
    doc_num     = line[:12].strip()
    ent_name    = line[12:204].strip()
    status_char = line[204] if len(line) > 204 else ""
    is_active   = status_char == "A"
    rest        = line[205:]

    addr_re = re.compile(
        r"(\d{2,5}\s+[A-Z][A-Z0-9\s]+(?:DR|DRIVE|BLVD|BOULEVARD|AVE|AVENUE|ST|STREET|RD|ROAD|LN|LANE|WAY|CT|COURT|PL|PLACE|PKWY|PARKWAY|TER|TERRACE|TRL|TRAIL|CIR|CIRCLE))\s+([A-Z][A-Z\s]+?)\s+FL\s*(\d{5})",
        re.IGNORECASE,
    )
    addr = addr_re.search(rest)
    street = addr.group(1).strip() if addr else None
    zipc   = addr.group(3) if addr else None

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

    ra = re.search(
        r"([A-Z][A-Z\s&,\.\-]{5,55}(?:MANAGEMENT|SERVICES|REALTY|PROPERTY|GROUP|LLC|INC|CORP|ASSOCIATION|HOLDINGS|TRUST|PARTNERS|SOLUTIONS|ADVISORS|CONSULT(?:ING|ANTS)?))\s",
        rest,
    )
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


def latest_snapshot():
    files = sorted(glob.glob(f"{SNAPSHOT_DIR}/pbg-mgmt-pre-*.json"))
    if not files:
        sys.exit(f"ERROR: no PBG snapshot in {SNAPSHOT_DIR}")
    return files[-1]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    if not os.path.isdir(CORDATA_DIR):
        sys.exit(f"ERROR: {CORDATA_DIR} not mounted")

    snap_path = latest_snapshot()
    with open(snap_path) as f:
        snap = json.load(f)
    communities = snap["rows"]
    print(f"[{time.strftime('%H:%M:%S')}] snapshot: {snap_path}", flush=True)
    print(f"[{time.strftime('%H:%M:%S')}] target communities: {len(communities)}", flush=True)

    # Build doc-number index for the 149 with state_entity_number
    by_doc = {}
    for c in communities:
        doc = (c.get("state_entity_number") or "").strip().upper()
        if doc:
            by_doc[doc] = c
    print(f"[{time.strftime('%H:%M:%S')}] doc-num index: {len(by_doc)}", flush=True)

    # Build name index for fuzzy match (all rows; doc-match path takes priority)
    name_words = []          # [(community_obj, tokens, upper_name)]
    word_to_idxs = defaultdict(list)
    for c in communities:
        words = tokenize(c["canonical_name"])
        if len(words) < 1:
            continue
        idx = len(name_words)
        name_words.append((c, words, c["canonical_name"].upper()))
        for w in words:
            word_to_idxs[w].append(idx)
    print(f"[{time.strftime('%H:%M:%S')}] name index: {len(word_to_idxs)} words, "
          f"{len(name_words)} communities", flush=True)

    matched_by_doc  = {}   # community_id → dict(parsed, score=1.0, source='doc')
    matched_by_name = {}   # name_idx     → dict(score, line)

    files = sorted(f for f in os.listdir(CORDATA_DIR)
                   if f.startswith("cordata") and f.endswith(".txt"))
    print(f"[{time.strftime('%H:%M:%S')}] streaming {len(files)} cordata files…", flush=True)
    total_lines = 0
    total_pairs = 0

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
                # Doc-number exact match
                doc = line[:12].strip().upper()
                if doc and doc in by_doc and by_doc[doc]["id"] not in matched_by_doc:
                    parsed = parse_record(line)
                    matched_by_doc[by_doc[doc]["id"]] = {
                        "score": 1.0, "parsed": parsed, "source": "doc",
                    }
                # Fuzzy name match
                ent_field = line[12:204]
                ent_words = tokenize(ent_field)
                if not ent_words:
                    continue
                candidates = set()
                for w in ent_words:
                    candidates.update(word_to_idxs.get(w, ()))
                if not candidates:
                    continue
                ent_norm = ent_field.strip().upper()
                for idx in candidates:
                    c, cwords, cname_upper = name_words[idx]
                    # If we already have a doc-match for this community, skip
                    if c["id"] in matched_by_doc:
                        continue
                    if len(ent_words & cwords) < 1:
                        continue
                    total_pairs += 1
                    score = SequenceMatcher(None, ent_norm[:80], cname_upper[:80]).ratio()
                    if score >= 0.78:
                        prev = matched_by_name.get(idx)
                        if not prev or score > prev["score"]:
                            matched_by_name[idx] = {"score": round(score, 3), "line": line}
        elapsed = time.time() - t0
        total_lines += n
        print(f"[{time.strftime('%H:%M:%S')}] {fname} ({size_gb:.2f}GB): "
              f"{n:,} lines · {elapsed:.0f}s · "
              f"doc={len(matched_by_doc)} name={len(matched_by_name)}",
              flush=True)

    # Build combined enrichment list
    enriched = []
    # community_id → row for existing-values lookup
    by_id = {c["id"]: c for c in communities}
    for cid, info in matched_by_doc.items():
        enriched.append({
            "community_id":  cid,
            "community_name": by_id[cid]["canonical_name"],
            "match_score":   info["score"],
            "match_source":  "doc",
            "sunbiz":        info["parsed"],
            "existing":      by_id[cid],
        })
    for idx, info in matched_by_name.items():
        c = name_words[idx][0]
        parsed = parse_record(info["line"])
        enriched.append({
            "community_id":  c["id"],
            "community_name": c["canonical_name"],
            "match_score":   info["score"],
            "match_source":  "name",
            "sunbiz":        parsed,
            "existing":      c,
        })
    enriched.sort(key=lambda r: (-r["match_score"], r["community_name"]))
    with open(MATCHES_PATH, "w") as f:
        json.dump(enriched, f, indent=2)
    print(f"[{time.strftime('%H:%M:%S')}] matches → {MATCHES_PATH}", flush=True)

    # Classify and write
    auto_approved = []
    queued = []
    field_updates = defaultdict(int)
    mgmt_writes = 0
    pending_writes = 0

    for r in enriched:
        cid = r["community_id"]
        sb  = r["sunbiz"]
        ex  = r["existing"]
        ent_name = sb.get("entity_name") or ""
        cls = classify_entity(ent_name)

        if cls == "assoc":
            # Auto-approve standard Sunbiz fields (null-only PATCH)
            for field in ("state_entity_number", "entity_status", "registered_agent",
                          "incorporation_date", "street_address"):
                new_val = sb.get(field)
                if not new_val: continue
                if ex.get(field): continue
                patch_url = f"{URL}/rest/v1/communities?id=eq.{cid}&{field}=is.null"
                resp = requests.patch(patch_url, headers=H,
                                      json={field: str(new_val)[:200], "updated_at": "now()"})
                if resp.status_code in (200, 204):
                    field_updates[field] += 1

            # management_company: write if registered_agent looks like mgmt co
            reg = sb.get("registered_agent")
            if reg and looks_like_mgmt_co(reg) and not ex.get("management_company"):
                patch_url = f"{URL}/rest/v1/communities?id=eq.{cid}&management_company=is.null"
                resp = requests.patch(patch_url, headers=H,
                                      json={"management_company": reg[:200], "updated_at": "now()"})
                if resp.status_code in (200, 204):
                    field_updates["management_company"] += 1
                    mgmt_writes += 1
                    r["mgmt_action"] = "auto-approved"
                    r["mgmt_value"]  = reg
            elif reg:
                payload = {
                    "community_id":   cid,
                    "field_name":     "management_company",
                    "proposed_value": reg[:200],
                    "source_url":     None,
                    "source_type":    "sunbiz_match",
                    "confidence":     round(r["match_score"], 2),
                    "auto_approvable": False,
                    "status":         "pending",
                }
                resp = requests.post(f"{URL}/rest/v1/pending_community_data",
                                     headers=H, json=payload)
                if resp.status_code in (200, 201, 204):
                    pending_writes += 1
                    r["mgmt_action"] = "queued (assoc match, agent not obvious mgmt co)"
                    r["mgmt_value"]  = reg
            auto_approved.append(r)

        else:
            # holding / other → queue all Sunbiz fields for admin review
            for field in ("state_entity_number", "registered_agent",
                          "incorporation_date", "street_address"):
                new_val = sb.get(field)
                if not new_val: continue
                if ex.get(field): continue
                payload = {
                    "community_id":   cid,
                    "field_name":     field,
                    "proposed_value": str(new_val)[:200],
                    "source_url":     None,
                    "source_type":    "sunbiz_match_llc",
                    "confidence":     round(r["match_score"], 2),
                    "auto_approvable": False,
                    "status":         "pending",
                }
                resp = requests.post(f"{URL}/rest/v1/pending_community_data",
                                     headers=H, json=payload)
                if resp.status_code in (200, 201, 204):
                    pending_writes += 1
            r["mgmt_action"] = f"queued ({cls})"
            queued.append(r)

    matched_ids = {r["community_id"] for r in enriched}
    no_match = [c for c in communities if c["id"] not in matched_ids]

    lines = []
    lines.append("=== PALM BEACH GARDENS MGMT_COMPANY BACKFILL REPORT ===")
    lines.append(f"Date: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"Source: {CORDATA_DIR}")
    lines.append(f"Snapshot: {snap_path}")
    lines.append(f"Target communities:        {len(communities)}")
    lines.append(f"  with state_entity_number: {len(by_doc)}")
    lines.append(f"  name-only:                {len(communities) - len(by_doc)}")
    lines.append(f"Lines streamed:            {total_lines:,}")
    lines.append(f"Candidate name pairs:      {total_pairs:,}")
    lines.append(f"Sunbiz matches (doc):      {len(matched_by_doc)}")
    lines.append(f"Sunbiz matches (name):     {len(matched_by_name)}")
    lines.append(f"Auto-approved (assoc):     {len(auto_approved)}")
    lines.append(f"Queued for review:         {len(queued)}")
    lines.append(f"No match:                  {len(no_match)}")
    lines.append("")
    lines.append("Direct field updates to communities:")
    for k, v in sorted(field_updates.items(), key=lambda x: -x[1]):
        lines.append(f"  {k:24s}: {v}")
    lines.append(f"  management_company direct writes: {mgmt_writes}")
    lines.append(f"  pending_community_data rows inserted: {pending_writes}")
    lines.append("")
    lines.append("AUTO-APPROVED (Association/HOA/Condominium matches):")
    for r in auto_approved:
        lines.append(f"  {r['match_score']:.2f} [{r['match_source']:4s}]  "
                     f"{r['community_name'][:55]:55s} ← "
                     f"{(r['sunbiz'].get('entity_name') or '')[:50]} "
                     f"[{r['sunbiz'].get('state_entity_number')}]")
        if r.get("mgmt_action"):
            lines.append(f"        mgmt: {r['mgmt_action']} → {r.get('mgmt_value')}")
    lines.append("")
    lines.append("QUEUED FOR REVIEW (LLC/holding/other matches):")
    for r in queued:
        lines.append(f"  {r['match_score']:.2f} [{r['match_source']:4s}]  "
                     f"{r['community_name'][:55]:55s} ← "
                     f"{(r['sunbiz'].get('entity_name') or '')[:50]} "
                     f"[{r['sunbiz'].get('state_entity_number')}]")
    lines.append("")
    lines.append(f"NO MATCH ({len(no_match)} communities — first 40 shown):")
    for c in no_match[:40]:
        lines.append(f"  -  {c['canonical_name']}")
    with open(REPORT_PATH, "w") as f:
        f.write("\n".join(lines))
    print("\n".join(lines[:40]))
    print(f"\nFull report: {REPORT_PATH}")


if __name__ == "__main__":
    main()

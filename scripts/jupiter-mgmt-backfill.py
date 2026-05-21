#!/usr/bin/env python3
"""
jupiter-mgmt-backfill.py
Focused Sunbiz match for 25 Jupiter HOAs missing management_company.

Uses CORRECTED parser slices line[:12] / line[12:204] / line[204] / line[205:]
(legacy [:13]/[13:93] slices corrupt state_entity_number and legal_name —
see CLAUDE.md memory `sunbiz_parser_offset`).

For each matched community:
  - If matched entity name looks like an HOA/ASSOCIATION/CONDOMINIUM/COA →
    AUTO-APPROVE: PATCH communities with the Sunbiz fields (null-only).
    If registered_agent strongly resembles a management company
    (MANAGEMENT / PROPERTY MANAGEMENT / SERVICES / REALTY / GROUP),
    also write that string as management_company.
  - If matched entity name looks like an LLC / PROPERTIES / HOLDINGS /
    DEVELOPMENT / REALTY / INVESTMENTS →
    QUEUE FOR REVIEW: insert into pending_community_data with
    source_type='sunbiz_match', auto_approvable=false, status='pending'.
  - Otherwise: queue for review (conservative).

Inputs:
  Reads top-25 pre-snapshot from
  /Users/izzymartinez/Agents/hoa-agent/logs/snapshots/jupiter-mgmt-2026-05-20.json

Outputs:
  scripts/output/jupiter-mgmt-matches.json
  scripts/output/jupiter-mgmt-report.txt
"""
import os, re, sys, time, json, warnings
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
SNAPSHOT    = "/Users/izzymartinez/Agents/hoa-agent/logs/snapshots/jupiter-mgmt-2026-05-20.json"
OUT_DIR     = "scripts/output"
MATCHES_PATH = f"{OUT_DIR}/jupiter-mgmt-matches.json"
REPORT_PATH  = f"{OUT_DIR}/jupiter-mgmt-report.txt"

STOPWORDS = {
    "HOMEOWNERS","HOMEOWNER","ASSOCIATION","ASSOCIATIONS","CONDOMINIUM","CONDO",
    "PROPERTY","PROPERTIES","OWNERS","OWNER","COMMUNITY","COMMUNITIES",
    "INC","INCORPORATED","LLC","CORP","LTD","CORPORATION","COMPANY",
    "AT","OF","IN","THE","AND","FOR","FLORIDA",
    "ESTATE","ESTATES","CLUB","HOA","COA","INCORP",
    "VILLAS","CONDO","CONDOS","TOWNHOMES","TOWNHOMES","TOWNHOUSES","THS","PUD","PLAT","PH",
}

ASSOC_TYPE_TOKENS = (
    "ASSOCIATION", "HOMEOWNERS", "CONDOMINIUM", " HOA", " COA",
    "PROPERTY OWNERS", "COMMUNITY ASSOCIATION", "TOWNHOUSE ASSOCIATION",
    "TOWNHOMES ASSOCIATION", "MAINTENANCE ASSOCIATION", "OWNERS ASSOCIATION",
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
    return {w for w in re.split(r"\W+", name.upper()) if len(w) > 3 and w not in STOPWORDS}


def classify_entity(entity_name: str) -> str:
    """Return 'assoc' | 'holding' | 'other'."""
    if not entity_name:
        return "other"
    upper = entity_name.upper()
    is_assoc = any(t in upper for t in ASSOC_TYPE_TOKENS)
    is_holding = any(t in upper for t in HOLDING_TYPE_TOKENS)
    if is_assoc and not is_holding:
        return "assoc"
    if is_assoc and is_holding:
        # e.g. "XYZ HOMEOWNERS ASSOCIATION LLC" — favor assoc only if explicit
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
    """Fixed-width Sunbiz cordata parser with CORRECTED offsets."""
    doc_num  = line[:12].strip()
    ent_name = line[12:204].strip()
    rest        = line[205:]
    status_char = line[204] if len(line) > 204 else ""
    is_active   = status_char == "A"

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
    with open(SNAPSHOT) as f:
        snap = json.load(f)
    communities = snap["rows"]
    print(f"[{time.strftime('%H:%M:%S')}] target communities: {len(communities)}", flush=True)

    name_words = []
    word_to_idxs = defaultdict(list)
    for ci, c in enumerate(communities):
        words = tokenize(c["canonical_name"])
        if len(words) < 1:
            continue
        nw_idx = len(name_words)
        name_words.append((ci, words, c["canonical_name"].upper()))
        for w in words:
            word_to_idxs[w].append(nw_idx)
    print(f"[{time.strftime('%H:%M:%S')}] index: {len(word_to_idxs)} significant words, "
          f"{len(name_words)} indexable communities", flush=True)
    print(f"    keys: {sorted(word_to_idxs.keys())}", flush=True)

    best = {}
    files = sorted(f for f in os.listdir(CORDATA_DIR) if f.startswith("cordata") and f.endswith(".txt"))
    print(f"[{time.strftime('%H:%M:%S')}] streaming {len(files)} files…", flush=True)

    total_lines = 0
    total_pairs = 0
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
                for ci in candidates:
                    cidx, cwords, cname_upper = name_words[ci]
                    if len(ent_words & cwords) < 1:
                        continue
                    total_pairs += 1
                    score = SequenceMatcher(None, ent_norm[:80], cname_upper[:80]).ratio()
                    if score >= 0.78:
                        prev = best.get(ci)
                        if not prev or score > prev["score"]:
                            best[ci] = {"score": round(score, 3), "line": line, "parsed": None}
        elapsed = time.time() - t0
        total_lines += line_count
        print(f"[{time.strftime('%H:%M:%S')}] {fname} ({size_gb:.2f}GB): "
              f"{line_count:,} lines · {elapsed:.0f}s · matches: {len(best)}", flush=True)

    print(f"[{time.strftime('%H:%M:%S')}] done streaming. {total_lines:,} lines · "
          f"{total_pairs:,} candidate pairs · {len(best)} matches", flush=True)

    enriched = []
    for nw_idx, info in best.items():
        info["parsed"] = parse_record(info["line"])
        info.pop("line", None)
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
                "management_company": c.get("management_company"),
            },
        })
    enriched.sort(key=lambda r: -r["match_score"])
    with open(MATCHES_PATH, "w") as f:
        json.dump(enriched, f, indent=2)
    print(f"[{time.strftime('%H:%M:%S')}] matches → {MATCHES_PATH}", flush=True)

    # Classify and apply
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
            # Auto-approve the standard Sunbiz fields (null-only)
            for field in ("state_entity_number", "entity_status", "registered_agent",
                          "incorporation_date", "street_address"):
                new_val = sb.get(field)
                if not new_val:
                    continue
                if ex.get(field):
                    continue
                patch_url = f"{URL}/rest/v1/communities?id=eq.{cid}&{field}=is.null"
                resp = requests.patch(patch_url, headers=H,
                                      json={field: str(new_val)[:200], "updated_at": "now()"})
                if resp.status_code in (200, 204):
                    field_updates[field] += 1

            # management_company: only if registered_agent strongly looks like a mgmt co
            reg = sb.get("registered_agent")
            if reg and looks_like_mgmt_co(reg) and not ex.get("management_company"):
                patch_url = f"{URL}/rest/v1/communities?id=eq.{cid}&management_company=is.null"
                resp = requests.patch(patch_url, headers=H,
                                      json={"management_company": reg[:200], "updated_at": "now()"})
                if resp.status_code in (200, 204):
                    field_updates["management_company"] += 1
                    mgmt_writes += 1
                    r["mgmt_action"] = "auto-approved"
                    r["mgmt_value"] = reg
            elif reg:
                # Queue the reg_agent → management_company decision for admin review
                payload = {
                    "community_id": cid,
                    "field_name": "management_company",
                    "proposed_value": reg[:200],
                    "source_url": None,
                    "source_type": "sunbiz_match",
                    "confidence": round(r["match_score"], 2),
                    "auto_approvable": False,
                    "status": "pending",
                }
                resp = requests.post(f"{URL}/rest/v1/pending_community_data",
                                     headers=H, json=payload)
                if resp.status_code in (200, 201, 204):
                    pending_writes += 1
                    r["mgmt_action"] = "queued (assoc match, agent not obvious mgmt co)"
                    r["mgmt_value"] = reg

            auto_approved.append(r)

        else:
            # LLC / holding / other — queue everything for admin review
            for field in ("state_entity_number", "registered_agent",
                          "incorporation_date", "street_address"):
                new_val = sb.get(field)
                if not new_val:
                    continue
                if ex.get(field):
                    continue
                payload = {
                    "community_id": cid,
                    "field_name": field,
                    "proposed_value": str(new_val)[:200],
                    "source_url": None,
                    "source_type": "sunbiz_match_llc",
                    "confidence": round(r["match_score"], 2),
                    "auto_approvable": False,
                    "status": "pending",
                }
                resp = requests.post(f"{URL}/rest/v1/pending_community_data",
                                     headers=H, json=payload)
                if resp.status_code in (200, 201, 204):
                    pending_writes += 1
            r["mgmt_action"] = f"queued ({cls})"
            queued.append(r)

    # Communities with no match at all
    matched_ids = {r["community_id"] for r in enriched}
    no_match = [c for c in communities if c["id"] not in matched_ids]

    # Report
    lines = []
    lines.append("=== JUPITER MGMT_COMPANY BACKFILL REPORT ===")
    lines.append(f"Date: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"Source: {CORDATA_DIR}")
    lines.append(f"Target communities:   {len(communities)}")
    lines.append(f"Lines streamed:       {total_lines:,}")
    lines.append(f"Candidate pairs:      {total_pairs:,}")
    lines.append(f"Sunbiz matches:       {len(best)}")
    lines.append(f"Auto-approved (assoc):{len(auto_approved)}")
    lines.append(f"Queued for review:    {len(queued)}")
    lines.append(f"No match:             {len(no_match)}")
    lines.append("")
    lines.append("Direct field updates to communities:")
    for k, v in sorted(field_updates.items(), key=lambda x: -x[1]):
        lines.append(f"  {k:24s}: {v}")
    lines.append(f"  management_company writes: {mgmt_writes}")
    lines.append(f"  pending_community_data rows inserted: {pending_writes}")
    lines.append("")
    lines.append("AUTO-APPROVED (Association/HOA/Condominium matches):")
    for r in auto_approved:
        lines.append(f"  {r['match_score']:.2f}  {r['community_name'][:55]:55s} ← "
                     f"{(r['sunbiz'].get('entity_name') or '')[:50]} "
                     f"[{r['sunbiz'].get('state_entity_number')}]")
        if r.get("mgmt_action"):
            lines.append(f"        mgmt: {r['mgmt_action']} → {r.get('mgmt_value')}")
    lines.append("")
    lines.append("QUEUED FOR REVIEW (LLC/holding/other matches):")
    for r in queued:
        lines.append(f"  {r['match_score']:.2f}  {r['community_name'][:55]:55s} ← "
                     f"{(r['sunbiz'].get('entity_name') or '')[:50]} "
                     f"[{r['sunbiz'].get('state_entity_number')}]")
    lines.append("")
    lines.append("NO MATCH:")
    for c in no_match:
        lines.append(f"  -     {c['canonical_name']}")
    with open(REPORT_PATH, "w") as f:
        f.write("\n".join(lines))
    print("\n".join(lines))
    print(f"\nReport: {REPORT_PATH}")


if __name__ == "__main__":
    main()

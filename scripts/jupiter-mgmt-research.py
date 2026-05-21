#!/usr/bin/env python3
"""
jupiter-mgmt-research.py
RESEARCH-ONLY toolkit for Jupiter management_company evidence gathering.

NO WRITES to communities or pending_community_data. Output is two CSVs
for admin review.

Sources (one row per community × source):
  1. sunbiz_registered_agent — Sunbiz cordata match, registered_agent string
  2. master_hoa              — master HOA's management_company (sub-HOAs only)
  3. web_search              — DuckDuckGo HTML scrape, top hits (sampled)
  4. community_website       — parse mgmt mentions from communities.website_url
  5. listing_site            — placeholder: not_attempted this run
  6. pbcpao                  — placeholder: not_attempted this run

CLAUDE.md §16 two-signal rule:
  A management_company candidate value is admissible for auto-write only when
  ≥ 2 independent sources point to it. Single-source candidates are segregated
  into jupiter-mgmt-single-source.csv for admin review.

Inputs:
  /Users/izzymartinez/Agents/hoa-agent/logs/snapshots/jupiter-mgmt-all-pre-*.json
  (latest by mtime)

Outputs:
  scripts/output/jupiter-mgmt-evidence.csv         (long-format, all sources)
  scripts/output/jupiter-mgmt-two-signal.csv       (candidates with ≥2 signals)
  scripts/output/jupiter-mgmt-single-source.csv    (single-source candidates)
  scripts/output/jupiter-mgmt-research-report.txt  (human-readable summary)

Uses the CORRECTED Sunbiz cordata parser (line[:12]/[12:204]/[204]/[205:]),
not the legacy [:13]/[13:93] slices (memory: sunbiz_parser_offset).
"""
from __future__ import annotations
import os, re, sys, time, json, glob, csv, html, warnings
from difflib import SequenceMatcher
from collections import defaultdict
from typing import Optional, Dict, List, Tuple, Iterable
import requests
warnings.filterwarnings("ignore")
from dotenv import load_dotenv
load_dotenv(".env.local", override=True)

URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}

CORDATA_DIR  = "/Volumes/LaCie/FL-Palm Beach County Data /cordata_extracted"
SNAPSHOT_DIR = "/Users/izzymartinez/Agents/hoa-agent/logs/snapshots"
OUT_DIR      = "scripts/output"
EVIDENCE_CSV = f"{OUT_DIR}/jupiter-mgmt-evidence.csv"
TWO_SIG_CSV  = f"{OUT_DIR}/jupiter-mgmt-two-signal.csv"
SINGLE_CSV   = f"{OUT_DIR}/jupiter-mgmt-single-source.csv"
REPORT_PATH  = f"{OUT_DIR}/jupiter-mgmt-research-report.txt"

# Cap on web-search sample (DuckDuckGo throttling guard).
WEB_SEARCH_CAP = 120
WEB_SEARCH_SLEEP = 2.0

STOPWORDS = {
    "HOMEOWNERS","HOMEOWNER","ASSOCIATION","ASSOCIATIONS","CONDOMINIUM","CONDO",
    "PROPERTY","PROPERTIES","OWNERS","OWNER","COMMUNITY","COMMUNITIES",
    "INC","INCORPORATED","LLC","CORP","LTD","CORPORATION","COMPANY",
    "AT","OF","IN","THE","AND","FOR","FLORIDA",
    "ESTATE","ESTATES","CLUB","HOA","COA","INCORP",
    "VILLAS","CONDOS","TOWNHOMES","TOWNHOUSES","THS","PUD","PLAT","PH",
    "JUPITER","VILLAGE","VILLAGES",
}

ASSOC_TYPE_TOKENS = (
    "ASSOCIATION","HOMEOWNERS","CONDOMINIUM"," HOA"," COA",
    "PROPERTY OWNERS","COMMUNITY ASSOCIATION","TOWNHOUSE ASSOCIATION",
    "TOWNHOMES ASSOCIATION","MAINTENANCE ASSOCIATION","OWNERS ASSOCIATION",
    "MASTER ASSOCIATION","NEIGHBORHOOD ASSOCIATION",
)
HOLDING_TYPE_TOKENS = (
    " LLC","L.L.C","HOLDINGS","PROPERTIES INC","REALTY",
    "INVESTMENTS","DEVELOPMENT","DEVELOPERS","CAPITAL","VENTURES",
    "PARTNERS","BUILDERS",
)
MGMT_CO_TOKENS = (
    "MANAGEMENT","PROPERTY MANAGEMENT","MANAGEMENT INC","MANAGEMENT LLC",
    "REALTY SERVICES","PROPERTY SERVICES","ASSOCIATION SERVICES",
    " GROUP "," SERVICES ",
)

KNOWN_MGMT_BRANDS = (
    "FIRSTSERVICE","FIRST SERVICE","CASTLE GROUP","KW PROPERTY","KWPM",
    "ASSOCIA","SEACREST","CAMPBELL","CONSOLIDATED COMMUNITY","CCMC",
    "SENTRY MANAGEMENT","RIZZETTA","LELAND MANAGEMENT","ARTEMIS",
    "GRS COMMUNITY","HAMMOCKS COMMUNITY","CONDOMINIUM CONCEPTS",
    "ALLIANCE COMMUNITY","RESOURCE PROPERTY","CARDINAL MANAGEMENT",
    "PROFESSIONAL ASSOCIATION","UNITED COMMUNITY","HAMPTON","FIRSTRESIDENTIAL",
    "AKAM","CASTLE MANAGEMENT","CCMI","CONTINENTAL PROPERTY",
    "ARCHSTONE","SOUTH FLORIDA PROPERTY","SUNRISE MANAGEMENT","CMC",
    "ACCESS DIFFERENCE","CAMS","MAY MANAGEMENT","CAMPBELL PROPERTY",
)


def tokenize(name: str) -> set:
    return {w for w in re.split(r"\W+", (name or "").upper())
            if len(w) > 3 and w not in STOPWORDS}


def classify_entity(entity_name: Optional[str]) -> str:
    if not entity_name:
        return "other"
    upper = entity_name.upper()
    is_assoc   = any(t in upper for t in ASSOC_TYPE_TOKENS)
    is_holding = any(t in upper for t in HOLDING_TYPE_TOKENS)
    if is_assoc and not is_holding:
        return "assoc"
    if is_assoc and is_holding:
        if any(k in upper for k in ("ASSOCIATION","HOMEOWNERS","CONDOMINIUM")):
            return "assoc"
        return "holding"
    if is_holding:
        return "holding"
    return "other"


def looks_like_mgmt_co(name: Optional[str]) -> bool:
    if not name:
        return False
    upper = name.upper()
    if any(t in upper for t in MGMT_CO_TOKENS):
        return True
    if any(brand in upper for brand in KNOWN_MGMT_BRANDS):
        return True
    return False


def normalize_candidate(name: str) -> str:
    """Normalize mgmt-co strings for cross-source matching."""
    if not name:
        return ""
    s = name.upper()
    s = re.sub(r"[,\.\-\(\)/]", " ", s)
    s = re.sub(r"\b(INC|LLC|CORP|CO|LTD|LP|LLP|PA|PLLC|LIMITED|INCORPORATED|CORPORATION)\b", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_record(line: str) -> Dict[str, Optional[str]]:
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
        r"([A-Z][A-Z\s&,\.\-]{5,80}(?:MANAGEMENT|SERVICES|REALTY|PROPERTY|GROUP|LLC|INC|CORP|ASSOCIATION|HOLDINGS|TRUST|PARTNERS|SOLUTIONS|ADVISORS|CONSULT(?:ING|ANTS)?))\s",
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


def latest_snapshot() -> str:
    files = sorted(glob.glob(f"{SNAPSHOT_DIR}/jupiter-mgmt-all-pre-*.json"))
    if not files:
        sys.exit(f"ERROR: no Jupiter snapshot in {SNAPSHOT_DIR}")
    return files[-1]


def stream_sunbiz_matches(communities: List[dict]) -> Dict[str, dict]:
    """For each Jupiter community, find the best Sunbiz cordata match.
    Doc-num exact match takes priority; falls back to fuzzy name match."""
    by_doc: Dict[str, dict] = {}
    for c in communities:
        doc = (c.get("state_entity_number") or "").strip().upper()
        if doc:
            by_doc[doc] = c
    print(f"[{time.strftime('%H:%M:%S')}] doc-num index: {len(by_doc)}", flush=True)

    name_index: List[Tuple[dict, set, str]] = []
    word_to_idx: Dict[str, List[int]] = defaultdict(list)
    for c in communities:
        words = tokenize(c["canonical_name"])
        if not words:
            continue
        idx = len(name_index)
        name_index.append((c, words, c["canonical_name"].upper()))
        for w in words:
            word_to_idx[w].append(idx)
    print(f"[{time.strftime('%H:%M:%S')}] name index: {len(word_to_idx)} words, "
          f"{len(name_index)} communities", flush=True)

    matched_by_doc: Dict[str, dict]  = {}
    matched_by_name: Dict[int, dict] = {}

    files = sorted(f for f in os.listdir(CORDATA_DIR)
                   if f.startswith("cordata") and f.endswith(".txt"))
    print(f"[{time.strftime('%H:%M:%S')}] streaming {len(files)} cordata files…", flush=True)
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
                doc = line[:12].strip().upper()
                if doc and doc in by_doc and by_doc[doc]["id"] not in matched_by_doc:
                    parsed = parse_record(line)
                    matched_by_doc[by_doc[doc]["id"]] = {
                        "score": 1.0, "parsed": parsed, "source": "doc",
                    }
                ent_field = line[12:204]
                ent_words = tokenize(ent_field)
                if not ent_words:
                    continue
                candidates = set()
                for w in ent_words:
                    candidates.update(word_to_idx.get(w, ()))
                if not candidates:
                    continue
                ent_norm = ent_field.strip().upper()
                for idx in candidates:
                    c, cwords, cname_upper = name_index[idx]
                    if c["id"] in matched_by_doc:
                        continue
                    if len(ent_words & cwords) < 1:
                        continue
                    score = SequenceMatcher(None, ent_norm[:80], cname_upper[:80]).ratio()
                    if score >= 0.78:
                        prev = matched_by_name.get(idx)
                        if not prev or score > prev["score"]:
                            matched_by_name[idx] = {"score": round(score, 3), "line": line}
        total_lines += n
        elapsed = time.time() - t0
        print(f"[{time.strftime('%H:%M:%S')}] {fname} ({size_gb:.2f}GB): "
              f"{n:,} lines · {elapsed:.0f}s · "
              f"doc={len(matched_by_doc)} name={len(matched_by_name)}",
              flush=True)

    result: Dict[str, dict] = {}
    for cid, info in matched_by_doc.items():
        result[cid] = {"score": info["score"], "source": "doc", "parsed": info["parsed"]}
    for idx, info in matched_by_name.items():
        c = name_index[idx][0]
        parsed = parse_record(info["line"])
        result[c["id"]] = {"score": info["score"], "source": "name", "parsed": parsed}
    print(f"[{time.strftime('%H:%M:%S')}] sunbiz done: {total_lines:,} lines, "
          f"{len(result)} communities matched", flush=True)
    return result


def fetch_master_mgmt(communities: List[dict]) -> Dict[str, Tuple[str, str]]:
    """For sub-HOAs, fetch master_hoa.management_company. Returns map of
    community_id → (master_name, master_mgmt_company)."""
    master_ids = sorted({c["master_hoa_id"] for c in communities if c.get("master_hoa_id")})
    if not master_ids:
        return {}
    masters: Dict[str, dict] = {}
    # batch in chunks of 50
    for i in range(0, len(master_ids), 50):
        chunk = master_ids[i:i+50]
        ids_str = ",".join(f'"{x}"' for x in chunk)
        r = requests.get(
            f"{URL}/rest/v1/communities?id=in.({ids_str})&select=id,canonical_name,management_company",
            headers=H,
        )
        for row in r.json():
            masters[row["id"]] = row
    out = {}
    for c in communities:
        mid = c.get("master_hoa_id")
        if not mid:
            continue
        m = masters.get(mid)
        if not m or not m.get("management_company"):
            continue
        out[c["id"]] = (m["canonical_name"], m["management_company"])
    return out


def ddg_search(query: str) -> List[Tuple[str, str, str]]:
    """DuckDuckGo HTML scrape — returns [(title, url, snippet), ...] for top hits."""
    try:
        resp = requests.post(
            "https://html.duckduckgo.com/html/",
            data={"q": query},
            headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                                    "Chrome/120.0 Safari/537.36"},
            timeout=20,
        )
    except Exception as e:
        return []
    if resp.status_code != 200:
        return []
    text = resp.text
    # Cheap regex pull of result blocks
    results = []
    pattern = re.compile(
        r'<a class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>.*?'
        r'<a class="result__snippet"[^>]*>(.*?)</a>',
        re.DOTALL,
    )
    for m in pattern.finditer(text):
        url_, title_html, snippet_html = m.groups()
        title = html.unescape(re.sub(r"<[^>]+>", "", title_html)).strip()
        snippet = html.unescape(re.sub(r"<[^>]+>", "", snippet_html)).strip()
        results.append((title, url_, snippet))
        if len(results) >= 6:
            break
    return results


def extract_mgmt_candidate_from_text(text: str) -> Optional[str]:
    """Heuristic: pull a likely management company name out of free-form text."""
    if not text:
        return None
    upper = text.upper()
    for brand in KNOWN_MGMT_BRANDS:
        i = upper.find(brand)
        if i >= 0:
            # Grab original-case span of brand + tail up to 40 chars
            chunk = text[i:i+80]
            m = re.match(r"([A-Za-z0-9&,\.\-' ]{3,60}(?:LLC|Inc|Corp|Group|Services|Realty|Management|Communities|Property)?)", chunk)
            if m:
                return m.group(1).strip(" ,.")
            return chunk[:60].strip()
    # Generic "X Management" / "X Property Management" pattern
    m = re.search(r"([A-Z][A-Za-z&\.,' \-]{2,40} (?:Property Management|Management(?:, Inc)?(?:, LLC)?))", text)
    if m:
        return m.group(1).strip(" ,.")
    return None


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

    sunbiz = stream_sunbiz_matches(communities)
    master_mgmt = fetch_master_mgmt(communities)
    print(f"[{time.strftime('%H:%M:%S')}] master HOA mgmt-company carries: {len(master_mgmt)}", flush=True)

    # Long-format evidence rows
    evidence_rows: List[dict] = []
    # candidates per community: norm_value → set of source labels
    candidates_per_community: Dict[str, Dict[str, set]] = defaultdict(lambda: defaultdict(set))
    # human-readable display for each norm_value (first one wins)
    display_value: Dict[Tuple[str, str], str] = {}

    def emit(cid: str, cname: str, source: str, candidate: Optional[str],
             confidence: float, signal_strength: str, evidence_detail: str,
             source_url: Optional[str] = None):
        norm = normalize_candidate(candidate) if candidate else ""
        evidence_rows.append({
            "community_id":    cid,
            "community_name":  cname,
            "source":          source,
            "candidate_value": candidate or "",
            "normalized":      norm,
            "confidence":      f"{confidence:.2f}" if confidence else "",
            "signal_strength": signal_strength,
            "evidence":        evidence_detail[:300] if evidence_detail else "",
            "source_url":      source_url or "",
        })
        if candidate and norm:
            candidates_per_community[cid][norm].add(source)
            display_value.setdefault((cid, norm), candidate)

    # Source 1: sunbiz_registered_agent
    for c in communities:
        cid, cname = c["id"], c["canonical_name"]
        sm = sunbiz.get(cid)
        if not sm:
            emit(cid, cname, "sunbiz_registered_agent", None, 0.0, "no_match",
                 "no Sunbiz cordata match")
            continue
        parsed = sm["parsed"]
        ent_cls = classify_entity(parsed.get("entity_name"))
        reg = parsed.get("registered_agent")
        if reg and looks_like_mgmt_co(reg):
            strength = "strong" if ent_cls == "assoc" else "weak"
            emit(cid, cname, "sunbiz_registered_agent", reg, sm["score"], strength,
                 f"entity={parsed.get('entity_name')}; cls={ent_cls}; doc={parsed.get('state_entity_number')}")
        elif reg:
            emit(cid, cname, "sunbiz_registered_agent", reg, sm["score"], "informational",
                 f"reg_agent does not look like mgmt co (entity={parsed.get('entity_name')[:60] if parsed.get('entity_name') else ''})")
        else:
            emit(cid, cname, "sunbiz_registered_agent", None, sm["score"], "no_match",
                 f"Sunbiz match but no registered_agent extracted (entity={parsed.get('entity_name')[:60] if parsed.get('entity_name') else ''})")

    # Source 2: master_hoa carry
    for c in communities:
        cid, cname = c["id"], c["canonical_name"]
        if cid in master_mgmt:
            master_name, master_mgmt_val = master_mgmt[cid]
            emit(cid, cname, "master_hoa", master_mgmt_val, 0.9, "strong",
                 f"sub-HOA of {master_name}")
        elif c.get("is_sub_hoa"):
            emit(cid, cname, "master_hoa", None, 0.0, "no_match",
                 "is_sub_hoa=true but master has no management_company")
        else:
            emit(cid, cname, "master_hoa", None, 0.0, "n/a", "not a sub-HOA")

    # Source 3: web_search (sampled — DuckDuckGo throttling)
    print(f"[{time.strftime('%H:%M:%S')}] starting web search on first "
          f"{min(WEB_SEARCH_CAP, len(communities))} communities…", flush=True)
    web_searched = 0
    web_hits = 0
    for c in communities[:WEB_SEARCH_CAP]:
        cid, cname = c["id"], c["canonical_name"]
        q = f'"{cname}" Jupiter Florida management company HOA'
        results = ddg_search(q)
        if not results:
            emit(cid, cname, "web_search", None, 0.0, "no_match",
                 f"DDG returned no results or was rate-limited (q={q[:60]})")
        else:
            best = None
            for title, url_, snippet in results:
                blob = f"{title}\n{snippet}"
                cand = extract_mgmt_candidate_from_text(blob)
                if cand:
                    best = (cand, url_, title, snippet)
                    break
            if best:
                cand, url_, title, snippet = best
                emit(cid, cname, "web_search", cand, 0.55, "weak",
                     f"title={title[:80]}; snippet={snippet[:120]}", source_url=url_)
                web_hits += 1
            else:
                top_title, top_url, top_snip = results[0]
                emit(cid, cname, "web_search", None, 0.0, "informational",
                     f"top hit: {top_title[:80]} / {top_snip[:100]}", source_url=top_url)
        web_searched += 1
        time.sleep(WEB_SEARCH_SLEEP)
        if web_searched % 10 == 0:
            print(f"[{time.strftime('%H:%M:%S')}] web search progress: "
                  f"{web_searched}/{min(WEB_SEARCH_CAP, len(communities))} "
                  f"(mgmt-hits {web_hits})", flush=True)
    # Mark the rest as not_attempted
    for c in communities[WEB_SEARCH_CAP:]:
        emit(c["id"], c["canonical_name"], "web_search", None, 0.0, "not_attempted",
             "outside WEB_SEARCH_CAP sample for this run")

    # Source 4: community_website (only 1 row has website_url)
    for c in communities:
        cid, cname = c["id"], c["canonical_name"]
        site = c.get("website_url")
        if not site:
            emit(cid, cname, "community_website", None, 0.0, "no_match",
                 "no website_url on file")
            continue
        try:
            r = requests.get(site, timeout=15,
                             headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code != 200:
                emit(cid, cname, "community_website", None, 0.0, "no_match",
                     f"HTTP {r.status_code}", source_url=site)
                continue
            cand = extract_mgmt_candidate_from_text(r.text[:30000])
            if cand:
                emit(cid, cname, "community_website", cand, 0.7, "strong",
                     "extracted from community website body", source_url=site)
            else:
                emit(cid, cname, "community_website", None, 0.0, "no_match",
                     "fetched but no mgmt-co pattern matched", source_url=site)
        except Exception as e:
            emit(cid, cname, "community_website", None, 0.0, "no_match",
                 f"fetch failed: {e!r}", source_url=site)

    # Source 5: listing_site — placeholder
    for c in communities:
        emit(c["id"], c["canonical_name"], "listing_site", None, 0.0, "not_attempted",
             "scrapers (Zillow/Realtor.com) disabled per CLAUDE.md fee-data rules; "
             "manual listing-site check required")

    # Source 6: pbcpao — placeholder
    for c in communities:
        emit(c["id"], c["canonical_name"], "pbcpao", None, 0.0, "not_attempted",
             "PBCPAO requires Playwright; not run in research-only toolkit")

    # Write long-format evidence CSV
    fields = ["community_id","community_name","source","candidate_value",
              "normalized","confidence","signal_strength","evidence","source_url"]
    with open(EVIDENCE_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in evidence_rows:
            w.writerow(row)
    print(f"[{time.strftime('%H:%M:%S')}] evidence CSV → {EVIDENCE_CSV} "
          f"({len(evidence_rows)} rows)", flush=True)

    # Apply two-signal rule
    two_sig: List[dict] = []
    single:  List[dict] = []
    for cid, by_norm in candidates_per_community.items():
        cname = next((r["community_name"] for r in evidence_rows
                      if r["community_id"] == cid), "")
        for norm, sources in by_norm.items():
            if not norm:
                continue
            entry = {
                "community_id":    cid,
                "community_name":  cname,
                "candidate_value": display_value.get((cid, norm), ""),
                "normalized":      norm,
                "source_count":    len(sources),
                "sources":         "|".join(sorted(sources)),
            }
            if len(sources) >= 2:
                two_sig.append(entry)
            else:
                single.append(entry)

    fields2 = ["community_id","community_name","candidate_value","normalized",
               "source_count","sources"]
    with open(TWO_SIG_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields2)
        w.writeheader()
        for row in sorted(two_sig, key=lambda r: (-r["source_count"], r["community_name"])):
            w.writerow(row)
    print(f"[{time.strftime('%H:%M:%S')}] two-signal CSV → {TWO_SIG_CSV} "
          f"({len(two_sig)} rows)", flush=True)

    with open(SINGLE_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields2)
        w.writeheader()
        for row in sorted(single, key=lambda r: r["community_name"]):
            w.writerow(row)
    print(f"[{time.strftime('%H:%M:%S')}] single-source CSV → {SINGLE_CSV} "
          f"({len(single)} rows)", flush=True)

    # Aggregate stats
    sunbiz_strong = sum(1 for r in evidence_rows
                        if r["source"] == "sunbiz_registered_agent" and r["signal_strength"] == "strong")
    sunbiz_weak   = sum(1 for r in evidence_rows
                        if r["source"] == "sunbiz_registered_agent" and r["signal_strength"] == "weak")
    master_carry  = sum(1 for r in evidence_rows
                        if r["source"] == "master_hoa" and r["candidate_value"])
    web_strong    = sum(1 for r in evidence_rows
                        if r["source"] == "web_search" and r["candidate_value"])
    site_carry    = sum(1 for r in evidence_rows
                        if r["source"] == "community_website" and r["candidate_value"])

    report = [
        "=== JUPITER MGMT_COMPANY RESEARCH-ONLY TOOLKIT REPORT ===",
        f"Date:                    {time.strftime('%Y-%m-%d %H:%M:%S')}",
        f"Snapshot:                {snap_path}",
        f"Target communities:      {len(communities)} (Jupiter published, management_company IS NULL)",
        f"  with state_entity_number: {sum(1 for c in communities if c.get('state_entity_number'))}",
        f"  is_sub_hoa:               {sum(1 for c in communities if c.get('is_sub_hoa'))}",
        f"  with website_url:         {sum(1 for c in communities if c.get('website_url'))}",
        "",
        "Per-source mgmt_company candidate hits:",
        f"  sunbiz_registered_agent (strong, assoc-class entity): {sunbiz_strong}",
        f"  sunbiz_registered_agent (weak, holding/other entity): {sunbiz_weak}",
        f"  master_hoa carry (sub-HOA inherits master's mgmt):    {master_carry}",
        f"  web_search (sampled {min(WEB_SEARCH_CAP,len(communities))}, mgmt-co keyword hit): {web_strong}",
        f"  community_website body match:                         {site_carry}",
        f"  listing_site:                                          0 (not_attempted)",
        f"  pbcpao:                                                0 (not_attempted)",
        "",
        f"Two-signal candidates (≥ 2 independent sources agreeing): {len(two_sig)}",
        f"Single-source candidates (admin review required):         {len(single)}",
        "",
        "Outputs:",
        f"  {EVIDENCE_CSV}            (one row per community × source, {len(evidence_rows)} rows)",
        f"  {TWO_SIG_CSV}              (two-signal-qualified candidates)",
        f"  {SINGLE_CSV}            (single-source candidates for admin review)",
        "",
        "NO writes to communities or pending_community_data — research-only.",
    ]
    with open(REPORT_PATH, "w") as f:
        f.write("\n".join(report))
    print("\n".join(report))
    print(f"\nReport: {REPORT_PATH}")


if __name__ == "__main__":
    main()

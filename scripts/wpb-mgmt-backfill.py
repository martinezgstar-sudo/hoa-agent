#!/usr/bin/env python3
"""
wpb-mgmt-backfill.py
West Palm Beach management_company evidence-gathering toolkit.

RESEARCH-ONLY — ZERO writes to communities or pending_community_data.
The apply step is a separate proposal contingent on Admiral CSV
approval of the two-signal CSV emitted here.

Target: 1,339 published WPB communities with management_company IS NULL
(the largest single-city deficit in PBC; 98.5% gap vs total 1,360
published WPB rows on 2026-05-21).

Mirrors scripts/jupiter-mgmt-backfill.py + scripts/jupiter-mgmt-research.py
patterns. Sources, one row per community x source, per Admiral spec:

  1. sunbiz_cordata        Sunbiz cordata officer/registered-agent entry on
                           LaCie (/Volumes/LaCie/.../cordata_extracted)
  2. web_search            DuckDuckGo HTML scrape, top 6 hits
  3. dbpr_lookup           DBPR CAM license + community-association-mgmt
                           firm search via DDG site:myfloridalicense.com
  4. community_website     parse website_url body for mgmt-co mention
  5. listing_site          DDG site:zillow.com OR site:realtor.com,
                           parse listing snippet for mgmt-co mention

CLAUDE.md Rule 16 (two-signal evidence): a management_company candidate
is only admissible for auto-write when >= 2 INDEPENDENT sources agree on
the normalized value. Single-source candidates are segregated to
wpb-mgmt-single-source.csv for explicit admin review.

Uses the CORRECTED Sunbiz cordata parser (line[:12]/[12:204]/[204]/[205:]),
NOT the legacy [:13]/[13:93] slices (memory: sunbiz_parser_offset).

Inputs:
  Latest /Users/izzymartinez/Agents/hoa-agent/logs/snapshots/wpb-mgmt-pre-*.json

Outputs (all under scripts/output/):
  wpb-mgmt-evidence.csv         one row per community x source (~ 5 x N rows)
  wpb-mgmt-two-signal.csv       candidates with >= 2 independent signals
  wpb-mgmt-single-source.csv    candidates with exactly 1 signal
  wpb-mgmt-matches.json         raw Sunbiz match payload (for re-classify)
  wpb-mgmt-report.txt           human-readable summary

Throttling caps (DuckDuckGo / fetch budget, configurable below):
  WEB_SEARCH_CAP    = 200    DDG general search
  DBPR_LOOKUP_CAP   = 200    DDG site:myfloridalicense.com
  LISTING_LOOKUP_CAP= 200    DDG site:zillow.com OR site:realtor.com
Communities beyond the cap are marked signal_strength='not_attempted'.

Run from project root:
  python3 scripts/wpb-mgmt-backfill.py
"""
from __future__ import annotations
import os, re, sys, time, json, glob, csv, html, warnings
from difflib import SequenceMatcher
from collections import defaultdict
from typing import Optional, Dict, List, Tuple
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
EVIDENCE_CSV = f"{OUT_DIR}/wpb-mgmt-evidence.csv"
TWO_SIG_CSV  = f"{OUT_DIR}/wpb-mgmt-two-signal.csv"
SINGLE_CSV   = f"{OUT_DIR}/wpb-mgmt-single-source.csv"
MATCHES_PATH = f"{OUT_DIR}/wpb-mgmt-matches.json"
REPORT_PATH  = f"{OUT_DIR}/wpb-mgmt-report.txt"

WEB_SEARCH_CAP    = 200
DBPR_LOOKUP_CAP   = 200
LISTING_LOOKUP_CAP= 200
DDG_SLEEP         = 2.0
WEBSITE_TIMEOUT   = 15
DDG_BLOCK_AFTER_FAILS = 5     # short-circuit DDG if N consecutive timeouts/empties
DDG_TIMEOUT       = 12        # shorter DDG timeout (was hard 20s)

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")

STOPWORDS = {
    "HOMEOWNERS","HOMEOWNER","ASSOCIATION","ASSOCIATIONS","CONDOMINIUM","CONDO",
    "PROPERTY","PROPERTIES","OWNERS","OWNER","COMMUNITY","COMMUNITIES",
    "INC","INCORPORATED","LLC","CORP","LTD","CORPORATION","COMPANY",
    "AT","OF","IN","THE","AND","FOR","FLORIDA",
    "ESTATE","ESTATES","CLUB","HOA","COA","INCORP",
    "VILLAS","CONDOS","TOWNHOMES","TOWNHOUSES","THS","PUD","PLAT","PH",
    "WEST","PALM","BEACH","NORTH","SOUTH","EAST",
    "VILLAGE","VILLAGES",
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
    "ASSOCIA","SEACREST","CAMPBELL PROPERTY","CAMPBELL MANAGEMENT",
    "CONSOLIDATED COMMUNITY","CCMC","SENTRY MANAGEMENT","RIZZETTA",
    "LELAND MANAGEMENT","ARTEMIS","GRS COMMUNITY","HAMMOCKS COMMUNITY",
    "CONDOMINIUM CONCEPTS","ALLIANCE COMMUNITY","RESOURCE PROPERTY",
    "CARDINAL MANAGEMENT","PROFESSIONAL ASSOCIATION","UNITED COMMUNITY",
    "HAMPTON","FIRSTRESIDENTIAL","AKAM","CASTLE MANAGEMENT","CCMI",
    "CONTINENTAL PROPERTY","ARCHSTONE","SOUTH FLORIDA PROPERTY",
    "SUNRISE MANAGEMENT","CMC","ACCESS DIFFERENCE","CAMS","MAY MANAGEMENT",
    "SEA BREEZE COMMUNITY","VISTA BLUE","VESTA PROPERTY","REGAL PROPERTY",
    "PRIESTLEY MANAGEMENT","TOWERS PROPERTY","CONCORD MANAGEMENT",
    "GRAND MANAGEMENT","INFRAMARK","REALMANAGE","BENCHMARK MANAGEMENT",
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
    upper = " " + name.upper() + " "
    if any(t in upper for t in MGMT_CO_TOKENS):
        return True
    if any(brand in upper for brand in KNOWN_MGMT_BRANDS):
        return True
    return False


def normalize_candidate(name: Optional[str]) -> str:
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
        "rest_blob":           rest[:1500],
    }


def latest_snapshot() -> str:
    files = sorted(glob.glob(f"{SNAPSHOT_DIR}/wpb-mgmt-pre-*.json"))
    if not files:
        sys.exit(f"ERROR: no WPB snapshot in {SNAPSHOT_DIR}")
    return files[-1]


def stream_sunbiz_matches(communities: List[dict]) -> Dict[str, dict]:
    """Doc-number exact match takes priority; falls back to fuzzy name."""
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
    print(f"[{time.strftime('%H:%M:%S')}] streaming {len(files)} cordata files...", flush=True)
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
                    if score >= 0.80:
                        prev = matched_by_name.get(idx)
                        if not prev or score > prev["score"]:
                            matched_by_name[idx] = {"score": round(score, 3), "line": line}
        total_lines += n
        elapsed = time.time() - t0
        print(f"[{time.strftime('%H:%M:%S')}] {fname} ({size_gb:.2f}GB): "
              f"{n:,} lines * {elapsed:.0f}s * "
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


_DDG_STATE = {"blocked": False, "consecutive_fails": 0, "last_error": None}


def ddg_search(query: str) -> List[Tuple[str, str, str]]:
    """Returns top hits or [] on failure. Short-circuits after
    DDG_BLOCK_AFTER_FAILS consecutive empty/timeout responses — once
    blocked, all subsequent calls return [] instantly (no network)."""
    if _DDG_STATE["blocked"]:
        return []
    try:
        resp = requests.post(
            "https://html.duckduckgo.com/html/",
            data={"q": query},
            headers={"User-Agent": UA},
            timeout=DDG_TIMEOUT,
        )
    except Exception as e:
        _DDG_STATE["consecutive_fails"] += 1
        _DDG_STATE["last_error"] = f"timeout/network: {e!r}"
        if _DDG_STATE["consecutive_fails"] >= DDG_BLOCK_AFTER_FAILS:
            _DDG_STATE["blocked"] = True
            print(f"[{time.strftime('%H:%M:%S')}] DDG BLOCKED after "
                  f"{DDG_BLOCK_AFTER_FAILS} consecutive failures — "
                  f"remaining DDG sources will be marked not_attempted",
                  flush=True)
        return []
    if resp.status_code != 200:
        _DDG_STATE["consecutive_fails"] += 1
        _DDG_STATE["last_error"] = f"HTTP {resp.status_code}"
        if _DDG_STATE["consecutive_fails"] >= DDG_BLOCK_AFTER_FAILS:
            _DDG_STATE["blocked"] = True
            print(f"[{time.strftime('%H:%M:%S')}] DDG BLOCKED after "
                  f"{DDG_BLOCK_AFTER_FAILS} consecutive failures — "
                  f"remaining DDG sources will be marked not_attempted",
                  flush=True)
        return []
    text = resp.text
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
    if results:
        _DDG_STATE["consecutive_fails"] = 0
    else:
        _DDG_STATE["consecutive_fails"] += 1
        if _DDG_STATE["consecutive_fails"] >= DDG_BLOCK_AFTER_FAILS:
            _DDG_STATE["blocked"] = True
            print(f"[{time.strftime('%H:%M:%S')}] DDG BLOCKED (empty results) — "
                  f"remaining DDG sources will be marked not_attempted",
                  flush=True)
    return results


def extract_mgmt_candidate_from_text(text: str) -> Optional[str]:
    if not text:
        return None
    upper = text.upper()
    for brand in KNOWN_MGMT_BRANDS:
        i = upper.find(brand)
        if i >= 0:
            chunk = text[i:i+80]
            m = re.match(r"([A-Za-z0-9&,\.\-' ]{3,60}(?:LLC|Inc|Corp|Group|Services|Realty|Management|Communities|Property)?)", chunk)
            if m:
                return m.group(1).strip(" ,.")
            return chunk[:60].strip()
    m = re.search(
        r"([A-Z][A-Za-z&\.,' \-]{2,40} (?:Property Management|Community Management|Management(?:, Inc)?(?:, LLC)?))",
        text,
    )
    if m:
        return m.group(1).strip(" ,.")
    return None


def fetch_text(url_: str) -> Optional[str]:
    try:
        r = requests.get(url_, timeout=WEBSITE_TIMEOUT, headers={"User-Agent": UA})
        if r.status_code != 200:
            return None
        return r.text
    except Exception:
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

    evidence_rows: List[dict] = []
    candidates_per_community: Dict[str, Dict[str, set]] = defaultdict(lambda: defaultdict(set))
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

    # Source 1: sunbiz_cordata
    print(f"[{time.strftime('%H:%M:%S')}] source 1/5 sunbiz_cordata", flush=True)
    for c in communities:
        cid, cname = c["id"], c["canonical_name"]
        sm = sunbiz.get(cid)
        if not sm:
            emit(cid, cname, "sunbiz_cordata", None, 0.0, "no_match",
                 "no Sunbiz cordata match")
            continue
        parsed = sm["parsed"]
        ent_cls = classify_entity(parsed.get("entity_name"))
        reg = parsed.get("registered_agent")
        if reg and looks_like_mgmt_co(reg):
            strength = "strong" if ent_cls == "assoc" else "weak"
            emit(cid, cname, "sunbiz_cordata", reg, sm["score"], strength,
                 f"entity={parsed.get('entity_name')}; cls={ent_cls}; doc={parsed.get('state_entity_number')}")
        elif reg:
            emit(cid, cname, "sunbiz_cordata", reg, sm["score"], "informational",
                 f"reg_agent does not look like mgmt co (entity={(parsed.get('entity_name') or '')[:60]})")
        else:
            emit(cid, cname, "sunbiz_cordata", None, sm["score"], "no_match",
                 f"Sunbiz match but no registered_agent extracted (entity={(parsed.get('entity_name') or '')[:60]})")

    # Source 2: web_search (DDG general)
    print(f"[{time.strftime('%H:%M:%S')}] source 2/5 web_search (cap {WEB_SEARCH_CAP})", flush=True)
    web_hits = 0
    for i, c in enumerate(communities):
        cid, cname = c["id"], c["canonical_name"]
        if i >= WEB_SEARCH_CAP:
            emit(cid, cname, "web_search", None, 0.0, "not_attempted",
                 f"outside WEB_SEARCH_CAP={WEB_SEARCH_CAP}")
            continue
        q = f'"{cname}" "West Palm Beach" Florida HOA management company'
        results = ddg_search(q)
        if not results:
            tag = "not_attempted" if _DDG_STATE["blocked"] else "no_match"
            detail = (f"DDG short-circuited (blocked): {_DDG_STATE['last_error']}"
                      if _DDG_STATE["blocked"]
                      else f"DDG returned no results or rate-limited (q={q[:60]})")
            emit(cid, cname, "web_search", None, 0.0, tag, detail)
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
        if not _DDG_STATE["blocked"]:
            time.sleep(DDG_SLEEP)
        if (i + 1) % 20 == 0:
            print(f"[{time.strftime('%H:%M:%S')}] web_search {i+1}/{WEB_SEARCH_CAP} "
                  f"(mgmt-hits {web_hits})", flush=True)

    # Source 3: dbpr_lookup (DDG site:myfloridalicense.com)
    print(f"[{time.strftime('%H:%M:%S')}] source 3/5 dbpr_lookup (cap {DBPR_LOOKUP_CAP})", flush=True)
    dbpr_hits = 0
    for i, c in enumerate(communities):
        cid, cname = c["id"], c["canonical_name"]
        if i >= DBPR_LOOKUP_CAP:
            emit(cid, cname, "dbpr_lookup", None, 0.0, "not_attempted",
                 f"outside DBPR_LOOKUP_CAP={DBPR_LOOKUP_CAP}")
            continue
        q = f'"{cname}" "West Palm Beach" site:myfloridalicense.com'
        results = ddg_search(q)
        if not results:
            tag = "not_attempted" if _DDG_STATE["blocked"] else "no_match"
            detail = (f"DDG short-circuited (blocked): {_DDG_STATE['last_error']}"
                      if _DDG_STATE["blocked"]
                      else f"no DBPR public-record results (q={q[:60]})")
            emit(cid, cname, "dbpr_lookup", None, 0.0, tag, detail)
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
                emit(cid, cname, "dbpr_lookup", cand, 0.6, "strong",
                     f"DBPR snippet match: title={title[:80]}; snippet={snippet[:120]}",
                     source_url=url_)
                dbpr_hits += 1
            else:
                top_title, top_url, top_snip = results[0]
                emit(cid, cname, "dbpr_lookup", None, 0.0, "informational",
                     f"DBPR top hit (no mgmt extracted): {top_title[:80]} / {top_snip[:100]}",
                     source_url=top_url)
        if not _DDG_STATE["blocked"]:
            time.sleep(DDG_SLEEP)
        if (i + 1) % 20 == 0:
            print(f"[{time.strftime('%H:%M:%S')}] dbpr_lookup {i+1}/{DBPR_LOOKUP_CAP} "
                  f"(mgmt-hits {dbpr_hits})", flush=True)

    # Source 4: community_website
    print(f"[{time.strftime('%H:%M:%S')}] source 4/5 community_website", flush=True)
    site_hits = 0
    for c in communities:
        cid, cname = c["id"], c["canonical_name"]
        site = c.get("website_url")
        if not site:
            emit(cid, cname, "community_website", None, 0.0, "no_match",
                 "no website_url on file")
            continue
        body = fetch_text(site)
        if not body:
            emit(cid, cname, "community_website", None, 0.0, "no_match",
                 "fetch failed or non-200", source_url=site)
            continue
        cand = extract_mgmt_candidate_from_text(body[:50000])
        if cand:
            emit(cid, cname, "community_website", cand, 0.75, "strong",
                 "extracted from association website body/footer",
                 source_url=site)
            site_hits += 1
        else:
            emit(cid, cname, "community_website", None, 0.0, "no_match",
                 "fetched but no mgmt-co pattern matched", source_url=site)

    # Source 5: listing_site (DDG site:zillow.com OR site:realtor.com)
    print(f"[{time.strftime('%H:%M:%S')}] source 5/5 listing_site (cap {LISTING_LOOKUP_CAP})", flush=True)
    listing_hits = 0
    for i, c in enumerate(communities):
        cid, cname = c["id"], c["canonical_name"]
        if i >= LISTING_LOOKUP_CAP:
            emit(cid, cname, "listing_site", None, 0.0, "not_attempted",
                 f"outside LISTING_LOOKUP_CAP={LISTING_LOOKUP_CAP}")
            continue
        q = f'"{cname}" "West Palm Beach" (site:zillow.com OR site:realtor.com) HOA management'
        results = ddg_search(q)
        if not results:
            tag = "not_attempted" if _DDG_STATE["blocked"] else "no_match"
            detail = (f"DDG short-circuited (blocked): {_DDG_STATE['last_error']}"
                      if _DDG_STATE["blocked"]
                      else f"no listing-site results (q={q[:60]})")
            emit(cid, cname, "listing_site", None, 0.0, tag, detail)
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
                emit(cid, cname, "listing_site", cand, 0.5, "weak",
                     f"listing snippet: title={title[:80]}; snippet={snippet[:120]}",
                     source_url=url_)
                listing_hits += 1
            else:
                top_title, top_url, top_snip = results[0]
                emit(cid, cname, "listing_site", None, 0.0, "informational",
                     f"listing top hit (no mgmt extracted): {top_title[:80]} / {top_snip[:100]}",
                     source_url=top_url)
        if not _DDG_STATE["blocked"]:
            time.sleep(DDG_SLEEP)
        if (i + 1) % 20 == 0:
            print(f"[{time.strftime('%H:%M:%S')}] listing_site {i+1}/{LISTING_LOOKUP_CAP} "
                  f"(mgmt-hits {listing_hits})", flush=True)

    # Persist raw Sunbiz matches for re-classify
    raw_matches = []
    for cid, sm in sunbiz.items():
        c = next((c for c in communities if c["id"] == cid), None)
        if not c:
            continue
        raw_matches.append({
            "community_id":   cid,
            "community_name": c["canonical_name"],
            "match_score":    sm["score"],
            "match_source":   sm["source"],
            "sunbiz":         sm["parsed"],
            "existing": {
                "entity_status":       c.get("entity_status"),
                "state_entity_number": c.get("state_entity_number"),
                "registered_agent":    c.get("registered_agent"),
                "incorporation_date":  c.get("incorporation_date"),
                "street_address":      c.get("street_address"),
                "management_company":  c.get("management_company"),
            },
        })
    raw_matches.sort(key=lambda r: (-r["match_score"], r["community_name"]))
    with open(MATCHES_PATH, "w") as f:
        json.dump(raw_matches, f, indent=2)
    print(f"[{time.strftime('%H:%M:%S')}] raw Sunbiz matches -> {MATCHES_PATH} "
          f"({len(raw_matches)} rows)", flush=True)

    # Write long-format evidence CSV
    fields = ["community_id","community_name","source","candidate_value",
              "normalized","confidence","signal_strength","evidence","source_url"]
    with open(EVIDENCE_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in evidence_rows:
            w.writerow(row)
    print(f"[{time.strftime('%H:%M:%S')}] evidence CSV -> {EVIDENCE_CSV} "
          f"({len(evidence_rows)} rows)", flush=True)

    # Two-signal classification
    two_sig: List[dict] = []
    single:  List[dict] = []
    name_by_id = {c["id"]: c["canonical_name"] for c in communities}
    for cid, by_norm in candidates_per_community.items():
        cname = name_by_id.get(cid, "")
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
    print(f"[{time.strftime('%H:%M:%S')}] two-signal CSV -> {TWO_SIG_CSV} "
          f"({len(two_sig)} rows)", flush=True)

    with open(SINGLE_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields2)
        w.writeheader()
        for row in sorted(single, key=lambda r: r["community_name"]):
            w.writerow(row)
    print(f"[{time.strftime('%H:%M:%S')}] single-source CSV -> {SINGLE_CSV} "
          f"({len(single)} rows)", flush=True)

    # Aggregate stats per source
    def cnt(src, pred=lambda r: True):
        return sum(1 for r in evidence_rows if r["source"] == src and pred(r))
    src_stats = {}
    for src in ("sunbiz_cordata","web_search","dbpr_lookup","community_website","listing_site"):
        src_stats[src] = {
            "strong":        cnt(src, lambda r: r["signal_strength"] == "strong"),
            "weak":          cnt(src, lambda r: r["signal_strength"] == "weak"),
            "informational": cnt(src, lambda r: r["signal_strength"] == "informational"),
            "no_match":      cnt(src, lambda r: r["signal_strength"] == "no_match"),
            "not_attempted": cnt(src, lambda r: r["signal_strength"] == "not_attempted"),
            "with_candidate":cnt(src, lambda r: bool(r["candidate_value"])),
        }

    report = [
        "=== WEST PALM BEACH MGMT_COMPANY 5-SOURCE RESEARCH REPORT ===",
        f"Date:                {time.strftime('%Y-%m-%d %H:%M:%S')}",
        f"Snapshot:            {snap_path}",
        f"Cordata source:      {CORDATA_DIR}",
        f"Target communities:  {len(communities)} (WPB published, management_company IS NULL)",
        f"  with state_entity_number: {sum(1 for c in communities if c.get('state_entity_number'))}",
        f"  is_sub_hoa:               {sum(1 for c in communities if c.get('is_sub_hoa'))}",
        f"  with website_url:         {sum(1 for c in communities if c.get('website_url'))}",
        f"  with master_hoa_id:       {sum(1 for c in communities if c.get('master_hoa_id'))}",
        "",
        "DB WRITES THIS PASS:  ZERO (research-only; apply step is a",
        "                     separate proposal pending Admiral CSV approval)",
        "",
        "Source caps:",
        f"  WEB_SEARCH_CAP    = {WEB_SEARCH_CAP}",
        f"  DBPR_LOOKUP_CAP   = {DBPR_LOOKUP_CAP}",
        f"  LISTING_LOOKUP_CAP= {LISTING_LOOKUP_CAP}",
        f"  DDG_BLOCK_AFTER_FAILS = {DDG_BLOCK_AFTER_FAILS}  "
        f"DDG_TIMEOUT = {DDG_TIMEOUT}s",
        "",
        f"DDG runtime state:  blocked={_DDG_STATE['blocked']}  "
        f"last_error={_DDG_STATE['last_error']}",
        "",
        "Per-source candidate distribution:",
    ]
    for src, st in src_stats.items():
        report.append(f"  {src:20s}  strong={st['strong']:4d}  weak={st['weak']:4d}  "
                      f"info={st['informational']:4d}  no_match={st['no_match']:4d}  "
                      f"not_attempted={st['not_attempted']:4d}  any_candidate={st['with_candidate']:4d}")
    report += [
        "",
        f"Sunbiz cordata matches:           {len(sunbiz)} ({sum(1 for v in sunbiz.values() if v['source']=='doc')} doc-num, "
        f"{sum(1 for v in sunbiz.values() if v['source']=='name')} name-fuzzy)",
        f"Two-signal candidates (>=2 src):  {len(two_sig)}    (admin-reviewable as a batch)",
        f"Single-source candidates:          {len(single)}   (require explicit per-row approval)",
        "",
        "Top 50 two-signal candidates by source_count then name:",
    ]
    for entry in sorted(two_sig, key=lambda r: (-r["source_count"], r["community_name"]))[:50]:
        report.append(f"  [{entry['source_count']} src] {entry['community_name'][:55]:55s} -> "
                      f"{entry['candidate_value'][:55]}  ({entry['sources']})")
    if not two_sig:
        report.append("  (none)")
    report += [
        "",
        "Sample single-source candidates (first 30 by name, alphabetical):",
    ]
    for entry in sorted(single, key=lambda r: r["community_name"])[:30]:
        report.append(f"  [1 src ] {entry['community_name'][:55]:55s} -> "
                      f"{entry['candidate_value'][:55]}  ({entry['sources']})")
    report += [
        "",
        "Outputs:",
        f"  {EVIDENCE_CSV}        ({len(evidence_rows)} rows, one per community x source)",
        f"  {TWO_SIG_CSV}          (>=2 independent sources, Admiral batch-approve target)",
        f"  {SINGLE_CSV}      (1 source, explicit per-row approval required)",
        f"  {MATCHES_PATH}         (raw Sunbiz cordata match payload)",
        "",
        "Next step: Admiral reviews wpb-mgmt-two-signal.csv and signs off",
        "(or selectively approves rows). A separate wpb-mgmt-apply.py proposal",
        "will write approved rows to communities.management_company directly",
        "(null-only PATCH) and queue the rest to pending_community_data with",
        "source_type='wpb-mgmt-two-signal' and auto_approvable=false.",
    ]
    with open(REPORT_PATH, "w") as f:
        f.write("\n".join(report))
    print("\n".join(report))
    print(f"\nReport: {REPORT_PATH}")


if __name__ == "__main__":
    main()

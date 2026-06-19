#!/usr/bin/env python3
"""build-sunbiz-index.py — one-time compact local Sunbiz index.

The launchd enrichment service is TCC-blocked from the 17GB cordata corpus on
the LaCie volume (and /usr/bin/python3 won't hold a Full Disk Access grant). The
corpus is too large to copy. Instead, this builder reads the corpus ONCE from an
interactive terminal (which has LaCie access) and extracts only the fields the
enricher stages per entity into a small SQLite DB under ~/Library, which the
service CAN read.

Run from a normal terminal (NOT under launchd):

    python3 scripts/build-sunbiz-index.py

Fixed-width cordata offsets (verified against real records):
  [0:12]  document/entity number      [204]    status (A/I)
  [12:204] legal name                 [472:480] file date MMDDYYYY
  [544:586] registered-agent name     [587:629] RA address line 1
  [629:657] RA city  [657:659] state  [659:664] zip5
"""
import glob
import os
import re
import sqlite3
import sys
import time

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if _SCRIPT_DIR not in sys.path:
    sys.path.insert(0, _SCRIPT_DIR)
from lib.enrich_chain import sunbiz_key  # noqa: E402

# LaCie path has a trailing space (intentional — see CLAUDE.md / memory).
CORDATA_DIR = "/Volumes/LaCie/FL-Palm Beach County Data /cordata_extracted"
OUT_DB = os.environ.get("SUNBIZ_INDEX_PATH") or os.path.join(
    os.path.expanduser("~"), "Library", "Application Support", "hoa-agent",
    "sunbiz-index", "sunbiz.db")

# Keep only residential-community / association entities — this is what the HOA
# enricher ever matches, and it keeps the index small vs. all FL corporations.
INCLUDE = ("ASSOCIATION", "HOMEOWNER", "PROPERTY OWNER", "PROPERTY OWNERS",
           "CONDOMINIUM", "CONDO", " POA", " COA", "MASTER ASSOCIATION")


def ws(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()


def file_date_to_iso(raw: str):
    raw = (raw or "").strip()
    if len(raw) != 8 or not raw.isdigit():
        return None
    mm, dd, yyyy = raw[0:2], raw[2:4], raw[4:8]
    if not ("1800" <= yyyy <= "2099" and "01" <= mm <= "12" and "01" <= dd <= "31"):
        return None
    return f"{yyyy}-{mm}-{dd}"


def parse(line: str):
    name = ws(line[12:204])
    if not name:
        return None
    up = name.upper()
    if not any(k in up for k in INCLUDE):
        return None
    status = "Active" if line[204:205] == "A" else "Inactive"
    ra_name = ws(line[544:586])
    ra_addr1 = ws(line[587:629])
    locality = ws(f"{ws(line[629:657])} {ws(line[657:659])} {ws(line[659:664])}")
    ra_addr = ", ".join(p for p in (ra_addr1, locality) if p) or None
    key = sunbiz_key(name)
    if not key:
        return None
    return (key, name, status, line[0:12].strip(),
            file_date_to_iso(line[472:480]),
            ra_name or None, ra_addr, 1 if status == "Active" else 0)


def main():
    if not os.path.isdir(CORDATA_DIR):
        print(f"ERROR: corpus not accessible: {CORDATA_DIR}")
        print("Run this from an interactive terminal with the LaCie volume mounted.")
        sys.exit(1)
    files = sorted(glob.glob(os.path.join(CORDATA_DIR, "cordata*.txt")))
    if not files:
        print(f"ERROR: no cordata*.txt in {CORDATA_DIR}")
        sys.exit(1)

    os.makedirs(os.path.dirname(OUT_DB), exist_ok=True)
    tmp = OUT_DB + ".building"
    if os.path.exists(tmp):
        os.remove(tmp)
    con = sqlite3.connect(tmp)
    con.execute("PRAGMA journal_mode=OFF")
    con.execute("PRAGMA synchronous=OFF")
    con.execute(
        "CREATE TABLE entities(name_key TEXT, legal_name TEXT, entity_status TEXT,"
        " state_entity_number TEXT, incorporation_date TEXT, registered_agent TEXT,"
        " registered_agent_address TEXT, status_active INTEGER)")
    cur = con.cursor()

    n_read = n_kept = 0
    t0 = time.time()
    batch = []
    for fi, f in enumerate(files):
        with open(f, encoding="utf-8", errors="ignore") as fh:
            for line in fh:
                n_read += 1
                rec = parse(line)
                if rec:
                    batch.append(rec)
                    n_kept += 1
                    if len(batch) >= 5000:
                        cur.executemany(
                            "INSERT INTO entities VALUES (?,?,?,?,?,?,?,?)", batch)
                        batch = []
        print(f"  [{fi+1}/{len(files)}] {os.path.basename(f)} — "
              f"read {n_read:,} kept {n_kept:,} ({time.time()-t0:.0f}s)", flush=True)
    if batch:
        cur.executemany("INSERT INTO entities VALUES (?,?,?,?,?,?,?,?)", batch)
    con.execute("CREATE INDEX idx_name_key ON entities(name_key)")
    con.commit()
    con.execute("VACUUM")
    con.commit()
    con.close()
    os.replace(tmp, OUT_DB)

    size_mb = os.path.getsize(OUT_DB) / 1024 / 1024
    print(f"\nIndexed {n_kept:,} association entities from {n_read:,} records "
          f"in {time.time()-t0:.0f}s")
    print(f"Index: {OUT_DB}")
    print(f"Size : {size_mb:.1f} MB")


if __name__ == "__main__":
    main()

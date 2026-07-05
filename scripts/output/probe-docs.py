#!/usr/bin/env python3
"""Diagnostic probe: reuse the enricher's own functions to show exactly which
candidate URLs are fetched and which document/PDF links are discovered per site.
Read-only — no DB writes, no AI calls."""
import importlib.util, os, sys

ROOT = "/Users/izzymartinez/Documents/hoa-agent"
spec = importlib.util.spec_from_file_location(
    "rhc", os.path.join(ROOT, "scripts/research-hoa-comprehensive.py"))
rhc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rhc)

SITES = [
    ("PGA National",        "https://pga-poa.com"),
    ("Mirabella At Mirasol","https://mirabellahoa.com"),
    ("Admirals Cove",       "https://admiralscove.net"),
    ("Sonoma Isles",        "https://sonomaisleshoa.com"),
    ("Polo Club Boca",      "https://www.thepolo.org"),
]

for name, site in SITES:
    print(f"\n=== {name} — {site} ===")
    candidates = rhc.build_candidate_urls(site, [])
    print(f"  candidate pages: {candidates}")
    for url in candidates:
        html = rhc.fetch(url, timeout=15)
        if html.startswith("ERROR") or not html:
            print(f"  [fetch FAIL] {url} -> {html[:80]!r}")
            continue
        doclinks = rhc.find_document_links(html, url)
        pdfs = [l for l in doclinks if l.lower().split('?')[0].endswith('.pdf')]
        print(f"  [fetch OK {len(html)}b] {url}")
        print(f"     doc links found: {len(doclinks)}  (pdf links: {len(pdfs)})")
        for l in doclinks[:8]:
            print(f"       - {l}")

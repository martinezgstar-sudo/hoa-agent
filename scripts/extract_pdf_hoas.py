#!/usr/bin/env python3
"""Extract text lines from the Palm Beach County HOA registry PDF. Prints JSON to stdout."""
from __future__ import annotations

import json
import re
import sys


def extract_pdf_text(path: str) -> str:
    try:
        import pdfplumber  # type: ignore

        try:
            chunks: list[str] = []
            with pdfplumber.open(path) as pdf:
                for page in pdf.pages:
                    t = page.extract_text()
                    if t:
                        chunks.append(t)
            return "\n".join(chunks)
        except Exception:
            pass
    except ImportError:
        pass
    try:
        from pdfminer.high_level import extract_text  # type: ignore

        try:
            return extract_text(path) or ""
        except Exception:
            pass
    except ImportError:
        pass
    try:
        from pypdf import PdfReader  # type: ignore

        try:
            r = PdfReader(path)
            return "\n".join((p.extract_text() or "") for p in r.pages)
        except Exception:
            pass
    except ImportError:
        pass
    return ""


HOA_PATTERN = re.compile(
    r"(association|homeowners|homeowner|hoa\b|community|village|condominium|"
    r"property owners|master|poa\b|inc\.?$|llc|trust|club|estates|pointe|isles|"
    r"gardens|villas|townhomes|townhouse)",
    re.IGNORECASE,
)


def main() -> None:
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: extract_pdf_hoas.py <pdf_path>", "names": []}))
        sys.exit(1)
    path = sys.argv[1]
    text = extract_pdf_text(path)
    if not text.strip():
        print(
            json.dumps(
                {
                    "error": "No text extracted (invalid PDF or missing pdfplumber/pdfminer/pypdf).",
                    "names": [],
                }
            )
        )
        return

    seen: set[str] = set()
    names: list[str] = []
    for raw in text.splitlines():
        s = raw.strip()
        if len(s) < 6:
            continue
        if not HOA_PATTERN.search(s):
            continue
        key = s.casefold()
        if key in seen:
            continue
        seen.add(key)
        names.append(s)

    print(json.dumps({"names": names}))


if __name__ == "__main__":
    main()

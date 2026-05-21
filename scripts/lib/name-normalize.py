"""
name-normalize.py — Sunbiz cordata-friendly name normalization.

The Sunbiz cordata legal_name field expands many abbreviations that our
community canonical_name retains in shorthand. Without expansion, fuzzy
matchers miss rows like 'Boca Chase SEC 2' (Sunbiz stores 'SECTION 2'),
'Sandalfoot Squire Condo' ('CONDOMINIUM'), 'Boca Raton Golf Course PUD'
('PLANNED UNIT DEVELOPMENT'), 'Woodbine Prcl E' ('PARCEL E'), etc.

This module provides normalize_for_sunbiz() which:
- Uppercases and strips diacritics
- Expands the common Sunbiz token abbreviations
- Strips 'NA' and standalone 'NEIGHBORHOOD ASSOCIATION' suffix tokens
- Collapses whitespace and removes most punctuation
- Returns a canonical, comparable name suitable for cordata grep / SequenceMatcher

It does NOT strip corporate suffixes (INC / LLC / CORP / ASSOCIATION) — those are
needed for some Sunbiz matches and are handled separately by callers that want
a 'stem' for SequenceMatcher (see name_stem()).

Reference: per CLAUDE.md rule #15 (duplicate prevention) we already normalize for
dedupe; this is the matching-side complement for Sunbiz legal_name fields.
"""
from __future__ import annotations
import re
import unicodedata
from typing import List, Tuple

# Order matters: longer phrases first so 'COND' doesn't fire before 'CONDOMINIUM'.
# Patterns are matched as whole tokens (word boundaries) and replaced with the
# canonical Sunbiz form. Where a token has multiple legitimate expansions, we
# pick the one Sunbiz cordata actually uses (verified by sampling the files).
_EXPANSIONS: List[Tuple[str, str]] = [
    # Section abbreviations (Boca Chase SEC 2, Huntington Lakes SEC TWO)
    (r"\bSEC\b", "SECTION"),
    (r"\bSECT\b", "SECTION"),
    # Condominium — match longest first (CONDOS → CONDOMINIUMS, CONDO → CONDOMINIUM,
    # COND → CONDOMINIUM). Don't accidentally fire on 'CONDITION', 'CONDUCT' etc.,
    # which the \b anchors prevent because those have letters after.
    (r"\bCONDOS\b", "CONDOMINIUMS"),
    (r"\bCONDOMINIUMS\b", "CONDOMINIUMS"),  # idempotent
    (r"\bCONDOMINIUM\b", "CONDOMINIUM"),    # idempotent
    (r"\bCONDO\b", "CONDOMINIUM"),
    (r"\bCOND\b", "CONDOMINIUM"),
    # PUD = Planned Unit Development
    (r"\bPUD\b", "PLANNED UNIT DEVELOPMENT"),
    # Parcel
    (r"\bPRCL\b", "PARCEL"),
    (r"\bPCL\b", "PARCEL"),
    # Roman-numeral expansion for the small set commonly used as section numbers
    # (II/III/IV/V already match the human-readable form Sunbiz typically uses,
    # but we leave Romans alone here — they're often kept verbatim on Sunbiz).
]

# Suffix tokens that should be stripped (Mango Groves NA → Mango Groves).
# 'NA' alone is ambiguous (could be initials) but in our flagged set it
# unambiguously means 'Neighborhood Association' — Tuvok's queue confirms this.
_STRIP_SUFFIX_TOKENS = [
    "NEIGHBORHOOD ASSOCIATION",
    "NA",
]


def _strip_accents(s: str) -> str:
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def _collapse(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def normalize_for_sunbiz(name: str) -> str:
    """Return a Sunbiz-cordata-friendly normalized name.

    Steps:
      1. Uppercase, strip accents
      2. Replace non [A-Z0-9&] with spaces (keep & since Sunbiz preserves it)
      3. Expand SEC / CONDO / COND / PUD / Prcl tokens to their Sunbiz form
      4. Strip trailing 'NA' / 'NEIGHBORHOOD ASSOCIATION' suffix tokens
      5. Collapse whitespace
    """
    if not name:
        return ""
    n = _strip_accents(name).upper()
    n = re.sub(r"[^A-Z0-9& ]+", " ", n)
    n = _collapse(n)

    for pat, repl in _EXPANSIONS:
        n = re.sub(pat, repl, n)

    n = _collapse(n)

    # Strip trailing NA / NEIGHBORHOOD ASSOCIATION
    for suffix in _STRIP_SUFFIX_TOKENS:
        # Match suffix as the last token(s), case-insensitive already since uppercase
        pattern = re.compile(r"\s+" + re.escape(suffix) + r"$")
        n = pattern.sub("", n)

    return _collapse(n)


def name_stem(name: str) -> str:
    """Aggressively strip name down to comparable stem for SequenceMatcher.

    Removes corporate / association suffixes that vary between our canonical_name
    and Sunbiz legal_name. Used for scoring, NOT for cordata grep patterns.
    """
    n = normalize_for_sunbiz(name)
    suffixes = [
        "INCORPORATED", "INC",
        "LLC", "L L C",
        "CORPORATION", "CORP",
        "COMPANY", "CO",
        "ASSOCIATION", "ASSOCIATIONS",
        "PROPERTY OWNERS ASSOCIATION",
        "PROPERTY OWNERS",
        "HOMEOWNERS ASSOCIATION",
        "HOMEOWNERS",
        "OWNERS ASSOCIATION",
        "HOA", "POA", "COA",
        "CLUB",
    ]
    # repeat strip until stable
    prev = None
    while prev != n:
        prev = n
        for s in suffixes:
            n = re.sub(r"(^|\s)" + re.escape(s) + r"$", "", n)
            n = _collapse(n)
    return n


def candidate_patterns(name: str) -> List[str]:
    """Build a small set of patterns to grep the cordata files with.

    Returns up to 3 patterns, in priority order:
      1. The fully normalized name (e.g. 'BOCA CHASE SECTION 2')
      2. The stem (e.g. 'BOCA CHASE SECTION 2' minus trailing INC/HOA suffixes)
      3. The original uppercase form (e.g. 'BOCA CHASE SEC 2') as a fallback
         in case the cordata row also uses the abbreviation
    """
    out = []
    seen = set()
    for cand in (normalize_for_sunbiz(name), name_stem(name), re.sub(r"\s+", " ", re.sub(r"[^A-Z0-9& ]+", " ", _strip_accents(name).upper())).strip()):
        if cand and cand not in seen and len(cand) >= 4:
            seen.add(cand)
            out.append(cand)
    return out


if __name__ == "__main__":
    # Quick sanity check — runs when invoked directly.
    samples = [
        "Boca Chase SEC 2",
        "Sabal Pine Condo",
        "Villages of Oriole Abbey Condo",
        "Mango Groves NA",
        "Boca Raton Golf Course PUD",
        "Woodbine Prcl E",
        "Sandalfoot Squire Condo",
        "Boca Verde Condo",
        "Huntington Lakes SEC TWO Condos",
        "Kings Point Brittany Cond",
        "Country Park at Boca Raton III",
        "Nautica Sound 1",
    ]
    for s in samples:
        print(f"{s:42s} → normalize: {normalize_for_sunbiz(s):50s}  stem: {name_stem(s)}")

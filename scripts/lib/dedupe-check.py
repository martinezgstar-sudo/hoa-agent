"""
dedupe-check.py
Single export: check_for_duplicate(supabase_client, canonical_name,
                                  master_hoa_id, zip_code) → existing id or None.

Normalize names by lowercasing, removing punctuation, and stripping
common suffixes. Match against communities sharing the same master_hoa_id
or ZIP code. Treat names as duplicate if normalized strings are equal,
or differ by ≤2 chars (Levenshtein) / ratio ≥0.92 (difflib fallback).

Usage:
    from scripts.lib.dedupe_check import check_for_duplicate
    dup_id = check_for_duplicate(sb, "The Tides at Briar Bay HOA",
                                 master_hoa_id="e438...", zip_code="33411")
    if dup_id: ...  # update instead of insert
"""
from __future__ import annotations
import re
from typing import Optional, Any

# Optional fast Levenshtein
try:
    import Levenshtein  # type: ignore
    _HAS_LEV = True
except Exception:  # pragma: no cover
    _HAS_LEV = False
    from difflib import SequenceMatcher

_SUFFIX_RE = re.compile(
    r"\b("
    r"property\s+owners?(?:\s+association)?|"
    r"home\s*owners?(?:\s+association)?|"
    r"homeowners(?:'\s|\s|')?(?:\s*association)?|"
    r"condominium(?:\s+association)?|"
    r"condo(?:\s+association)?|"
    r"association|"
    r"hoa|"
    r"coa|"
    r"poa|"
    r"incorporated|inc|"
    r"l\.?\s*l\.?\s*c\.?|llc|"
    r"corporation|corp|"
    r"company|co\.?|"
    r"limited|ltd"
    r")\b\.?",
    re.IGNORECASE,
)
_PUNCT_RE = re.compile(r"[^\w\s]")
_WS_RE    = re.compile(r"\s+")


def normalize_name(name: str) -> str:
    """Lowercase, strip punctuation + common HOA/condo/legal suffixes, collapse whitespace."""
    if not name:
        return ""
    s = name.lower()
    s = _PUNCT_RE.sub(" ", s)
    # Strip suffixes repeatedly (handles "Inc LLC" or repeated "Association Inc")
    for _ in range(4):
        new = _SUFFIX_RE.sub(" ", s)
        if new == s:
            break
        s = new
    s = _WS_RE.sub(" ", s).strip()
    return s


def _name_distance(a: str, b: str) -> int:
    """Edit distance (Levenshtein if installed, else proxy via SequenceMatcher)."""
    if _HAS_LEV:
        return Levenshtein.distance(a, b)
    # Approximate: convert ratio to distance (lower = more similar)
    if not a or not b:
        return max(len(a), len(b))
    ratio = SequenceMatcher(None, a, b).ratio()
    return int(round(max(len(a), len(b)) * (1 - ratio)))


def _is_duplicate(norm_input: str, norm_existing: str) -> bool:
    """True if names normalize to the same string or differ by ≤2 chars / ratio ≥ 0.92."""
    if not norm_input or not norm_existing:
        return False
    if norm_input == norm_existing:
        return True
    if _HAS_LEV:
        return Levenshtein.distance(norm_input, norm_existing) <= 2
    # Fallback ratio
    return SequenceMatcher(None, norm_input, norm_existing).ratio() >= 0.92


def check_for_duplicate(
    supabase_client: Any,
    canonical_name: str,
    master_hoa_id: Optional[str] = None,
    zip_code: Optional[str] = None,
) -> Optional[str]:
    """
    Return the id of an existing community that fuzzy-matches canonical_name
    within the same master_hoa_id or zip_code. Return None if no match.

    `supabase_client` is expected to be a supabase-py client. If a dict-style
    helper is needed (e.g. raw requests), pass an object exposing
    `.from_("communities").select("id,canonical_name").eq(...).execute()`.
    """
    norm_in = normalize_name(canonical_name)
    if not norm_in:
        return None

    candidates: list[dict] = []

    def _gather(builder):
        try:
            res = builder.execute()
            data = getattr(res, "data", None) or []
            for row in data:
                candidates.append(row)
        except Exception:
            return

    # Pull communities sharing master_hoa_id (covers parent_id legacy too)
    if master_hoa_id:
        try:
            _gather(
                supabase_client.from_("communities")
                .select("id,canonical_name,master_hoa_id,parent_id,zip_code,status")
                .or_(f"master_hoa_id.eq.{master_hoa_id},parent_id.eq.{master_hoa_id}")
            )
        except Exception:
            try:
                _gather(
                    supabase_client.from_("communities")
                    .select("id,canonical_name,master_hoa_id,parent_id,zip_code,status")
                    .eq("master_hoa_id", master_hoa_id)
                )
            except Exception:
                pass

    # Pull communities sharing zip_code
    if zip_code:
        try:
            _gather(
                supabase_client.from_("communities")
                .select("id,canonical_name,master_hoa_id,parent_id,zip_code,status")
                .eq("zip_code", zip_code)
            )
        except Exception:
            pass

    # Check each candidate
    seen_ids: set[str] = set()
    for row in candidates:
        rid = row.get("id")
        if not rid or rid in seen_ids:
            continue
        seen_ids.add(rid)
        if (row.get("status") or "").lower() in {"removed"}:
            continue
        if _is_duplicate(norm_in, normalize_name(row.get("canonical_name") or "")):
            return rid
    return None


__all__ = ["check_for_duplicate", "normalize_name"]

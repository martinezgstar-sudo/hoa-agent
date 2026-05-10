"use client"

import { useEffect, useMemo, useRef, useState } from "react"

type Category = {
  id: string
  name: string
  slug: string
  parent_group: string | null
}

interface Props {
  /**
   * Called whenever the user's selection changes. category_id is the
   * matched ad_categories row id when the typed value matches an existing
   * category (case-insensitive); null when the user typed a custom name
   * that should be flagged for admin review.
   */
  onChange: (selection: { category_id: string | null; category_text: string }) => void
  /** Optional initial value (e.g. when re-entering the form). */
  initialText?: string
  /** Optional preset id (when re-entering and the previous selection matched). */
  initialCategoryId?: string | null
  /** Stable id for input element + label association. */
  id?: string
}

/**
 * CategoryAutocomplete — type-ahead category picker.
 *
 * - Loads /api/categories once on mount, caches in component state.
 * - Filters as the user types (substring match, case-insensitive).
 * - If the typed value matches an existing category exactly (case-insensitive),
 *   binds to that category_id. Otherwise category_id is null and category_text
 *   is what the user typed (parent uses this to insert with pending_review = true).
 */
export default function CategoryAutocomplete({
  onChange,
  initialText = "",
  initialCategoryId = null,
  id,
}: Props) {
  const [text, setText] = useState(initialText)
  const [matchedId, setMatchedId] = useState<string | null>(initialCategoryId)
  const [allCategories, setAllCategories] = useState<Category[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (Array.isArray(d.categories)) setAllCategories(d.categories)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Outside click closes dropdown
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [])

  // Recompute match whenever text or category list changes
  useEffect(() => {
    const trimmed = text.trim()
    if (!trimmed) {
      setMatchedId(null)
      onChange({ category_id: null, category_text: "" })
      return
    }
    const lower = trimmed.toLowerCase()
    const exact = allCategories.find((c) => c.name.toLowerCase() === lower)
    setMatchedId(exact ? exact.id : null)
    onChange({ category_id: exact ? exact.id : null, category_text: trimmed })
    // we deliberately exclude `onChange` from deps — parent rarely memoises it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, allCategories])

  const filtered = useMemo(() => {
    const trimmed = text.trim().toLowerCase()
    if (!trimmed) return allCategories.slice(0, 12)
    return allCategories.filter((c) => c.name.toLowerCase().includes(trimmed)).slice(0, 12)
  }, [text, allCategories])

  // Group filtered results by parent_group for nicer display
  const grouped = useMemo(() => {
    const out = new Map<string, Category[]>()
    for (const c of filtered) {
      const g = c.parent_group || "Other"
      if (!out.has(g)) out.set(g, [])
      out.get(g)!.push(c)
    }
    return out
  }, [filtered])

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        id={id || "category-autocomplete"}
        name={id || "category-autocomplete"}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setOpen(true)}
        autoComplete="off"
        placeholder={loading ? "Loading categories…" : "e.g. Cleaning, Plumbing, Real Estate…"}
        style={{
          width: "100%",
          padding: "11px 14px",
          fontSize: "14px",
          border: "1px solid " + (matchedId ? "#1D9E75" : "#d0d0d0"),
          borderRadius: "10px",
          outline: "none",
          boxSizing: "border-box",
          fontFamily: "inherit",
        }}
      />

      {/* Match status line */}
      <div style={{ marginTop: "6px", fontSize: "11px", color: text.trim() ? (matchedId ? "#1D9E75" : "#854F0B") : "#888" }}>
        {!text.trim()
          ? "Pick from the list or type your own — we'll review custom categories before activating."
          : matchedId
            ? "✓ Matched an existing category — exclusivity will be checked against this ZIP."
            : "Custom category — will be flagged for admin review (pending_review)."}
      </div>

      {open && filtered.length > 0 && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "4px",
            backgroundColor: "#fff",
            border: "1px solid #e0e0e0",
            borderRadius: "10px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
            maxHeight: "320px",
            overflowY: "auto",
            zIndex: 50,
          }}
        >
          {Array.from(grouped.entries()).map(([group, items]) => (
            <div key={group}>
              <div style={{ padding: "8px 12px 4px", fontSize: "10px", fontWeight: 700, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {group}
              </div>
              {items.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={matchedId === c.id}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setText(c.name)
                    setMatchedId(c.id)
                    setOpen(false)
                    onChange({ category_id: c.id, category_text: c.name })
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 14px",
                    border: "none",
                    background: matchedId === c.id ? "#E1F5EE" : "#fff",
                    cursor: "pointer",
                    fontSize: "13px",
                    color: "#1a1a1a",
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

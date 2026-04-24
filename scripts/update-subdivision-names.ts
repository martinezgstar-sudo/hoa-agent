/**
 * Merge CAMA plat names from improved_matches.csv into communities.subdivision_names.
 *
 * Run (dry run, logs only): npx ts-node scripts/update-subdivision-names.ts
 * Apply updates:           npx ts-node scripts/update-subdivision-names.ts --apply
 *
 * Env:
 *   IMPROVED_MATCHES_CSV — default scripts/output/improved_matches.csv
 *   SUPABASE_SERVICE_ROLE_KEY — optional; if set, used instead of anon key (helps when RLS blocks updates)
 */

import { createClient } from "@supabase/supabase-js"
import { parse as parseSync } from "csv-parse/sync"
import dotenv from "dotenv"
import { existsSync, readFileSync } from "fs"
import { join } from "path"

dotenv.config({ path: join(process.cwd(), ".env.local") })
dotenv.config()

/** Split existing DB value (commas and pipes seen in the wild). */
function splitExistingSubdivisionParts(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(/[,|]/g)
    .map((s) => s.trim())
    .filter(Boolean)
}

type MatchRow = {
  subdiv_name: string
  matched_community_id: string
  matched_community_name: string
}

function readImprovedMatches(path: string): MatchRow[] {
  if (!existsSync(path)) {
    throw new Error(`File not found: ${path}`)
  }
  const buf = readFileSync(path, "utf8")
  const records = parseSync(buf, {
    columns: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
    trim: true,
    skip_empty_lines: true,
  }) as Record<string, string>[]

  const out: MatchRow[] = []
  for (const row of records) {
    const id = (row.matched_community_id || "").trim()
    if (!id) continue
    const subdiv = (row.subdiv_name || "").trim()
    if (!subdiv) continue
    out.push({
      subdiv_name: subdiv,
      matched_community_id: id,
      matched_community_name: (row.matched_community_name || "").trim(),
    })
  }
  return out
}

/** Preserve first-seen order; dedupe case-insensitively within the list. */
function mergeSubdivisionNames(
  existingRaw: string | null,
  newNames: string[],
): { next: string | null; added: string[] } {
  const existingParts = splitExistingSubdivisionParts(existingRaw)
  const seenLower = new Set(existingParts.map((p) => p.toLowerCase()))
  const added: string[] = []

  for (const n of newNames) {
    const k = n.toLowerCase()
    if (!k || seenLower.has(k)) continue
    seenLower.add(k)
    added.push(n)
  }

  if (added.length === 0) {
    return { next: existingRaw?.trim() || null, added: [] }
  }

  const merged = [...existingParts, ...added]
  return { next: merged.join(", "), added }
}

async function main() {
  const apply = process.argv.includes("--apply")
  const csvPath =
    process.env.IMPROVED_MATCHES_CSV?.trim() ||
    join(__dirname, "output", "improved_matches.csv")

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const key = serviceKey || anonKey
  if (!url || !key) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY for updates under RLS).",
    )
  }

  if (apply && !serviceKey) {
    process.stderr.write(
      "Note: SUPABASE_SERVICE_ROLE_KEY not set — using anon key; RLS may block updates.\n",
    )
  }

  const rows = readImprovedMatches(csvPath)
  const byCommunity = new Map<string, { names: string[]; displayName: string }>()
  for (const r of rows) {
    let g = byCommunity.get(r.matched_community_id)
    if (!g) {
      g = { names: [], displayName: r.matched_community_name }
      byCommunity.set(r.matched_community_id, g)
    }
    const lower = r.subdiv_name.toLowerCase()
    if (!g.names.some((x) => x.toLowerCase() === lower)) {
      g.names.push(r.subdiv_name)
    }
    if (r.matched_community_name) g.displayName = r.matched_community_name
  }

  const ids = [...byCommunity.keys()]
  if (ids.length === 0) {
    process.stderr.write("No rows with matched_community_id; nothing to do.\n")
    return
  }

  const supabase = createClient(url, key)

  const { data: communities, error: fetchErr } = await supabase
    .from("communities")
    .select("id, canonical_name, subdivision_names")
    .in("id", ids)

  if (fetchErr) throw new Error(`Fetch communities: ${fetchErr.message}`)
  const byId = new Map((communities || []).map((c) => [c.id as string, c]))

  process.stderr.write(
    `${apply ? "APPLY" : "DRY RUN"} — ${byCommunity.size} communities from ${rows.length} match rows (${csvPath})\n\n`,
  )

  for (const id of ids) {
    const g = byCommunity.get(id)!
    const row = byId.get(id)
    if (!row) {
      process.stderr.write(`SKIP id=${id} — not found in Supabase\n`)
      continue
    }

    const communityName = (row.canonical_name || "").trim() || g.displayName
    const oldVal = row.subdivision_names
    const { next, added } = mergeSubdivisionNames(oldVal, g.names)

    if (added.length === 0) {
      process.stderr.write(
        `[no change] ${communityName} (id=${id})\n  subdivision_names unchanged: ${oldVal ?? "(null)"}\n\n`,
      )
      continue
    }

    process.stderr.write(
      `[${apply ? "update" : "would update"}] ${communityName} (id=${id})\n` +
        `  old: ${oldVal ?? "(null)"}\n` +
        `  new: ${next}\n` +
        `  appended (${added.length}): ${added.join(" | ")}\n\n`,
    )

    if (apply) {
      const { error: upErr } = await supabase
        .from("communities")
        .update({ subdivision_names: next })
        .eq("id", id)
      if (upErr) throw new Error(`Update ${id}: ${upErr.message}`)
    }
  }

  if (!apply) {
    process.stderr.write("Dry run complete. Re-run with --apply to write changes.\n")
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

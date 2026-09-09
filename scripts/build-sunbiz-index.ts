#!/usr/bin/env -S npx tsx
/**
 * build-sunbiz-index.ts — build data/sunbiz.sqlite from the LaCie cordata dump.
 *
 * Owner ruling 2026-09-08: keep rows where the county resolves to Palm
 * Beach AND the name matches an association pattern. Write locally so
 * the nightly loop no longer depends on the LaCie volume being mounted.
 * The freshness check in nightly-enrich.ts reads MAX(built_at) from
 * sunbiz_meta and treats > 45 days as stale.
 *
 * Source: /Volumes/LaCie/FL-Palm Beach County Data /cordata_extracted/cordata*.txt
 *   (trailing space in the path is intentional — LaCie ships it that way)
 *
 * Fixed-width offsets confirmed against real records
 * (matches scripts/build-sunbiz-index.py in the main hoa-agent tree):
 *   [0:12]    document_number
 *   [12:204]  legal name (192)
 *   [204]     status  A|I
 *   [220:262] principal address line 1 (42)
 *   [304:332] principal city (28)
 *   [332:334] principal state
 *   [334:339] principal zip5
 *   [346:388] mailing address line 1 (42)
 *   [388:430] mailing city (42, some variance)
 *   [430:432] mailing state
 *   [432:437] mailing zip5
 *   [472:480] file date MMDDYYYY
 *   [544:586] registered agent name (42)
 *   [587:629] RA address 1 (42)
 *   [629:657] RA city (28)
 *   [657:659] RA state
 *   [659:664] RA zip5
 *
 * PBC filter: principal zip5 begins with "334". Every Palm Beach ZIP
 * lives in the 334xx block per CLAUDE.md's pbc_zips dict; 335xx is
 * Martin / St. Lucie and we skip it.
 *
 * Usage:
 *   npx tsx scripts/build-sunbiz-index.ts
 *
 * Output:
 *   data/sunbiz.sqlite  (schema below; existing file is replaced)
 *
 * Exit codes:
 *   0  ok
 *   1  LaCie volume not mounted / no cordata files
 */

// node:sqlite is Node 22.5+. TS types trail; the runtime binding works.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error node:sqlite types not yet in @types/node baseline
import { DatabaseSync } from 'node:sqlite';
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, renameSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');

const CORDATA_DIR = '/Volumes/LaCie/FL-Palm Beach County Data /cordata_extracted';
const OUT_PATH = join(REPO, 'data', 'sunbiz.sqlite');
const TMP_PATH = OUT_PATH + '.building';

// Owner ruling 2026-09-09 (late): three filters, in order.
//
//   1. Entity type must be DOMNP (Domestic Not-for-Profit) — cordata
//      [205:210] of the fixed-width record.
//   2. Name must contain ASSOCIATION AND at least one of the required
//      community-shape tokens.
//   3. Name must NOT contain any of the exclusion tokens (alumni,
//      clubs, churches, foundations, medical/dental, etc.).
//
// The same filter is applied as a guard in pickNewBatch inside
// nightly-enrich.ts so a stale index can't leak old rows.
export const REQUIRE_ONE = [
  'HOMEOWNERS', 'OWNERS', 'CONDOMINIUM', 'CONDO', 'PROPERTY',
  'COMMUNITY', 'MASTER', 'RESIDENTS', 'TOWNHOME', 'TOWNHOMES',
  'VILLAS', 'ESTATES', 'NEIGHBORHOOD', 'RECREATION', 'MAINTENANCE',
];
export const EXCLUDE_ANY = [
  'ALUMNI', 'CLUB', 'CLUBS', 'CHURCH', 'MINISTRY', 'MINISTRIES',
  'FOUNDATION', 'CHARITABLE', 'LEAGUE', 'SOCIETY', 'GUILD',
  'NURSES', 'MEDICAL', 'DENTAL', 'BAR ASSOCIATION', 'CHAMBER',
  'PROFESSIONAL', 'TRADE', 'BOOSTER', 'PTA', 'PTO', 'ATHLETIC',
  'BUSINESS',
];

// Word-boundary regex used by nameMatches. \bASSOCIATION\b is required;
// one of the REQUIRE_ONE tokens must also appear (word-boundary).
const ASSOCIATION_PATTERN = /\bASSOCIATION\b/;
const REQUIRE_ONE_PATTERN = new RegExp(
  '\\b(' +
    REQUIRE_ONE.map((t) => t.replace(/\s+/g, '\\s+')).join('|') +
    ')\\b',
);
const EXCLUDE_ANY_PATTERN = new RegExp(
  '\\b(' +
    EXCLUDE_ANY.map((t) => t.replace(/\s+/g, '\\s+')).join('|') +
    ')\\b',
);

export function nameMatchesTight(name: string): boolean {
  const up = name.toUpperCase();
  if (!ASSOCIATION_PATTERN.test(up)) return false;
  if (!REQUIRE_ONE_PATTERN.test(up)) return false;
  if (EXCLUDE_ANY_PATTERN.test(up)) return false;
  return true;
}

function typeMatches(line: string): boolean {
  return line.slice(205, 210) === 'DOMNP';
}

function nameMatches(name: string): boolean {
  return nameMatchesTight(name);
}

function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .replace(/,?\s+(INC|INCORPORATED|LLC|LTD|CO)\.?\s*$/i, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function ws(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function fileDateIso(raw: string): string | null {
  const s = raw.trim();
  if (s.length !== 8 || !/^\d{8}$/.test(s)) return null;
  const mm = s.slice(0, 2);
  const dd = s.slice(2, 4);
  const yyyy = s.slice(4, 8);
  if (mm < '01' || mm > '12' || dd < '01' || dd > '31' || yyyy < '1800' || yyyy > '2099') return null;
  return `${yyyy}-${mm}-${dd}`;
}

interface Parsed {
  document_number: string;
  name: string;
  normalized_name: string;
  status: 'Active' | 'Inactive';
  filing_date: string | null;
  registered_agent: string | null;
  principal_address: string | null;
  principal_city: string | null;   // tie-breaker for multi-name-match
  principal_zip: string | null;    // fuels the pbc-zip-city rule at query time
  mailing_address: string | null;
}

function parseLine(line: string): Parsed | null {
  if (line.length < 470) return null;

  // Filter 1: entity type must be DOMNP (Domestic Not-for-Profit).
  if (!typeMatches(line)) return null;

  const zip5 = line.slice(334, 339).trim();
  if (!zip5.startsWith('334')) return null;

  const name = ws(line.slice(12, 204));
  // Filter 2: word-boundary name pattern.
  if (!name || !nameMatches(name)) return null;

  const document_number = line.slice(0, 12).trim();
  if (!document_number) return null;

  const status: 'Active' | 'Inactive' = line[204] === 'A' ? 'Active' : 'Inactive';
  const filing_date = fileDateIso(line.slice(472, 480));

  const p_addr = ws(line.slice(220, 262));
  const p_city = ws(line.slice(304, 332));
  const p_state = ws(line.slice(332, 334));
  const principal_address = [
    p_addr,
    [p_city, p_state, zip5].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .join(', ');

  const m_addr = ws(line.slice(346, 388));
  const m_city = ws(line.slice(388, 430));
  const m_state = ws(line.slice(430, 432));
  const m_zip5 = ws(line.slice(432, 437));
  const mailing_line = [m_addr, [m_city, m_state, m_zip5].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  const mailing_address = mailing_line.replace(/\s+,\s+$/, '').trim() || null;

  const ra_name = ws(line.slice(544, 586)) || null;

  return {
    document_number,
    name,
    normalized_name: normalizeName(name),
    status,
    filing_date,
    registered_agent: ra_name,
    principal_address: principal_address || null,
    principal_city: p_city || null,
    principal_zip: zip5 || null,
    mailing_address,
  };
}

async function main(): Promise<void> {
  if (!existsSync(CORDATA_DIR)) {
    console.error(`ERROR: cordata dir not accessible: ${CORDATA_DIR}`);
    console.error('Is the LaCie volume mounted? Run from an interactive terminal.');
    process.exit(1);
  }
  const files = readdirSync(CORDATA_DIR)
    .filter((f) => /^cordata\d+\.txt$/.test(f))
    .sort()
    .map((f) => join(CORDATA_DIR, f));
  if (files.length === 0) {
    console.error(`ERROR: no cordata*.txt files in ${CORDATA_DIR}`);
    process.exit(1);
  }
  const totalBytes = files.reduce((s, f) => s + statSync(f).size, 0);
  console.log(`Sunbiz index build:`);
  console.log(`  cordata files: ${files.length}, total ${(totalBytes / 1024 / 1024 / 1024).toFixed(1)} GB`);
  console.log(`  output: ${OUT_PATH}`);

  const dataDir = dirname(OUT_PATH);
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  if (existsSync(TMP_PATH)) {
    console.log(`  removing stale ${TMP_PATH}`);
    // node:fs.rmSync is not on all node versions but we're on 22.22 — safe.
    const { rmSync } = await import('node:fs');
    rmSync(TMP_PATH);
  }

  const db = new DatabaseSync(TMP_PATH);
  db.exec(`
    PRAGMA journal_mode = OFF;
    PRAGMA synchronous = OFF;
    CREATE TABLE sunbiz_pbc_associations (
      document_number   TEXT PRIMARY KEY,
      name              TEXT NOT NULL,
      normalized_name   TEXT NOT NULL,
      status            TEXT NOT NULL,
      filing_date       TEXT,
      registered_agent  TEXT,
      principal_address TEXT,
      principal_city    TEXT,
      principal_zip     TEXT,
      mailing_address   TEXT
    );
    CREATE TABLE sunbiz_meta (
      built_at         TEXT NOT NULL,
      source_files     INTEGER NOT NULL,
      source_bytes     INTEGER NOT NULL,
      rows_kept        INTEGER NOT NULL,
      rows_scanned     INTEGER NOT NULL
    );
  `);

  const insert = db.prepare(
    `INSERT OR REPLACE INTO sunbiz_pbc_associations
       (document_number, name, normalized_name, status, filing_date,
        registered_agent, principal_address, principal_city, principal_zip, mailing_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const t0 = Date.now();
  let scanned = 0;
  let kept = 0;

  for (let fi = 0; fi < files.length; fi++) {
    const f = files[fi];
    const rl = createInterface({
      input: createReadStream(f, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    db.exec('BEGIN');
    let batchInBegin = true;
    let batched = 0;
    for await (const line of rl) {
      scanned++;
      const rec = parseLine(line);
      if (rec) {
        insert.run(
          rec.document_number,
          rec.name,
          rec.normalized_name,
          rec.status,
          rec.filing_date,
          rec.registered_agent,
          rec.principal_address,
          rec.principal_city,
          rec.principal_zip,
          rec.mailing_address,
        );
        kept++;
        batched++;
        if (batched >= 10000) {
          db.exec('COMMIT');
          db.exec('BEGIN');
          batched = 0;
        }
      }
    }
    if (batchInBegin) {
      db.exec('COMMIT');
      batchInBegin = false;
    }
    const elapsed = Math.round((Date.now() - t0) / 1000);
    console.log(
      `  [${fi + 1}/${files.length}] ${f.split('/').pop()} — scanned ${scanned.toLocaleString()} kept ${kept.toLocaleString()} (${elapsed}s)`,
    );
  }

  db.exec('CREATE INDEX idx_sunbiz_norm_name ON sunbiz_pbc_associations(normalized_name)');
  db.exec('CREATE INDEX idx_sunbiz_status ON sunbiz_pbc_associations(status)');
  db.exec('CREATE INDEX idx_sunbiz_status_filing ON sunbiz_pbc_associations(status, filing_date DESC)');

  db.prepare(
    'INSERT INTO sunbiz_meta (built_at, source_files, source_bytes, rows_kept, rows_scanned) VALUES (?, ?, ?, ?, ?)',
  ).run(new Date().toISOString(), files.length, totalBytes, kept, scanned);

  db.exec('VACUUM');
  db.close();
  renameSync(TMP_PATH, OUT_PATH);

  const finalSize = statSync(OUT_PATH).size;
  const elapsed = Math.round((Date.now() - t0) / 1000);
  console.log('');
  console.log(`Done. Kept ${kept.toLocaleString()} PBC association rows from ${scanned.toLocaleString()} scanned in ${elapsed}s.`);
  console.log(`Index size: ${(finalSize / 1024 / 1024).toFixed(1)} MB at ${OUT_PATH}`);
}

void main().catch((err) => {
  console.error('BUILD FAILED:', err);
  process.exit(1);
});

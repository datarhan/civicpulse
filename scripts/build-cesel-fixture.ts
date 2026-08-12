#!/usr/bin/env tsx
/**
 * Slice the CESEL national workbook down to the `cv-15k-40k` peer band, so the
 * parser test runs against REAL ministry rows without a 45 MB file in git.
 *
 * Values are copied verbatim and the sheet names are preserved — only rows are
 * dropped. That matters: the fixture IS the RED contract, and a hand-written
 * one would only ever prove the parser agrees with whoever wrote the fixture.
 *
 * The source workbook is cached under .cache/cesel (gitignored):
 *
 *   mkdir -p .cache/cesel
 *   curl -sSL -A "CivicPulse/1.0 (monitor cívico Riba-roja; +https://github.com/datarhan/civicpulse)" \
 *     -o .cache/cesel/cesel-2021.xlsx "https://www.hacienda.gob.es/cdi/power%20bi/cesel-2021.xlsx"
 *
 * Usage: npx tsx scripts/build-cesel-fixture.ts
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as XLSX from 'xlsx'
import { parseConprelRoster } from '../src/scraper/budget'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SRC = join(ROOT, '.cache/cesel/cesel-2021.xlsx')
const CONPREL = join(ROOT, 'tests/fixtures/conprel_CV_2024.xls')
const OUT = join(ROOT, 'tests/fixtures/cesel_2021_cv_slice.xlsx')

const POP_MIN = 15_000
const POP_MAX = 40_000
const RIBA_ROJA = '46214'

if (!existsSync(SRC)) {
  console.error(`[cesel-fixture] missing ${SRC} — download it first (see the header of this file)`)
  process.exit(1)
}

const roster = parseConprelRoster(readFileSync(CONPREL))
const band = new Set(
  roster.filter((m) => m.poblacion >= POP_MIN && m.poblacion <= POP_MAX).map((m) => m.ine),
)
band.add(RIBA_ROJA)

const ENTE_RE = /^\d{2}-(\d{2})-(\d{3})-AA-\d{3}$/

const src = XLSX.read(readFileSync(SRC), { type: 'buffer' })
const out = XLSX.utils.book_new()

for (const name of src.SheetNames) {
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(src.Sheets[name])
  const kept = rows.filter((r) => {
    const m = ENTE_RE.exec(String(r.Ente ?? ''))
    return m ? band.has(m[1] + m[2]) : false
  })
  XLSX.utils.book_append_sheet(out, XLSX.utils.json_to_sheet(kept), name)
  console.log(`[cesel-fixture] ${name}: ${rows.length} → ${kept.length} filas`)
}

// `compression` defaults to false, which writes a ~3.5 MB stored-zip fixture
// for rows that deflate to a fraction of that.
writeFileSync(OUT, XLSX.write(out, { type: 'buffer', bookType: 'xlsx', compression: true }))
console.log(`[cesel-fixture] banda ${POP_MIN}-${POP_MAX}: ${band.size} municipios → ${OUT}`)

#!/usr/bin/env tsx
/**
 * One-off: re-derive the frozen `departmentSlug` of published area-fit rows
 * from the department taxonomy as it stands now.
 *
 *   npm run migrate:area-fit-department-slug -- --dry-run
 *   npm run migrate:area-fit-department-slug
 *
 * This is a NAVIGATION correction, not a re-judgement. `departmentSlug` decides
 * only where the «Departamento →» link of a row points; the visible heading of
 * the row is `portfolio`, verbatim. Every judgement, citation, reason, curator
 * signature and date is carried across untouched — nothing here reads or
 * rewrites a verdict.
 *
 * WHY IT WAS NEEDED. `departmentSlug` is frozen at promotion time from
 * `canonicalizeDepartment(portfolio)`, so a row keeps whatever the taxonomy
 * said on the day a curator signed it. That is the right default — a cron must
 * not move a published row — but it means a row goes stale silently when the
 * taxonomy itself is corrected. On 2026-08-24 the rules that folded
 * «Urbanizaciones» and «barrios y diseminados» into `urbanismo` were removed:
 * they are the peripheral developments, not planning, and sharing a slug with
 * «Urbanismo» made /cargos paint that word on the card of the councillor who
 * does NOT hold Urbanismo. The two rows promoted on 2026-08-04 kept pointing at
 * the urbanismo department, whose responsable is a different person.
 *
 * WHY A SIBLING SCRIPT AND NOT A FLAG ON `promote-area-fit`. Same reason as
 * `migrate-area-fit-portfolio-key`: teaching promotion to re-point rows that
 * are already published would give every future promotion the standing power to
 * change, as a side effect, which department a signed claim about a named
 * councillor hangs from. A dated one-off leaves the act in git history instead.
 *
 * HOW THE NEW SLUG IS DERIVED, and why it is not a table written here. It is
 * imported from `canonicalizeDepartment` — the same function that produced the
 * value at promotion time — so the two cannot drift; a second copy of the rules
 * would be the "restated shape" that DATA_INTEGRITY §1 is about. A row whose
 * slug is unchanged is left alone, which is what makes a second run a no-op.
 *
 * Writes through the same gate as `promote-area-fit`: the WHOLE snapshot is
 * re-validated — officials, portfolios, signatures, source ids, aviso indices
 * re-resolved against the reports as they stand now — before a single byte is
 * written. Idempotent: a second run migrates nothing and says so.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  validateAreaFitSnapshot,
  type AreaFitSnapshot,
  type OfficialLike,
  type ReportLike,
} from '../src/scraper/area-fit'
import { canonicalizeDepartment } from '../src/scraper/departments'

const OUT = resolve('public/data/area-fit.json')
const OFFICIALS = resolve('public/data/officials.json')
const REPORTS = resolve('public/data/journalist-reports.json')

const DRY = process.argv.includes('--dry-run')

function loadReports(): ReportLike[] {
  const raw = JSON.parse(readFileSync(REPORTS, 'utf8'))
  return (raw.items || raw.reports || []) as ReportLike[]
}

function main() {
  if (!existsSync(OUT)) {
    console.error(`${OUT} no existe — no hay nada que migrar`)
    process.exit(1)
  }
  const snap = JSON.parse(readFileSync(OUT, 'utf8')) as AreaFitSnapshot
  const officials = JSON.parse(readFileSync(OFFICIALS, 'utf8')).officials as OfficialLike[]
  const byslug = new Map(officials.map((o) => [o.slug, o]))

  let attempted = 0
  let migrated = 0
  let already = 0
  const unmatched: string[] = []

  for (const row of snap.rows ?? []) {
    attempted += 1
    const where = `${row.officialSlug}/${row.portfolio}`
    if (!byslug.has(row.officialSlug)) {
      unmatched.push(`${where}: el concejal no existe en officials.json`)
      continue
    }
    const target = canonicalizeDepartment(row.portfolio)
    if (target === (row.departmentSlug ?? null)) {
      already += 1
      continue
    }
    const stale = row.departmentSlug ?? '(ninguno)'
    row.departmentSlug = target
    migrated += 1
    console.log(`  · ${where}: «${stale}» → «${target ?? '(ninguno)'}»`)
  }

  console.log(
    `filas ${attempted}  ·  re-apuntadas ${migrated}  ·  ya correctas ${already}  ·  ` +
      `sin resolver ${unmatched.length}`,
  )

  // "A run must prove it did work" (DATA_INTEGRITY §2): zero rows examined is
  // reading the wrong file, not a clean snapshot. It must never read as a pass.
  if (attempted === 0) {
    console.error(
      'ninguna fila examinada — el snapshot está vacío o se ha leído el fichero equivocado. ' +
        'No se escribe nada.',
    )
    process.exit(1)
  }

  if (unmatched.length) {
    console.error(
      `\n${unmatched.length} fila(s) que no se pueden re-apuntar:\n` +
        unmatched.map((u) => `  · ${u}`).join('\n') +
        '\n\nNo se escribe nada.',
    )
    process.exit(1)
  }

  if (migrated === 0) {
    console.log('nada que migrar — cada fila ya apunta a donde la taxonomía dice hoy')
    return
  }

  // Same gate as promote-area-fit's write(): revalidate EVERYTHING, including
  // the aviso indices re-resolved against the reports as they stand right now.
  const reports = loadReports()
  const reportSources: Record<string, Set<string>> = {}
  const reportWarnings: Record<string, string[]> = {}
  for (const r of reports) {
    reportSources[r.id] = new Set((r.sources ?? []).map((s) => s.id))
    reportWarnings[r.id] = Array.isArray(r.warnings) ? r.warnings : []
  }
  validateAreaFitSnapshot(snap, { officials, reportSources, reportWarnings })

  if (DRY) {
    console.log('--dry-run: validado, no se escribe')
    return
  }

  // `generatedAt` is left alone on purpose: this changes where a row LINKS, not
  // what it claims. Row order is untouched — the key is `portfolio`, and that
  // is not what moved here.
  writeFileSync(OUT, JSON.stringify(snap, null, 2) + '\n')
  console.log(`✓ escrito ${OUT}`)
}

main()

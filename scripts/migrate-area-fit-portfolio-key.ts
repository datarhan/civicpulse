#!/usr/bin/env tsx
/**
 * One-off: re-key published area-fit rows whose `portfolio` still carries the
 * list conjunction the corporación parser used to leave on ("y Comercio").
 *
 *   npm run migrate:area-fit-portfolio-key -- --dry-run
 *   npm run migrate:area-fit-portfolio-key
 *
 * This is a NAMING correction, not a re-judgement. The área is the same área;
 * only the string it is filed under changes. Every judgement, citation, reason,
 * curator signature and date is carried across untouched — nothing here reads
 * or rewrites a verdict.
 *
 * WHY A SIBLING SCRIPT AND NOT A FLAG ON `promote-area-fit`. Promotion moves a
 * drafted judgement into the published set. Teaching it to re-key rows that are
 * already published would give every future promotion the standing power to
 * rename a published claim about a named councillor as a side effect — which is
 * precisely the "nothing automatic rewrites published prose" rule. A dated
 * one-off leaves the act in git history instead, the same shape as
 * `migrate-area-fit-short`.
 *
 * HOW THE NEW KEY IS DERIVED, and why it is not a regex written here. The rule
 * is imported from the parser that produces the strings in the first place
 * (`stripLeadingListConjunction`), so the two cannot drift; a second copy of the
 * rule would be the "restated shape" that DATA_INTEGRITY §1 is about. The
 * stripped value is then required to be an actual portfolio of that official in
 * `officials.json`. A row that strips to nothing recognisable, or whose target
 * key is already taken, is reported and the whole run aborts without writing:
 * silently re-filing a signed judgement under the wrong área is the
 * misattribution this surface exists to prevent.
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
import { stripLeadingListConjunction } from '../src/scraper/corporacion'

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

  // Every (official, portfolio) already spoken for, so a rename can never land
  // on top of another signed row.
  const taken = new Set((snap.rows ?? []).map((r) => `${r.officialSlug}::${r.portfolio}`))

  let attempted = 0
  let migrated = 0
  let already = 0
  const unmatched: string[] = []

  for (const row of snap.rows ?? []) {
    attempted += 1
    const where = `${row.officialSlug}/${row.portfolio}`
    const official = byslug.get(row.officialSlug)
    if (!official) {
      unmatched.push(`${where}: el concejal no existe en officials.json`)
      continue
    }
    // The row is already keyed by a portfolio the official actually holds:
    // nothing to do. This is what makes a second run a no-op.
    if (official.portfolios.includes(row.portfolio)) {
      already += 1
      continue
    }
    const target = stripLeadingListConjunction(row.portfolio)
    if (target === row.portfolio) {
      unmatched.push(
        `${where}: no está entre las áreas de ${row.officialSlug} y no empieza por conjunción — ` +
          `áreas publicadas: ${official.portfolios.map((p) => `«${p}»`).join(', ')}`,
      )
      continue
    }
    if (!official.portfolios.includes(target)) {
      unmatched.push(
        `${where}: al quitar la conjunción queda «${target}», que tampoco está entre sus áreas — ` +
          `áreas publicadas: ${official.portfolios.map((p) => `«${p}»`).join(', ')}`,
      )
      continue
    }
    if (taken.has(`${row.officialSlug}::${target}`)) {
      unmatched.push(
        `${where}: «${target}» ya tiene fila propia — fusionarlas cambiaría un juicio firmado`,
      )
      continue
    }
    // In-place, so the key keeps its position in the object and the diff is the
    // string and nothing else. Everything under it — juicio, evidencia, razón,
    // firma y fecha — se queda tal cual.
    const stale = row.portfolio
    taken.delete(`${row.officialSlug}::${stale}`)
    row.portfolio = target
    taken.add(`${row.officialSlug}::${target}`)
    migrated += 1
    console.log(`  · ${row.officialSlug}: «${stale}» → «${target}»`)
  }

  console.log(
    `filas ${attempted}  ·  re-etiquetadas ${migrated}  ·  ya correctas ${already}  ·  ` +
      `sin correspondencia ${unmatched.length}`,
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
      `\n${unmatched.length} fila(s) que no se pueden re-etiquetar sin adivinar:\n` +
        unmatched.map((u) => `  · ${u}`).join('\n') +
        '\n\nNo se escribe nada. Colgar un juicio firmado del área equivocada atribuye a una ' +
        'persona con nombre y apellidos una competencia que no tiene; si las áreas han cambiado ' +
        'de verdad, eso se revisa, no se repara aquí.',
    )
    process.exit(1)
  }

  if (migrated === 0) {
    console.log('nada que migrar — todas las filas ya se apoyan en un área publicada')
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

  // Same ordering and formatting as the promote CLI. Re-keying moves the row
  // within its official's block — that is the canonical order the next
  // promotion would impose anyway, so it belongs in this commit rather than
  // surfacing later as an unexplained diff. `generatedAt` is left alone on
  // purpose: this changes how a row is FILED, not what it claims.
  snap.rows.sort((a, b) =>
    a.officialSlug === b.officialSlug
      ? a.portfolio.localeCompare(b.portfolio)
      : a.officialSlug.localeCompare(b.officialSlug),
  )
  snap.avisos?.sort((a, b) =>
    a.officialSlug === b.officialSlug
      ? a.avisoIndex - b.avisoIndex
      : a.officialSlug.localeCompare(b.officialSlug),
  )
  writeFileSync(OUT, JSON.stringify(snap, null, 2) + '\n')
  console.log(`✓ escrito ${OUT}`)
}

main()

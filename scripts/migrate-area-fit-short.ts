#!/usr/bin/env tsx
/**
 * One-off: give every PUBLISHED evidence item its `short` form.
 *
 *   npm run migrate:area-fit-short -- --dry-run
 *   npm run migrate:area-fit-short
 *
 * `short` is the credential without the institution — «Arquitecto Técnico»
 * rather than «Arquitecto Técnico — Universitat Politècnica de València» — and
 * it is what the card on /cargos prints. Rows promoted before the field existed
 * carry only the full label, and the published validator now refuses them, so
 * they are migrated here rather than left to render blank.
 *
 * HOW THE VALUE IS RECOVERED, and why it is not a regex. The short form is NOT
 * parsed out of the label. Each published item is matched back to the biography
 * row it came from by rebuilding that report's pools with `evidencePoolsFor` —
 * the very builder the pipeline used — and comparing the WHOLE label. The
 * `degree` / `role` fields are then read from the matched row. An item that
 * matches nothing is reported and the whole run aborts without writing: a
 * guessed credential under a named councillor's photograph is exactly the
 * mis-attribution this surface exists to avoid, and a partial migration would
 * leave the file half-published and half-refused.
 *
 * Writes through the same gate as `promote-area-fit`: the WHOLE snapshot is
 * re-validated — officials, portfolios, signatures, source ids, aviso indices
 * re-resolved against the reports as they stand now — before a single byte is
 * written. Idempotent: a second run migrates nothing and says so.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  evidencePoolsFor,
  validateAreaFitSnapshot,
  type AreaFitSnapshot,
  type FitEvidenceItem,
  type OfficialLike,
  type ReportLike,
} from '../src/scraper/area-fit'

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
  const reports = loadReports()
  // One pool set per report, built once with the pipeline's own builder.
  const poolsByReport = new Map(reports.map((r) => [r.id, evidencePoolsFor(r)]))

  let attempted = 0
  let migrated = 0
  let already = 0
  const unmatched: string[] = []

  for (const row of snap.rows ?? []) {
    const pools = poolsByReport.get(row.reportId)
    for (const field of ['formacion', 'experiencia'] as const) {
      // The two axes read DIFFERENT sections; crossing them is how a job title
      // would end up published as a degree.
      const pool: FitEvidenceItem[] =
        (field === 'formacion' ? pools?.educationItems : pools?.careerItems) ?? []
      const evidence = row[field]?.evidence ?? []
      for (let i = 0; i < evidence.length; i += 1) {
        const ev = evidence[i]
        attempted += 1
        const where = `${row.officialSlug}/${row.portfolio}.${field}`
        const hit = pool.find((p) => p.label === ev.label)
        if (!hit) {
          unmatched.push(
            `${where}: «${ev.label}» no coincide con ninguna fila de ${row.reportId || '(sin informe)'}` +
              ` — ${pool.length} fila(s) en esa sección`,
          )
          continue
        }
        if (ev.short === hit.short) {
          already += 1
          continue
        }
        // Rebuilt rather than assigned, so the key order matches what the
        // pipeline writes and a later promotion of the same row produces no
        // spurious diff. Any field this migration does not know about is kept:
        // dropping one silently is how a curator's annotation disappears.
        const { label, short: _stale, sourceIds, ...rest } = ev
        evidence[i] = { label, short: hit.short, sourceIds, ...rest }
        migrated += 1
      }
    }
  }

  console.log(
    `intentadas ${attempted}  ·  migradas ${migrated}  ·  ya la traían ${already}  ·  ` +
      `sin correspondencia ${unmatched.length}`,
  )

  // "A run must prove it did work" (DATA_INTEGRITY §2): zero items examined is
  // reading the wrong file, not a clean snapshot. It must never read as a pass.
  if (attempted === 0) {
    console.error(
      'ningún elemento de evidencia examinado — el snapshot no tiene citas o se ha leído ' +
        'el fichero equivocado. No se escribe nada.',
    )
    process.exit(1)
  }

  if (unmatched.length) {
    console.error(
      `\n${unmatched.length} elemento(s) sin correspondencia en su biografía:\n` +
        unmatched.map((u) => `  · ${u}`).join('\n') +
        '\n\nNo se escribe nada. Un «short» adivinado atribuiría a una persona con nombre y ' +
        'apellidos una credencial que su CV no dice; si la biografía se ha vuelto a generar, ' +
        'la fila publicada cita un texto que ya no existe y hay que revisarla, no repararla aquí.',
    )
    process.exit(1)
  }

  if (migrated === 0) {
    console.log('nada que migrar — todas las evidencias ya llevan su forma corta')
    return
  }

  // Same gate as promote-area-fit's write(): revalidate EVERYTHING, including
  // the aviso indices re-resolved against the reports as they stand right now.
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

  // Same ordering and formatting as the promote CLI, so the diff is the field
  // and nothing else. `generatedAt` is left alone on purpose: this adds a way of
  // WRITING what the rows already said, and touching it would date a snapshot
  // whose claims are unchanged.
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

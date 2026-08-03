#!/usr/bin/env tsx
/**
 * Promote reviewed «encaje declarado» rows into the published snapshot.
 *
 *   npm run promote-area-fit -- --list
 *   npm run promote-area-fit -- --official teresa-pozuelo-martin --area "Urbanismo" \
 *       --curator "datarhan" [--note "el título es del ramo de la edificación"]
 *   npm run promote-area-fit -- --official alfredo-pla-gimenez --area "Fallas" --reject
 *   npm run promote-area-fit -- --official X --area Y --retract --curator "datarhan"
 *
 * The ONLY path that writes public/data/area-fit.json. Mirrors promote-place /
 * promote-social / promote-claim: the machine proposes, a human publishes, the
 * approval flag is stripped in transit, and the WHOLE snapshot is re-validated
 * before it is written — so no invariant can slip in through a single row.
 *
 * `--retract` exists because a published judgement about a named person must be
 * removable without hand-editing the file the guard hook protects. Retraction is
 * a weakening action: it only ever removes a claim.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  validateAreaFitSnapshot,
  type AreaFitRow,
  type AreaFitSnapshot,
  type OfficialLike,
} from '../src/scraper/area-fit'

const QUEUE = resolve('editorial/area-fit-queue.json')
const OUT = resolve('public/data/area-fit.json')
const OFFICIALS = resolve('public/data/officials.json')
const REPORTS = resolve('public/data/journalist-reports.json')
const PROMISES = resolve('public/data/promises.json')

const MANDATE = '2023-2027'
const NOTE =
  'Qué formación y trayectoria declara públicamente quien dirige cada área. ' +
  'No es una calificación: la ley no exige titulación alguna para ser concejal ' +
  '(a diferencia de la secretaría, la intervención y la tesorería municipales, ' +
  'que exigen oposición estatal). «No consta» significa que la fuente publicada ' +
  'no lo recoge, no que la persona carezca de ello.'
const METHOD =
  'Un modelo compara, área por área, lo que el CV publicado declara con la materia ' +
  'del área, citando por índice sobre esa misma lista; un curador revisa y firma ' +
  'cada fila antes de publicarse. Nada se publica automáticamente.'

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1] ?? null) : null
}

function loadOfficials(): OfficialLike[] {
  return JSON.parse(readFileSync(OFFICIALS, 'utf8')).officials
}

/** reportId → the source ids that report actually carries. */
function loadReportSources(): Record<string, Set<string>> {
  const raw = JSON.parse(readFileSync(REPORTS, 'utf8'))
  const items = raw.items || raw.reports || []
  const out: Record<string, Set<string>> = {}
  for (const r of items) {
    out[r.id] = new Set((r.sources || []).map((s: { id: string }) => s.id))
  }
  return out
}

function loadPublished(): AreaFitSnapshot {
  if (!existsSync(OUT)) {
    return {
      generatedAt: new Date().toISOString(),
      mandate: MANDATE,
      note: NOTE,
      method: METHOD,
      rows: [],
    }
  }
  return JSON.parse(readFileSync(OUT, 'utf8'))
}

function loadQueue(): AreaFitRow[] {
  if (!existsSync(QUEUE)) return []
  return JSON.parse(readFileSync(QUEUE, 'utf8')).rows || []
}

function frozenUntil(): string | null {
  if (!existsSync(PROMISES)) return null
  try {
    const f = JSON.parse(readFileSync(PROMISES, 'utf8')).frozenUntil
    if (typeof f !== 'string') return null
    return new Date(f) > new Date() ? f : null
  } catch {
    return null
  }
}

function describe(r: AreaFitRow): string {
  const mark = (v: string) =>
    v === 'relacionada' ? 'relacionada' : v === 'no-consta' ? 'no consta' : 'sin relación declarada'
  return (
    `${r.officialSlug}  ·  ${r.portfolio}\n` +
    `      formación   ${mark(r.formacion.value)}` +
    `${r.formacion.evidence.map((e) => `\n                    ↳ ${e.label} [${e.sourceIds.join(', ')}]`).join('')}\n` +
    `${r.formacion.reason ? `                    « ${r.formacion.reason} »\n` : ''}` +
    `      experiencia ${mark(r.experiencia.value)}` +
    `${r.experiencia.evidence.map((e) => `\n                    ↳ ${e.label} [${e.sourceIds.join(', ')}]`).join('')}\n` +
    `${r.experiencia.reason ? `                    « ${r.experiencia.reason} »\n` : ''}`
  )
}

function write(snap: AreaFitSnapshot) {
  const officials = loadOfficials()
  const reportSources = loadReportSources()
  // Re-validate the WHOLE snapshot, never just the touched row.
  validateAreaFitSnapshot(snap, { officials, reportSources })
  snap.rows.sort((a, b) =>
    a.officialSlug === b.officialSlug
      ? a.portfolio.localeCompare(b.portfolio)
      : a.officialSlug.localeCompare(b.officialSlug),
  )
  writeFileSync(OUT, JSON.stringify(snap, null, 2) + '\n')
}

function main() {
  const queue = loadQueue()

  if (process.argv.includes('--list')) {
    const published = new Set(loadPublished().rows.map((r) => `${r.officialSlug}::${r.portfolio}`))
    console.log(`${queue.length} fila(s) en cola:\n`)
    for (const r of queue) {
      const mark = published.has(`${r.officialSlug}::${r.portfolio}`)
        ? '✓ publicada'
        : '· pendiente'
      console.log(`${mark}  ${describe(r)}`)
    }
    return
  }

  const freeze = frozenUntil()
  if (freeze) {
    console.error(`congelación LOREG activa hasta ${freeze} — no se promociona nada`)
    process.exit(1)
  }

  const slug = arg('official')
  const area = arg('area')
  if (!slug || !area) {
    console.error(
      'uso: npm run promote-area-fit -- --official <slug> --area "<área>" --curator "<nombre>"\n' +
        '     npm run promote-area-fit -- --official <slug> --area "<área>" --reject\n' +
        '     npm run promote-area-fit -- --official <slug> --area "<área>" --retract --curator "<nombre>"\n' +
        '     npm run promote-area-fit -- --list',
    )
    process.exit(1)
  }

  const snap = loadPublished()

  if (process.argv.includes('--retract')) {
    const before = snap.rows.length
    snap.rows = snap.rows.filter((r) => !(r.officialSlug === slug && r.portfolio === area))
    if (snap.rows.length === before) {
      console.error(`no hay fila publicada para ${slug} · ${area}`)
      process.exit(1)
    }
    snap.generatedAt = new Date().toISOString()
    write(snap)
    console.log(`↩ retirada  ${slug} · ${area}`)
    return
  }

  if (process.argv.includes('--reject')) {
    // Rejection is a note to the curator, not a mutation: the queue is
    // regenerated by the suggester, and the published file simply never gains
    // the row. Nothing to write.
    console.log(`✗ rechazada (no se publica)  ${slug} · ${area}`)
    return
  }

  const curator = arg('curator')
  if (!curator) {
    console.error('--curator es obligatorio: esto nombra a una persona, así que lleva firma')
    process.exit(1)
  }

  const draft = queue.find((r) => r.officialSlug === slug && r.portfolio === area)
  if (!draft) {
    console.error(`no hay borrador en cola para ${slug} · ${area}`)
    process.exit(1)
  }

  // Strip the approval flag on the way through — the published schema rejects it.
  const { requiresHumanApproval: _drop, ...rest } = draft
  const note = arg('note')
  const row: AreaFitRow = {
    ...rest,
    curatedBy: curator,
    curatedAt: new Date().toISOString().slice(0, 10),
    ...(note ? { curatorNotes: note } : {}),
  }

  snap.rows = snap.rows.filter((r) => !(r.officialSlug === slug && r.portfolio === area))
  snap.rows.push(row)
  snap.generatedAt = new Date().toISOString()
  snap.mandate = snap.mandate || MANDATE
  snap.note = NOTE
  snap.method = METHOD
  write(snap)

  console.log(`✓ publicada  ${describe(row)}      firma: ${curator}`)
}

main()

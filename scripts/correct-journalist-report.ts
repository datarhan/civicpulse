/**
 * Curator CLI — apply an IFCN-style correction to a published journalist
 * report. Appends to `report.corrections[]` and replaces the targeted
 * field on the report in-place.
 *
 *   npm run correct-journalist-report -- <reportId> \
 *       --field <fieldPath> \
 *       --new "<text>" \
 *       --reason "<≥20 chars curator explanation>" \
 *       [--editor "<name>"]
 *
 * `fieldPath` accepts these targets today (kept narrow on purpose):
 *   · narrative.<heading>.bodyMarkdown   — replace the body of the
 *     narrative section whose heading matches.
 *   · narrative.<heading>.heading        — rename the heading.
 *   · quote.<index>.attributedTo         — change the attribution of a
 *     quote card (0-indexed).
 *   · portrait.portfolios[<index>]       — rename one área chip on the
 *     portrait beside the councillor's photograph (0-indexed).
 *   · warnings[<index>]                  — reword one of the curator-signed
 *     caveats of the biography (0-indexed). `area-fit.json` mirrors these BY
 *     INDEX onto /cargos and its validator pins the verbatim, so retract the
 *     mirrored aviso first (`promote-area-fit --aviso … --retract`), correct
 *     here, then re-sign it. Same three fences as the portrait: index in
 *     range, no blank, no copy of a sibling warning.
 *   · career-political[<index>].endYear  — close (or re-date the close of)
 *     one mandate in the biography's political career (0-indexed). Exists
 *     because a councillor who leaves mid-term stays «En el cargo · desde
 *     2023» on her page until somebody closes the row, and a full re-run is
 *     disproportionate for one date. Fenced like the portrait — exactly one
 *     career-political section, index in range — plus what a year needs: a
 *     four-digit YYYY, not before that row's `startYear`, not the value the
 *     row already holds (a no-op correction is a mistake, not a record), and
 *     never `null` or blank — re-opening a closed mandate is a re-run. The
 *     ledger's `original` is `'null'` for an open row, the previous year for
 *     a closed one, so the reader sees `null → 2025`.
 *   · sources.<id>.excerpt               — reword the excerpt of one of OUR OWN
 *     measurements (`kind: 'local-snapshot'`, e.g. «public/data/tenders.json ·
 *     comprobación nominal…»). Exists because four biographies cited «804
 *     contratos adjudicados examinados» from a corpus of 804 expedientes,
 *     adjudicados o no (28-10-2026), and correcting the narrative alone left
 *     the citation saying the opposite. An external excerpt is the document's
 *     own words and is refused: `repoint-source-url` moves it, nothing rewrites
 *     it. ≤500 characters, no blank, no no-op.
 *   · timeline[<index>].label            — reword one dated event (0-indexed).
 *     Exists because a 2023 row still said a councillor «percibe» a salary the
 *     pleno had since raised (2026-10-18), and one tense was a full re-run.
 *     The label only: the date and sources make the row an event. Exactly one
 *     timeline section, index in range, no blank, no no-op.
 *
 * Two more ways in, each its own mode (mutually exclusive with `--field`):
 *
 *   npm run correct-journalist-report -- <reportId> \
 *       --add-source <fuente.json> --section "<narrative heading>" \
 *       --reason "<≥20 chars>" [--editor "<name>"]
 *
 *   Adds a citation and links it to one narrative section. A correction that
 *   puts a new figure in signed prose needs a document that carries it, and the
 *   only other way to add one was a full re-run (Rafael Gómez, 28-10-2026: the
 *   «dos grandes contratos» were not the largest, and the largest are in
 *   PLACSP pages no section cited). The JSON carries kind, title, excerpt,
 *   trust and url (or localPath for a local-snapshot); `retrievedAt` is stamped
 *   here and `id` is the next free `src-NNN`. An excerpt is required —a
 *   citation without the words that support the sentence supports nothing—,
 *   and a URL the report already cites is refused: link that source instead.
 *   The ledger row is `sources.<id>`, from '' to «<title> · <url>».
 *
 *   npm run correct-journalist-report -- <reportId> \
 *       --amend-reason <i> --new "<motivo nuevo>" \
 *       --reason "<por qué se enmienda, ≥20>" --editor "<Nombre Apellido>"
 *
 *   Replaces the MOTIVO of `corrections[<i>]` and leaves the amendment in that
 *   row, exactly as `correct-pleno-finding --amend-reason` does —same function
 *   (`enmendarMotivoDeFila`), same validator, same rules: the previous reason
 *   only as a digest, signed by a PERSON, dated, no new row. Exists because two
 *   biographies published «se publicó en el BOP once días después del decreto
 *   original» as the reason of a correction, and the BOP published it on the
 *   23rd day; the eleven days are between the two decrees.
 *
 * Re-validates the whole reports snapshot before writing — which, for a
 * warning, includes the judicial-token gate: a corrected caveat that names a
 * court would demand `legalSensitivity: 'high'` and the write would refuse.
 *
 * HOW AN ARRAY ELEMENT FITS A string→string LEDGER. `corrections[]` is flat by
 * design: the reader is shown `<field> · <original> → <corrected>` and nothing
 * else (`CorrectionLog` in src/pages/AgenteReporte.jsx). Serialising the whole
 * `portfolios` array into `original` would bury the one word that changed among
 * six that did not, so the address goes in `field` and the element alone goes in
 * `original`/`corrected`. That keeps the reader-facing line legible and the
 * record precise about what was republished.
 *
 * The index is the part that can misattribute, so it is fenced three ways: the
 * report must carry exactly one portrait, the index is bounds-checked against
 * that portrait as it stands now, and a value already present elsewhere in the
 * list is refused — two identical chips would also collide on the `key={p}`
 * HeroBand renders them with. What this CLI deliberately does NOT do is verify
 * the new value against `officials.json`: a portrait is a point-in-time snapshot
 * of the register, and a correction to it must stay able to restore what the
 * register said then. `check:relations`' `portrait-officials` is where the
 * roster join lives.
 *
 * This is NOT a way to add or drop an área. Renaming is a correction — the same
 * claim, spelled right. Changing which competences a named councillor holds is a
 * different claim, and it belongs in a re-run reviewed by a curator.
 *
 * `--editor` acepta la cuenta de rol, que es la de por defecto, y rechaza, antes
 * de leer nada, el hueco de una orden copiada sin rellenar —el `<name>` de
 * arriba— (`rechazoDeMarcador`, src/scraper/firma-de-persona.ts).
 */
import { existsSync, readFileSync } from 'node:fs'
import { rewriteJsonIfPresent, writeSnapshot } from './lib/snapshot-io'
import { resolve } from 'node:path'
import { rechazoDeFirma, rechazoDeMarcador } from '../src/scraper/firma-de-persona'
import { enmendarMotivoDeFila } from '../src/scraper/pleno-finding'
import {
  ALLOWED_CITATION_KINDS,
  ALLOWED_CITATION_TRUST,
  validateReportsSnapshot,
  type JournalistReport,
  type JournalistReportCorrection,
  type JournalistReportsSnapshot,
  type ReportSection,
  type SourceCitation,
} from '../src/scraper/journalist'

const REPORTS = resolve('public/data/journalist-reports.json')
const CHUNK_DIR = resolve('public/data/journalist-reports')

function usage(): never {
  process.stderr.write(
    'Usage:\n' +
      '  npm run correct-journalist-report -- <reportId> --field <fieldPath> \\\n' +
      '      --new "<replacement>" --reason "<≥20 chars>" [--editor "<name>"]\n' +
      '\n' +
      'fieldPath:\n' +
      '  · narrative.<heading>.bodyMarkdown\n' +
      '  · narrative.<heading>.heading\n' +
      '  · quote.<index>.attributedTo\n' +
      '  · portrait.portfolios[<index>]\n' +
      '  · warnings[<index>]\n' +
      '  · career-political[<index>].endYear   (--new YYYY; never null)\n' +
      '  · timeline[<index>].label             (the wording only; never the date)\n' +
      '  · sources.<id>.excerpt                (local-snapshot sources only)\n' +
      '\n' +
      '  npm run correct-journalist-report -- <reportId> --add-source <fuente.json> \\\n' +
      '      --section "<heading>" --reason "<≥20 chars>" [--editor "<name>"]\n' +
      '  npm run correct-journalist-report -- <reportId> --amend-reason <i> \\\n' +
      '      --new "<motivo nuevo>" --reason "<≥20 chars>" --editor "<Nombre Apellido>"\n',
  )
  process.exit(2)
}

interface Opts {
  reportId: string
  field: string
  newValue: string
  reason: string
  editor: string
  /** `--add-source`: the JSON file with the citation to add. */
  addSource: string
  /** `--section`: the narrative heading the added citation is linked to. */
  section: string
  /** `--amend-reason`: the index of the ledger row whose reason is replaced. */
  amendReason: string
}

function parseArgs(argv: string[]): Opts {
  const o: Opts = {
    reportId: '',
    field: '',
    newValue: '',
    reason: '',
    editor: 'civicpulse-curator',
    addSource: '',
    section: '',
    amendReason: '',
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--field') o.field = argv[++i]
    else if (a === '--new') o.newValue = argv[++i]
    else if (a === '--reason') o.reason = argv[++i]
    else if (a === '--editor') o.editor = argv[++i]
    else if (a === '--add-source') o.addSource = argv[++i]
    else if (a === '--section') o.section = argv[++i]
    else if (a === '--amend-reason') o.amendReason = argv[++i]
    else if (a === '-h' || a === '--help') usage()
    else if (a.startsWith('--')) {
      process.stderr.write(`[correct-journalist-report] unknown flag ${a}\n`)
      process.exit(2)
    } else if (!o.reportId) o.reportId = a
  }
  const modos = [o.field, o.addSource, o.amendReason].filter(Boolean)
  if (modos.length > 1) {
    process.stderr.write(
      '[correct-journalist-report] --field, --add-source and --amend-reason are mutually exclusive\n',
    )
    process.exit(2)
  }
  if (!o.reportId || modos.length === 0 || !o.reason) usage()
  if ((o.field || o.amendReason) && !o.newValue) usage()
  if (o.addSource && !o.section) {
    process.stderr.write('[correct-journalist-report] --add-source needs --section "<heading>"\n')
    process.exit(2)
  }
  if (o.amendReason && !/^\d+$/.test(o.amendReason)) {
    process.stderr.write(
      '[correct-journalist-report] --amend-reason takes the index of a ledger row (0, 1, …)\n',
    )
    process.exit(2)
  }
  if (o.reason.trim().length < 20) {
    process.stderr.write('[correct-journalist-report] --reason must be ≥20 chars\n')
    process.exit(2)
  }
  // Antes de leer nada: el hueco no firma una corrección publicada. Sólo el
  // hueco; la cuenta de rol, sí (`rechazoDeMarcador`).
  const hueco = rechazoDeMarcador(o.editor)
  if (hueco) {
    process.stderr.write(`[correct-journalist-report] --editor: ${hueco}\n`)
    process.exit(2)
  }
  // Una enmienda de motivo la firma una persona, con su nombre: la cuenta de rol
  // por defecto no basta (lo exige también el validador).
  if (o.amendReason) {
    const rechazo = rechazoDeFirma(o.editor)
    if (rechazo) {
      process.stderr.write(`[correct-journalist-report] --amend-reason --editor: ${rechazo}\n`)
      process.exit(2)
    }
  }
  return o
}

const PORTFOLIO_PATH = /^portrait\.portfolios\[(\d+)\]$/
const WARNING_PATH = /^warnings\[(\d+)\]$/
const CAREER_END_PATH = /^career-political\[(\d+)\]\.endYear$/
const TIMELINE_LABEL_PATH = /^timeline\[(\d+)\]\.label$/
const SOURCE_EXCERPT_PATH = /^sources\.([A-Za-z0-9_-]+)\.excerpt$/
const EXCERPT_MAX = 500
const YEAR = /^\d{4}$/

export function applyCorrection(
  report: JournalistReport,
  fieldPath: string,
  newValue: string,
): {
  sections: ReportSection[]
  warnings?: string[]
  sources?: SourceCitation[]
  original: string
} {
  const sections = JSON.parse(JSON.stringify(report.sections)) as ReportSection[]
  if (fieldPath.startsWith('sources')) {
    const m = SOURCE_EXCERPT_PATH.exec(fieldPath)
    if (!m) throw new Error(`sources must be addressed as sources.<id>.excerpt, got ${fieldPath}`)
    const sources = JSON.parse(JSON.stringify(report.sources)) as SourceCitation[]
    const source = sources.find((x) => x.id === m[1])
    if (!source) throw new Error(`no source ${m[1]} in this report`)
    // Un extracto externo son las palabras del documento; sólo el de una medición
    // nuestra se puede redactar de nuevo.
    if (source.kind !== 'local-snapshot')
      throw new Error(
        `sources.${m[1]} is ${source.kind}: only a local-snapshot excerpt (our own ` +
          'measurement) can be reworded — an external excerpt is the document itself',
      )
    const trimmed = newValue.trim()
    if (!trimmed) throw new Error('an excerpt cannot be blank — it is what the citation shows')
    if (trimmed.length > EXCERPT_MAX)
      throw new Error(`an excerpt must be ≤${EXCERPT_MAX} characters (got ${trimmed.length})`)
    const original = source.excerpt ?? ''
    if (trimmed === original.trim())
      throw new Error(
        `sources.${m[1]}.excerpt already reads that — a no-op correction is a mistake, not a record`,
      )
    source.excerpt = trimmed
    return { sections, sources, original }
  }
  if (fieldPath.startsWith('career-political')) {
    const m = CAREER_END_PATH.exec(fieldPath)
    if (!m)
      throw new Error(
        `career-political must be addressed as career-political[<index>].endYear, got ${fieldPath}`,
      )
    const targetIndex = Number(m[1])
    const careers = sections.filter((s) => s.kind === 'career-political') as Array<
      Extract<ReportSection, { kind: 'career-political' }>
    >
    // Zero would silently close nothing; more than one makes "the mandate at
    // index N" ambiguous, and guessing would end the wrong person's term.
    if (careers.length === 0) throw new Error('no career-political section in this report')
    if (careers.length > 1)
      throw new Error(
        `expected exactly 1 career-political section, found ${careers.length} — ambiguous`,
      )
    const items = careers[0].payload.items
    if (targetIndex >= items.length)
      throw new Error(`career-political index ${targetIndex} out of range (${items.length} items)`)
    const item = items[targetIndex]
    const trimmed = newValue.trim()
    if (!trimmed || trimmed.toLowerCase() === 'null')
      throw new Error(
        'endYear cannot be null or blank — re-opening a mandate is a re-run, not a correction',
      )
    if (!YEAR.test(trimmed))
      throw new Error(`endYear must be a four-digit year (YYYY), got "${trimmed}"`)
    const year = Number(trimmed)
    if (year < item.startYear)
      throw new Error(
        `endYear ${year} is before startYear ${item.startYear} of career-political[${targetIndex}]`,
      )
    if (item.endYear === year)
      throw new Error(
        `career-political[${targetIndex}].endYear is already ${year} — a no-op correction is a mistake, not a record`,
      )
    // The live row stores an open mandate as a MISSING key, not `null`;
    // `String(undefined)` would put "undefined" in the Bitácora.
    const original = item.endYear == null ? 'null' : String(item.endYear)
    item.endYear = year
    return { sections, original }
  }
  if (fieldPath.startsWith('timeline')) {
    const m = TIMELINE_LABEL_PATH.exec(fieldPath)
    if (!m)
      throw new Error(`timeline must be addressed as timeline[<index>].label, got ${fieldPath}`)
    const targetIndex = Number(m[1])
    const timelines = sections.filter((s) => s.kind === 'timeline') as Array<
      Extract<ReportSection, { kind: 'timeline' }>
    >
    // The date and the sources are what make a row an event; only its wording
    // is correctable here. Zero sections would correct nothing, several make
    // «the event at index N» ambiguous.
    if (timelines.length !== 1)
      throw new Error(`expected exactly 1 timeline section, found ${timelines.length}`)
    const events = timelines[0].payload.events
    if (targetIndex >= events.length)
      throw new Error(`timeline index ${targetIndex} out of range (${events.length} events)`)
    const trimmed = newValue.trim()
    if (!trimmed)
      throw new Error('a timeline label cannot be blank — dropping an event is a re-run')
    const original = events[targetIndex].label
    if (trimmed === original)
      throw new Error(
        `timeline[${targetIndex}].label already reads that — a no-op correction is a mistake, not a record`,
      )
    events[targetIndex].label = trimmed
    return { sections, original }
  }
  if (fieldPath.startsWith('warnings')) {
    const m = WARNING_PATH.exec(fieldPath)
    if (!m) throw new Error(`warnings must be addressed as warnings[<index>], got ${fieldPath}`)
    const targetIndex = Number(m[1])
    const warnings = [...(report.warnings ?? [])]
    if (targetIndex >= warnings.length)
      throw new Error(`warning index ${targetIndex} out of range (${warnings.length} warnings)`)
    const trimmed = newValue.trim()
    if (!trimmed)
      throw new Error('a warning cannot be blank — dropping a caveat is a re-run, not a correction')
    const clash = warnings.findIndex((w, i) => i !== targetIndex && w === trimmed)
    if (clash >= 0)
      throw new Error(
        `"${trimmed.slice(0, 60)}…" is already warnings[${clash}] — two identical caveats`,
      )
    const original = warnings[targetIndex]
    warnings[targetIndex] = trimmed
    return { sections, warnings, original }
  }
  if (fieldPath.startsWith('portrait.')) {
    const m = PORTFOLIO_PATH.exec(fieldPath)
    if (!m) throw new Error(`portrait subfield must be portfolios[<index>], got ${fieldPath}`)
    const targetIndex = Number(m[1])
    const portraits = sections.filter((s) => s.kind === 'portrait') as Array<
      Extract<ReportSection, { kind: 'portrait' }>
    >
    // Zero would silently correct nothing; more than one makes "the portrait"
    // ambiguous, and guessing which one would rename an área under a photograph
    // of somebody else.
    if (portraits.length !== 1)
      throw new Error(`expected exactly 1 portrait section, found ${portraits.length}`)
    const list = portraits[0].payload.portfolios
    if (targetIndex >= list.length)
      throw new Error(`portfolio index ${targetIndex} out of range (${list.length} áreas)`)
    const trimmed = newValue.trim()
    if (!trimmed)
      throw new Error('a portfolio cannot be blank — dropping an área is a re-run, not a rename')
    const clash = list.findIndex((p, i) => i !== targetIndex && p === trimmed)
    if (clash >= 0)
      throw new Error(
        `"${trimmed}" is already portfolios[${clash}] — renaming onto it would merge two áreas`,
      )
    const original = list[targetIndex]
    list[targetIndex] = trimmed
    return { sections, original }
  }
  if (fieldPath.startsWith('narrative.')) {
    const rest = fieldPath.slice('narrative.'.length)
    const lastDot = rest.lastIndexOf('.')
    if (lastDot < 0) throw new Error(`malformed fieldPath ${fieldPath}`)
    const heading = rest.slice(0, lastDot)
    const sub = rest.slice(lastDot + 1)
    if (sub !== 'bodyMarkdown' && sub !== 'heading') {
      throw new Error(`narrative subfield must be bodyMarkdown|heading, got ${sub}`)
    }
    const idx = sections.findIndex(
      (s) =>
        s.kind === 'narrative' &&
        (s as Extract<ReportSection, { kind: 'narrative' }>).payload.heading === heading,
    )
    if (idx < 0) throw new Error(`no narrative section with heading "${heading}"`)
    const nar = sections[idx] as Extract<ReportSection, { kind: 'narrative' }>
    const original = sub === 'bodyMarkdown' ? nar.payload.bodyMarkdown : nar.payload.heading
    if (sub === 'bodyMarkdown') nar.payload.bodyMarkdown = newValue
    else nar.payload.heading = newValue
    return { sections, original }
  }
  if (fieldPath.startsWith('quote.')) {
    const rest = fieldPath.slice('quote.'.length)
    const lastDot = rest.lastIndexOf('.')
    if (lastDot < 0) throw new Error(`malformed fieldPath ${fieldPath}`)
    const idxStr = rest.slice(0, lastDot)
    const sub = rest.slice(lastDot + 1)
    if (sub !== 'attributedTo') throw new Error(`quote subfield must be attributedTo, got ${sub}`)
    const targetIndex = Number(idxStr)
    if (!Number.isInteger(targetIndex) || targetIndex < 0)
      throw new Error(`quote index must be integer, got ${idxStr}`)
    const quoteSections = sections.filter((s) => s.kind === 'quote-card') as Array<
      Extract<ReportSection, { kind: 'quote-card' }>
    >
    if (targetIndex >= quoteSections.length)
      throw new Error(`quote index ${targetIndex} out of range (${quoteSections.length} quotes)`)
    const original = quoteSections[targetIndex].payload.attributedTo
    quoteSections[targetIndex].payload.attributedTo = newValue
    return { sections, original }
  }
  throw new Error(`unsupported fieldPath ${fieldPath} — see --help`)
}

/**
 * Añade una cita al informe y la enlaza a UNA sección narrativa. Las vallas, antes
 * de tocar nada: la forma de la cita (las del validador, más un extracto
 * obligatorio), una URL que el informe ya no cite y una sola sección con ese
 * encabezado. Devuelve el informe nuevo (secciones y fuentes) y el id asignado.
 */
export function applyAddSource(
  report: JournalistReport,
  raw: unknown,
  heading: string,
  retrievedAt: string,
): { sections: ReportSection[]; sources: SourceCitation[]; id: string; corrected: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    throw new Error('the source must be a JSON object')
  const o = raw as Record<string, unknown>
  const ALLOWED_KEYS = [
    'id',
    'kind',
    'title',
    'url',
    'localPath',
    'publisher',
    'publishedAt',
    'excerpt',
    'trust',
    'selfDeclared',
  ]
  const extra = Object.keys(o).filter((k) => !ALLOWED_KEYS.includes(k))
  if (extra.length) throw new Error(`unknown keys in the source: ${extra.join(', ')}`)
  if (!(ALLOWED_CITATION_KINDS as readonly string[]).includes(String(o.kind)))
    throw new Error(`kind must be one of ${ALLOWED_CITATION_KINDS.join(', ')}`)
  if (!(ALLOWED_CITATION_TRUST as readonly string[]).includes(String(o.trust)))
    throw new Error(`trust must be one of ${ALLOWED_CITATION_TRUST.join(', ')}`)
  const excerpt = typeof o.excerpt === 'string' ? o.excerpt.trim() : ''
  if (!excerpt)
    throw new Error(
      'an added source needs its excerpt: a citation without the words supports nothing',
    )
  if (excerpt.length > EXCERPT_MAX)
    throw new Error(`an excerpt must be ≤${EXCERPT_MAX} characters (got ${excerpt.length})`)
  const url = typeof o.url === 'string' ? o.url : undefined
  if (url && report.sources.some((s) => s.url === url))
    throw new Error(`the report already cites ${url}: link that source instead of adding a copy`)

  const usados = new Set(report.sources.map((s) => s.id))
  let id = typeof o.id === 'string' ? o.id : ''
  if (id && usados.has(id)) throw new Error(`source id ${id} is already taken`)
  if (!id) {
    const max = Math.max(
      0,
      ...report.sources.map((s) => Number(/^src-(\d+)$/.exec(s.id)?.[1] ?? 0)),
    )
    id = `src-${String(max + 1).padStart(3, '0')}`
  }

  const sections = JSON.parse(JSON.stringify(report.sections)) as ReportSection[]
  const destino = sections.filter(
    (s) =>
      s.kind === 'narrative' &&
      (s as Extract<ReportSection, { kind: 'narrative' }>).payload.heading === heading,
  ) as Array<Extract<ReportSection, { kind: 'narrative' }>>
  if (destino.length !== 1)
    throw new Error(`expected exactly 1 narrative section «${heading}», found ${destino.length}`)
  const payload = destino[0].payload as { sourceIds?: string[] }
  payload.sourceIds = [...(payload.sourceIds ?? []), id]

  const source = {
    ...(o as Partial<SourceCitation>),
    id,
    excerpt,
    retrievedAt,
  } as SourceCitation
  const sources = [...report.sources, source]
  return { sections, sources, id, corrected: url ? `${source.title} · ${url}` : source.title }
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2))
  if (!existsSync(REPORTS)) {
    process.stderr.write(`[correct-journalist-report] ${REPORTS} missing\n`)
    process.exit(1)
  }
  const snap = validateReportsSnapshot(readFileSync(REPORTS, 'utf8'))
  const idx = snap.items.findIndex((r) => r.id === opts.reportId)
  if (idx < 0) {
    process.stderr.write(`[correct-journalist-report] report ${opts.reportId} not found\n`)
    process.exit(1)
  }
  const report = snap.items[idx]
  const hoy = new Date().toISOString().slice(0, 10)
  let next: JournalistReport
  let campo = opts.field
  try {
    if (opts.amendReason) {
      // No añade fila: la enmienda queda en la fila enmendada (ENMIENDA DEL MOTIVO).
      const i = Number(opts.amendReason)
      const corrections = JSON.parse(
        JSON.stringify(report.corrections),
      ) as JournalistReportCorrection[]
      if (!corrections[i])
        throw new Error(
          `corrections[${i}] does not exist: ${report.id} has ${corrections.length} ledger row(s)`,
        )
      const previous = enmendarMotivoDeFila(corrections[i], opts.newValue, {
        reason: opts.reason,
        editor: opts.editor,
        amendedAt: hoy,
      })
      campo = `corrections[${i}].reason (sustituye ${previous})`
      next = { ...report, corrections }
    } else if (opts.addSource) {
      const raw = JSON.parse(readFileSync(resolve(opts.addSource), 'utf8')) as unknown
      const added = applyAddSource(report, raw, opts.section, new Date().toISOString())
      campo = `sources.${added.id}`
      next = {
        ...report,
        sections: added.sections,
        sources: added.sources,
        corrections: [
          ...report.corrections,
          {
            field: campo,
            original: '',
            corrected: added.corrected,
            reason: opts.reason.trim(),
            editor: opts.editor,
            correctedAt: hoy,
          },
        ],
      }
    } else {
      const updated = applyCorrection(report, opts.field, opts.newValue)
      next = {
        ...report,
        sections: updated.sections,
        warnings: updated.warnings ?? report.warnings,
        sources: updated.sources ?? report.sources,
        corrections: [
          ...report.corrections,
          {
            field: opts.field,
            original: updated.original,
            corrected: opts.newValue,
            reason: opts.reason.trim(),
            editor: opts.editor,
            correctedAt: hoy,
          },
        ],
      }
    }
  } catch (err) {
    process.stderr.write(`[correct-journalist-report] ${(err as Error).message}\n`)
    process.exit(1)
  }
  const items = [...snap.items]
  items[idx] = next
  const out: JournalistReportsSnapshot = { ...snap, generatedAt: new Date().toISOString(), items }
  writeSnapshot(REPORTS, out, validateReportsSnapshot)
  // Refresh per-id chunk if present.
  rewriteJsonIfPresent(resolve(CHUNK_DIR, `${next.assignmentId}.json`), next)
  process.stdout.write(
    `[correct-journalist-report] applied correction to ${report.id} · field=${campo} · editor=${opts.editor}\n`,
  )
}

// Guarded so `applyCorrection` can be unit-tested without the CLI running
// against public/data on import (same shape as check-finding-quotes.ts).
if (import.meta.url === `file://${process.argv[1]}`) main()

/**
 * Encaje declarado — what formación and experiencia the holder of a delegated
 * área declares, per (official × portfolio), with a citation for every word.
 *
 * This is the most libel-material derived surface in the repo: it attaches a
 * judgement to a NAMED living person. Three decisions carry that weight.
 *
 * 1. THERE IS NO SCORE. The original ask was an HR-style "ideal profile" per
 *    cargo and a fit percentage on each card. A concejal is not a hire — Spanish
 *    law requires no titulación for the office, voters choose — so a percentage
 *    grades an elected official against a rubric a model invented and no statute
 *    contains. The house pattern (press-analytics computes a trust score and
 *    never renders it; AreaActivity refuses to put bloc-level content under a
 *    person's photograph) is: publish the components, refuse the sum. Nothing
 *    here returns a number, a ranking, or a per-person aggregate.
 *
 * 2. THREE VALUES, NOT TWO. `no-consta` (nothing on record to judge) and
 *    `sin-relacion-declarada` (a CV IS on record and none of it relates) are
 *    different facts about a person, and collapsing them is DATA_INTEGRITY
 *    failure mode 3 — a sentinel published as a value. Pla declares a Grado
 *    Superior de Peluquería; that is on record and unrelated to Fiestas.
 *    Navarro declares nothing at all. Printing the same chip for both would
 *    assert of Navarro something no source supports.
 *
 * 3. CITE BY INDEX, NEVER BY ID. The model receives numbered items and returns
 *    indices; this module maps indices back to sourceIds. The model therefore
 *    cannot emit a source id at all, so it cannot invent one. The promise miner
 *    learned this the hard way (172fd04): it accepted model-authored ids, the
 *    model invented them for third-party news, and forcing them would have
 *    mis-attached evidence to the wrong person. An index outside the pool is a
 *    hard error here — never repaired, never clamped.
 *
 * The model never sees a case it cannot judge: an absent section resolves to
 * `no-consta` deterministically, before any call. And `cargoPublicoPrevio` needs
 * no model at all — it falls out of the biography's `career-political` section.
 *
 * Pure: no fs, no network, no clock. The CLI at scripts/suggest-area-fit.ts owns
 * the model call; scripts/promote-area-fit.ts owns the write.
 */

/**
 * Exported so tests import it instead of restating it. Six suites in this repo
 * hand-copied an enum and stayed green while production matched nothing; the
 * costliest coerced 298 contracts to `unknown` and lost €53.5M from the site.
 */
export const FIT_VALUES = ['relacionada', 'sin-relacion-declarada', 'no-consta'] as const
export type FitValue = (typeof FIT_VALUES)[number]

/**
 * What an assessment's evidence RESTS ON — a separate question from whether it
 * relates to the área, and deliberately a separate value.
 *
 * Measured 2026-08-04: all 109 evidence references behind the 40 published rows
 * were self-declared, so this axis reads `autodeclarada` everywhere today. That
 * is the finding, not a bug — and it is why the UI states it once instead of
 * printing an identical badge 80 times.
 *
 * `sin-clasificar` is NOT a synonym for autodeclarada. It means no one has said
 * what backs this, and it must never render as corroboration.
 */
export const RESPALDO_VALUES = [
  'autodeclarada',
  'corroborada',
  'discrepancia-documentada',
  'sin-clasificar',
] as const
export type RespaldoValue = (typeof RESPALDO_VALUES)[number]

/** Minimal shape this module needs from a report's `sources` array. */
export interface SourceLike {
  id: string
  selfDeclared?: boolean
}

/**
 * Ceiling on how much of a published snapshot may be `no-consta`.
 *
 * Paired with the enum per DATA_INTEGRITY §1: an allow-set assertion alone
 * cannot fail when the fallback is itself a member of the set. All 11 officials
 * holding a delegation today have both an `education` and a
 * `career-professional` section, so the true share is ~0. A snapshot that
 * breaches this is reading the wrong field, not discovering mass ignorance.
 */
export const NO_CONSTA_CEILING = 0.1

export const AREA_FIT_PROMPT_VERSION = 'area-fit-v1'

export interface FitEvidenceItem {
  /** Human-readable, verbatim from the biography section. */
  label: string
  sourceIds: string[]
}

export interface FitAssessment {
  value: FitValue
  evidence: FitEvidenceItem[]
  /** The model's stated criterion. Published, so it describes the rule, never the person. */
  reason?: string
  /**
   * What the cited evidence rests on. The second axis — never folded into
   * `value`. Absent when the assessment cites nothing, present and never
   * `sin-clasificar` when it does; see `withRespaldo` and the published
   * validator.
   */
  respaldo?: RespaldoValue
}

/**
 * Derive the respaldo of a set of cited items.
 *
 * Fails closed in both directions a reader could be misled: an id nobody
 * classified, and an id that is not in the map at all, both read
 * `sin-clasificar`. Only an explicit `selfDeclared: false` — someone other than
 * the subject published it — earns `corroborada`.
 *
 * `discrepancia-documentada` is not derivable and is never returned here: two
 * sources disagreeing is a curator's reading of them, not a flag comparison.
 */
export function deriveRespaldo(
  evidence: readonly FitEvidenceItem[],
  sourcesById: Record<string, SourceLike>,
): RespaldoValue {
  const ids = evidence.flatMap((e) => e.sourceIds ?? [])
  if (!ids.length) return 'sin-clasificar'
  const flags = ids.map((id) => sourcesById[id]?.selfDeclared)
  if (flags.some((f) => f === undefined)) return 'sin-clasificar'
  return flags.some((f) => f === false) ? 'corroborada' : 'autodeclarada'
}

/**
 * Stamp the respaldo of an assessment that cites something.
 *
 * An assessment with no evidence is left WITHOUT a respaldo rather than marked
 * `sin-clasificar`: only `relacionada` may carry citations here, so the other
 * two values — 52 of the 80 published assessments on 2026-08-04 — have nothing
 * whose backing could be stated. Stamping them would assert nothing and, because
 * the published validator refuses `sin-clasificar`, would make the entire
 * surface unpublishable. Absent means "there is no citation to describe"; the
 * validator's job is to refuse an assessment that DOES cite something nobody
 * classified.
 */
function withRespaldo(a: FitAssessment, sourcesById: Record<string, SourceLike>): FitAssessment {
  if (!a.evidence.length) return a
  return { ...a, respaldo: deriveRespaldo(a.evidence, sourcesById) }
}

export interface FitTask {
  officialSlug: string
  /** Verbatim from officials.json — what the delegation decree actually says. */
  portfolio: string
  /** null when canonicalizeDepartment does not resolve it; the row stands anyway. */
  departmentSlug: string | null
  reportId: string
  educationItems: FitEvidenceItem[]
  careerItems: FitEvidenceItem[]
  politicalItems: FitEvidenceItem[]
  /**
   * The cited report's own sources, by id — the only place the respaldo axis
   * can be read from. Carried on the task so it is built once, next to the
   * items whose ids it explains, instead of re-loaded by every caller.
   */
  sourcesById: Record<string, SourceLike>
}

export interface AreaFitRow {
  officialSlug: string
  portfolio: string
  departmentSlug: string | null
  reportId: string
  formacion: FitAssessment
  experiencia: FitAssessment
  curatedBy?: string
  curatedAt?: string
  curatorNotes?: string
  /** Drafts only. The published schema REJECTS this field — two independent layers. */
  requiresHumanApproval?: true
}

export interface AreaFitSnapshot {
  generatedAt: string
  mandate: string
  note?: string
  method?: string
  rows: AreaFitRow[]
}

/** Raw, unvalidated assessment as it arrives from the model. */
export interface RawAssessment {
  value: string
  evidenceIndices: number[]
  reason?: string
}

export interface RawFitResponse {
  formacion: RawAssessment
  experiencia: RawAssessment
}

export class AreaFitValidationError extends Error {}

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new AreaFitValidationError(msg)
}

const isFitValue = (v: unknown): v is FitValue =>
  typeof v === 'string' && (FIT_VALUES as readonly string[]).includes(v)

/** Minimal shape this module needs from officials.json. */
export interface OfficialLike {
  slug: string
  name?: string
  party?: string
  role?: string
  portfolios: string[]
}

/**
 * Turn a model answer into evidence, or refuse.
 *
 * `no-consta` is not accepted here: it is a fact about our sources, decided
 * before the model is called, never something the model may claim.
 */
export function resolveAssessment(raw: RawAssessment, pool: FitEvidenceItem[]): FitAssessment {
  must(raw && typeof raw === 'object', 'assessment must be an object')
  must(isFitValue(raw.value), `value must be one of ${FIT_VALUES.join(' | ')}, got ${raw.value}`)
  must(
    raw.value !== 'no-consta',
    'the model may not return no-consta — an absent section is resolved deterministically',
  )

  const indices = Array.isArray(raw.evidenceIndices) ? raw.evidenceIndices : []
  const evidence: FitEvidenceItem[] = []
  for (const i of indices) {
    must(
      Number.isInteger(i) && i >= 0 && i < pool.length,
      `evidence index ${i} is outside the pool of ${pool.length} — refusing to repair it, ` +
        'a drifted index attaches evidence to the wrong claim',
    )
    const item = pool[i]
    must(
      Array.isArray(item.sourceIds) && item.sourceIds.length > 0,
      `pool item ${i} ("${item.label}") carries no sourceIds — it cannot support a published claim`,
    )
    evidence.push({ label: item.label, sourceIds: [...item.sourceIds] })
  }

  must(
    raw.value !== 'relacionada' || evidence.length > 0,
    '"relacionada" requires at least one cited item — an uncited relation is an opinion',
  )

  const reason = typeof raw.reason === 'string' ? raw.reason.trim() : undefined
  return { value: raw.value, evidence, ...(reason ? { reason } : {}) }
}

/*
 * A `cargoPublicoPrevio` chip was built here and removed before it shipped.
 *
 * It read the biography's `career-political` section, which INCLUDES the
 * current mandate — so every sitting councillor scored "has held public
 * office", by definition. A chip whose value is the same for all 40 rows
 * carries no information, and for Eva Lara, whose only political row is the
 * seat she holds now, it asserted a prior office she has never held.
 *
 * Computing it honestly means separating "held office" from "stood and was not
 * elected" — Alfredo Pla's 2019 row is a candidacy at nº 13 with no seat — and
 * the section does not mark that reliably. It is also orthogonal to what this
 * surface claims: whether what someone brings relates to the área they run.
 *
 * So it is gone rather than approximated. Prior office is a real question; it
 * needs its own data, not a keyword guess over this one.
 */

/**
 * Assemble a full row from a task and the model's answer for it.
 *
 * `sourcesById` defaults to the task's own map — one source of truth — and is
 * overridable only so a re-derivation can pass a freshly loaded classification
 * without rebuilding every task.
 */
export function rowFromResponse(
  task: FitTask,
  response: RawFitResponse,
  sourcesById: Record<string, SourceLike> = task.sourcesById,
): AreaFitRow {
  must(response && typeof response === 'object', 'response must be an object')
  // An absent map is an EMPTY one, never a permissive one: every id then reads
  // unclassified and the row cannot publish.
  const sources = sourcesById ?? {}
  return {
    officialSlug: task.officialSlug,
    portfolio: task.portfolio,
    departmentSlug: task.departmentSlug,
    reportId: task.reportId,
    formacion: withRespaldo(
      task.educationItems.length
        ? resolveAssessment(response.formacion, task.educationItems)
        : { value: 'no-consta', evidence: [] },
      sources,
    ),
    experiencia: withRespaldo(
      task.careerItems.length
        ? resolveAssessment(response.experiencia, task.careerItems)
        : { value: 'no-consta', evidence: [] },
      sources,
    ),
  }
}

/**
 * The row for a task no model was ever asked about.
 *
 * Kept separate from `rowFromResponse` so "we never asked" can never be dressed
 * up as "we asked and it said nothing" — the reporting distinction the run
 * manifest exists to preserve.
 */
export function rowWithoutModel(
  task: FitTask,
  sourcesById: Record<string, SourceLike> = task.sourcesById,
): AreaFitRow {
  return {
    officialSlug: task.officialSlug,
    portfolio: task.portfolio,
    departmentSlug: task.departmentSlug,
    reportId: task.reportId,
    // Both cite nothing, so neither gains a respaldo — there is no backing to
    // describe when we hold no source at all.
    formacion: withRespaldo({ value: 'no-consta', evidence: [] }, sourcesById ?? {}),
    experiencia: withRespaldo({ value: 'no-consta', evidence: [] }, sourcesById ?? {}),
  }
}

/** Share of published assessments that are `no-consta`, for the ceiling. */
export function noConstaShare(rows: readonly AreaFitRow[]): number {
  const values = rows.flatMap((r) => [r.formacion?.value, r.experiencia?.value])
  if (!values.length) return 0
  return values.filter((v) => v === 'no-consta').length / values.length
}

/** Does this task need a model call at all? */
export function needsModel(task: FitTask): boolean {
  return task.educationItems.length > 0 || task.careerItems.length > 0
}

// ─────────────────────────────────────────────────────────────────────────────
// Building tasks from the published snapshots
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal shape this module needs from a journalist report. */
export interface ReportLike {
  id: string
  sections: Array<{ kind: string; payload: Record<string, unknown> }>
  /** The citations the sections' sourceIds point at; carries `selfDeclared`. */
  sources?: SourceLike[]
}

function sectionPayload(
  report: ReportLike | undefined,
  kind: string,
): Record<string, unknown> | null {
  const s = report?.sections?.find((x) => x.kind === kind)
  return s ? s.payload : null
}

function itemsFrom(
  payload: Record<string, unknown> | null,
  label: (row: Record<string, unknown>) => string,
): FitEvidenceItem[] {
  const rows = (payload?.items as Array<Record<string, unknown>> | undefined) || []
  return rows
    .map((r) => ({
      label: label(r).trim(),
      sourceIds: Array.isArray(r.sourceIds) ? (r.sourceIds as string[]) : [],
    }))
    .filter((i) => i.label.length > 0)
}

const joinNonEmpty = (parts: Array<unknown>, sep: string) =>
  parts.filter((p) => typeof p === 'string' && p.trim().length > 0).join(sep)

/**
 * One task per (official × raw portfolio string).
 *
 * Raw string, not canonical slug: it is what the alcaldía's delegation decree
 * says, and canonicalizeDepartment has known collisions ("Movilidad y Deportes"
 * → deportes, "Juventud y Servicios Jurídicos" → servicios-generales) plus one
 * portfolio that resolves to null. Judging the canonical slug would silently
 * merge two delegations or drop one.
 *
 * `resolveSlug` is injected so this module stays free of the departments table.
 */
export function buildFitTasks(
  officials: readonly OfficialLike[],
  reports: readonly ReportLike[],
  resolveSlug: (portfolio: string) => string | null = () => null,
): FitTask[] {
  const bySlug = new Map<string, ReportLike>()
  for (const r of reports) {
    const portrait = sectionPayload(r, 'portrait')
    const slug = portrait?.officialSlug
    if (typeof slug === 'string') bySlug.set(slug, r)
  }

  const tasks: FitTask[] = []
  for (const o of officials) {
    if (!Array.isArray(o.portfolios) || o.portfolios.length === 0) continue
    const report = bySlug.get(o.slug)
    const educationItems = itemsFrom(sectionPayload(report, 'education'), (r) =>
      joinNonEmpty([r.degree, r.institution], ' — '),
    )
    const careerItems = itemsFrom(sectionPayload(report, 'career-professional'), (r) =>
      joinNonEmpty([r.role, r.org], ' @ '),
    )
    const politicalItems = itemsFrom(sectionPayload(report, 'career-political'), (r) =>
      joinNonEmpty([r.role, r.org], ' @ '),
    )
    // Only ids the report actually carries. An id we cannot find is left out
    // rather than defaulted, so deriveRespaldo reads it as unclassified.
    const sourcesById: Record<string, SourceLike> = {}
    for (const s of report?.sources ?? []) {
      if (s && typeof s.id === 'string') sourcesById[s.id] = s
    }
    for (const portfolio of o.portfolios) {
      if (typeof portfolio !== 'string' || !portfolio.trim()) continue
      tasks.push({
        officialSlug: o.slug,
        portfolio,
        departmentSlug: resolveSlug(portfolio),
        reportId: report?.id ?? '',
        educationItems,
        careerItems,
        politicalItems,
        sourcesById,
      })
    }
  }
  return tasks
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompts — the only place the model's instructions live
// ─────────────────────────────────────────────────────────────────────────────

export function buildAreaFitSystemPrompt(): string {
  return `Eres analista documental de un observatorio municipal español.

Se te da UN área de gestión delegada de un ayuntamiento y lo que una persona
declara en su CV publicado. Decides, para la formación y para la trayectoria
profesional POR SEPARADO, si lo declarado guarda relación con la MATERIA de esa
área.

Reglas, sin excepción:
- Juzgas la relación entre una materia y un área. NO juzgas a la persona, ni su
  competencia, ni su idoneidad para el cargo. No emitas ninguna valoración.
- Usa ÚNICAMENTE los elementos que se te dan. No infieras nada que no esté
  escrito. No uses conocimiento externo sobre esta persona.
- Cita por ÍNDICE: devuelve los índices de los elementos en los que te apoyas,
  exactamente como aparecen numerados. Nunca inventes un índice.
- "relacionada" exige al menos un índice. Si no puedes señalar ninguno, el valor
  es "sin-relacion-declarada" y evidenceIndices va vacío.
- La relación ha de ser de materia, no de prestigio: un título universitario no
  es "relacionado" con todo, y una formación profesional del ramo sí lo es con el
  suyo.
- "reason" es una frase, factual, sin adjetivos de mérito. Describe el criterio,
  nunca a la persona.

Devuelve SÓLO JSON.`
}

export function buildAreaFitUserPrompt(task: FitTask): string {
  const fmt = (xs: FitEvidenceItem[]) =>
    xs.length ? xs.map((x, i) => `  [${i}] ${x.label}`).join('\n') : '  (sin elementos)'
  return `ÁREA DE GESTIÓN DELEGADA: ${task.portfolio}

FORMACIÓN DECLARADA:
${fmt(task.educationItems)}

TRAYECTORIA PROFESIONAL DECLARADA:
${fmt(task.careerItems)}

Responde con el JSON de valoración para esta área.`
}

// ─────────────────────────────────────────────────────────────────────────────
// Validators
// ─────────────────────────────────────────────────────────────────────────────

export interface AreaFitValidationContext {
  officials: readonly OfficialLike[]
  /** reportId → the set of source ids that report actually carries. */
  reportSources: Record<string, Set<string>>
}

function validateAssessment(a: FitAssessment, where: string, known: Set<string> | undefined) {
  must(a && typeof a === 'object', `${where} required`)
  must(isFitValue(a.value), `${where}.value must be one of ${FIT_VALUES.join(' | ')}`)
  must(Array.isArray(a.evidence), `${where}.evidence must be an array`)
  must(
    a.value !== 'relacionada' || a.evidence.length > 0,
    `${where}: "relacionada" requires at least one cited item`,
  )
  must(
    a.value === 'relacionada' || a.evidence.length === 0,
    `${where}: only "relacionada" may carry evidence`,
  )
  must(
    a.respaldo === undefined || (RESPALDO_VALUES as readonly string[]).includes(a.respaldo),
    `${where}.respaldo must be one of ${RESPALDO_VALUES.join(' | ')}`,
  )
  // Requiring a respaldo on every citing assessment is the NEXT gate, and it
  // lands with the re-promotion that makes it true — not here, where it would
  // condemn the 28 already-published rows that predate the axis.
  must(
    a.respaldo !== 'sin-clasificar',
    `${where}: refusing to publish an assessment whose backing was never classified — ` +
      'run `npm run backfill:self-declared` first',
  )
  for (const ev of a.evidence) {
    must(typeof ev.label === 'string' && ev.label.length > 0, `${where}: evidence needs a label`)
    must(
      Array.isArray(ev.sourceIds) && ev.sourceIds.length > 0,
      `${where}: evidence "${ev.label}" carries no sourceIds`,
    )
    for (const id of ev.sourceIds) {
      must(
        !known || known.has(id),
        `${where}: sourceId ${id} does not exist in the cited report — ` +
          'an orphan citation is worse than no citation',
      )
    }
  }
}

/**
 * The published shape. Rejects anything that would put an uncited, unsigned or
 * mis-attached judgement about a named person on the site.
 */
export function validateAreaFitSnapshot(
  json: unknown,
  ctx: AreaFitValidationContext,
): AreaFitSnapshot {
  const s = json as AreaFitSnapshot
  must(s && typeof s === 'object', 'snapshot must be an object')
  must(typeof s.mandate === 'string' && s.mandate.length >= 4, 'mandate required')
  must(Array.isArray(s.rows), 'rows must be an array')

  const byslug = new Map(ctx.officials.map((o) => [o.slug, o]))
  const seen = new Set<string>()

  for (const r of s.rows) {
    const where = `${r?.officialSlug}/${r?.portfolio}`
    must(typeof r.officialSlug === 'string' && r.officialSlug.length > 0, 'officialSlug required')
    const official = byslug.get(r.officialSlug)
    must(official, `${where}: officialSlug does not resolve in officials.json`)
    must(typeof r.portfolio === 'string' && r.portfolio.length > 0, `${where}: portfolio required`)
    must(
      official.portfolios.includes(r.portfolio),
      `${where}: this official does not hold that portfolio — ` +
        'attaching a judgement to an área someone else runs is a misattribution',
    )

    const key = `${r.officialSlug}::${r.portfolio}`
    must(!seen.has(key), `${where}: duplicate row`)
    seen.add(key)

    must(
      !('requiresHumanApproval' in r),
      `${where}: requiresHumanApproval must not appear on a published row — ` +
        'promotion strips it; its presence means a draft leaked into the published set',
    )
    must(
      typeof r.curatedBy === 'string' && r.curatedBy.length > 0,
      `${where}: curatedBy required — this names a person, so it carries a signature`,
    )
    must(
      typeof r.curatedAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(r.curatedAt),
      `${where}: curatedAt must be an ISO date`,
    )

    const known = ctx.reportSources[r.reportId]
    validateAssessment(r.formacion, `${where}.formacion`, known)
    validateAssessment(r.experiencia, `${where}.experiencia`, known)
  }

  const share = noConstaShare(s.rows)
  must(
    share < NO_CONSTA_CEILING,
    `no-consta share is ${(share * 100).toFixed(1)}% (ceiling ${NO_CONSTA_CEILING * 100}%) — ` +
      'that many blanks means the pipeline is reading the wrong field, not that the CVs are empty',
  )

  return s
}

/** The DRAFT shape: the mirror image — every row MUST carry the approval flag. */
export function validateAreaFitDrafts(json: unknown): AreaFitRow[] {
  const s = json as { rows?: AreaFitRow[] }
  must(s && typeof s === 'object', 'draft queue must be an object')
  must(Array.isArray(s.rows), 'draft queue rows must be an array')
  for (const r of s.rows) {
    must(
      r.requiresHumanApproval === true,
      `${r?.officialSlug}/${r?.portfolio}: a draft must carry requiresHumanApproval: true`,
    )
    must(
      !r.curatedBy,
      `${r?.officialSlug}/${r?.portfolio}: a draft cannot carry a curator signature`,
    )
  }
  return s.rows
}

/** Rows for one official, in the order their portfolios are declared. */
export function rowsForOfficial(snap: AreaFitSnapshot | null, slug: string): AreaFitRow[] {
  return (snap?.rows || []).filter((r) => r.officialSlug === slug)
}

/**
 * Áreas where a given field is `relacionada`, for the card.
 *
 * Returns names, never a count or a ratio: "3 de 4" is a score with extra steps,
 * and the whole point of this surface is that it does not grade anyone.
 */
export function relatedAreas(
  rows: readonly AreaFitRow[],
  field: 'formacion' | 'experiencia',
): string[] {
  return rows.filter((r) => r[field]?.value === 'relacionada').map((r) => r.portfolio)
}

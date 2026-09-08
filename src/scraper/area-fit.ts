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
 * Measured 2026-08-04: EVERY evidence reference behind the published rows traces
 * to a document the subject wrote, so this axis reads `autodeclarada` throughout.
 * That is the finding, not a bug — and the reason the surface should state it
 * once rather than repeat an identical badge on every assessment. No count is
 * written here on purpose: it moves with every promotion, and a stale number in
 * a comment is how a claim outlives the measurement behind it. Count the rows.
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

/**
 * Which axis a biography warning bears on.
 *
 * A biography's `warnings` are free prose, and most of them have nothing to do
 * with this surface: private-activity compatibility, press coverage, a
 * file-naming incident. A few bear directly on it — a CV that contradicts a
 * statutory declaration is a fact about the same evidence a chip is built from.
 * Mapping them is what lets the real discrepancy surface without the noise
 * surfacing with it.
 *
 * `area` is not a decoration: it means the delegation changed mid-mandate, so a
 * row may be judging an área the person no longer holds. That is a correctness
 * problem with the ROW, not a note about the person, and it renders as such —
 * hence `decoratesChip: false`.
 *
 * `ninguno` is the honest majority answer and exists so the model can say "this
 * one is not about you" instead of straining to fit it somewhere. It is dropped
 * before the queue and refused by the published validator: a mapping that says
 * nothing while naming a living person is worse than no mapping.
 */
export const AVISO_EJES = ['formacion', 'experiencia', 'area', 'ninguno'] as const
export type AvisoEje = (typeof AVISO_EJES)[number]

/**
 * WHICH WAY the warning cuts — required, and a closed set on purpose.
 *
 * The axis alone cannot be rendered. Of the first three `experiencia` mappings
 * this pipeline produced, TWO were corroborations: Pozuelo's 2015/2019
 * discrepancy was RESOLVED by independent sources (BOP n.º 79, acta de 2015),
 * and Barbancho's statutory declaration CORROBORATES his CV. Painting either as
 * "discrepancia documentada" would publish corroboration as suspicion about a
 * named person — the exact inversion this surface exists to avoid.
 *
 * It is an enum and not a label because the field REACHES public/data. This
 * carried free text for one commit, and a free-text field that publishes is a
 * field through which a model can author a sentence about a living person —
 * `tipo: 'El concejal miente sobre su titulación'` validated and would have
 * shipped under a curator's signature. A closed set cannot hold a sentence.
 */
export const AVISO_DIRECCIONES = ['contradice', 'corrobora', 'matiza'] as const
export type AvisoDireccion = (typeof AVISO_DIRECCIONES)[number]

export interface AvisoMapping {
  officialSlug: string
  /** The report the index is relative to — an index means nothing without it. */
  reportId: string
  avisoIndex: number
  eje: AvisoEje
  /** Which way it cuts. Required: an axis with no direction cannot be rendered. */
  direccion: AvisoDireccion
  /** Resolved here from the index — the model never emits prose we publish. */
  verbatim: string
  decoratesChip: boolean
  curatedBy?: string
  curatedAt?: string
  /** Drafts only. The published schema REJECTS this field — two independent layers. */
  requiresHumanApproval?: true
}

/**
 * Which axes a chip can actually show.
 *
 * Derived, never stored by hand: the published validator recomputes it, so a
 * snapshot whose flag was hand-edited cannot make a chip claim an axis it is
 * not on.
 */
export function decoratesChipFor(eje: AvisoEje): boolean {
  return eje === 'formacion' || eje === 'experiencia'
}

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
  /**
   * The CREDENTIAL alone — «Arquitecto Técnico», «Arquitecta técnica y jefa de
   * obra» — without the university or the company that follows it in `label`.
   *
   * It exists because the card on /cargos has one line per axis and no room for
   * the institution: printing the full label there says where someone studied,
   * which is not what «Formación» claims. Both forms are read from the
   * biography's OWN structured fields (`degree` / `role`), never by splitting
   * `label` back apart — a regex over a joined string is a second, silently
   * divergent parser of data we already hold in pieces.
   *
   * REQUIRED, not optional. A snapshot written before this field existed must
   * be migrated rather than rendered blank, and requiredness is what proves the
   * migration ran instead of letting "never attempted" pass as "nothing to do"
   * (DATA_INTEGRITY §2). Never empty: a row with no structured credential falls
   * back to the whole line.
   */
  short: string
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
 * All `deriveRespaldo` actually reads.
 *
 * `Pick`ed from FitEvidenceItem rather than restated, so it cannot drift from
 * it: what an assessment RESTS ON is a property of the source ids it cites and
 * of nothing else — the labels are for the reader. Narrow on purpose, so a
 * caller that only holds the ids (relations-check re-derives the axis across the
 * whole committed set) need not fabricate a label or a short form to ask.
 */
export type CitedSources = Pick<FitEvidenceItem, 'sourceIds'>

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
  evidence: readonly CitedSources[],
  sourcesById: Record<string, SourceLike>,
): RespaldoValue {
  const ids = evidence.flatMap((e) => e.sourceIds ?? [])
  if (!ids.length) return 'sin-clasificar'
  const flags = ids.map((id) => sourcesById[id]?.selfDeclared)
  // ORDER IS LOAD-BEARING: the unclassified guard runs FIRST. Checking for an
  // independent source before it would answer `corroborada` for an assessment
  // that also cites something nobody classified. Pinned by the mixed-source
  // tests in tests/parse-area-fit.test.ts — every uniformly-classified case
  // passes under either ordering.
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
  /**
   * Optional and separate from `rows` on purpose: a warning is a fact about the
   * biography, not about one (official × área) pair, and most rows will never
   * have one.
   */
  avisos?: AvisoMapping[]
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

const isAvisoEje = (v: unknown): v is AvisoEje =>
  typeof v === 'string' && (AVISO_EJES as readonly string[]).includes(v)

const isAvisoDireccion = (v: unknown): v is AvisoDireccion =>
  typeof v === 'string' && (AVISO_DIRECCIONES as readonly string[]).includes(v)

/**
 * Turn the model's answer about ONE warning into a mapping, or refuse.
 *
 * The model chooses from three closed sets — an index, an axis and a direction —
 * and the text that gets published is read from the report's own `warnings`
 * array here. Every field the model can influence is therefore bounded, so it
 * cannot author a sentence this surface publishes about a named person. That is
 * the strongest form of the cite-by-index rule the rest of this module follows,
 * and it holds only while NO free-text field survives to publication.
 *
 * An index outside the report's warnings is a hard error, never repaired: a
 * drifted index attaches one councillor's warning to another's claim, and a
 * clamp would do it silently. The promise miner learned this at 172fd04.
 */
export function resolveAvisoMapping(
  raw: { avisoIndex: number; eje: string; direccion: string },
  warnings: readonly string[],
  ctx: { officialSlug: string; reportId: string } = { officialSlug: '', reportId: '' },
): AvisoMapping {
  must(raw && typeof raw === 'object', 'aviso mapping must be an object')
  must(
    isAvisoEje(raw.eje),
    `eje must be one of ${AVISO_EJES.join(' | ')}, got ${JSON.stringify(raw.eje)}`,
  )
  must(
    isAvisoDireccion(raw.direccion),
    `direccion must be one of ${AVISO_DIRECCIONES.join(' | ')}, got ${JSON.stringify(raw.direccion)} — ` +
      'an axis with no direction renders corroboration as suspicion',
  )
  must(
    Number.isInteger(raw.avisoIndex) && raw.avisoIndex >= 0 && raw.avisoIndex < warnings.length,
    `avisoIndex ${raw.avisoIndex} is outside the report's ${warnings.length} warning(s) — ` +
      'refusing to repair it; a drifted index attaches a warning to the wrong claim',
  )
  const verbatim = warnings[raw.avisoIndex]
  must(
    typeof verbatim === 'string' && verbatim.trim().length > 0,
    `warning ${raw.avisoIndex} is empty — there is nothing to map`,
  )
  return {
    officialSlug: ctx.officialSlug,
    reportId: ctx.reportId,
    avisoIndex: raw.avisoIndex,
    eje: raw.eje,
    direccion: raw.direccion,
    verbatim,
    decoratesChip: decoratesChipFor(raw.eje),
  }
}

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
    // Both label forms travel together — the card shows the short one, the
    // detail page the full one, and they must describe the SAME pool item. The
    // fallback is the same one `itemsFrom` applies: a pool built without short
    // forms degrades to the whole line, never to a blank.
    evidence.push({
      label: item.label,
      short: item.short || item.label,
      sourceIds: [...item.sourceIds],
    })
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
  /** Free prose the biography publishes about its own limits. Indexed, never rewritten. */
  warnings?: string[]
}

function sectionPayload(
  report: ReportLike | undefined,
  kind: string,
): Record<string, unknown> | null {
  const s = report?.sections?.find((x) => x.kind === kind)
  return s ? s.payload : null
}

const joinNonEmpty = (parts: Array<unknown>, sep: string) =>
  parts.filter((p) => typeof p === 'string' && p.trim().length > 0).join(sep)

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** The two forms of one biography row: the whole line, and the credential alone. */
export interface FitLabels {
  label: string
  short: string
}

/**
 * «Arquitecto Técnico — Universitat Politècnica de València» / «Arquitecto Técnico».
 *
 * The report stores `degree` and `institution` as separate keys, so the short
 * form is READ, not recovered: nothing here ever splits the joined label back
 * apart. Exported so the one other place that has to reproduce these labels —
 * scripts/migrate-area-fit-short.ts, matching published evidence back to the row
 * it came from — uses this builder instead of a second copy of the join.
 */
export const educationLabels = (r: Record<string, unknown>): FitLabels => ({
  label: joinNonEmpty([r.degree, r.institution], ' — '),
  short: str(r.degree),
})

/** «Arquitecta técnica y jefa de obra @ Grupo Tremon SA» / the role alone. */
export const careerLabels = (r: Record<string, unknown>): FitLabels => ({
  label: joinNonEmpty([r.role, r.org], ' @ '),
  short: str(r.role),
})

function itemsFrom(
  payload: Record<string, unknown> | null,
  labels: (row: Record<string, unknown>) => FitLabels,
): FitEvidenceItem[] {
  const rows = (payload?.items as Array<Record<string, unknown>> | undefined) || []
  return rows
    .map((r) => {
      const parts = labels(r)
      const label = parts.label.trim()
      return {
        label,
        // Fall back to the whole line rather than publish a blank: a biography
        // row that carries only an institution still has to render something,
        // and an empty short is refused by the published validator anyway.
        short: parts.short.trim() || label,
        sourceIds: Array.isArray(r.sourceIds) ? (r.sourceIds as string[]) : [],
      }
    })
    .filter((i) => i.label.length > 0)
}

/**
 * officialSlug → their biography, read off the `portrait` section.
 *
 * Exported so the rows and the warnings resolve a person's report the SAME way.
 * Two independent lookups is how a warning ends up quoted under the wrong
 * councillor's name — the one failure this whole surface cannot afford.
 */
export function indexReportsByOfficial(reports: readonly ReportLike[]): Map<string, ReportLike> {
  const bySlug = new Map<string, ReportLike>()
  for (const r of reports) {
    const slug = sectionPayload(r, 'portrait')?.officialSlug
    if (typeof slug === 'string') bySlug.set(slug, r)
  }
  return bySlug
}

/** The three pools a biography offers, in the shape a task carries them. */
export interface FitEvidencePools {
  educationItems: FitEvidenceItem[]
  careerItems: FitEvidenceItem[]
  politicalItems: FitEvidenceItem[]
}

/**
 * Build a report's evidence pools — the ONE place a biography row becomes a
 * citable item.
 *
 * Exported so anything that has to map a PUBLISHED evidence item back to the
 * biography row behind it rebuilds the pool exactly as the pipeline did and
 * matches on the whole label. The alternative — re-deriving a field from the
 * label with a regex — is a second parser of the same data, and the one it
 * would silently disagree with is the one that already published.
 */
export function evidencePoolsFor(report: ReportLike | undefined): FitEvidencePools {
  return {
    educationItems: itemsFrom(sectionPayload(report, 'education'), educationLabels),
    careerItems: itemsFrom(sectionPayload(report, 'career-professional'), careerLabels),
    politicalItems: itemsFrom(sectionPayload(report, 'career-political'), careerLabels),
  }
}

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
  const bySlug = indexReportsByOfficial(reports)

  const tasks: FitTask[] = []
  for (const o of officials) {
    if (!Array.isArray(o.portfolios) || o.portfolios.length === 0) continue
    const report = bySlug.get(o.slug)
    const { educationItems, careerItems, politicalItems } = evidencePoolsFor(report)
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

export const AVISO_PROMPT_VERSION = 'area-fit-aviso-v2'

export function buildAvisoSystemPrompt(): string {
  return `Eres analista documental de un observatorio municipal español.

Se te da la lista numerada de ADVERTENCIAS que acompaña a una biografía. Para
cada una dices DOS cosas: sobre qué EJE recae y en qué DIRECCIÓN.

EJE:
- "formacion"   — recae sobre la FORMACIÓN ACADÉMICA declarada (títulos, cursos,
                  centros donde estudió).
- "experiencia" — recae sobre la TRAYECTORIA PROFESIONAL declarada: empleos y
                  actividad laboral. NO es "experiencia" una advertencia sobre
                  su carrera POLÍTICA (concejalías, actas, listas electorales,
                  desde cuándo es regidor): esa carrera no entra en este eje.
                  Si la advertencia sólo habla de cargos electos, es "ninguno".
- "area"        — dice que las áreas o delegaciones han cambiado.
- "ninguno"     — cualquier otra cosa (compatibilidad de actividades privadas,
                  cobertura de prensa, incidencias de archivo, patrimonio,
                  carrera política).

DIRECCIÓN (obligatoria, incluso cuando el eje es "ninguno"):
- "contradice" — dos fuentes se contradicen y la contradicción sigue abierta,
                 o el dato no ha podido verificarse y queda en entredicho.
- "corrobora"  — otra fuente confirma lo declarado, o una discrepancia anterior
                 quedó RESUELTA. Una advertencia que confirma NO es un reparo.
- "matiza"     — acota, precisa o contextualiza sin confirmar ni desmentir.

Reglas:
- Cita por ÍNDICE, exactamente como están numeradas. Nunca inventes un índice.
- Una advertencia que sólo dice que un dato es autodeclarado es "ninguno": eso
  ya se refleja por otra vía y repetirlo es ruido.
- No juzgas a la persona. No escribes prosa: sólo eliges de las listas de
  arriba. Ningún texto tuyo se publica.
- Ante la duda en el eje, "ninguno". Ante la duda en la dirección, "matiza".

Devuelve SÓLO JSON.`
}

export function buildAvisoUserPrompt(warnings: readonly string[]): string {
  return `ADVERTENCIAS:
${warnings.map((w, i) => `  [${i}] ${w}`).join('\n')}

Devuelve {"avisos":[{"avisoIndex":n,"eje":"…","direccion":"…"}]} con una entrada
por advertencia. "eje" es uno de ${AVISO_EJES.join(' | ')} y "direccion" uno de
${AVISO_DIRECCIONES.join(' | ')}. No añadas ningún otro campo.`
}

// ─────────────────────────────────────────────────────────────────────────────
// Validators
// ─────────────────────────────────────────────────────────────────────────────

export interface AreaFitValidationContext {
  officials: readonly OfficialLike[]
  /** reportId → the set of source ids that report actually carries. */
  reportSources: Record<string, Set<string>>
  /**
   * reportId → that report's `warnings`, so an aviso's index can be RE-RESOLVED
   * at publication time and not merely at generation time.
   *
   * Without it, cite-by-index protects only the moment the model answered. Re-run
   * a biography between `suggest` and `promote` — warnings reorder or a
   * retraction shortens the list — and a stale `verbatim` publishes under a stale
   * index with a curator's name on it. That is precisely the "warning quoted
   * under the wrong councillor's name" this module says it cannot afford, so the
   * check has to run where the write happens.
   *
   * Optional in the TYPE only so a snapshot carrying no avisos still validates
   * in callers that hold no reports. The moment a snapshot carries even one
   * aviso this field is REQUIRED AT RUNTIME and its absence is a hard error —
   * see the guard in `validateAreaFitSnapshot`.
   *
   * It cannot be merely optional. An omitted field would not weaken the
   * re-resolution check, it would DELETE it, and a fabricated `verbatim` would
   * publish under a named councillor's row. This repo has shipped that exact
   * shape twice — `check:contract-drift` and the pre-push `review:surfaces` both
   * printed an all-clear against a dead backend because absent input read as
   * "nothing to report" (DATA_INTEGRITY §2). Type-level `required` would not be
   * enough on its own either: tsconfig covers only src/ and scripts/, so a test-
   * built or JS-built context is never typechecked.
   */
  reportWarnings?: Record<string, readonly string[]>
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
  // "Every citing assessment carries a respaldo" is enforced, but by
  // `areafit-respaldo-classified` in relations-check.ts, not here: this
  // validator sees ONE snapshot at write time, and the failure worth catching —
  // a row that stopped being classified after a re-run elsewhere — is a
  // property of the committed set. Refusing it here would also have condemned
  // the rows that predate the axis, at a moment when nothing could repair them.
  must(
    a.respaldo !== 'sin-clasificar',
    `${where}: refusing to publish an assessment whose backing was never classified — ` +
      'run `npm run backfill:self-declared` first',
  )
  for (const ev of a.evidence) {
    must(typeof ev.label === 'string' && ev.label.length > 0, `${where}: evidence needs a label`)
    must(
      typeof ev.short === 'string' && ev.short.length > 0,
      `${where}: evidence "${ev.label}" carries no short form — the card prints the credential, ` +
        'not the institution, and a blank line under a named councillor is not an option. ' +
        'A published snapshot from before the field existed: `npm run migrate:area-fit-short`. ' +
        'A row still in the review queue from before it: re-run `npm run suggest:area-fit`, ' +
        'which rebuilds the pools with both label forms',
    )
    // The cheap invariant that catches a short form sitting on the WRONG item.
    // Both forms come from one biography row and the full label is built by
    // appending the institution (or the company) to the credential, so the
    // short form is always the head of the label. A short that is not — «Grado
    // en Derecho» under a label about a building site — is evidence drift, the
    // same class of failure cite-by-index exists to prevent, and it renders as
    // a qualification the person never claimed.
    must(
      ev.label.startsWith(ev.short),
      `${where}: short form "${ev.short}" is not the head of "${ev.label}" — ` +
        'the two must come from the same biography row; refusing to publish a credential ' +
        'that drifted onto another item',
    )
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

  if (s.avisos !== undefined) {
    must(Array.isArray(s.avisos), 'avisos must be an array when present')
    // REFUSE TO RUN rather than skip the re-resolution below. A caller that
    // forgets this field does not get a weaker check, it gets no check, and a
    // fabricated `verbatim` publishes under a named councillor's row with a
    // curator's signature on it. Not defaulted to `{}` on purpose: that would
    // reproduce the same hole one layer down, where every reportId would simply
    // resolve to nothing. A snapshot with zero avisos needs no reports.
    must(
      s.avisos.length === 0 ||
        (ctx.reportWarnings !== null &&
          typeof ctx.reportWarnings === 'object' &&
          !Array.isArray(ctx.reportWarnings)),
      `this snapshot carries ${s.avisos.length} aviso(s) but the validation context has no ` +
        '`reportWarnings`, so their indices cannot be re-resolved against the reports. ' +
        'Refusing to validate: an absent input must never read as a pass. Pass ' +
        "reportWarnings (reportId → that report's warnings[]) — see loadReportWarnings() " +
        'in scripts/promote-area-fit.ts.',
    )
    const seenAvisos = new Set<string>()
    for (const a of s.avisos) {
      const where = `aviso ${a?.officialSlug}#${a?.avisoIndex}`
      must(a && typeof a === 'object', 'aviso must be an object')
      must(
        typeof a.officialSlug === 'string' && byslug.has(a.officialSlug),
        `${where}: officialSlug does not resolve in officials.json`,
      )
      must(
        typeof a.reportId === 'string' && a.reportId.length > 0,
        `${where}: reportId required — an index means nothing without the list it indexes`,
      )
      must(
        Number.isInteger(a.avisoIndex) && a.avisoIndex >= 0,
        `${where}: avisoIndex must be a non-negative integer`,
      )
      must(isAvisoEje(a.eje), `${where}: eje must be one of ${AVISO_EJES.join(' | ')}`)
      must(
        a.eje !== 'ninguno',
        `${where}: refusing to publish eje "ninguno" — it asserts nothing and names a ` +
          'living person to assert it; drop the mapping instead',
      )
      must(
        isAvisoDireccion(a.direccion),
        `${where}: direccion must be one of ${AVISO_DIRECCIONES.join(' | ')} — ` +
          'an axis with no direction renders corroboration as suspicion',
      )
      must(
        !('tipo' in a),
        `${where}: "tipo" was free text the model authored and it reached public/data — ` +
          'it is gone; use direccion, which is a closed set',
      )
      must(
        typeof a.verbatim === 'string' && a.verbatim.trim().length > 0,
        `${where}: verbatim required — it is the warning's own text, read from the report`,
      )
      must(
        a.decoratesChip === decoratesChipFor(a.eje),
        `${where}: decoratesChip (${a.decoratesChip}) contradicts eje "${a.eje}" — ` +
          'the flag is derived, so a hand-edited one makes a chip claim the wrong axis',
      )
      // RE-RESOLVE the index against the report as it stands NOW. Generation-time
      // validation cannot see a biography re-run that happened afterwards.
      // Unconditional: the guard above already refused a context without the
      // reports, so there is no branch here in which the check can be skipped.
      const warnings = ctx.reportWarnings![a.reportId]
      must(
        Array.isArray(warnings),
        `${where}: reportId "${a.reportId}" resolves to no report — ` +
          'an aviso whose list cannot be found is refused, never assumed correct',
      )
      must(
        warnings[a.avisoIndex] === a.verbatim,
        `${where}: verbatim no longer matches warning ${a.avisoIndex} of ${a.reportId} ` +
          `(the report now has ${warnings.length}) — the biography was re-run after the ` +
          'mapping was drafted; re-run `npm run suggest:area-fit` rather than publishing a ' +
          'quote the report no longer contains at that index',
      )
      must(
        !('requiresHumanApproval' in a),
        `${where}: requiresHumanApproval must not appear on a published aviso — ` +
          'promotion strips it; its presence means a draft leaked into the published set',
      )
      must(
        typeof a.curatedBy === 'string' && a.curatedBy.length > 0,
        `${where}: curatedBy required — this names a person, so it carries a signature`,
      )
      must(
        typeof a.curatedAt === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a.curatedAt),
        `${where}: curatedAt must be an ISO date`,
      )
      const key = `${a.officialSlug}::${a.avisoIndex}`
      must(!seenAvisos.has(key), `${where}: duplicate aviso mapping`)
      seenAvisos.add(key)
    }
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
  const s = json as { rows?: AreaFitRow[]; avisos?: AvisoMapping[] }
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
  // The avisos ride the same queue and so answer to the same mirror: an aviso
  // draft that arrived pre-signed, or without the flag, is one the promote step
  // would wave straight through.
  for (const a of s.avisos ?? []) {
    const where = `aviso ${a?.officialSlug}#${a?.avisoIndex}`
    must(
      a.requiresHumanApproval === true,
      `${where}: a draft must carry requiresHumanApproval: true`,
    )
    must(!a.curatedBy, `${where}: a draft cannot carry a curator signature`)
    must(isAvisoEje(a.eje), `${where}: eje must be one of ${AVISO_EJES.join(' | ')}`)
    must(
      a.eje !== 'ninguno',
      `${where}: "ninguno" is dropped before the queue — it is not something to review`,
    )
    must(
      isAvisoDireccion(a.direccion),
      `${where}: direccion must be one of ${AVISO_DIRECCIONES.join(' | ')}`,
    )
    must(!('tipo' in a), `${where}: "tipo" is gone — it was unbounded model-authored text`)
  }
  return s.rows
}

/** Rows for one official, in the order their portfolios are declared. */
export function rowsForOfficial(snap: AreaFitSnapshot | null, slug: string): AreaFitRow[] {
  return (snap?.rows || []).filter((r) => r.officialSlug === slug)
}

/**
 * Reanclar las filas y los avisos que citan un informe a su versión siguiente.
 *
 * Una biografía v2 promovida archiva la v1 y su id desaparece del índice: las
 * filas firmadas que lo citan y los avisos espejados por índice quedan colgando,
 * el validador los rechaza (bien) y no había camino que no fuera editar a mano
 * el fichero que la guarda protege. Esto cambia SÓLO `reportId`; el juicio, la
 * firma, las pruebas y el índice del aviso no se tocan. La revalidación del
 * snapshot entero contra el informe nuevo la hace quien escribe (`write()` en
 * promote-area-fit): si la v2 no conserva las fuentes citadas o el aviso en el
 * mismo índice, ahí se cae, no aquí. Un `from` que no cita nadie es un error,
 * no un cero: un reanclaje que no reancla nada no puede imprimir un ✓.
 */
export function rebindAreaFitReport(
  snap: AreaFitSnapshot,
  from: string,
  to: string,
): { snapshot: AreaFitSnapshot; rows: number; avisos: number } {
  if (!from || !to) throw new Error('rebind: reportId de origen y de destino son obligatorios')
  if (from === to) throw new Error(`rebind: ${from} → ${to} no cambia nada`)
  let rows = 0
  let avisos = 0
  const nextRows = snap.rows.map((r) => {
    if (r.reportId !== from) return r
    rows++
    return { ...r, reportId: to }
  })
  const nextAvisos = snap.avisos?.map((a) => {
    if (a.reportId !== from) return a
    avisos++
    return { ...a, reportId: to }
  })
  if (rows === 0 && avisos === 0)
    throw new Error(`rebind: ninguna fila ni aviso cita ${from}; no hay nada que reanclar`)
  const snapshot: AreaFitSnapshot = { ...snap, rows: nextRows }
  if (nextAvisos !== undefined) snapshot.avisos = nextAvisos
  return { snapshot, rows, avisos }
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

/**
 * ¿Sigue habiendo una firma para cada área delegada? — la parte pura de
 * `check:area-fit`.
 *
 * Vive aquí y no en el guion porque el guion sólo debe hacer entrada/salida y
 * salir con un código: la pregunta en sí tiene que poder inyectarse con datos
 * falsos desde una prueba. Una guarda que no se puede poner roja a propósito
 * no se ha comprobado nunca.
 *
 * CUATRO desenlaces, no dos. Plegar «no lo he mirado» dentro de «coincide»
 * hace que la guarda imprima su propio visto bueno, que es el defecto
 * `r?.findings ?? []` que este repositorio ya pagó.
 */
export const ENCAJE_DESENLACES = [
  'coincide',
  'sin-firmar',
  'cargo-cambiado',
  'oficial-inexistente',
] as const
export type EncajeDesenlace = (typeof ENCAJE_DESENLACES)[number]

/** Los tres que salen 1: publican algo que dejó de ser cierto, o callan sobre quien no debería. */
export const ENCAJE_DESENLACES_ROJOS: readonly EncajeDesenlace[] = [
  'sin-firmar',
  'cargo-cambiado',
  'oficial-inexistente',
]

export interface EncajeCotejo {
  desenlace: EncajeDesenlace
  oficial: string
  area: string
  detalle: string
}

export interface OficialConAreas {
  slug: string
  name?: string
  portfolios?: readonly string[]
}

export interface FilaFirmada {
  officialSlug: string
  portfolio: string
}

/**
 * El cotejo del área es por igualdad LITERAL contra `portfolios` — medido
 * antes de escribirlo: las 40 filas publicadas casan exactamente. Si algún día
 * deja de casar, el desenlace correcto es `cargo-cambiado` y hay que mirarlo.
 * Aflojar el cotejo aquí convertiría la guarda en un sello.
 */
export function cotejarCoberturaEncaje(
  oficiales: readonly OficialConAreas[],
  filas: readonly FilaFirmada[],
): EncajeCotejo[] {
  const porSlug = new Map(oficiales.map((o) => [o.slug, o]))
  const nombre = (slug: string) => porSlug.get(slug)?.name ?? slug
  // Separador que no puede aparecer dentro de un nombre de área.
  const clave = (slug: string, area: string) => `${slug}§${area}`
  const firmadas = new Set(filas.map((f) => clave(f.officialSlug, f.portfolio)))
  const cotejos: EncajeCotejo[] = []

  // Eje 1 — cada área delegada necesita su firma. `EncajeCard` hace
  // `if (!rows.length) return null`, así que un área sin firmar no deja hueco
  // visible: deja SILENCIO, y el silencio se lee como limpio.
  for (const o of oficiales) {
    for (const area of o.portfolios ?? []) {
      cotejos.push(
        firmadas.has(clave(o.slug, area))
          ? { desenlace: 'coincide', oficial: o.slug, area, detalle: 'firmada' }
          : {
              desenlace: 'sin-firmar',
              oficial: o.slug,
              area,
              detalle:
                `${nombre(o.slug)} lleva esta área y no hay fila firmada: su ficha no ` +
                `pinta encaje mientras las de sus compañeros sí`,
            },
      )
    }
  }

  // Eje 2 — ninguna firma puede sobrevivir al cargo que describe.
  for (const f of filas) {
    const o = porSlug.get(f.officialSlug)
    if (!o) {
      cotejos.push({
        desenlace: 'oficial-inexistente',
        oficial: f.officialSlug,
        area: f.portfolio,
        detalle: 'el slug ya no está en officials.json y la fila sigue publicada',
      })
      continue
    }
    if (!(o.portfolios ?? []).includes(f.portfolio)) {
      cotejos.push({
        desenlace: 'cargo-cambiado',
        oficial: f.officialSlug,
        area: f.portfolio,
        detalle:
          `${nombre(f.officialSlug)} ya no lleva «${f.portfolio}»; ahora lleva ` +
          `[${(o.portfolios ?? []).join(' · ') || 'ninguna'}]`,
      })
    }
  }

  return cotejos
}

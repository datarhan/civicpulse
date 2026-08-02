/**
 * The curation queue — drafts the automation policy refused to publish, with
 * the machine's evidence checks attached.
 *
 * Why the checks travel WITH the draft: a curator reviewing on a phone can read
 * prose and judge tone, but cannot check whether "la empresa FCC" appears in
 * 1,231 contract rows, or whether the contract cited for a parqué replacement
 * is actually about paving an exterior walkway. Those were two of the four real
 * defects in the published corpus, and both needed a desk and the source data.
 *
 * So the deterministic part is precomputed here and shipped alongside. Review
 * then becomes "read the prose, look at the checks" instead of "trust your gut",
 * which is the difference between a review surface and a green button that
 * launders drafts into publication.
 *
 * Every check corresponds to a defect class actually observed on 2026-08-02:
 *   entity-unbacked  · FCC, named as municipal record, in zero contract rows
 *   all-sin-datos    · every cited claim retracted, yet the summary asserts
 *                      documentary corroboration (the PEF and COMETA cases)
 *   weak-corroboration · cited contract shares almost nothing with what was said
 *                      (the Complejo La Malla / paseo Pacadar collision)
 *
 * Pure module: callers supply the drafts and the datasets.
 */

import { findUnbackedOrgNames } from './finding-entities'

export type CheckLevel = 'blocker' | 'warn' | 'ok'

export interface CurationCheck {
  code: string
  level: CheckLevel
  message: string
}

export interface DraftFindingLike {
  id?: string
  plenoId?: string
  title?: string
  summary?: string
  severity?: string
  sourceClaimIds?: string[]
  quotes?: { text: string; speakerGroup?: string | null; sourceClaimId?: string }[]
  corroboration?: { kind?: string; snippet?: string; ref?: string }[]
}

export interface QueueItem {
  /** Short, stable handle a curator can type on a phone. */
  ref: string
  finding: DraftFindingLike
  checks: CurationCheck[]
}

export interface CurationQueue {
  generatedAt: string
  reason: string
  items: QueueItem[]
}

/** Phrases that assert the record backs something, rather than reporting speech. */
const ASSERTS_RECORD =
  /(seg[uú]n el registro municipal|el registro municipal (incluye|recoge|consta)|consta en el expediente|que documenta|los datos muestran|acredita)/i

const STOP = new Set(
  (
    'de la el los las y en que a un una para con por del al se es su sus como o no lo mas más ' +
    'contrato contratos servicio servicios obras obra municipal riba roja turia túria ayuntamiento ' +
    'este esta estos estas ese esa segun según pleno sesion sesión grupo grupos afirma señala'
  ).split(' '),
)

function contentTokens(s: string): Set<string> {
  return new Set(
    (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9ñ ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP.has(w)),
  )
}

export interface QueueInputs {
  /** Concatenated titles/assignees of everything we publish, for name lookup. */
  haystack: string
  /** claimId → current verdict, for the all-retracted check. */
  verdictByClaimId: Map<string, string>
  /** Company names a human already reviewed and accepted. */
  reviewedNames?: string[]
}

export function checkDraft(draft: DraftFindingLike, inputs: QueueInputs): CurationCheck[] {
  const checks: CurationCheck[] = []

  // 1 · A company named in the prose that appears in none of our data.
  const unbacked = findUnbackedOrgNames(
    [{ id: draft.id ?? 'draft', summary: draft.summary }],
    inputs.haystack,
    inputs.reviewedNames ?? [],
  )
  if (unbacked.length > 0) {
    checks.push({
      code: 'entity-unbacked',
      level: 'blocker',
      message:
        `Nombra ${unbacked.map((u) => `«${u.name}»`).join(', ')}, que no aparece en ningún ` +
        `registro publicado. Comprueba si el sumario lo presenta como hecho documentado.`,
    })
  }

  // 2 · Every cited claim retracted, AND the prose asserts the record backs it.
  const verdicts = (draft.sourceClaimIds ?? [])
    .map((id) => inputs.verdictByClaimId.get(id))
    .filter((v): v is string => Boolean(v))
  const allSinDatos = verdicts.length > 0 && verdicts.every((v) => v === 'sin-datos')
  const assertsRecord = ASSERTS_RECORD.test(draft.summary ?? '')
  if (allSinDatos && assertsRecord) {
    checks.push({
      code: 'asserts-record-without-evidence',
      level: 'blocker',
      message:
        `El sumario dice que el registro respalda algo, pero las ${verdicts.length} afirmaciones ` +
        `citadas están en sin-datos. Así se publicaron el contrato de FCC y el PEF.`,
    })
  } else if (allSinDatos) {
    checks.push({
      code: 'all-sin-datos',
      level: 'warn',
      message:
        `Las ${verdicts.length} afirmaciones citadas están en sin-datos: informa de lo que se ` +
        `dijo, no de un hecho acreditado. Correcto si el sumario no afirma lo contrario.`,
    })
  }

  // 3 · Cited corroboration that shares almost nothing with what was said.
  const said = contentTokens((draft.quotes ?? []).map((q) => q.text).join(' '))
  const substantive = (draft.corroboration ?? []).filter((c) => c.kind !== 'pleno-video')
  const weak = substantive.filter(
    (c) => [...contentTokens(c.snippet ?? '')].filter((w) => said.has(w)).length === 0,
  )
  if (weak.length > 0) {
    checks.push({
      code: 'weak-corroboration',
      level: 'warn',
      message:
        `${weak.length} de ${substantive.length} expediente(s) citados no comparten ninguna ` +
        `palabra con lo que se dijo. Ej.: «${(weak[0].snippet ?? '').slice(0, 70)}…»`,
    })
  }

  // 4 · Quotes with no attribution at all.
  const unattributed = (draft.quotes ?? []).filter((q) => !q.speakerGroup).length
  if (unattributed > 0) {
    checks.push({
      code: 'unattributed-quotes',
      level: 'warn',
      message: `${unattributed} de ${(draft.quotes ?? []).length} cita(s) sin grupo atribuido.`,
    })
  }

  if (checks.length === 0) {
    checks.push({
      code: 'clean',
      level: 'ok',
      message: 'Sin avisos automáticos. Queda el juicio editorial sobre el texto.',
    })
  }
  return checks
}

/** Deterministic short handle: pleno + a slice of the finding id. */
export function draftRef(draft: DraftFindingLike, index: number): string {
  const tail = (draft.id ?? '').split('-').pop() ?? String(index)
  return `${draft.plenoId ?? 'x'}-${tail}`.slice(0, 24)
}

export function buildCurationQueue(
  drafts: readonly DraftFindingLike[],
  inputs: QueueInputs,
  opts: { reason: string; now: string },
): CurationQueue {
  return {
    generatedAt: opts.now,
    reason: opts.reason,
    items: drafts.map((finding, i) => ({
      ref: draftRef(finding, i),
      finding,
      checks: checkDraft(finding, inputs),
    })),
  }
}

/** True when nothing blocks publication — used to sort the easy ones first. */
export function isCleanForReview(item: QueueItem): boolean {
  return !item.checks.some((c) => c.level === 'blocker')
}

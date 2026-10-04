/**
 * Verifier evaluation scorer (P0).
 *
 * Pure function: given a verifier's predictions + a labelled gold set,
 * produce a Scorecard so any `VerifierFn` (deterministic / current-LLM / NLI)
 * can be compared apples-to-apples. No fetch, no LLM.
 *
 * A precision is only as good as the labels it is measured against. This
 * header used to call the gold «human-labeled»; every row of
 * tests/fixtures/verifier-gold.json was labelled by a model (ai-opus-4.8,
 * 2026-06-23/24), and /metodologia published its figures as «etiquetada a
 * mano». So the scorecard says whose labels it scored (`labelledBy`, by
 * `claseDeFirma`): against a model's labels every figure is agreement with
 * that model, not accuracy. 2026-10-04.
 *
 * Scoring rules (see docs/superpowers/specs/2026-06-23-factcheck-rebuild-phase1-design.md):
 *   · only rows flagged `reviewed:true` count — whoever set the flag;
 *   · a gold row with no matching prediction is scored as predicted `sin-datos`
 *     with empty evidence (a verifier that skips a claim emits "no verdict");
 *   · citation precision/recall are micro-averaged over rows that carry
 *     `goldEvidenceRefs`;
 *   · FEVER-style: a row passes iff the label matches AND (no gold refs, or the
 *     gold refs are a subset of the predicted refs).
 */
import type { ClaimVerdict, ClaimVerification } from './claim-verifier'
import { CLASES_DE_FIRMA, claseDeFirma, type ClaseDeFirma } from './firma-de-persona'

export interface GoldRow {
  claimId: string
  claimType?: string
  goldVerdict: ClaimVerdict
  /** Refs the verifier SHOULD cite (optional; enables citation scoring). */
  goldEvidenceRefs?: string[]
  /**
   * Only `reviewed:true` rows are scored. It says the label was set, not by
   * whom: a model can set it as well as a person, and `reviewer` says which.
   */
  reviewed: boolean
  /** Who set the label: a person's name, or a model or process id (`ai-opus-4.8`). */
  reviewer?: string
  verbatim?: string
  notes?: string
}

/** Who labelled the scored rows. */
export interface LabelProvenance {
  /** Scored rows by `claseDeFirma(reviewer)`: persona / automatica / no-consta. */
  byClass: Record<ClaseDeFirma, number>
  /** Scored rows by `reviewer` as written; `(none)` when the row has none. */
  byReviewer: Record<string, number>
}

export interface VerdictMetrics {
  precision: number
  recall: number
  f1: number
  support: number
}

export interface Scorecard {
  n: number
  /** Whose labels the figures below agree with. */
  labelledBy: LabelProvenance
  labelAccuracy: number
  perVerdict: Record<ClaimVerdict, VerdictMetrics>
  /** confusion[goldVerdict][predVerdict] = count. */
  confusion: Record<ClaimVerdict, Record<ClaimVerdict, number>>
  /** pred=contradicho & gold!=contradicho, over n. Libel-critical. */
  falseContradichoRate: number
  /** pred=sin-datos & gold!=sin-datos, over rows whose gold!=sin-datos. Recall miss. */
  falseSinDatosRate: number
  citation: { precision: number; recall: number; f1: number; rowsWithGoldRefs: number }
  feverScore: number
}

const VERDICTS: ClaimVerdict[] = [
  'verificado',
  'parcial',
  'contradicho',
  'sin-datos',
  'promesa-repetida',
]

function f1Of(precision: number, recall: number): number {
  return precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0
}

export function scoreVerifier(
  predictions: Map<string, ClaimVerification>,
  gold: GoldRow[],
): Scorecard {
  const rows = gold.filter((g) => g.reviewed)
  const n = rows.length

  const labelledBy: LabelProvenance = {
    byClass: Object.fromEntries(CLASES_DE_FIRMA.map((c) => [c, 0])) as Record<ClaseDeFirma, number>,
    byReviewer: {},
  }
  for (const r of rows) {
    labelledBy.byClass[claseDeFirma(r.reviewer)] += 1
    const who = r.reviewer ?? '(none)'
    labelledBy.byReviewer[who] = (labelledBy.byReviewer[who] ?? 0) + 1
  }

  const predVerdictOf = (id: string): ClaimVerdict => predictions.get(id)?.verdict ?? 'sin-datos'
  const predRefsOf = (id: string): string[] =>
    (predictions.get(id)?.evidence ?? []).map((e) => e.ref)

  // Confusion matrix, accuracy, and the two libel/recall rates.
  const confusion = Object.fromEntries(
    VERDICTS.map((gv) => [gv, Object.fromEntries(VERDICTS.map((pv) => [pv, 0]))]),
  ) as Record<ClaimVerdict, Record<ClaimVerdict, number>>

  let correct = 0
  let falseContra = 0
  let sinDatosDenom = 0
  let falseSinDatos = 0
  for (const r of rows) {
    const pv = predVerdictOf(r.claimId)
    confusion[r.goldVerdict][pv] += 1
    if (pv === r.goldVerdict) correct += 1
    if (pv === 'contradicho' && r.goldVerdict !== 'contradicho') falseContra += 1
    if (r.goldVerdict !== 'sin-datos') {
      sinDatosDenom += 1
      if (pv === 'sin-datos') falseSinDatos += 1
    }
  }

  // Per-verdict precision/recall/F1 from the confusion matrix.
  const perVerdict = {} as Record<ClaimVerdict, VerdictMetrics>
  for (const v of VERDICTS) {
    const tp = confusion[v][v]
    let predTotal = 0 // column sum = times v was predicted
    let goldTotal = 0 // row sum = gold support of v
    for (const gv of VERDICTS) predTotal += confusion[gv][v]
    for (const pv of VERDICTS) goldTotal += confusion[v][pv]
    const precision = predTotal > 0 ? tp / predTotal : 0
    const recall = goldTotal > 0 ? tp / goldTotal : 0
    perVerdict[v] = { precision, recall, f1: f1Of(precision, recall), support: goldTotal }
  }

  // Citation micro precision/recall over rows with gold refs.
  let interSum = 0
  let predSum = 0
  let goldSum = 0
  let rowsWithGoldRefs = 0
  for (const r of rows) {
    if (!r.goldEvidenceRefs || r.goldEvidenceRefs.length === 0) continue
    rowsWithGoldRefs += 1
    const goldSet = new Set(r.goldEvidenceRefs)
    const predSet = new Set(predRefsOf(r.claimId))
    let inter = 0
    for (const ref of predSet) if (goldSet.has(ref)) inter += 1
    interSum += inter
    predSum += predSet.size
    goldSum += goldSet.size
  }
  const cprec = predSum > 0 ? interSum / predSum : 0
  const crec = goldSum > 0 ? interSum / goldSum : 0

  // FEVER-style: correct label AND gold refs ⊆ predicted refs.
  let passes = 0
  for (const r of rows) {
    if (predVerdictOf(r.claimId) !== r.goldVerdict) continue
    if (r.goldEvidenceRefs && r.goldEvidenceRefs.length > 0) {
      const predSet = new Set(predRefsOf(r.claimId))
      if (!r.goldEvidenceRefs.every((ref) => predSet.has(ref))) continue
    }
    passes += 1
  }

  return {
    n,
    labelledBy,
    labelAccuracy: n > 0 ? correct / n : 0,
    perVerdict,
    confusion,
    falseContradichoRate: n > 0 ? falseContra / n : 0,
    falseSinDatosRate: sinDatosDenom > 0 ? falseSinDatos / sinDatosDenom : 0,
    citation: { precision: cprec, recall: crec, f1: f1Of(cprec, crec), rowsWithGoldRefs },
    feverScore: n > 0 ? passes / n : 0,
  }
}

/**
 * The scorecard's provenance lines, for `eval:verifier`. The warning is the
 * point: the June engine's «sin-datos 92.3%» reached /metodologia as
 * «acierta ~92 %» of a hand-labelled sample, and nothing in the scorecard
 * said the labels were a model's.
 */
export function formatLabelProvenance(p: LabelProvenance): string[] {
  const { persona, automatica } = p.byClass
  const total = persona + automatica + p.byClass['no-consta']
  const who = Object.entries(p.byReviewer)
    .map(([reviewer, n]) => `${reviewer} ×${n}`)
    .join(', ')
  const lines = [
    `labelled by: a person ${persona} · a model or process ${automatica} · ` +
      `not stated ${p.byClass['no-consta']}  (${who})`,
  ]
  if (persona === 0) {
    lines.push(
      '⚠ no scored row was labelled by a person — every figure below is ' +
        'agreement with those labels, not accuracy',
    )
  } else if (persona < total) {
    lines.push(
      `⚠ ${total - persona} of ${total} scored rows were not labelled by a person — ` +
        'the figures below mix accuracy with agreement',
    )
  }
  return lines
}

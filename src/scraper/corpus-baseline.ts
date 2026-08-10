/**
 * What changed in the transcript corpus since a human last looked?
 *
 * Re-transcribing is an improvement that breaks things: better text means a
 * published verbatim lifted from the old text may no longer appear in it.
 * Totals hide that — "30 untraceable" reads identically whether it is the same
 * 30 a curator already accepted or a fresh 30 the run that just finished
 * created. The DELTA is the only part anyone has to act on.
 *
 * Pure. `verify-transcript-corpus.sh` owns the files, the baseline write and
 * the exit code; this owns the set arithmetic, which is the part with a wrong
 * answer available. It used to live inside a `node -e` string in that shell
 * script, which meant no test could reach it.
 *
 * ── Two ways a delta lies, both of which it did ─────────────────────────────
 *
 * 1. THE BASELINE NEVER SHRANK. `healed` was printed and then thrown away: the
 *    file on disk was only ever rewritten by an explicit `--baseline`. So the
 *    same recovery was announced as news on every run, for ever. A tick nobody
 *    can act on is the shape of check this repo keeps re-learning to distrust,
 *    so the baseline now heals itself — see `healedBaseline`.
 *
 * 2. THE DEFINITION MOVED UNDER IT. `drifted` used to mean «absent from the
 *    current transcript». Since 8a4ef92 the classifier has three states and
 *    `drifted` means only «absent from BOTH the current and the superseded
 *    text» — the invention question. 22 of the 30 rows written under the old
 *    meaning are `solo-en-sustituida` today: not recovered, just re-filed. The
 *    delta compared them anyway and reported 22 phantom recoveries, because
 *    nothing in the file said which definition wrote it. It does now, and a
 *    baseline stamped with another one is refused rather than mis-compared.
 */
import { PROVENANCE_VERSION, QUOTE_PROVENANCE_STATUS_IDS } from './quote-provenance'

export interface DriftedQuote {
  findingId: string
  quote: string
}

/** The on-disk shape. `version` is the file's, `definition` is the classifier's. */
export interface CorpusBaselineFile {
  _comment?: string
  version: string
  definition: string
  /** ISO instant a human (or a heal) last accepted this list. */
  acceptedAt: string
  drifted: DriftedQuote[]
}

export const BASELINE_VERSION = 'transcript-check-baseline-v2'

/**
 * Which classifier produced the rows in a baseline.
 *
 * DERIVED, not a constant someone has to remember to bump — the bump that was
 * missed is the whole reason this exists. It fingerprints the two things that
 * move the `no-localizada` boundary: the snapshot version and the list of
 * states a quote can land in instead. Add a fourth state and every baseline on
 * disk self-invalidates on the next run, which is the honest failure: «I cannot
 * compare these», not a confident subtraction of two different questions.
 *
 * Long and legible on purpose. A hash would be shorter and would tell a human
 * opening the file nothing about what their rows mean.
 */
export function driftDefinitionId(): string {
  return `${PROVENANCE_VERSION}:${QUOTE_PROVENANCE_STATUS_IDS.join('+')}`
}

/**
 * Did the run that produced `current` actually cotejar anything?
 *
 * Without this, a `check:finding-quotes` that fell over early — an empty
 * findings snapshot, a corpus that is not where it is looked for — emits
 * `drifted: []`, and an empty current set against a populated baseline reads as
 * «everything recovered». That is `r?.findings ?? []` again: a null result is
 * not «found nothing» (`docs/DATA_INTEGRITY.md` rule 2).
 *
 * `sanity` is the run's own verdict on itself, re-used rather than re-derived —
 * `check:finding-quotes` already refuses to believe a pass that matched nothing.
 *
 * Returns the reason as a sentence, or null when the run can carry a delta.
 */
export function runMeasuredNothing(run: {
  checked?: number
  sanity?: string | null
}): string | null {
  if (typeof run?.checked !== 'number' || !Number.isFinite(run.checked) || run.checked <= 0) {
    return 'la pasada no cotejó ni una cita: un conjunto vacío restado de la línea base diría que todo se ha recuperado'
  }
  if (typeof run.sanity === 'string' && run.sanity.length > 0) {
    return `la pasada se declara no fiable — ${run.sanity}`
  }
  return null
}

/**
 * Can this baseline be subtracted from today's run?
 *
 * Returns the reason it cannot, or null. Anything other than null means the
 * caller must print «no lo sé» and stop, never a delta: two lists built by
 * different classifiers subtract to a number that describes neither.
 */
export function baselineIncomparable(
  raw: unknown,
  definition: string = driftDefinitionId(),
): string | null {
  if (raw == null || typeof raw !== 'object') return 'el fichero de línea base no es un objeto'
  const b = raw as Partial<CorpusBaselineFile>
  if (!Array.isArray(b.drifted)) return 'el fichero de línea base no trae una lista `drifted`'
  if (typeof b.definition !== 'string' || b.definition.length === 0) {
    return (
      'la línea base se escribió sin sello de definición, cuando «drift» abarcaba también las ' +
      'citas que sólo constan en la transcripción sustituida — hoy ésas son un estado propio y ' +
      'no una pérdida de rastro'
    )
  }
  if (b.definition !== definition) {
    return `la línea base se escribió bajo «${b.definition}» y ahora rige «${definition}»`
  }
  return null
}

/** The rows of a baseline that is known to be comparable. */
export function baselineRows(raw: unknown): DriftedQuote[] {
  const d = (raw as Partial<CorpusBaselineFile> | null)?.drifted
  return Array.isArray(d) ? d : []
}

/** When a baseline was accepted, for the report. Empty when it never said. */
export function baselineAcceptedAt(raw: unknown): string {
  const a = (raw as Partial<CorpusBaselineFile> | null)?.acceptedAt
  return typeof a === 'string' ? a : ''
}

export interface CorpusDelta {
  /** Untraceable now AND in the baseline — already seen, no action. */
  carried: string[]
  /** Untraceable now but NOT in the baseline — this run broke them. */
  appeared: string[]
  /** In the baseline but traceable again — the run fixed them. */
  healed: string[]
}

/**
 * Identity of a drift.
 *
 * findingId + the head of the quote, because one finding can carry several
 * quotes and only some of them go untraceable. 60 chars is enough to tell two
 * quotes in one finding apart without making the key churn on a trailing-space
 * change — a key that churns turns every re-transcription into a wall of false
 * "appeared", which is how a delta check stops being read.
 */
export function driftKey(d: DriftedQuote): string {
  return `${d.findingId}|${(d.quote ?? '').slice(0, 60)}`
}

export function compareCorpus(current: DriftedQuote[], baseline: DriftedQuote[]): CorpusDelta {
  const now = new Set((current ?? []).map(driftKey))
  const before = new Set((baseline ?? []).map(driftKey))
  return {
    carried: [...now].filter((k) => before.has(k)),
    appeared: [...now].filter((k) => !before.has(k)),
    healed: [...before].filter((k) => !now.has(k)),
  }
}

/**
 * Does this delta need a human?
 *
 * Only `appeared`. A quote that healed is good news and a quote that carried
 * has already been looked at — blocking on either would make the check
 * permanently red and therefore permanently ignored.
 */
export function corpusDeltaBlocks(delta: CorpusDelta): boolean {
  return delta.appeared.length > 0
}

const BASELINE_COMMENT =
  'Las citas publicadas que no constan en NINGUNA transcripción de su sesión —ni la vigente ni la ' +
  'que sustituyó— y que ya se han mirado. `check:corpus` resta esta lista de la pasada del día ' +
  'para avisar sólo de lo NUEVO. Se versiona en git a propósito: gitignorada, CI arrancaría de ' +
  'cero cada noche, escribiría una línea base limpia y no podría fallar nunca. ' +
  'Aceptar el estado actual: `bash scripts/verify-transcript-corpus.sh --baseline`. ' +
  'ENCOGE SOLA (se retira lo que ha vuelto a ser rastreable) y NUNCA CRECE SOLA: admitir una ' +
  'deriva nueva sigue siendo un acto humano. Las citas que sí constan en la transcripción ' +
  'sustituida no viven aquí — son un estado publicado en ' +
  'public/data/finding-quote-provenance.json y una fila en `npm run triage:quote-reanchor`.'

/**
 * The baseline to write back after a run, with the healed rows dropped.
 *
 * SHRINKS ONLY. Removing a row that is traceable again cannot hide anything:
 * if that quote ever goes untraceable a second time it comes back as
 * `appeared` — newly broken, blocking — instead of `carried` and silent. So
 * healing tightens the gate. GROWING it is the opposite act: accepting a drift
 * nobody has looked at, which is what `--baseline` is for and what a human has
 * to type. Keeping the two apart is the whole safety property here.
 */
export function healedBaseline(
  current: DriftedQuote[],
  baseline: DriftedQuote[],
  acceptedAt: string,
): CorpusBaselineFile {
  const now = new Set((current ?? []).map(driftKey))
  return {
    _comment: BASELINE_COMMENT,
    version: BASELINE_VERSION,
    definition: driftDefinitionId(),
    acceptedAt,
    drifted: (baseline ?? []).filter((d) => now.has(driftKey(d))),
  }
}

/** A freshly accepted baseline: this run's state, stamped. Used by `--baseline`. */
export function acceptedBaseline(current: DriftedQuote[], acceptedAt: string): CorpusBaselineFile {
  return {
    _comment: BASELINE_COMMENT,
    version: BASELINE_VERSION,
    definition: driftDefinitionId(),
    acceptedAt,
    drifted: current ?? [],
  }
}

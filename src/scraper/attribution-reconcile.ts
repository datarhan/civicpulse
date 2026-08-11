/**
 * Compare published attributions against the speaker map, and decide what an
 * automated pass is allowed to do about the disagreements.
 *
 * ## The asymmetry is the whole design
 *
 * This may only ever **weaken**. Retracting an attribution says "we no longer
 * claim to know who said this", which takes an assertion about a named person
 * off the site and needs no new evidence to justify. Setting one says "it was
 * them", and that is an assertion — it goes through a curator, because
 * `decideAutomation` puts anything naming an individual in Tier C before it
 * reads a single precision measurement.
 *
 * The map is a second opinion, not an oracle. It is built from one model's
 * reading of the audio; the gates in `speaker-map-validate.ts` make its rows
 * evidence-backed, not infallible. Evidence-backed is enough to stop saying
 * something. It is not enough to start.
 */
import type { SpeakerMap } from './speaker-map'

export type ReconcileVerdict =
  /** Map and published attribution agree. Nothing to do. */
  | 'agrees'
  /** Published a bloc the map contradicts. Retract to null — autonomous. */
  | 'contradicted'
  /** Published nothing; the map has one. ADDITIVE — curator only. */
  | 'additive'
  /** The map does not vouch for this quote either way. */
  | 'unknown'

export interface PublishedQuote {
  findingId: string
  quoteIndex: number
  text: string
  speakerGroup: string | null
}

export interface ReconcileRow {
  findingId: string
  quoteIndex: number
  verdict: ReconcileVerdict
  published: string | null
  fromMap: string | null
  /** True only for `contradicted`. The single autonomous action available. */
  retractable: boolean
  /** True when the map's bloc holds one seat, so naming it names a person. */
  namesIndividual: boolean
}

export interface ReconcileResult {
  rows: ReconcileRow[]
  stats: Record<ReconcileVerdict, number>
}

export interface ReconcileOptions {
  quotes: readonly PublishedQuote[]
  /** From `blocResolverFor` — text → bloc, or null when unvouched. */
  resolveBloc: (verbatim: string) => string | null
  map: SpeakerMap
}

export function reconcileAttributions(opts: ReconcileOptions): ReconcileResult {
  const oneSeat = new Set(
    opts.map.rows.filter((r) => r.namesIndividual && r.bloc).map((r) => r.bloc),
  )
  const rows: ReconcileRow[] = []
  const stats: Record<ReconcileVerdict, number> = {
    agrees: 0,
    contradicted: 0,
    additive: 0,
    unknown: 0,
  }

  for (const q of opts.quotes) {
    const fromMap = opts.resolveBloc(q.text)
    let verdict: ReconcileVerdict
    if (fromMap === null) verdict = 'unknown'
    else if (q.speakerGroup === null) verdict = 'additive'
    else if (q.speakerGroup === fromMap) verdict = 'agrees'
    else verdict = 'contradicted'

    stats[verdict] += 1
    rows.push({
      findingId: q.findingId,
      quoteIndex: q.quoteIndex,
      verdict,
      published: q.speakerGroup,
      fromMap,
      // The ONE autonomous action. Asserted by a unit test, because a later
      // edit widening this line is exactly how an "automated correction" would
      // quietly start naming people.
      retractable: verdict === 'contradicted',
      namesIndividual: Boolean(fromMap && oneSeat.has(fromMap)),
    })
  }

  return { rows, stats }
}

/**
 * The correction a `contradicted` row implies, or null when the row is not one.
 *
 * Returns the exact arguments for `correct-pleno-finding`, and the `corrected`
 * value is hard-coded empty — there is no path through this function that
 * produces a bloc. Callers cannot pass one in.
 */
export function retractionFor(
  row: ReconcileRow,
  map: SpeakerMap,
): { field: string; corrected: string; reason: string } | null {
  if (!row.retractable) return null
  const evidence = map.rows.find((r) => r.bloc === row.fromMap && !r.weak)?.evidence[0]
  const cite = evidence
    ? `la grabación acredita ${row.fromMap} en el segundo ${Math.round(evidence.at)} («${evidence.quote}»)`
    : `el mapa de hablantes acredita ${row.fromMap}`
  return {
    field: `quote.${row.quoteIndex}.speakerGroup`,
    // Empty, always. Retraction is the only automated outcome.
    corrected: '',
    reason:
      `Atribución retirada: se publicó como ${row.published} y ${cite}. ` +
      `Se retira la atribución en vez de corregirla: afirmar quién habló nombra a ` +
      `una persona y eso lo decide un curador.`,
  }
}

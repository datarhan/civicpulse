/**
 * Who sits in the corporación, and how many seats each bloc holds.
 *
 * ## Why this is a module and not two copies
 *
 * Two callers need the composition and they MUST agree. Production
 * (`scripts/extract-pleno-claims.ts`) puts it in the extractor's prompt so the
 * model knows which blocs exist; the eval (`scripts/eval-extractor.ts`) has to
 * reproduce production exactly, or it is scoring a different pipeline than the
 * one that ships.
 *
 * The eval used to carry a hand-copied literal of the five blocs. That is
 * `DATA_INTEGRITY.md` rule 1 — a test that restates a shape instead of
 * importing it stays green while production drifts — and it is the single
 * most expensive defect class in this repo's history. One import, one source.
 */
import { findPartiesInText } from '../lib/party-alias'

export interface OfficialLike {
  slug: string
  name: string
  party: string
}

export interface OfficialsDoc {
  officials?: OfficialLike[]
  /** Published seat count per bloc. Authoritative when present. */
  composition?: Record<string, number>
}

export interface BlocSeats {
  bloc: string
  seats: number
}

/**
 * Seats per bloc, preferring the snapshot's own `composition` block and
 * falling back to counting the roster.
 *
 * `composition` wins because it is what the council publishes; the roster can
 * lag a resignation. A bloc carried at zero seats stays in the result — this
 * function reports the composition, it does not editorialise it.
 */
export function seatsFromOfficials(doc: OfficialsDoc): BlocSeats[] {
  if (doc.composition) {
    return Object.entries(doc.composition).map(([bloc, seats]) => ({ bloc, seats }))
  }
  const counts = new Map<string, number>()
  for (const o of doc.officials ?? []) {
    counts.set(o.party, (counts.get(o.party) ?? 0) + 1)
  }
  return [...counts.entries()].map(([bloc, seats]) => ({ bloc, seats }))
}

/**
 * Blocs holding exactly one seat.
 *
 * Tagging a quote with such a bloc **names that councillor by elimination**,
 * so it is individual attribution however it is labelled. In Riba-roja that is
 * VOX, EU-Podem and Compromís — three of five groups — which means CLAUDE.md's
 * "bloc-level is the safe floor" is not a floor for most of the opposition.
 * Callers route these through `decideAutomation({ namesIndividual: true })`.
 *
 * Zero-seat blocs are excluded: naming a bloc nobody holds identifies nobody.
 */
export function singleSeatBlocs(seats: readonly BlocSeats[]): string[] {
  return seats.filter((s) => s.seats === 1).map((s) => s.bloc)
}

/**
 * The one-seat blocs of a roster document, or `null` when the document holds
 * nothing to derive them from.
 *
 * The two answers must not collapse. With `officials.json` missing,
 * `seatsFromOfficials` returns `[]`, `singleSeatBlocs([])` returns `[]`, and a
 * caller asking "does this name anyone by elimination?" hears "no" — the
 * `r?.findings ?? []` defect, a gate that prints its own all-clear
 * (DATA_INTEGRITY rule 2). Unknown is `null`, and a caller deciding what may
 * publish fails closed on it.
 */
export function oneSeatBlocsOf(doc: OfficialsDoc | null | undefined): string[] | null {
  const seats = seatsFromOfficials(doc ?? {})
  return seats.length === 0 ? null : singleSeatBlocs(seats)
}

/** The parts of a finding, or a draft of one, that can attribute or name a group. */
export interface AttributableLike {
  quotes?: ReadonlyArray<{ speakerGroup?: string | null }>
  title?: string
  summary?: string
}

/**
 * Every one-seat bloc a finding attributes something to or names, once each,
 * in order of appearance: quote labels first, then the title and the summary.
 *
 * The prose counts as much as the labels. A synthesiser that never sees the
 * label can still write «Vox se compromete…» from a verbatim that says «el
 * compromiso de Vox», and the chair calls the groups by other names —
 * «Esquerra Unida» is EU-Podem — so the prose is read through
 * `findPartiesInText`, the same alias table the speaker map is checked with.
 */
export function singleSeatAttributions(
  draft: AttributableLike,
  oneSeat: readonly string[],
): string[] {
  const found: string[] = []
  const add = (bloc: string | null | undefined) => {
    if (bloc && oneSeat.includes(bloc) && !found.includes(bloc)) found.push(bloc)
  }
  for (const q of draft.quotes ?? []) add(q.speakerGroup)
  for (const prose of [draft.title, draft.summary]) {
    for (const party of findPartiesInText(prose ?? '')) add(party)
  }
  return found
}

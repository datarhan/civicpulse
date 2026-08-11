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

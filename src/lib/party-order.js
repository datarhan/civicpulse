// @ts-check
/**
 * Reading order of the parties in the composition bar, and the pure function
 * that turns a `composition` map into painted items.
 *
 * It used to live inline in `CompositionBar` and was hand-copied into
 * `tests/parse-composition-bar.test.ts` — a restated shape that could drift
 * from the component while the test stayed green (DATA_INTEGRITY rule 1). Now
 * both import it from here.
 *
 * The known parties fix the order; anything else in the snapshot is APPENDED
 * rather than dropped. A hard-coded allow-list once erased EU-Podem — a party
 * holding a real seat — so the bar painted 20 escaños under a label reading
 * «Total 21». A party that wins a seat must never depend on someone
 * remembering to add it here.
 */
export const PARTY_ORDER = ['PSOE', 'PP', 'VOX', 'Compromís', 'Ciudadanos', 'EU-Podem', 'Otro']

/**
 * @param {Record<string, number>} composition
 * @returns {Array<{ p: string, n: number }>}
 */
export function barItems(composition) {
  const known = PARTY_ORDER.filter((p) => composition[p])
  const rest = Object.keys(composition)
    .filter((p) => composition[p] && !PARTY_ORDER.includes(p))
    .sort((a, b) => composition[b] - composition[a])
  return [...known, ...rest].map((p) => ({ p, n: composition[p] }))
}

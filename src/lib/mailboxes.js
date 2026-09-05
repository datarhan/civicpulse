// @ts-check
/**
 * Which published addresses are a person's, and which are a counter.
 *
 * `officials.json` gives every sitting member an `email`, but most of them are
 * the same address: eleven share the alcaldía's and six the PP group's Gmail.
 * Printed bare under a face, a shared counter reads as that person's direct
 * line — a reader writes to it expecting them.
 *
 * Nothing here decides which mailboxes are shared: it COUNTS the roster. The
 * day the council publishes individual addresses, every row turns personal on
 * its own and the label disappears without anyone editing a list. A hand-kept
 * list of «known shared mailboxes» is the sentinel trap this repo keeps paying
 * for — it goes stale the moment the source moves.
 *
 * @param {Array<{slug: string, email?: string|null}>|null|undefined} officials
 * @returns {Map<string, {email: string, compartido: boolean, n: number}>}
 *   Keyed by slug. A member the source gives no address is ABSENT from the map,
 *   never present with an empty string: "not published" is not a mailbox.
 */
export function mailboxKinds(officials) {
  const rows = (officials ?? []).filter((o) => o && typeof o.email === 'string' && o.email.trim())
  const cuenta = new Map()
  for (const o of rows) {
    const email = o.email.trim().toLowerCase()
    cuenta.set(email, (cuenta.get(email) ?? 0) + 1)
  }
  const out = new Map()
  for (const o of rows) {
    const n = cuenta.get(o.email.trim().toLowerCase()) ?? 1
    out.set(o.slug, { email: o.email, compartido: n > 1, n })
  }
  return out
}

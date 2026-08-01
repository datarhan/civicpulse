// @ts-check
/**
 * Find an official's own biographic PDF in the transparency-portal index.
 *
 * Every `officials[].cvUrl` is byte-identical — one generic portal landing
 * page — while `transparency-docs.json` holds 18 per-person documents titled
 * "Dades biogràfiques <Nombre>" and served as, e.g.,
 * `…/filesGroup/PSOE-Robert-Raga-Gadea.pdf`. The two were never joined, so the
 * primary document about each councillor sat one click away from nobody.
 *
 * Matching is strict, and for the same reason the voice-id work is: the title
 * must contain the councillor's given name AND at least one surname, and it
 * must resolve to exactly ONE official across the whole roster. A corporation
 * with five Josés and two Rafaels punishes anything looser, and linking the
 * wrong person's CV from their page is a factual error about who they are.
 */
const fold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

const hasToken = (haystack, token) =>
  new RegExp(`(^|[^\\p{L}])${token}([^\\p{L}]|$)`, 'u').test(haystack)

/**
 * Does this document title name exactly this official?
 *
 * Spanish names are `given name(s) + two surnames`, so the SURNAMES are the
 * last two tokens — not everything after the first. Splitting naively made
 * "Luis" a surname, and the title "Dades biogràfiques José Luis Ramos" then
 * matched José Luis Fernández Santamaría as well, which the ambiguity guard
 * (correctly) resolved by refusing both.
 */
export function titleNamesOfficial(title, official) {
  const t = fold(title)
  if (!t) return false
  const parts = fold(official?.name).split(/\s+/).filter(Boolean)
  if (parts.length < 2) return false
  const surnames = parts.length >= 3 ? parts.slice(-2) : parts.slice(-1)
  const givens = parts.slice(0, parts.length - surnames.length)
  return givens.some((g) => hasToken(t, g)) && surnames.some((s) => hasToken(t, s))
}

/**
 * The CV document for this official, or null.
 * Returns null when the title matches more than one councillor — ambiguity is
 * resolved by refusing, never by picking the first.
 */
export function cvDocForOfficial(docsSnapshot, official, roster) {
  const docs = (docsSnapshot?.docs ?? []).filter(
    (d) => d?.category === 'cv' && d?.url && (d?.label || d?.title),
  )
  for (const d of docs) {
    const title = d.label || d.title
    if (!titleNamesOfficial(title, official)) continue
    // Guard against a title that would fit several councillors.
    const alsoMatches = (roster ?? []).filter((o) => titleNamesOfficial(title, o))
    if (alsoMatches.length !== 1) continue
    return { url: d.url, title }
  }
  return null
}

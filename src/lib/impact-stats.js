/**
 * Pure impact-metrics summarizer for the /nosotros transparency page.
 * Takes the raw snapshot objects the existing hooks return and reduces
 * them to the headline counters. Tolerates missing/partial snapshots
 * (every page hook starts as null while loading).
 */
export function summarizeImpact({ plenos, findings, quejas, tenders } = {}) {
  const findingItems = findings?.items ?? []
  const lastFindingAt = findingItems.reduce(
    (max, it) => (it?.publishedAt && it.publishedAt > max ? it.publishedAt : max),
    '',
  )
  return {
    plenosCount: plenos?.items?.length ?? 0,
    findingsCount: findingItems.length,
    quejasCount: quejas?.items?.length ?? 0,
    contractsCount: tenders?.contracts?.length ?? 0,
    lastFindingAt: lastFindingAt || null,
  }
}

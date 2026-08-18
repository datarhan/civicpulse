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
    // Los ADJUDICADOS, no las filas del snapshot. El total incluye anulados,
    // revocados y desistidos, y bajo el rótulo «contratos indexados» de una
    // página que habla del impacto del medio se leía como contratos realmente
    // adjudicados: ~15 % de más. Es el mismo arreglo que /datos ya llevaba
    // («N adjudicados · M expedientes») y que a esta página no llegó. Sin
    // `stats`, mejor no decir un número que decir el que infla.
    contractsCount: tenders?.stats?.awardedContracts ?? null,
    contractsRows: tenders?.stats?.totalContracts ?? tenders?.contracts?.length ?? 0,
    lastFindingAt: lastFindingAt || null,
  }
}

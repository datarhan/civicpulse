// @ts-check
/**
 * Honest headline scalars for /laboratorio, derived from the loaded snapshots.
 * Pure — no I/O; `now` is injected for deterministic tests.
 *
 * The lab *monitors* far more headlines than it *audits*. Trust indicators
 * (has-date, is-local, cross-outlet) are deterministic and computed for every
 * in-window article, whereas an "audit" requires an LLM-extracted claim that
 * has been verified against municipal data. Conflating the two overstates the
 * work done — a page reading "70 auditados / 0% verificado" is self-
 * contradictory. These fields keep the two counts distinct, and leave the
 * ratios null (→ rendered "—") when there is nothing to divide.
 */
const WINDOW_DAYS = 30

export function pressLabSummary({ press = [], verified = [] } = {}, now = Date.now()) {
  const cutoffMs = now - WINDOW_DAYS * 24 * 60 * 60 * 1000
  const inWindow = press.filter((p) => {
    const t = Date.parse(p?.date)
    return Number.isFinite(t) && t >= cutoffMs
  })

  const auditedIds = new Set()
  let verificado = 0
  let contradicho = 0
  for (const row of verified) {
    const id = row?.claim?.articleId
    if (id) auditedIds.add(id)
    const v = row?.verification?.verdict
    if (v === 'verificado') verificado += 1
    else if (v === 'contradicho') contradicho += 1
  }

  const totalClaims = verified.length
  return {
    windowDays: WINDOW_DAYS,
    monitoredCount: inWindow.length, // headlines tracked in the rolling window
    // Artículos con ≥1 afirmación ANALIZADA, sea cual sea su veredicto. El
    // comentario decía «with ≥1 verified claim» y la etiqueta de /laboratorio
    // repetía lo mismo, pero `auditedIds` mete el articleId de toda fila del
    // corpus sin mirar `verdict`. Con un artículo, una claim y cero
    // verificadas, la página decía «1 · con ≥1 afirmación verificada» justo
    // encima de «TASA DE VERIFICACIÓN 0% · 0 de 1». Se contradecía sola en la
    // misma pantalla.
    auditedCount: auditedIds.size,
    totalClaims,
    verificadoClaims: verificado,
    contradichoClaims: contradicho,
    verificadoRatio: totalClaims === 0 ? null : verificado / totalClaims,
    contradichoRatio: totalClaims === 0 ? null : contradicho / totalClaims,
    hasEditorialContent: totalClaims > 0,
  }
}

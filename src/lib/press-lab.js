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
  // Ninguna fila ha llegado a un veredicto que se pueda contar: ni confirmada
  // ni desmentida. `sin-datos` y `parcial` no resuelven nada que dividir.
  const sinResolver = verificado + contradicho === 0
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
    // La tasa de VERIFICACIÓN se queda en 0: «0 de 63 verificadas» es una
    // cobertura, y es verdad. Quien la lee concluye exactamente lo que pasa —
    // que no se ha verificado nada. No hay nada que arreglar ahí, y
    // `tests/press-lab.js` lo fija a propósito.
    verificadoRatio: totalClaims === 0 ? null : verificado / totalClaims,
    // La de DISCREPANCIA no es una cobertura, es un hallazgo, y ahí el 0
    // miente: «0 %» se lee «hemos mirado y no hay discrepancias» cuando lo
    // cierto es «no se ha mirado». Sin una sola fila resuelta, la tasa no vale
    // 0, no existe.
    contradichoRatio: sinResolver ? null : contradicho / totalClaims,
    // «Hay contenido editorial» no es «hay filas»: es «hay veredictos
    // resueltos». Con `totalClaims > 0` no podía dispararse sobre un corpus
    // lleno de `sin-datos`, que es exactamente el estado de hoy — 63 de 63
    // filas sin resolver — y la página publicaba «TASA DE DISCREPANCIA 0 %»
    // al lado de «TASA DE VERIFICACIÓN 0 %» sobre las mismas 63.
    //
    // Un 0 % de discrepancia sobre un corpus que nadie ha examinado no
    // significa «no hay discrepancias», significa «no se ha mirado». Es el
    // cero-que-es-un-centinela otra vez, y el aviso que existe para decirlo
    // —«Extracción pendiente»— estaba apagado justo cuando hacía falta.
    //
    // El recuento no se pierde: sigue en el pie de cada tarjeta («0 de 63
    // claims»), que es una cobertura y sí es un hecho.
    hasEditorialContent: !sinResolver,
  }
}

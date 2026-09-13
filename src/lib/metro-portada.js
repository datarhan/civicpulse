// @ts-check
/**
 * Qué horario del metro publica la portada: el que está EN VIGOR, no el que
 * conteste primero.
 *
 * Hay dos fuentes y no son intercambiables. El GTFS estático de FGV
 * —`public/data/metro-schedule.json`, que `useMetroSchedule` sirve por
 * `findNext(slug, now)`— se regenera cada noche y sigue declarando
 * `validThrough: 2025-12-31`, porque FGV no ha republicado el feed. La tabla
 * transcrita a mano de fgv.es —`useNextMetro`— declara `validUntil: 2026-12-31`
 * y es la que rige hoy. La cabecera hacía `gtfs ? gtfs : transcripcion`, así que
 * publicaba la caducada por el mero hecho de responder, y debajo imprimía «FGV
 * no ha republicado»: las salidas de un horario y el descargo de otro.
 *
 * De ahí las reglas, en este orden:
 *
 *   1. Si alguna está en vigor a `ahora`, manda ésa. Entre dos en vigor manda el
 *      GTFS, que es el dato de la fuente y no una transcripción nuestra.
 *   2. Si ninguna lo está, se publica la menos vieja como REFERENCIA. Un horario
 *      caducado sigue siendo útil —los trenes no cambian todos los años— pero no
 *      puede anunciarse como vigente.
 *   3. Una validez ilegible o ausente no es vigencia. `new Date('pronto')` es
 *      Invalid Date y toda comparación con NaN da false, así que un «¿caducó?»
 *      escrito al revés colaría cualquier cosa como buena.
 *   4. Sin ninguna fuente utilizable, `null`. Ausencia no es cero: la cabecera
 *      prefiere no pintar el chip a pintar una salida que no puede sostener.
 *
 * Ninguna de las dos es tiempo real, y aquí no hay campo que lo sugiera: FGV no
 * publica una API libre de llegadas. El campo `isRealtime` que arrastraba la
 * cabecera se va con esto.
 *
 * La aritmética de las salidas no vive aquí: la tabla transcrita la fija
 * `tests/parse-next-metro.test.ts` y el GTFS lo normaliza `findNext` —incluido el
 * `+` de las salidas de después de medianoche, como «00:17+»—. Esto sólo elige
 * entre dos respuestas ya hechas.
 *
 * Pendiente de converger: `LiveCity/popups/GtfsSchedulePopup.jsx` decide lo mismo
 * por su cuenta (`expired`, y su propio «horario {año} (referencia)»). Son dos
 * sitios para una sola regla, que es como en este repo se queda una rancia. El
 * mapa es otra superficie con sus propias pruebas, así que la mudanza va aparte.
 */

/** En vigor a la hora de mirar, o publicado como referencia declarada. */
export const VIGENCIA = /** @type {const} */ ({
  enVigor: 'enVigor',
  referencia: 'referencia',
})

/** Los milisegundos de una fecha de validez, o null si no se puede leer. */
function finDeVigencia(valor) {
  if (typeof valor !== 'string') return null
  const t = new Date(valor).getTime()
  return Number.isFinite(t) ? t : null
}

/**
 * El GTFS reducido a la salida que la portada publica: L9 hacia València desde
 * el término de Riba-roja. Sin esa dirección no hay fuente — está bien formado y
 * no trae el dato, que es ausencia, no un dato vacío.
 */
function candidatoGtfs(gtfs) {
  const salida = (gtfs?.departures ?? []).find((d) => d?.line === 'L9' && d?.heading === 'València')
  if (!salida) return null
  return {
    origen: 'gtfs',
    stationName: gtfs?.stop?.label ?? 'Riba-roja de Túria',
    departureLabel: salida.label,
    minutesAway: salida.minutesAway,
    afterMidnight: !!salida.afterMidnight,
    heading: salida.heading,
    validoHasta: typeof gtfs?.validThrough === 'string' ? gtfs.validThrough : null,
    hasta: finDeVigencia(gtfs?.validThrough),
    // La procedencia sale del propio fichero, no de una copia escrita aquí.
    fuente: gtfs?.source?.feed ?? null,
    fuenteUrl: gtfs?.source?.url ?? null,
  }
}

/** La transcripción, tal y como la devuelve `useNextMetro()`. */
function candidatoTranscripcion(t) {
  if (!t || typeof t.departureLabel !== 'string') return null
  return {
    origen: 'transcripcion',
    stationName: t.stationName,
    departureLabel: t.departureLabel,
    minutesAway: t.minutesAway,
    afterMidnight: !!t.afterMidnight,
    heading: t.heading || 'València',
    validoHasta: typeof t.scheduleValidUntil === 'string' ? t.scheduleValidUntil : null,
    hasta: finDeVigencia(t.scheduleValidUntil),
    fuente: t.scheduleSource ?? null,
    fuenteUrl: null,
  }
}

/**
 * @param {{gtfs: any, transcripcion: any, ahora?: Date}} entrada
 * @returns {null | {origen: string, vigencia: string, stationName: string,
 *   departureLabel: string, minutesAway: number, afterMidnight: boolean,
 *   heading: string, validoHasta: string|null, fuente: string|null,
 *   fuenteUrl: string|null}}
 */
export function metroDeLaPortada({ gtfs, transcripcion, ahora = new Date() }) {
  const t = ahora.getTime()
  // El GTFS primero en los dos desempates: en vigor manda por ser la fuente, y
  // caducado empata por fecha, no por preferencia.
  const candidatos = [candidatoGtfs(gtfs), candidatoTranscripcion(transcripcion)].filter(Boolean)
  if (!candidatos.length) return null

  const enVigor = candidatos.filter((c) => c.hasta != null && c.hasta >= t)
  const elegido = enVigor.length
    ? enVigor[0]
    : [...candidatos].sort((a, b) => (b.hasta ?? -Infinity) - (a.hasta ?? -Infinity))[0]

  const { hasta, ...publicable } = elegido
  return {
    ...publicable,
    vigencia: hasta != null && hasta >= t ? VIGENCIA.enVigor : VIGENCIA.referencia,
  }
}

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
 * publica una API libre de llegadas. (El `isRealtime` que arrastraba la cabecera
 * ya no existía cuando se escribió esto: se fue en el PR anterior. La prueba que
 * lo vigila es una fianza de política, no la red de un defecto vivo, y conviene
 * saber cuál de las dos cosas es.)
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

/**
 * Los milisegundos en que CADUCA una validez, o null si no se puede leer.
 *
 * Una fecha sin hora —«2026-12-31»— la lee `Date` como medianoche UTC, así que en
 * Madrid ese día quedaba «no vigente» desde la 01:00: veintitrés horas de un día
 * que todavía valía. Una validez por días vale hasta el final del día, no hasta
 * su principio.
 */
function finDeVigencia(valor) {
  if (typeof valor !== 'string') return null
  const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(valor)
  const t = new Date(soloFecha ? `${valor}T23:59:59` : valor).getTime()
  return Number.isFinite(t) ? t : null
}

/**
 * ¿Vale esta validez a esta hora?
 *
 * Exportada porque el globo de estación del mapa tiene que preguntar LO MISMO.
 * Mientras lo decidía por su cuenta —«si el GTFS contesta, el GTFS»— la cabecera
 * publicaba el horario en vigor y el globo al que ella misma manda al lector
 * seguía sirviendo el GTFS de 2025: a las 22:55 de un laborable, 22:51 arriba y
 * 23:02 en el mapa. Una sola regla y un solo sitio donde vive.
 */
export function estaEnVigor(validez, ahora = new Date()) {
  const hasta = finDeVigencia(validez)
  return hasta != null && hasta >= ahora.getTime()
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
  }
}

/**
 * @param {{gtfs: any, transcripcion: any, ahora?: Date}} entrada
 * @returns {null | {origen: string, vigencia: string, stationName: string,
 *   departureLabel: string, minutesAway: number, afterMidnight: boolean,
 *   heading: string, validoHasta: string|null}}
 */
export function metroDeLaPortada({ gtfs, transcripcion, ahora = new Date() }) {
  // El GTFS primero en los dos desempates: en vigor manda por ser la fuente, y
  // caducado empata por fecha, no por preferencia.
  const candidatos = [candidatoGtfs(gtfs), candidatoTranscripcion(transcripcion)].filter(Boolean)
  if (!candidatos.length) return null

  // La vigencia se PREGUNTA a `estaEnVigor`; no se recalcula aquí. Tenerla dos
  // veces en el mismo fichero es la misma trampa que tenerla en dos ficheros, y se
  // vio: una mutación que hacía al predicado devolver siempre `true` sobrevivía a
  // todas las pruebas de este módulo, porque ninguna pasaba por él — y el globo de
  // estación del mapa sí pasa.
  const enVigor = candidatos.filter((c) => estaEnVigor(c.validoHasta, ahora))
  const elegido = enVigor.length
    ? enVigor[0]
    : [...candidatos].sort((a, b) => (b.hasta ?? -Infinity) - (a.hasta ?? -Infinity))[0]

  const { hasta, ...publicable } = elegido
  return {
    ...publicable,
    vigencia: estaEnVigor(elegido.validoHasta, ahora) ? VIGENCIA.enVigor : VIGENCIA.referencia,
  }
}

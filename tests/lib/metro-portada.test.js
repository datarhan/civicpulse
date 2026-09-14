/**
 * Qué horario del metro publica la portada, y por qué ese.
 *
 * Hay dos fuentes y la portada elegía mal. `useMetroSchedule` lee el GTFS de FGV
 * —`public/data/metro-schedule.json`—, que se regenera cada noche y sigue
 * declarando `validThrough: 2025-12-31`: caducó hace meses porque FGV no ha
 * republicado el feed. `useNextMetro` es la tabla transcrita a mano de fgv.es,
 * con `validUntil: 2026-12-31`, que es la que está EN VIGOR. La cabecera hacía
 * `gtfs ? gtfs : transcripcion`, o sea que prefería la caducada por el mero
 * hecho de que contestara, y encima imprimía debajo «FGV no ha republicado».
 *
 * Así que la regla no es «la que responda» sino «la que esté en vigor a la hora
 * de mirar». Y cuando ninguna lo está, se publica la que haya diciéndolo: un
 * horario de referencia es útil, pero no puede anunciarse como vigente.
 *
 * Lo que este fichero NO comprueba: la aritmética de las salidas. Eso ya lo fija
 * `tests/parse-next-metro.test.ts` sobre la tabla transcrita, y copiarlo aquí
 * sería la trampa de siempre —una prueba que repite una forma en vez de
 * importarla— con dos sitios donde equivocarse.
 */
import { describe, expect, it } from 'vitest'

import { estaEnVigor, metroDeLaPortada, VIGENCIA } from '../../src/lib/metro-portada'

/** El GTFS tal y como lo devuelve `findNext(slug, now)`. */
const gtfs = (validThrough, salidas = [{ line: 'L9', heading: 'València' }]) => ({
  validThrough,
  source: { feed: 'Metrovalencia (FGV) GTFS static' },
  departures: salidas.map((s) => ({
    label: '12:21',
    minutesAway: 7,
    afterMidnight: false,
    ...s,
  })),
})

/** La transcripción, tal y como la devuelve `useNextMetro()`. */
const transcrito = (validUntil = '2026-12-31') => ({
  stationName: 'Riba-roja de Túria',
  departureLabel: '12:23',
  minutesAway: 9,
  afterMidnight: false,
  heading: 'València',
  scheduleValidUntil: validUntil,
})

const AHORA = new Date('2026-09-13T12:14:00+02:00')

describe('metroDeLaPortada · elige por vigencia, no por quién contesta', () => {
  it('con el GTFS caducado y la transcripción en vigor, manda la transcripción', () => {
    // El caso de hoy mismo, y el defecto que estaba publicado: el GTFS contesta
    // 37 salidas laborables y su validez expiró el 31-12-2025.
    const r = metroDeLaPortada({
      gtfs: gtfs('2025-12-31'),
      transcripcion: transcrito('2026-12-31'),
      ahora: AHORA,
    })
    expect(r.origen).toBe('transcripcion')
    expect(r.vigencia).toBe(VIGENCIA.enVigor)
    expect(r.departureLabel).toBe('12:23')
    expect(r.validoHasta).toBe('2026-12-31')
  })

  it('con el GTFS en vigor, manda el GTFS: es el dato de la fuente', async () => {
    // El control. Sin esto, «gana la transcripción» lo cumpliría un selector que
    // ignorara el GTFS siempre, y el día que FGV republique seguiríamos leyendo
    // una tabla escrita a mano.
    const r = metroDeLaPortada({
      gtfs: gtfs('2027-06-30'),
      transcripcion: transcrito('2026-12-31'),
      ahora: AHORA,
    })
    expect(r.origen).toBe('gtfs')
    expect(r.vigencia).toBe(VIGENCIA.enVigor)
    expect(r.departureLabel).toBe('12:21')
  })

  it('si las dos están en vigor, sigue mandando el GTFS', () => {
    const r = metroDeLaPortada({
      gtfs: gtfs('2026-12-31'),
      transcripcion: transcrito('2026-12-31'),
      ahora: AHORA,
    })
    expect(r.origen).toBe('gtfs')
  })

  it('con las dos caducadas publica la menos vieja, y lo DICE', () => {
    const r = metroDeLaPortada({
      gtfs: gtfs('2025-12-31'),
      transcripcion: transcrito('2024-12-31'),
      ahora: AHORA,
    })
    expect(r.origen).toBe('gtfs')
    expect(r.vigencia).toBe(VIGENCIA.referencia)
    // Un horario de referencia es útil; anunciarlo como vigente, no.
    expect(r.validoHasta).toBe('2025-12-31')
  })

  it('con las dos caducadas manda la MENOS vieja, aunque sea la transcripción', () => {
    // El caso que llega el 1 de enero de 2027 y que ninguna de las pruebas de
    // arriba veía: las dos caducadas, y la más reciente es la transcripción.
    // Todas las demás esperan el GTFS, que además es el PRIMER candidato, así que
    // «devuelve el primero» —sin ordenar por fecha— las pasaba todas. Esto es lo
    // que lo mata, y describe el estado de producción dentro de tres meses.
    const r = metroDeLaPortada({
      gtfs: gtfs('2025-12-31'),
      transcripcion: transcrito('2026-12-31'),
      ahora: new Date('2027-01-02T12:00:00+01:00'),
    })
    expect(r.origen).toBe('transcripcion')
    expect(r.vigencia).toBe(VIGENCIA.referencia)
    expect(r.validoHasta).toBe('2026-12-31')
  })

  it('una validez por días vale hasta el final del día, no hasta su principio', () => {
    // `new Date('2026-12-31')` es medianoche UTC, así que en Madrid el día 31
    // quedaba «no vigente» desde la 01:00: veintitrés horas de un día que valía.
    const r = metroDeLaPortada({
      gtfs: gtfs('2025-12-31'),
      transcripcion: transcrito('2026-12-31'),
      ahora: new Date('2026-12-31T18:00:00+01:00'),
    })
    expect(r.origen).toBe('transcripcion')
    expect(r.vigencia).toBe(VIGENCIA.enVigor)
  })

  it('nunca dice «tiempo real»: ninguna de las dos lo es', () => {
    for (const caso of [
      { gtfs: gtfs('2027-01-01'), transcripcion: transcrito() },
      { gtfs: gtfs('2025-12-31'), transcripcion: transcrito() },
    ]) {
      const r = metroDeLaPortada({ ...caso, ahora: AHORA })
      expect(r).not.toHaveProperty('isRealtime')
      expect(JSON.stringify(r)).not.toMatch(/realtime|tiempo real/i)
    }
  })
})

describe('estaEnVigor · la regla, a solas', () => {
  // Se prueba aparte porque el globo de estación del mapa la usa sin pasar por el
  // selector: es la única forma de que el mapa y la cabecera no vuelvan a decidir
  // cada uno por su cuenta. Y porque una mutación que la hacía devolver siempre
  // `true` sobrevivía a todo lo de arriba mientras el selector se la saltaba.
  const AHORA_2026 = new Date('2026-09-14T12:00:00+02:00')

  it('una fecha futura está en vigor', () => {
    expect(estaEnVigor('2027-06-30', AHORA_2026)).toBe(true)
  })

  it('una fecha pasada no lo está', () => {
    expect(estaEnVigor('2025-12-31', AHORA_2026)).toBe(false)
  })

  it('el ÚLTIMO día vale entero, no hasta su medianoche UTC', () => {
    // `new Date('2026-09-14')` es medianoche UTC: a las 18:00 de Madrid el día
    // seguía valiendo y esto decía que no. Veintitrés horas mal por cada validez.
    expect(estaEnVigor('2026-09-14', new Date('2026-09-14T18:00:00+02:00'))).toBe(true)
    expect(estaEnVigor('2026-09-14', new Date('2026-09-15T00:30:00+02:00'))).toBe(false)
  })

  it('una validez ilegible o ausente no está en vigor', () => {
    for (const malo of ['pronto', '', null, undefined, 20261231]) {
      expect(estaEnVigor(malo, AHORA_2026), `«${String(malo)}» no es una fecha`).toBe(false)
    }
  })

  it('una marca con hora se respeta tal cual', () => {
    expect(estaEnVigor('2026-09-14T13:00:00+02:00', AHORA_2026)).toBe(true)
    expect(estaEnVigor('2026-09-14T11:00:00+02:00', AHORA_2026)).toBe(false)
  })
})

describe('metroDeLaPortada · ausencia, no cero', () => {
  it('sin ninguna fuente devuelve null, no un hueco con forma de salida', () => {
    expect(metroDeLaPortada({ gtfs: null, transcripcion: null, ahora: AHORA })).toBeNull()
  })

  it('un GTFS sin salida hacia València no cuenta como fuente', () => {
    // 200 y bien formado, pero sin la dirección que la portada publica. Eso es
    // ausencia de dato, no un dato vacío.
    const r = metroDeLaPortada({
      gtfs: gtfs('2027-01-01', [{ line: 'L9', heading: 'Riba-roja' }]),
      transcripcion: transcrito('2026-12-31'),
      ahora: AHORA,
    })
    expect(r.origen).toBe('transcripcion')
  })

  it('una validez ilegible no se lee como vigente', () => {
    // `new Date('pronto')` es Invalid Date, y comparar con NaN da siempre false:
    // un «caducado?» mal escrito colaría el horario como bueno.
    const r = metroDeLaPortada({
      gtfs: gtfs('pronto'),
      transcripcion: transcrito('2026-12-31'),
      ahora: AHORA,
    })
    expect(r.origen).toBe('transcripcion')
  })

  it('sin fecha de validez tampoco se presume vigente', () => {
    const r = metroDeLaPortada({
      gtfs: gtfs(undefined),
      transcripcion: transcrito('2026-12-31'),
      ahora: AHORA,
    })
    expect(r.origen).toBe('transcripcion')
  })

  it('una validez ilegible no adelanta a una ausente: sigue mandando el GTFS', () => {
    // Este caso lo encontró una mutación que sobrevivió a las nueve pruebas de
    // arriba: leer una fecha ilegible como el epoch en vez de como «no hay
    // fecha» la coloca POR DELANTE de la que no declara nada, y entonces la
    // portada cambia de fuente publicada por una errata en el feed. Ninguna de
    // las dos está en vigor; el desempate es por fecha, y ni «pronto» ni la
    // ausencia son una fecha.
    const r = metroDeLaPortada({
      gtfs: gtfs(undefined),
      transcripcion: transcrito('pronto'),
      ahora: AHORA,
    })
    expect(r.origen).toBe('gtfs')
    expect(r.vigencia).toBe(VIGENCIA.referencia)
  })

  it('y si la única fuente no declara validez, se publica como referencia', () => {
    const r = metroDeLaPortada({
      gtfs: gtfs(undefined),
      transcripcion: null,
      ahora: AHORA,
    })
    expect(r.origen).toBe('gtfs')
    expect(r.vigencia).toBe(VIGENCIA.referencia)
    expect(r.validoHasta).toBeNull()
  })
})

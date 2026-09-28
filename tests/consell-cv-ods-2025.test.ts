import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseConsellTable, type ConsellEntry } from '../src/scraper/consell-cv'

/**
 * La tabla 2025 del Consell de Transparència tal como la publica la GVA: un
 * ODS, aunque la de 2026 sea XLSX y el analizador las lea igual. Las fechas son
 * celdas de fecha: la de la resolución 1/2025 es
 * `office:date-value="2025-01-15T00:00:00"` y se muestra «15/01/25».
 *
 * Con xlsx 0.18.5 y el reloj en Madrid, la pasada cruda devolvía 45671,9995 en
 * vez de 45672, y todas las fechas de 2025 salían un día antes; en UTC, bien.
 * Se midió el 28-09-2026 al pasar a la 0.20.3 (PR #139) y no alcanzó a nada
 * publicado: lo que casa con el municipio viene de la tabla 2026.
 *
 * Con la 0.20.3 esa celda llega de la pasada cruda como un Date, y el
 * analizador cae al texto mostrado, igual en las dos zonas. La trampa sigue
 * puesta: el Date es la medianoche LOCAL (2025-01-14T23:00Z en Madrid), así que
 * leerlo con `toISOString()` volvería a restar un día, y sólo al este de UTC. La
 * CI corre en UTC y no lo vería; el adaptador corre en el portátil del curador
 * (`scripts/scrape-ci-blocked.sh`), en Madrid. Por eso cada caso se ejecuta en
 * las dos zonas.
 *
 * La fixture es la tabla descargada el 28-09-2026 (sha256 2668e0c0f4aaada8…
 * 4268e39d) sin sus datos personales: los nombres de autora y última editora
 * en `meta.xml`, y la fila 307/2025, la última, que señala a un cargo electo
 * por sus iniciales. Lo demás, byte a byte.
 */
const ODS = readFileSync(join(__dirname, 'fixtures', 'consell_cv_2025_2026-09-28.ods'))

/** Número y `office:date-value`, leídos de content.xml y no del analizador. */
const FECHAS: Array<[string, string]> = [
  ['1/2025', '2025-01-15'], // «15/01/25»: invierno, +01:00
  ['63/2025', '2025-03-07'], // «07/03/25»: día ≤ 12, al revés sería el 3 de julio
  ['172/2025', '2025-07-01'], // «01/07/25»: verano, +02:00; un día antes cae en junio
]

/** Los días con resoluciones de toda la tabla, también de content.xml. */
const DIAS_CON_RESOLUCIONES = [
  '2025-01-15',
  '2025-01-30',
  '2025-02-12',
  '2025-02-25',
  '2025-03-07',
  '2025-03-26',
  '2025-04-04',
  '2025-04-16',
  '2025-04-29',
  '2025-05-09',
  '2025-05-26',
  '2025-06-06',
  '2025-06-18',
  '2025-07-01',
  '2025-07-18',
  '2025-07-30',
  '2025-09-15',
  '2025-09-22',
  '2025-10-06',
  '2025-10-20',
  '2025-10-29',
]

/** `getTimezoneOffset()` del 15-01-2025 en cada zona: negativo al este de UTC. */
const ZONAS: Array<[string, number]> = [
  ['Europe/Madrid', -60],
  ['UTC', 0],
]

describe.each(ZONAS)('consell-cv — la tabla 2025 real (ODS) con TZ=%s', (zona, desfase) => {
  const antes = process.env.TZ
  let desfaseAlLeer: number
  let entradas: ConsellEntry[]

  beforeAll(() => {
    process.env.TZ = zona
    desfaseAlLeer = new Date(2025, 0, 15).getTimezoneOffset()
    entradas = parseConsellTable(ODS, 2025)
  })

  afterAll(() => {
    if (antes === undefined) delete process.env.TZ
    else process.env.TZ = antes
  })

  it('la tabla se leyó de verdad en esa zona', () => {
    // Sin esto, en un portátil de Madrid las dos pasadas serían Madrid y la de
    // UTC pasaría sola; y en un pool donde asignar TZ no cambiara la zona del
    // proceso, las dos probarían la misma.
    expect(desfaseAlLeer).toBe(desfase)
  })

  it.each(FECHAS)('la resolución %s es del %s', (numero, fecha) => {
    const filas = entradas.filter((e) => e.numero === numero)
    expect(filas).toHaveLength(1)
    expect(filas[0].fecha).toBe(fecha)
  })

  it('ninguna fecha se corre: las 310 caen en días de la tabla', () => {
    expect(entradas).toHaveLength(310)
    expect([...new Set(entradas.map((e) => e.fecha))].sort()).toEqual(DIAS_CON_RESOLUCIONES)
  })
})

/**
 * La medición que decide qué puede decir la serie temporal de /laboratorio.
 *
 * Si el denominador de un cociente lleva seis entregas sin moverse y el
 * numerador se actualiza cada año, la serie de costes unitarios no mide
 * gestión: mide inflación. Esta prueba fija que la detección distingue entre
 * las dos magnitudes, porque la comparación entre ellas es la evidencia.
 */
import { describe, it, expect } from 'vitest'
import {
  medirDeclaracionCongelada,
  MIN_ENTREGAS_CONGELADA,
} from '../src/scraper/declaracion-congelada'
import { SERVICIOS } from '../src/scraper/indicador-registry'
import type { CesteRow } from '../src/scraper/coste-efectivo'

const DEN = SERVICIOS['a1621'].denominador

function fila(ine: string, anio: number, coste: number, unidad: number): CesteRow {
  return {
    anio,
    ine,
    ente: `17-46-${ine.slice(2)}-AA-000`,
    nombre: `Municipio ${ine}`,
    programa: 'a1621',
    modoGestion: 'directa',
    codGestionRaw: 'Gestión directa por la entidad local',
    costeTotal: coste,
    unidades: [{ atributo: DEN, valor: unidad }],
  }
}

const ANIOS = [2019, 2020, 2021, 2022, 2023]

describe('scraper/declaracion-congelada', () => {
  it('marca congelada la serie que repite el mismo valor todas las entregas', () => {
    // El coste sube cada año; la unidad no se mueve. Es el patrón de Riba-roja.
    const filas = ANIOS.map((a, i) => fila('46001', a, 100000 + i * 20000, 11059.41))
    const r = medirDeclaracionCongelada(filas, ['a1621'], ANIOS)
    const unidad = r.series.find((s) => s.magnitud === 'unidad')!
    const coste = r.series.find((s) => s.magnitud === 'coste')!
    expect(unidad.congelada).toBe(true)
    expect(unidad.valor).toBeCloseTo(11059.41, 4)
    expect(unidad.entregas).toBe(5)
    expect(unidad.desde).toBe(2019)
    expect(unidad.hasta).toBe(2023)
    expect(coste.congelada).toBe(false)
    expect(coste.distintos).toBe(5)
  })

  it('mira el tramo final, no si la serie se movió alguna vez', () => {
    // El caso real de Riba-roja: la cifra cambió una vez, hace años, y desde
    // entonces se repite entrega tras entrega. Con la prueba de «todos los
    // valores iguales» esta serie salía limpia y la página habría publicado que
    // el denominador se actualiza. Lo que importa es si la cifra de HOY es una
    // medición o una copia.
    const anios = [2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024]
    const valores = [9000, 9500, 11059.41, 11059.41, 11059.41, 11059.41, 11059.41, 11059.41]
    const filas = anios.map((a, i) => fila('46009', a, 100000 + i * 1000, valores[i]))
    const r = medirDeclaracionCongelada(filas, ['a1621'], anios)
    const u = r.series.find((s) => s.magnitud === 'unidad')!
    expect(u.distintos).toBe(3)
    expect(u.repeticionesFinales).toBe(6)
    expect(u.congelada).toBe(true)
    expect(u.congeladaDesde).toBe(2018)
    expect(u.valor).toBeCloseTo(11059.41, 4)
  })

  it('no marca congelada una racha final más corta que el mínimo', () => {
    const anios = [2019, 2021, 2022, 2023, 2024]
    const valores = [9000, 9500, 10000, 11059.41, 11059.41]
    const filas = anios.map((a, i) => fila('46010', a, 100000, valores[i]))
    const r = medirDeclaracionCongelada(filas, ['a1621'], anios)
    const u = r.series.find((s) => s.magnitud === 'unidad')!
    expect(u.repeticionesFinales).toBe(2)
    expect(u.congelada).toBe(false)
    expect(u.congeladaDesde).toBeNull()
  })

  it('no marca congelada una serie que se mueve, aunque sea poco', () => {
    const filas = ANIOS.map((a, i) => fila('46002', a, 100000, 11059.41 + i * 0.01))
    const r = medirDeclaracionCongelada(filas, ['a1621'], ANIOS)
    expect(r.series.find((s) => s.magnitud === 'unidad')!.congelada).toBe(false)
    // …y el coste, que sí es idéntico todos los años, sale congelado. La
    // detección no privilegia una magnitud sobre la otra: es la comparación
    // entre las dos lo que significa algo.
    expect(r.series.find((s) => s.magnitud === 'coste')!.congelada).toBe(true)
  })

  it('no juzga una serie demasiado corta', () => {
    // Repetir cifra dos años es normal. Marcarlo sería ruido, y el ruido en una
    // guarda es cómo se consigue que nadie la lea.
    const cortos = [2022, 2023]
    const filas = cortos.map((a) => fila('46003', a, 100000, 11059.41))
    const r = medirDeclaracionCongelada(filas, ['a1621'], cortos)
    expect(r.series).toHaveLength(0)
    expect(r.totales.unidadSeries).toBe(0)
    expect(MIN_ENTREGAS_CONGELADA).toBe(4)
  })

  it('ignora las entregas en las que la celda no está declarada', () => {
    // Un cero de CE3 es «no lo declaré», no un valor: no puede contar como una
    // entrega más ni como un valor distinto.
    const filas = [
      fila('46004', 2019, 100000, 11059.41),
      fila('46004', 2020, 100000, 0),
      fila('46004', 2021, 100000, 11059.41),
      fila('46004', 2022, 100000, 11059.41),
      fila('46004', 2023, 100000, 11059.41),
    ]
    const r = medirDeclaracionCongelada(filas, ['a1621'], ANIOS)
    const unidad = r.series.find((s) => s.magnitud === 'unidad')!
    expect(unidad.entregas).toBe(4)
    expect(unidad.congelada).toBe(true)
  })

  it('cuenta las entregas revisadas, para que «cero congeladas» no sea «no miré»', () => {
    const filas = ANIOS.map((a, i) => fila('46005', a, 100000 + i, 11059 + i))
    const r = medirDeclaracionCongelada(filas, ['a1621'], ANIOS)
    expect(r.totales.entregas).toBe(ANIOS.length)
    expect(r.totales.unidadSeries).toBe(1)
    expect(r.totales.unidadCongeladas).toBe(0)
    expect(r.totales.minEntregas).toBe(MIN_ENTREGAS_CONGELADA)
  })

  it('separa las dos magnitudes en los totales', () => {
    const filas = [
      ...ANIOS.map((a, i) => fila('46006', a, 100000 + i * 1000, 11059.41)),
      ...ANIOS.map((a, i) => fila('46007', a, 100000 + i * 1000, 8000 + i * 10)),
    ]
    const r = medirDeclaracionCongelada(filas, ['a1621'], ANIOS)
    expect(r.totales.unidadSeries).toBe(2)
    expect(r.totales.unidadCongeladas).toBe(1)
    expect(r.totales.costeSeries).toBe(2)
    expect(r.totales.costeCongeladas).toBe(0)
  })

  it('salta un programa que no está en el registro en vez de inventarle denominador', () => {
    const filas = ANIOS.map((a) => ({ ...fila('46008', a, 1000, 10), programa: 'zZz' }))
    const r = medirDeclaracionCongelada(filas, ['zZz'], ANIOS)
    expect(r.series).toHaveLength(0)
  })
})

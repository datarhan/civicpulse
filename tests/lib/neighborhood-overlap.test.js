import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  BARRIOS_PARA_EL_CRUCE,
  computeOverlapRows,
  cruceDibujable,
} from '../../src/lib/neighborhood-aggregate'

const neighborhoods = [
  { slug: 'a', name: 'Barrio A', centroid: [0, 0] },
  { slug: 'b', name: 'Barrio B', centroid: [0, 0] },
  { slug: 'c', name: 'Barrio C', centroid: [0, 0] },
  { slug: 'z', name: 'Barrio Z', centroid: [0, 0] },
]
const zones = [
  { slug: 'a', contractCount: 2, amount: 50000 },
  { slug: 'b', contractCount: 1, amount: 10000 },
]
const quejaItems = [
  { address_string: 'a', status: 'pendiente' },
  { address_string: 'a', status: 'resuelta' },
  { address_string: 'c', status: 'pendiente' }, // gap: quejas but no situated spend
]
const instantanea = { stats: { total: quejaItems.length }, items: quejaItems }

describe('computeOverlapRows', () => {
  it('joins quejas + situated spend per barrio, sorts (quejas desc, amount desc), flags gaps', () => {
    const rows = computeOverlapRows({ neighborhoods, zones, instantanea })
    // a: 2 quejas + 50k; c: 1 queja + 0; b: 0 quejas + 10k; z: nothing (dropped)
    expect(rows.map((r) => r.slug)).toEqual(['a', 'c', 'b'])
    const c = rows.find((r) => r.slug === 'c')
    expect(c.quejas).toBe(1)
    expect(c.amount).toBe(0)
    expect(c.gap).toBe(true)
    const b = rows.find((r) => r.slug === 'b')
    expect(b.quejas).toBe(0)
    expect(b.amount).toBe(10000)
    expect(b.gap).toBe(false)
  })

  it('drops barrios with neither quejas nor situated spend', () => {
    const rows = computeOverlapRows({
      neighborhoods: [{ slug: 'z', name: 'Z' }],
      zones: [],
      instantanea: { stats: { total: 0 }, items: [] },
    })
    expect(rows).toEqual([])
  })

  /**
   * Estas cifras NO se gatean por el registro, y conviene fijarlo: `quejas` es
   * cuántas pusieron los vecinos y `gap` es si hay gasto situado allí. Ninguna
   * de las dos afirma que el ayuntamiento deba una respuesta, así que esconderlas
   * cuando nada está registrado ocultaría un dato legítimo — al contrario que
   * ✓ ⏳ ⚠, que sí son respuestas suyas.
   */
  it('sin ninguna queja registrada, el cruce sigue publicando sus cifras', () => {
    const sinRegistro = quejaItems.map((q) => ({ ...q, registered_at: null }))
    const rows = computeOverlapRows({
      neighborhoods,
      zones,
      instantanea: { stats: { total: sinRegistro.length }, items: sinRegistro },
    })
    expect(rows.find((r) => r.slug === 'a').quejas).toBe(2)
    expect(rows.find((r) => r.slug === 'c').gap).toBe(true)
  })
})

/**
 * El cruce de /quejas se dibuja con quejas en al menos BARRIOS_PARA_EL_CRUCE
 * barrios. Con una sola queja publicada, la tabla eran trece filas con «—» en
 * doce, y su columna de quejas no repartía nada (auditoría de las dos lecturas,
 * §18).
 */
describe('cruceDibujable', () => {
  const filas = (...quejas) =>
    quejas.map((q, i) => ({ slug: `b${i}`, quejas: q, amount: 1000, gap: false }))

  it('el umbral es un número con nombre, y no es 1: una queja no es un reparto', () => {
    expect(Number.isInteger(BARRIOS_PARA_EL_CRUCE)).toBe(true)
    expect(BARRIOS_PARA_EL_CRUCE).toBeGreaterThan(1)
  })

  it('cuenta los barrios con quejas, no las filas: las de sólo contratos no cuentan', () => {
    const r = cruceDibujable(filas(1, 0, 0, 0, 0))
    expect(r).toEqual({ dibujable: false, conQuejas: 1, minimo: BARRIOS_PARA_EL_CRUCE })
  })

  it('se dibuja justo al llegar al umbral, y no un barrio antes', () => {
    const justo = Array.from({ length: BARRIOS_PARA_EL_CRUCE }, () => 1)
    expect(cruceDibujable(filas(...justo)).dibujable).toBe(true)
    expect(cruceDibujable(filas(...justo.slice(1), 0)).dibujable).toBe(false)
  })

  it('sin ninguna queja situada en un barrio, conQuejas es 0 y no se dibuja', () => {
    expect(cruceDibujable(filas(0, 0))).toEqual({
      dibujable: false,
      conQuejas: 0,
      minimo: BARRIOS_PARA_EL_CRUCE,
    })
    expect(cruceDibujable([]).conQuejas).toBe(0)
  })

  it('lo publicado hoy: las filas del cruce salen de los ficheros servidos', () => {
    const geo = JSON.parse(readFileSync('public/data/geo.json', 'utf8'))
    const tenderGeo = JSON.parse(readFileSync('public/data/tender-geo.json', 'utf8'))
    const quejas = JSON.parse(readFileSync('public/data/quejas.json', 'utf8'))
    const rows = computeOverlapRows({
      neighborhoods: geo.neighborhoods,
      zones: tenderGeo.zones,
      instantanea: quejas,
    })
    const r = cruceDibujable(rows)
    // Mide algo: hay filas, y conQuejas es el recuento de las que traen quejas.
    expect(rows.length).toBeGreaterThan(0)
    expect(r.conQuejas).toBe(rows.filter((f) => f.quejas > 0).length)
    expect(r.dibujable).toBe(r.conQuejas >= BARRIOS_PARA_EL_CRUCE)
  })
})

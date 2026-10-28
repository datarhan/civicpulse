/**
 * Las quejas por área municipal, para /quejas/dashboard (auditoría de las dos
 * lecturas, §19).
 *
 * El panel contaba resueltas, pendientes y silencios por CARGO: una tabla de
 * personas que, con volumen, es la forma de un marcador. Ahora se agrupa por
 * área, con la regla de /departamentos —la misma `computeDepartmentStats`— y
 * quien tiene el área a su cargo, una vez por área.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { quejasPorArea } from '../src/lib/quejas-por-area'
import { computeDepartmentStats, departamentoDeQueja } from '../src/lib/department-stats'

const lee = (f) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
const QUEJAS = lee('quejas.json')
const OFICIALES = lee('officials.json')

/** La queja publicada, con los cambios del caso; `stats.total` cuadra con `items`. */
const instantanea = (items) => ({
  ...QUEJAS,
  stats: { ...QUEJAS.stats, total: items.length },
  items,
})
const Q = QUEJAS.items[0]

describe('quejasPorArea, con lo publicado', () => {
  it('mide algo: hay quejas publicadas y caen en algún área', () => {
    const r = quejasPorArea({ quejas: QUEJAS, officials: OFICIALES })
    expect(QUEJAS.items.length).toBeGreaterThan(0)
    expect(r.filas.length).toBeGreaterThan(0)
  })

  it('cada fila es el área de /departamentos, con sus cifras y su responsable', () => {
    const r = quejasPorArea({ quejas: QUEJAS, officials: OFICIALES })
    const { bySlug } = computeDepartmentStats({ quejas: QUEJAS, officials: OFICIALES })
    for (const f of r.filas) {
      const b = bySlug[f.slug]
      expect(f.total, f.slug).toBe(b.quejas.total)
      expect(f.abiertas, f.slug).toBe(b.quejas.abiertas)
      expect(f.silencios, f.slug).toBe(b.quejas.silencios)
      expect(f.motivo, f.slug).toBe(b.quejas.motivo)
      expect(f.responsable?.slug ?? null, f.slug).toBe(b.responsableOfficial?.slug ?? null)
    }
    // Y suman las quejas publicadas, más las que no caen en ningún área.
    const asignadas = r.filas.reduce((n, f) => n + f.total, 0)
    expect(asignadas + r.sinArea).toBe(QUEJAS.stats.total)
  })

  it('sólo salen las áreas con alguna queja', () => {
    const r = quejasPorArea({ quejas: QUEJAS, officials: OFICIALES })
    expect(r.filas.every((f) => f.total > 0)).toBe(true)
  })
})

describe('quejasPorArea, caso a caso', () => {
  it('sin registro, el área dice cuántas tiene pero no abiertas ni silencios', () => {
    const r = quejasPorArea({
      quejas: instantanea([{ ...Q, registered_at: null }]),
      officials: OFICIALES,
    })
    const f = r.filas.find((x) => x.slug === departamentoDeQueja(Q))
    expect(f).toMatchObject({
      total: 1,
      abiertas: null,
      silencios: null,
      medible: false,
      motivo: 'sinRegistro',
    })
  })

  it('con una registrada, el área sí tiene cifras', () => {
    const r = quejasPorArea({
      quejas: instantanea([{ ...Q, status: 'registrada', registered_at: '2026-09-01 10:00:00' }]),
      officials: OFICIALES,
    })
    expect(r.filas[0]).toMatchObject({ total: 1, abiertas: 1, silencios: 0, medible: true })
  })

  it('una queja de una categoría sin área cuenta aparte, no se pierde', () => {
    const r = quejasPorArea({
      quejas: instantanea([Q, { ...Q, service_request_id: 'Q-SINAREA1', service_code: 'otra' }]),
      officials: OFICIALES,
    })
    expect(departamentoDeQueja({ service_code: 'otra' })).toBeNull()
    expect(r.sinArea).toBe(1)
    expect(r.filas.reduce((n, f) => n + f.total, 0)).toBe(1)
  })

  it('con el listado truncado no hay filas, y dice por qué', () => {
    const r = quejasPorArea({
      quejas: { ...QUEJAS, stats: { ...QUEJAS.stats, total: QUEJAS.items.length + 5 } },
      officials: OFICIALES,
    })
    expect(r).toEqual({ filas: [], sinArea: null, motivo: 'exportIncompleto' })
  })

  it('sin instantánea legible, tampoco: ni un cero', () => {
    expect(quejasPorArea({ quejas: null, officials: OFICIALES })).toEqual({
      filas: [],
      sinArea: null,
      motivo: 'sinDatos',
    })
  })

  it('las áreas con más quejas primero', () => {
    const otra = { ...Q, service_request_id: 'Q-OTRA0001', service_code: 'limpieza' }
    const r = quejasPorArea({
      quejas: instantanea([otra, { ...otra, service_request_id: 'Q-OTRA0002' }, Q]),
      officials: OFICIALES,
    })
    expect(r.filas.map((f) => f.total)).toEqual([2, 1])
  })
})

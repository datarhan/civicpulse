import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseBalanceMunicipal,
  unirBalances,
  TOTAL_2022_EN_ADELANTE,
  TOTAL_2021,
} from '../src/scraper/criminalidad'

// Rebanadas reales de los ficheros Jaxi del Portal Estadístico de Criminalidad
// (balance T4 = año natural completo), una por cada era del esquema:
//   2024 — las filas de municipio llevan código INE («46214 Riba-roja de Túria»)
//   2021 — sólo nombre («-Municipio de Riba-roja de Túria»), árbol de
//          categorías distinto y SIN el desglose convencional/ciber.
// Cabecera y filas verbatim; una comunidad autónoma entera (Andalucía) dentro
// para que el filtrado municipal tenga algo que filtrar.
const f24 = readFileSync(join(__dirname, 'fixtures', 'crimen_municipal_2024T4_slice.csv'), 'utf8')
const f21 = readFileSync(join(__dirname, 'fixtures', 'crimen_municipal_2021T4_slice.csv'), 'utf8')

describe('scraper/criminalidad', () => {
  const filas24 = parseBalanceMunicipal(f24, { anioActual: 2024 })
  const filas21 = parseBalanceMunicipal(f21, { anioActual: 2021 })

  it('leyó municipios con su código INE en la era nueva', () => {
    const rr = filas24.find((m) => m.ine === '46214')!
    expect(rr).toBeDefined()
    expect(rr.nombre).toMatch(/Riba-roja de Túria/)
    // El total anual del propio fichero, cotejado a mano contra el CSV.
    expect(rr.totales[2024]).toBe(1417)
    // Y el año ANTERIOR sale del mismo fichero: cada balance trae dos columnas.
    expect(rr.totales[2023]).toBe(1441)
  })

  it('la era sin código INE resuelve por nombre, y trae 2020', () => {
    const rr = filas21.find((m) => /Riba-roja de Túria/.test(m.nombre))!
    expect(rr).toBeDefined()
    expect(rr.ine).toBeNull()
    expect(rr.totales[2021]).toBe(1141)
    expect(rr.totales[2020]).toBe(1040)
  })

  it('una comunidad autónoma NO es un municipio', () => {
    // Andalucía está entera en la rebanada: si el filtrado municipal se
    // relajara, entraría con cientos de miles de infracciones y reventaría
    // cualquier banda de comparación.
    for (const filas of [filas24, filas21]) {
      expect(filas.some((m) => /ANDALUC/i.test(m.nombre))).toBe(false)
    }
  })

  it('los totales usan la fila TOTAL de su era, no una suma propia', () => {
    // Las dos eras etiquetan el total distinto; sumarlo nosotros contaría los
    // sub-epígrafes (5.1, 7.1) dos veces.
    expect(TOTAL_2022_EN_ADELANTE).toMatch(/III\. TOTAL/)
    expect(TOTAL_2021).toBe('TOTAL INFRACCIONES PENALES')
    const quart = filas24.find((m) => m.ine === '46102')!
    expect(quart.totales[2024]).toBeGreaterThan(0)
  })

  it('las dos eras se unen en UN municipio, con la serie entera', () => {
    // La rotura silenciosa que ya ocurrió: con el INE de clave, la fila con
    // código (2024) y la fila por nombre (2021) eran dos municipios distintos
    // y la serie perdía sus tres primeros años sin decir nada.
    const unidos = unirBalances([
      { anioActual: 2021, filas: filas21 },
      { anioActual: 2024, filas: filas24 },
    ])
    const rr = unidos.find((m) => m.ine === '46214')!
    expect(rr).toBeDefined()
    expect(Object.keys(rr.totales).map(Number).sort()).toEqual([2020, 2021, 2023, 2024])
    expect(rr.totales[2020]).toBe(1040)
    expect(rr.totales[2024]).toBe(1417)
    // Y no hay un doble fantasma por nombre.
    expect(unidos.filter((m) => /riba-?roja/i.test(m.nombre))).toHaveLength(1)
  })

  it('los miles con punto y los decimales con coma se leen como números', () => {
    // «1.417» es mil cuatrocientos diecisiete, no 1,417.
    const rr = filas24.find((m) => m.ine === '46214')!
    expect(Number.isInteger(rr.totales[2024])).toBe(true)
    expect(rr.totales[2024]).toBeGreaterThan(1000)
  })
})

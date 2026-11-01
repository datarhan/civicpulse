import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'csv-parse/sync'
import { parseRibalicitaContracts, type Contract } from '../src/scraper/tenders'
import { censoDe } from '../src/scraper/vocabulary-census'

/**
 * `contract_id`, la clave de fila de Gobierto, se guarda para poder medirla.
 *
 * En un expediente multifila el `id` publicado ya la lleva dentro (`idsDeFilas`),
 * así que esos ids dependen de que aguante; en una fila suelta sólo está en este
 * campo. Lo que se sabe de ella viene de filas sueltas, y si aguanta en las
 * multifila es lo que mide `identidad-de-filas.ts`.
 *
 * Esta fixture es la descarga entera del 01-11-2026, sin tocar.
 */
const FIXTURE = join(__dirname, 'fixtures', 'ribalicita_contratos_2026-11-01.csv')
const SIN_COLUMNA = join(__dirname, 'fixtures', 'ribalicita_contratos_2026-04-19.csv')

const filasDe = (csv: string) =>
  parse(csv, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    trim: true,
  }) as Record<string, string>[]

/** Vuelve a CSV unas filas ya leídas, para tocar una columna sin cortar por comas. */
function aCsv(filas: Record<string, string>[]): string {
  const columnas = Object.keys(filas[0])
  const celda = (v: string) => `"${v.replaceAll('"', '""')}"`
  return [columnas.join(','), ...filas.map((f) => columnas.map((k) => celda(f[k])).join(','))].join(
    '\n',
  )
}

describe('parseRibalicitaContracts — sourceRowId', () => {
  let csv: string
  let contratos: Contract[]

  beforeAll(() => {
    csv = readFileSync(FIXTURE, 'utf8')
    contratos = parseRibalicitaContracts(csv)
  })

  it('guarda el contract_id de cada fila, tal cual lo trae la fuente', () => {
    const filas = filasDe(csv)
    expect(filas.length).toBeGreaterThan(0)
    expect(contratos.map((c) => c.sourceRowId)).toEqual(filas.map((f) => f.contract_id))
  })

  it('distingue todas las filas, también las gemelas de un expediente multifila', () => {
    const claves = new Set(contratos.map((c) => c.sourceRowId))
    expect(claves.size).toBe(contratos.length)
    const gemelas = contratos.filter((c) => c.id === '4889055' || c.id.startsWith('4889055#'))
    expect(gemelas.length).toBeGreaterThan(1)
    expect(new Set(gemelas.map((c) => c.sourceRowId)).size).toBe(gemelas.length)
  })

  it('en una fila multifila es el sufijo de su id: si cambia la clave, cambia el id', () => {
    const multifila = contratos.filter((c) => c.id.includes('#'))
    expect(multifila.length).toBeGreaterThan(0)
    expect(multifila.every((c) => c.id.endsWith(`#${c.sourceRowId}`))).toBe(true)
  })

  it('en una fila suelta el id no la lleva: sólo se puede leer aquí', () => {
    const sueltas = contratos.filter((c) => !c.id.includes('#'))
    expect(sueltas.length).toBeGreaterThan(0)
    expect(sueltas.some((c) => !c.id.includes(String(c.sourceRowId)))).toBe(true)
  })

  it('una fila sin clave da null, no una cadena vacía (la regla 3: no hay centinela)', () => {
    const viejos = parseRibalicitaContracts(readFileSync(SIN_COLUMNA, 'utf8'))
    expect(viejos.length).toBeGreaterThan(0)
    expect(viejos.every((c) => c.sourceRowId === null)).toBe(true)

    const [primera] = filasDe(csv)
    const [fila] = parseRibalicitaContracts(aCsv([{ ...primera, contract_id: '' }]))
    expect(fila.sourceRowId).toBeNull()
  })

  it('la fuente sigue trayendo clave: techo de filas sin ella', () => {
    const sinClave = contratos.filter((c) => !c.sourceRowId).length
    expect(sinClave / contratos.length).toBeLessThan(0.1)
  })

  it('el censo de vocabulario no la toma por vocabulario', () => {
    const censo = censoDe({ 'tenders.json': { contracts: contratos } })
    expect(censo.some((c) => c.path === 'tenders.contracts.status')).toBe(true)
    expect(censo.some((c) => c.path === 'tenders.contracts.sourceRowId')).toBe(false)
  })
})

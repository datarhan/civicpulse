import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'csv-parse/sync'
import { parseRibalicitaContracts, type Contract } from '../src/scraper/tenders'
import { censoDe } from '../src/scraper/vocabulary-census'

/**
 * `contract_id`, la clave de fila de Gobierto, se guarda para poder medirla.
 *
 * El `id` publicado es posicional: `parseRibalicitaContracts` desempata los
 * repetidos con `#n` en el orden en que llegan, y la consulta no lleva ORDER BY.
 * Entre el 28 y el 31-10-2026 la fuente movió una fila del expediente 4889055
 * y 23 ids pasaron a nombrar otro contrato. Lo que protege lo publicado es que
 * los derivados se rehacen esa misma noche, no el id.
 *
 * Esta fixture es la descarga entera del 01-11-2026, sin tocar. No re-clavea
 * nada: `id` no se mueve, y estas pruebas lo fijan. Si la clave aguanta una
 * edición es lo que mide `identidad-de-filas.ts`.
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
function aCsv(filas: Record<string, string>[], columnas = Object.keys(filas[0])): string {
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

  it('no mueve ni un id: es el mismo con la columna y sin ella', () => {
    const filas = filasDe(csv)
    const columnas = Object.keys(filas[0])
    expect(columnas).toContain('contract_id')
    const sinColumna = aCsv(
      filas,
      columnas.filter((k) => k !== 'contract_id'),
    )
    expect(parseRibalicitaContracts(sinColumna).map((c) => c.id)).toEqual(
      contratos.map((c) => c.id),
    )
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

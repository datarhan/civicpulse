/**
 * Las subidas firmadas, vueltas a derivar contra el corpus de hoy.
 *
 * Una subida se juzga al escribirla, contra el tenders.json de ese día, y nada
 * volvía a mirarla: si la Plataforma corrige un importe, anula un lote o lo
 * cambia de adjudicataria, la fila firmada seguiría diciendo lo de entonces. Es
 * la regla de CLAUDE.md «A verbatim stays put; a number does not», con sus
 * cuatro desenlaces:
 *
 *   coincide      la vía escribiría hoy la misma fila
 *   movido        el mismo contrato, y la fila sólo cambia por el formato de la
 *                 vía o por cómo escribe el registro la adjudicataria
 *   contradice    el importe, el estado, la fecha o el contrato no son los mismos
 *   sin-registro  el contrato o su lote ya no está en tenders.json
 *
 * Los dos últimos salen 1. Y además de la fila, la subida: un registro posterior
 * a la declaración, un contrato que sostiene una promesa o un `verificado` cuya
 * cifra no dice ninguna de sus filas.
 *
 * Con las 18 subidas firmadas de main el 19-10-2026 y sus filas reales
 * (tests/fixtures/subida-firmada-revision_2026-10-19.json).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DESENLACES_DE_FILA,
  cotejarFilaDeContrato,
  cotejarSubidasFirmadas,
  type DeclaracionCotejada,
} from '../src/scraper/subida-firmada'
import type { Overlay } from '../src/scraper/verified-merge'

const F = JSON.parse(
  readFileSync(resolve(__dirname, 'fixtures/subida-firmada-revision_2026-10-19.json'), 'utf8'),
)
const corpus = () => structuredClone({ tenders: F.tenders, bdns: F.bdns, agendas: F.agendas })
const overlay = (): Overlay => ({
  version: 1,
  generatedAt: '2026-10-19T00:00:00.000Z',
  entries: structuredClone(F.subidas),
})
const declaraciones = (): Map<string, DeclaracionCotejada> =>
  new Map(
    Object.entries<{ plenoDate: string; type: string; amountEuros: number | null }>(
      F.declaraciones,
    ).map(([id, d]) => [id, { fecha: d.plenoDate, tipo: d.type, importe: d.amountEuros }]),
  )

const fila = (claimId: string, n = 0) =>
  structuredClone(F.subidas[claimId].verification.evidence[n])

describe('cotejarFilaDeContrato · una fila firmada contra el tenders.json de hoy', () => {
  it('el enum se exporta, no se recita', () => {
    expect(DESENLACES_DE_FILA).toEqual(['coincide', 'movido', 'contradice', 'sin-registro'])
  })

  it('coincide: la fila es la que la vía escribiría hoy', () => {
    const f = fila('19gax3o-034-cit-8ae8be')
    const hoy = cotejarFilaDeContrato(f, corpus())
    // La fila de hoy, escrita por la vía, coincide consigo misma.
    expect(hoy.desenlace).toBe('movido')
    const reescrita = { ...f, snippet: hoy.filaDeHoy as string }
    expect(cotejarFilaDeContrato(reescrita, corpus()).desenlace).toBe('coincide')
  })

  it('movido: el formato viejo («… por X € con IVA el DD-MM-AAAA»), el mismo contrato', () => {
    const r = cotejarFilaDeContrato(fila('c8kr44-229-cit-1356bf'), corpus())
    expect(r.desenlace).toBe('movido')
    expect(r.lote).toBe(3)
  })

  it('movido: la adjudicataria escrita de otro modo por el registro («VODAFONE ESPANA SA» → «VODAFONE SA»)', () => {
    const f = fila('k4olcs-019-cit-947479', 0)
    expect(f.snippet).toContain('VODAFONE ESPANA SA')
    expect(cotejarFilaDeContrato(f, corpus()).desenlace).toBe('movido')
  })

  it('movido: la concesión del agua, que hoy se escribe con su valor estimado y no «adjudicado por»', () => {
    const r = cotejarFilaDeContrato(fila('k4olcs-101-cit-ddd6c4'), corpus())
    expect(r.desenlace).toBe('movido')
  })

  it('contradice: el registro publica hoy otro importe', () => {
    const c = corpus()
    const garbialdiAuditesa = c.tenders.contracts.find(
      (r: { permalink: string; batchNumber: number }) =>
        r.permalink === fila('c8kr44-045-afi-8e7181').ref && r.batchNumber === 2,
    )
    garbialdiAuditesa.finalAmount = 190000
    garbialdiAuditesa.finalAmountNoTaxes = 157024.79
    const r = cotejarFilaDeContrato(fila('c8kr44-045-afi-8e7181'), c)
    expect(r.desenlace).toBe('contradice')
    expect(r.detalle).toMatch(/importe/)
  })

  it('contradice: otra adjudicataria, no otra forma de escribir la misma', () => {
    const c = corpus()
    const f = fila('rmtyr-124-cit-a8696c')
    c.tenders.contracts.find((r: { permalink: string }) => r.permalink === f.ref).assignee =
      'OBRA CIVIL Y EDIFICACION ESCRIMAR S.L.L.'
    const r = cotejarFilaDeContrato(f, c)
    expect(r.desenlace).toBe('contradice')
    expect(r.detalle).toMatch(/adjudicataria/)
  })

  it('contradice: el contrato ya no está adjudicado ni formalizado', () => {
    const c = corpus()
    const f = fila('rmtyr-124-cit-a8696c')
    c.tenders.contracts.find((r: { permalink: string }) => r.permalink === f.ref).status = 'void'
    const r = cotejarFilaDeContrato(f, c)
    expect(r.desenlace).toBe('contradice')
    expect(r.detalle).toMatch(/estado/)
  })

  it('contradice: la adjudicación se publica hoy con otra fecha', () => {
    const c = corpus()
    const f = fila('rmtyr-124-cit-a8696c')
    c.tenders.contracts.find((r: { permalink: string }) => r.permalink === f.ref).awardDate =
      '2025-10-24'
    expect(cotejarFilaDeContrato(f, c).desenlace).toBe('contradice')
  })

  it('sin-registro: el enlace, o su lote, ya no está en tenders.json', () => {
    const c = corpus()
    const f = fila('rmtyr-124-cit-a8696c')
    c.tenders.contracts = c.tenders.contracts.filter(
      (r: { permalink: string }) => r.permalink !== f.ref,
    )
    expect(cotejarFilaDeContrato(f, c).desenlace).toBe('sin-registro')

    const d = corpus()
    const lote3 = fila('c8kr44-229-cit-1356bf')
    d.tenders.contracts = d.tenders.contracts.filter(
      (r: { permalink: string; batchNumber: number }) =>
        !(r.permalink === lote3.ref && r.batchNumber === 3),
    )
    expect(cotejarFilaDeContrato(lote3, d).desenlace).toBe('sin-registro')
  })
})

describe('cotejarSubidasFirmadas · lo que publica main el 19-10-2026', () => {
  const r = cotejarSubidasFirmadas({
    overlay: overlay(),
    declaraciones: declaraciones(),
    corpus: corpus(),
  })

  it('mira las 18 subidas y sus 20 filas de contrato; ninguna se queda sin cotejar', () => {
    expect(r.estado).toBe('cotejado')
    expect(r.subidas).toBe(18)
    expect(r.filas).toHaveLength(20)
    expect(r.otrasFilas).toBe(7)
  })

  it('las 20 son del formato de antes de hoy: movidas, ninguna contradice ni falta', () => {
    const cuenta = (d: string) => r.filas.filter((f) => f.desenlace === d).length
    expect(cuenta('movido')).toBe(20)
    expect(cuenta('coincide') + cuenta('contradice') + cuenta('sin-registro')).toBe(0)
  })

  it('10 subidas citan una adjudicación publicada después de lo dicho', () => {
    const posteriores = [
      ...new Set(r.avisos.filter((a) => a.codigo === 'posterior').map((a) => a.id)),
    ]
    expect(posteriores.sort()).toEqual(
      [
        '19gax3o-034-cit-8ae8be',
        'c8kr44-045-afi-8e7181',
        'c8kr44-081-cit-74fc55',
        'c8kr44-142-cit-b8c30e',
        'c8kr44-229-cit-1356bf',
        'c8kr44-230-cit-56b068',
        'c8kr44-231-cit-faf7d3',
        'k4olcs-101-cit-ddd6c4',
        'ma87e0-157-pro-7ce20e',
        'rmtyr-124-cit-a8696c',
      ].sort(),
    )
  })

  it('una es una promesa sostenida por un contrato', () => {
    expect(r.avisos.filter((a) => a.codigo === 'promesa').map((a) => a.id)).toEqual([
      'ma87e0-157-pro-7ce20e',
    ])
  })

  it('ningún verificado con cifra la tiene distinta de la de su fila', () => {
    expect(r.avisos.filter((a) => a.codigo === 'importe')).toEqual([])
  })

  it('un verificado cuya cifra no dice ninguna fila se señala', () => {
    const o = overlay()
    const d = declaraciones()
    d.set('k4olcs-018-afi-7abae5', { ...d.get('k4olcs-018-afi-7abae5')!, importe: 66666 })
    const otro = cotejarSubidasFirmadas({ overlay: o, declaraciones: d, corpus: corpus() })
    expect(otro.avisos.filter((a) => a.codigo === 'importe').map((a) => a.id)).toEqual([
      'k4olcs-018-afi-7abae5',
    ])
  })

  it('una subida cuya declaración no se sirve no se coteja contra ella, y se cuenta', () => {
    const d = declaraciones()
    d.delete('rmtyr-124-cit-a8696c')
    const otro = cotejarSubidasFirmadas({ overlay: overlay(), declaraciones: d, corpus: corpus() })
    expect(otro.sinDeclaracion).toEqual(['rmtyr-124-cit-a8696c'])
    expect(otro.avisos.some((a) => a.id === 'rmtyr-124-cit-a8696c')).toBe(false)
  })

  it('sin tenders.json no coteja nada y lo dice: nunca «0 contradicen»', () => {
    const sin = cotejarSubidasFirmadas({
      overlay: overlay(),
      declaraciones: declaraciones(),
      corpus: null,
    })
    expect(sin.estado).toBe('sin-corpus')
    expect(sin.filas).toEqual([])
    expect(sin.subidas).toBe(0)
  })
})

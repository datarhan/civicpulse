import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseOfertasList, parseOfertaDetail, OFERTA_STATUS_TONE } from '../src/scraper/empleo'

const LIST = join(__dirname, 'fixtures', 'portalemp_ribaocupacio_ofertas_2026-07-05.html')
const DETAIL_2481 = join(
  __dirname,
  'fixtures',
  'portalemp_ribaocupacio_oferta_2481_2026-07-05.html',
)
const DETAIL_2480 = join(
  __dirname,
  'fixtures',
  'portalemp_ribaocupacio_oferta_2480_2026-07-05.html',
)

const BASE = 'https://ribaocupacio.portalemp.com'

describe('scraper/empleo — parseOfertasList', () => {
  let rows: ReturnType<typeof parseOfertasList>

  beforeAll(() => {
    rows = parseOfertasList(readFileSync(LIST, 'utf8'), { baseUrl: BASE })
  })

  it('parses every oferta row in the fixture (73)', () => {
    expect(rows.length).toBe(73)
  })

  it('every row has a valid shape', () => {
    for (const r of rows) {
      expect(typeof r.fo).toBe('number')
      expect(r.fo).toBeGreaterThan(0)
      expect(r.id).toBe(String(r.fo))
      expect(r.codigo).toMatch(/^\d{4}\/\d{4,6}$/)
      expect(r.titulo.length).toBeGreaterThan(1)
      expect(r.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      // deadline is ISO or null
      if (r.deadline !== null) expect(r.deadline).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(typeof r.location).toBe('string') // optional free text — may be empty
      expect(typeof r.inRibaRoja).toBe('boolean')
      // detail url is an absolute https link back to the offer
      expect(r.url).toMatch(/^https:\/\/.*\?fo=\d+$/)
      expect(r.url).toContain(String(r.fo))
    }
  })

  it('maps the "Abierta" status to the ok tone', () => {
    const abierta = rows.filter((r) => r.status === 'Abierta')
    expect(abierta.length).toBeGreaterThan(0)
    for (const r of abierta) expect(r.statusTone).toBe('ok')
  })

  it('mints a unique id per offer', () => {
    const ids = rows.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('converts DD/MM/YYYY to ISO and reads the known Limpiador/a row (fo=2481)', () => {
    const r = rows.find((x) => x.fo === 2481)
    expect(r).toBeTruthy()
    expect(r!.codigo).toBe('2026/00181')
    expect(r!.titulo).toBe('Limpiador/a')
    expect(r!.publishedAt).toBe('2026-07-03')
    expect(r!.deadline).toBe('2026-09-03')
    expect(r!.inRibaRoja).toBe(true)
  })

  it('flags comarca offers outside Riba-roja as inRibaRoja=false (fo=2480, Paterna)', () => {
    const r = rows.find((x) => x.fo === 2480)
    expect(r).toBeTruthy()
    expect(r!.inRibaRoja).toBe(false)
  })

  it('classifies both Riba-roja and non-Riba-roja offers (mixed comarca feed)', () => {
    const inside = rows.filter((r) => r.inRibaRoja).length
    expect(inside).toBeGreaterThan(0)
    expect(inside).toBeLessThan(rows.length)
  })
})

describe('scraper/empleo — parseOfertaDetail', () => {
  it('extracts the ficha fields for a simple offer (fo=2481)', () => {
    const d = parseOfertaDetail(readFileSync(DETAIL_2481, 'utf8'))
    expect(d.tipoContrato).toBe('CONTRATO DE OBRA O SERVICIO DETERMINADO')
    expect(d.numPuestos).toBe('1')
    expect(d.municipio).toBe('Riba-roja de Túria')
    expect(d.provincia).toBe('Valencia')
    expect(d.cp).toBe('46190')
    expect(d.jornada).toBe('Parcial')
    expect(d.salario).toBe('Según convenio')
    expect(d.vehiculo).toBe('Sí')
    expect(d.funciones).toContain('Limpieza')
    // generic field list carries every label/value pair, forward-compatibly
    expect(d.fields.length).toBeGreaterThanOrEqual(10)
    expect(d.fields.some((f) => f.label === 'Código' && f.value === '2026/00181')).toBe(true)
  })

  it('never leaks the breadcrumb <li> into ficha fields', () => {
    const d = parseOfertaDetail(readFileSync(DETAIL_2481, 'utf8'))
    expect(d.fields.some((f) => f.value === 'Ofertas')).toBe(false)
    expect(d.ocupaciones.some((o) => o.nombre === 'Ofertas')).toBe(false)
  })

  it('parses the "Ocupaciones solicitadas" list with required experience (fo=2481)', () => {
    const d = parseOfertaDetail(readFileSync(DETAIL_2481, 'utf8'))
    expect(d.ocupaciones.length).toBe(1)
    expect(d.ocupaciones[0].nombre).toContain('LIMPIEZA')
    expect(d.ocupaciones[0].experiencia).toBe('3 Meses')
  })

  it('scopes occupations to the right sub-section for a rich offer (fo=2480)', () => {
    const d = parseOfertaDetail(readFileSync(DETAIL_2480, 'utf8'))
    // Two occupations only — the carnet "B" and the curso live in OTHER <h3> lists
    expect(d.ocupaciones.length).toBe(2)
    for (const o of d.ocupaciones) expect(o.nombre).toContain('MONTADORES')
    expect(d.ocupaciones.some((o) => o.nombre === 'B')).toBe(false)
    // richer offers expose extra labelled fields
    expect(d.municipio).toBe('Paterna')
    expect(d.categoria).toBe('Ayudantes no titulados')
    expect(d.observaciones).toBeTruthy()
  })
})

describe('scraper/empleo — status tone map', () => {
  it('maps Abierta to ok', () => {
    expect(OFERTA_STATUS_TONE['Abierta']).toBe('ok')
  })
})

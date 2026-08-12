import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  parseCeselWorkbook,
  clasificarGestion,
  ineFromEnte,
  MODOS_GESTION,
  type CesteRow,
} from '../src/scraper/coste-efectivo'

// A real slice of the ministry's 2021 national workbook, cut to the cv-15k-40k
// band by scripts/build-cesel-fixture.ts. Values and sheet names are verbatim;
// only rows were dropped. A hand-written fixture would only ever prove the
// parser agrees with whoever wrote the fixture.
const FIXTURE = join(__dirname, 'fixtures', 'cesel_2021_cv_slice.xlsx')
const rows = parseCeselWorkbook(readFileSync(FIXTURE), { anio: 2021 })
const rr = rows.filter((r) => r.ine === '46214')
const unidad = (row: CesteRow, re: RegExp) => row.unidades.filter((u) => re.test(u.atributo))

describe('scraper/coste-efectivo — parseCeselWorkbook', () => {
  it('parsed the whole band, not just one town', () => {
    expect(rows.length).toBeGreaterThan(2000)
    expect(new Set(rows.map((r) => r.ine)).size).toBeGreaterThanOrEqual(50)
    expect(rr.length).toBeGreaterThan(20)
  })

  it('joins cost to physical units for recogida de residuos', () => {
    const residuos = rr.filter((r) => r.programa === 'a1621')
    expect(residuos).toHaveLength(1)
    expect(residuos[0].costeTotal).toBe(801040.17)
    expect(residuos[0].modoGestion).toBe('directa')
    expect(unidad(residuos[0], /toneladas/i)[0].valor).toBe(11059.41)
  })

  it('reads alumbrado despite the trailing spaces in the attribute name', () => {
    // 'Nº puntos de luz  ' ships with two trailing spaces. A registry keyed on
    // the raw string would silently never match.
    const alumbrado = rr.find((r) => r.programa === 'a165')!
    expect(alumbrado.costeTotal).toBe(98241.77)
    const puntos = alumbrado.unidades.find((u) => u.atributo === 'Nº puntos de luz')
    expect(puntos!.valor).toBe(4514)
  })

  it('classifies the water and sewer concessions, which report zero cost', () => {
    // THE trap: dividing these would publish "Riba-roja supplies water for
    // free". The cost is real, it just sits with the concessionaire.
    for (const programa of ['a160', 'a161']) {
      const row = rr.find((r) => r.programa === programa)!
      expect(row.modoGestion).toBe('concesion')
      expect(row.costeTotal).toBe(0)
      expect(row.unidades.length).toBeGreaterThan(0) // denominator IS there
    }
  })

  it('keeps every duplicate row for a programa instead of picking the first', () => {
    const dupes = rr.filter((r) => r.programa === 'a1721/170P')
    expect(dupes.length).toBe(2)
    expect(new Set(dupes.map((d) => d.costeTotal))).toEqual(new Set([1964894.95, 282412.19]))
  })

  it('keeps contradictory repeated attributes rather than collapsing them', () => {
    const row = rr.find((r) => r.programa === 'a1721/170P')!
    const plantilla = unidad(row, /plantilla adscritas/i)
    expect(plantilla.map((u) => u.valor).sort((a, b) => a - b)).toEqual([0, 16])
    const superficie = unidad(row, /núcleo urbano/i)
    expect(superficie.map((u) => u.valor).sort((a, b) => a - b)).toEqual([1.43, 12.89])
  })

  it('preserves the undeclared zero rather than dropping the attribute', () => {
    // Transporte urbano: real cost, `viajeros = 0`. The zero must survive to
    // the engine, which is what turns it into `no-declarado`, not into ∞.
    const bus = rr.find((r) => r.programa === 'a4411/440P')!
    expect(bus.costeTotal).toBe(485975.77)
    expect(unidad(bus, /viajeros/i)[0].valor).toBe(0)
  })

  it('records the ministry wording verbatim beside the classified mode', () => {
    const row = rr.find((r) => r.programa === 'a161')!
    expect(row.codGestionRaw).toMatch(/riesgo y ventura/i)
  })

  it('derives INE codes from the ente identifier', () => {
    expect(ineFromEnte('17-46-214-AA-000')).toBe('46214')
    expect(ineFromEnte('09-43-125-AA-000')).toBe('43125')
    expect(ineFromEnte('00-00-004-CC-000')).toBeNull() // consorcio, not a municipality
    expect(ineFromEnte('nonsense')).toBeNull()
  })

  it('emits only values from the exported enum', () => {
    for (const r of rows) expect(MODOS_GESTION).toContain(r.modoGestion)
  })

  it('classifies every CodGestion the ministry actually publishes', () => {
    // Fourteen distinct strings appear in this entrega. `otra` means the SOURCE
    // said «Otro tipo de gestión»; `sin-clasificar` means WE failed to match.
    // Folding those two would make the ceiling below unfalsifiable.
    expect(clasificarGestion('Gestión directa por la entidad local')).toBe('directa')
    expect(clasificarGestion('Gestión directa por sociedad mercantil local')).toBe('directa')
    expect(clasificarGestion('Gestión directa por organismo autónomo de la entidad local')).toBe(
      'directa',
    )
    expect(clasificarGestion('Gestión directa por entidad pública empresarial')).toBe('directa')
    expect(
      clasificarGestion(
        'Gestión indirecta mediante concesión, gestionando el concesionario el servicio a su riesgo y ventura',
      ),
    ).toBe('concesion')
    expect(clasificarGestion('Gestión indirecta por concierto')).toBe('concesion')
    expect(
      clasificarGestion(
        'Gestión indirecta interesada, compartiendo la entidad local y el empresario los resultados de explotación en la proporción fijada en el contrato',
      ),
    ).toBe('concesion')
    expect(
      clasificarGestion(
        'Gestión mancomunada/comarcal/por la Diputación/otro tipo de agrupación municipal',
      ),
    ).toBe('mancomunada')
    expect(clasificarGestion('Gestión consorciada')).toBe('consorciada')
    expect(clasificarGestion('Gestión por convenio de colaboración interadministrativo')).toBe(
      'convenio',
    )
    expect(clasificarGestion('No se presta el servicio')).toBe('no-se-presta')
    expect(clasificarGestion('Otro tipo de gestión (**)')).toBe('otra')
    // Hybrids: part of the cost sits somewhere else, so they are as
    // uncomparable as a concession and must never join a peer pool.
    expect(
      clasificarGestion(
        'Gestión mancomunada/comarcal/por la Diputación/otro tipo de agrupación municipal + otra forma de gestión (*)',
      ),
    ).toBe('otra')
    expect(clasificarGestion('Gestión consorciada + otra forma de gestión (*)')).toBe('otra')
    expect(clasificarGestion('')).toBe('sin-clasificar')
  })

  it('leaves nothing unclassified in a real entrega (the classifier ceiling)', () => {
    // Rule 1's fallback ceiling, aimed at the right target: «the source says
    // other» is data and may be any share, but «I could not read this» is a
    // parser defect and must be ~zero.
    const sinClasificar = rows.filter((r) => r.modoGestion === 'sin-clasificar')
    expect(sinClasificar.length / rows.length).toBeLessThan(0.01)
  })
})

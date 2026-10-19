import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import {
  parseCeselWorkbook,
  parseCeselInforme,
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

// ── Casilla vacía contra cero declarado ─────────────────────────────────────
// El 2026-10-18 una revisión lectora preguntó si los ceros del agua de 2018–2023
// eran «no calculado» y no cero. Leída la celda cruda, era un 0 numérico: un
// cero de verdad. Pero el parser no habría sabido distinguirlo, porque
// `Number('')` es 0 y el respaldo era `: 0`: una casilla en blanco salía
// `costeTotal: 0`, idéntica a un cero declarado. Es la regla 3 de
// docs/DATA_INTEGRITY.md, un centinela valiendo por dos hechos.
//
// Ninguna entrega cacheada trae hoy una casilla vacía en coste ni en unidades
// (medido el 2026-10-19 sobre las doce), así que no hay fila real que congelar.
// En vez de inventar un libro, se toma la fixture real, se vacía UNA celda y se
// vuelve a escribir: todo lo demás sigue siendo el fichero del ministerio.
const FIXTURE_CCAA = join(__dirname, 'fixtures', 'cesel_ccaa17_2024_slice.xlsx')

/**
 * Vacía (o sustituye por texto) la única celda de `columna` en la fila que
 * cumple `donde`. Falla si la fila no es exactamente una o si la celda ya
 * estaba vacía: una edición que no toca nada dejaría el test pasando en vano.
 */
function editarCelda(
  buf: Buffer,
  hoja: string,
  columna: string,
  donde: Record<string, string>,
  valor: string | null,
): Buffer {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const ws = wb.Sheets[hoja]
  const origen = XLSX.utils.decode_range(ws['!ref']!).s
  const filas: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null })
  const h = filas.findIndex((r) => r.some((c) => String(c ?? '').trim() === columna))
  const head = filas[h].map((c) => String(c ?? '').trim())
  const casan = filas
    .map((_, i) => i)
    .filter(
      (i) =>
        i > h &&
        Object.entries(donde).every(
          ([k, v]) => String(filas[i][head.indexOf(k)] ?? '').trim() === v,
        ),
    )
  expect(casan, `${hoja}: ${JSON.stringify(donde)}`).toHaveLength(1)
  const addr = XLSX.utils.encode_cell({
    r: origen.r + casan[0],
    c: origen.c + head.indexOf(columna),
  })
  expect(ws[addr], `${hoja}!${addr} ya estaba vacía`).toBeDefined()
  if (valor === null) delete ws[addr]
  else ws[addr] = { t: 's', v: valor }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

describe('scraper/coste-efectivo — casilla vacía no es cero', () => {
  const RR = '17-46-214-AA-000'

  it('CE2: una casilla de coste vacía es null; el 0 declarado sigue siendo 0', () => {
    // a161 (agua) declara 0 en 2021; a160 (alcantarillado) también. Se vacía
    // sólo la del agua: si las dos salen iguales, el parser no distingue.
    const buf = editarCelda(
      readFileSync(FIXTURE),
      '2021 CE2',
      'Econ14',
      { Ente: RR, Programa: 'a161' },
      null,
    )
    const filas = parseCeselWorkbook(buf, { anio: 2021 }).filter((r) => r.ine === '46214')
    expect(filas.find((r) => r.programa === 'a161')!.costeTotal).toBeNull()
    expect(filas.find((r) => r.programa === 'a160')!.costeTotal).toBe(0)
    // Lo demás no se mueve: la edición tocó una celda, no la lectura entera.
    expect(filas.find((r) => r.programa === 'a1621')!.costeTotal).toBe(801040.17)
  })

  it('CE2: un texto que no es una cifra tampoco se lee como 0', () => {
    const buf = editarCelda(
      readFileSync(FIXTURE),
      '2021 CE2',
      'Econ14',
      { Ente: RR, Programa: 'a165' },
      'n/d',
    )
    const fila = parseCeselWorkbook(buf, { anio: 2021 }).find(
      (r) => r.ine === '46214' && r.programa === 'a165',
    )!
    expect(fila.costeTotal).toBeNull()
  })

  it('CE3: una unidad física vacía es null; la unidad a 0 sigue siendo 0', () => {
    // La unidad se decide igual que el coste: el 0 de `viajeros` es un dato de
    // la fuente («no lo declaré», que clasifica el motor); la casilla vacía no
    // dice nada y no puede hacerse pasar por él.
    const buf = editarCelda(
      readFileSync(FIXTURE),
      '2021 CE3',
      'Valor',
      { Ente: RR, Programa: 'a1621', Atributo: 'Producción anual residuos urbanos: toneladas' },
      null,
    )
    const filas = parseCeselWorkbook(buf, { anio: 2021 }).filter((r) => r.ine === '46214')
    const residuos = filas.find((r) => r.programa === 'a1621')!
    expect(residuos.unidades.find((u) => /toneladas/i.test(u.atributo))!.valor).toBeNull()
    const bus = filas.find((r) => r.programa === 'a4411/440P')!
    expect(bus.unidades.find((u) => /viajeros/i.test(u.atributo))!.valor).toBe(0)
  })

  it('informe por comunidad: coste_efectivo vacío es null; el 0 declarado sigue siendo 0', () => {
    // 2024: el agua declara 1.898.034,08 €; a1531 declara 0. Vaciar la primera
    // no puede convertirla en la segunda.
    const buf = editarCelda(
      readFileSync(FIXTURE_CCAA),
      'CE1a y CE2a',
      'coste_efectivo',
      { 'Código Ente': RR, 'Grupo de programa / Programa': '161' },
      null,
    )
    const filas = parseCeselInforme(buf, { anio: 2024 }).filter((r) => r.ine === '46214')
    expect(filas.find((r) => r.programa === 'a161')!.costeTotal).toBeNull()
    expect(filas.find((r) => r.programa === 'a1531/150P')!.costeTotal).toBe(0)
    expect(filas.find((r) => r.programa === 'a160')!.costeTotal).toBe(514318.78)
  })

  it('informe por comunidad: «Nº unidades» vacío es null', () => {
    const buf = editarCelda(
      readFileSync(FIXTURE_CCAA),
      'CE3a',
      'Nº unidades',
      {
        'Código Ente': RR,
        'Grupo de programa / Programa': '165',
        'Unidades físicas de referencia': 'Nº puntos de luz',
      },
      null,
    )
    const alumbrado = parseCeselInforme(buf, { anio: 2024 }).find(
      (r) => r.ine === '46214' && r.programa === 'a165',
    )!
    expect(alumbrado.unidades.find((u) => u.atributo === 'Nº puntos de luz')!.valor).toBeNull()
    expect(alumbrado.unidades.find((u) => u.atributo === 'Potencia instalada')!.valor).toBe(657)
  })
})

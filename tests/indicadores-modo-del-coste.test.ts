import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCeselInforme, type CesteRow } from '../src/scraper/coste-efectivo'
import { MAPA_URL } from '../src/scraper/cesel-entregas'
import { construirIndicadores, modoDelCoste } from '../src/scraper/indicadores'

/**
 * El modo de gestión de un par es el de la fila cuyo coste se usa.
 *
 * Se tomaba de la PRIMERA fila del servicio (`.find`), y en parques y jardines
 * de 2024 varios municipios traen dos: Quart de Poblet y Moncada declaran el
 * mismo coste bajo «otra forma de gestión» y bajo gestión directa; Cullera trae
 * 0 € en «otra» y 47.168,48 € en directa. Quién entraba en el grupo dependía
 * del orden en que el ministerio escribe las filas, y el tamaño del grupo
 * bailaba entre 28 y 31 sin que cambiara ningún dato.
 *
 * Fixture real: el informe de la Comunitat Valenciana de 2024 recortado a la
 * banda (scripts/build-cesel-ccaa-fixture.ts).
 */
const f24 = parseCeselInforme(
  readFileSync(join(__dirname, 'fixtures', 'cesel_ccaa17_2024_pares.xlsx')),
  { anio: 2024 },
)
const RR = '46214'
const QUART = '46102'
const MONCADA = '46171'
const CULLERA = '46105'
const P = 'a171/170P'

function parques(filas: CesteRow[]) {
  const miembros = [...new Set(filas.map((r) => r.ine))].map((ine) => ({
    ine,
    nombre: filas.find((r) => r.ine === ine)!.nombre,
    poblacion: 0,
  }))
  const snap = construirIndicadores({
    municipio: {
      ine: RR,
      nombre: 'Riba-roja de Túria',
      filas: filas.filter((r) => r.ine === RR),
    },
    pares: { conjunto: 'cv-15k-40k', anios: [2024], miembros, filas },
    anioBase: 2024,
    origenes: { 2024: { documento: 'informe-ccaa', url: MAPA_URL, ccaa: 17 } },
  })
  return snap.indicadores.find((i) => i.id === 'a171-170p-coste-unitario')!
}

describe('modo de gestión de un par: el de la fila que da el coste', () => {
  it('la fixture trae los casos de dos modos (la prueba mide algo)', () => {
    for (const ine of [QUART, MONCADA, CULLERA]) {
      const modos = new Set(
        f24.filter((f) => f.ine === ine && f.programa === P).map((f) => f.modoGestion),
      )
      expect(modos.size, ine).toBe(2)
    }
  })

  it('Cullera: el coste está en la fila de gestión directa', () => {
    expect(
      modoDelCoste(
        f24.filter((f) => f.ine === CULLERA),
        P,
        2024,
      ),
    ).toEqual({
      modo: 'directa',
      ambiguo: false,
    })
  })

  it('Quart y Moncada: el mismo coste bajo dos modos no decide ninguno', () => {
    for (const ine of [QUART, MONCADA]) {
      expect(
        modoDelCoste(
          f24.filter((f) => f.ine === ine),
          P,
          2024,
        ).ambiguo,
        ine,
      ).toBe(true)
    }
  })

  it('el grupo no depende del orden de las filas', () => {
    const a = parques(f24)
    const b = parques([...f24].reverse())
    expect(a.pares).not.toBeNull()
    expect(b.pares!.n).toBe(a.pares!.n)
    expect(b.pares!.miembros.map((m) => m.ine).sort()).toEqual(
      a.pares!.miembros.map((m) => m.ine).sort(),
    )
    expect(b.pares!.mediana).toBe(a.pares!.mediana)
  })

  it('Cullera entra; Quart y Moncada quedan fuera y se cuentan', () => {
    const i = parques(f24)
    const ines = i.pares!.miembros.map((m) => m.ine)
    expect(ines).toContain(CULLERA)
    expect(ines).not.toContain(QUART)
    expect(ines).not.toContain(MONCADA)
    expect(i.pares!.fuera['modo-ambiguo']).toBe(2)
  })
})

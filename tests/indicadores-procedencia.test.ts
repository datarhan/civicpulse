import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCeselInforme, parseCeselWorkbook } from '../src/scraper/coste-efectivo'
import { construirIndicadores } from '../src/scraper/indicadores'
import { MAPA_URL } from '../src/scraper/cesel-entregas'
import { procedenciaCesel, type OrigenEntrega } from '../src/scraper/cesel-procedencia'

/**
 * La cita de cada ficha de /eficiencia tiene que llevar al documento del que
 * sale la cifra, y a la celda en la que está.
 *
 * Las quince fichas citaban `cesel-2021.xlsx` —el volcado nacional, el único
 * que el ministerio publica entero— con «entrega 2024» al lado y una celda
 * «CE2:a1621:Econ14». La cifra de 2024 no está en ese fichero: sale del
 * informe por comunidad autónoma, hoja «CE1a y CE2a», columna `coste_efectivo`,
 * con el programa sin la letra de la variante. Un lector que seguía el enlace
 * encontraba 801.040,17 € (2021) donde la ficha dice 740.272,16 € (2024).
 *
 * Fixtures reales: el informe de la Comunitat Valenciana de 2024 recortado a la
 * banda (scripts/build-cesel-ccaa-fixture.ts) y el volcado de 2021 recortado
 * (scripts/build-cesel-fixture.ts).
 */
const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n))
const VOLCADO = 'https://www.hacienda.gob.es/cdi/power%20bi/cesel-2021.xlsx'
const CCAA: OrigenEntrega = { documento: 'informe-ccaa', url: MAPA_URL, ccaa: 17 }
const NACIONAL: OrigenEntrega = { documento: 'volcado-nacional', url: VOLCADO }

const f24 = parseCeselInforme(fx('cesel_ccaa17_2024_slice.xlsx'), { anio: 2024 })
const f21 = parseCeselWorkbook(fx('cesel_2021_cv_slice.xlsx'), { anio: 2021 })
const RR = '46214'

function construir(filas: typeof f24, origenes: Record<number, OrigenEntrega>) {
  const miembros = [...new Set(filas.map((r) => r.ine))].map((ine) => ({
    ine,
    nombre: filas.find((r) => r.ine === ine)!.nombre,
    poblacion: 0,
  }))
  return construirIndicadores({
    municipio: { ine: RR, nombre: 'Riba-roja de Túria', filas: filas.filter((r) => r.ine === RR) },
    pares: { conjunto: 'cv-15k-40k', miembros, filas },
    origenes,
  })
}

describe('indicadores · cada cifra cita el documento y la celda de los que sale', () => {
  const snap = construir([...f21, ...f24], { 2021: NACIONAL, 2024: CCAA })
  const residuos = snap.indicadores.find((i) => i.id === 'a1621-coste-unitario')!

  it('evaluó algo: la ficha titula en 2024 con la cifra del informe', () => {
    expect(residuos.citas[0].entrega).toBe(2024)
    expect(residuos.numerador.valor).toBe(740272.16)
  })

  it('la cita de 2024 lleva al informe por comunidad, no al volcado de 2021', () => {
    const c = residuos.citas[0]
    expect(c.url).toBe(MAPA_URL)
    expect(c.url).not.toContain('cesel-2021')
    expect(c.coste).toContain('«CE1a y CE2a»')
    expect(c.coste).toContain('coste_efectivo')
    // El programa como lo escribe el informe: sin la letra de la variante.
    expect(c.coste).toContain('Grupo de programa 1621')
    expect(c.coste).not.toContain('a1621')
    expect(c.coste).not.toContain('Econ14')
    expect(c.unidad).toContain('«CE3a»')
    expect(c.unidad).toContain('Producción anual residuos urbanos: toneladas')
    expect(c.unidad).toContain('Nº unidades')
  })

  it('cada punto de la serie cita el suyo: 2021 el volcado, 2024 el informe', () => {
    const grupos = residuos.procedencia
    const de = (anio: number) => grupos.find((g) => g.entregas.includes(anio))!
    // Toda entrega de la serie está en exactamente un grupo.
    for (const p of residuos.serie) {
      expect(grupos.filter((g) => g.entregas.includes(p.anio))).toHaveLength(1)
    }
    expect(de(2021).url).toBe(VOLCADO)
    expect(de(2021).coste).toContain('«2021 CE2»')
    expect(de(2021).coste).toContain('Programa a1621')
    expect(de(2021).coste).toContain('Econ14')
    expect(de(2021).unidad).toContain('«2021 CE3»')
    expect(de(2024).url).toBe(MAPA_URL)
    expect(de(2024).coste).toContain('coste_efectivo')
  })

  it('las variantes b viven en sus propias hojas', () => {
    const policia = snap.indicadores.find((i) => i.id === 'b132-130p-coste-unitario')!
    expect(policia.citas[0].coste).toContain('«CE1b y CE2b»')
    expect(policia.citas[0].coste).toContain('Grupo de programa 132/130P')
    expect(policia.citas[0].unidad).toContain('«CE3b»')
  })

  it('una entrega sin documento conocido no se publica con una cita inventada', () => {
    // Sin origen para 2021, el motor no puede decir de dónde sale esa entrega:
    // callar el hueco es lo que dejó la cita de 2021 sobre la cifra de 2024.
    expect(() => construir([...f21, ...f24], { 2024: CCAA })).toThrow(/2021/)
  })

  it('procedenciaCesel escribe la celda del informe por ente en su hoja propia', () => {
    const p = procedenciaCesel(
      2024,
      { documento: 'informe-ente', url: 'https://example.org/consulta' },
      { programa: 'a1621', atributo: 'X', ente: '17-46-214-AA-000' },
    )
    expect(p.coste).toContain('«CE2a»')
    expect(p.coste).toContain('coste_efectivo')
    expect(p.unidad).toContain('«CE3a»')
  })
})

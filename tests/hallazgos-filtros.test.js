import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { contarHallazgos, pasaFiltros, gruposDe, SIN_ATRIBUIR } from '../src/lib/hallazgos-filtros'

/**
 * LA invariante: cada chip dice cuántas FILAS deja pasar su propio filtro.
 *
 * El de GRUPO contaba CITAS mientras los de severidad y pleno contaban
 * hallazgos, y el filtro que el chip acciona selecciona hallazgos. La pastilla
 * decía «PSOE 48» y al pulsarla salían 27 filas. Medido sobre los 40
 * publicados: las de grupo sumaban 131 —el triple del total— junto a las de
 * pleno, que suman exactamente 40.
 *
 * Es la regla que `pleno-summary` ya escribe para los suyos y que allí tiene
 * prueba desde el principio: «un chip que promete 7 y enseña 4 es peor que no
 * tener filtro». Aquí no la tenía, y por eso el defecto duró hasta que lo cazó
 * la revisión lectora — no una prueba.
 */
const finding = (over = {}) => ({
  id: 'f1',
  severity: 'informational',
  plenoDate: '2026-05-11',
  quotes: [],
  ...over,
})

const q = (speakerGroup) => ({ text: 'lo que se dijo', speakerGroup })

describe('gruposDe', () => {
  it('no repite un grupo que aparece en varias citas', () => {
    const f = finding({ quotes: [q('PSOE'), q('PSOE'), q('PP')] })
    expect([...gruposDe(f)].sort()).toEqual(['PP', 'PSOE'])
  })

  /** Sin atribuir NO es un grupo: es la ausencia de uno, y se cuenta aparte. */
  it('agrupa las citas sin atribuir bajo el sentinela', () => {
    expect([...gruposDe(finding({ quotes: [q(null), q(undefined)] }))]).toEqual([SIN_ATRIBUIR])
  })

  it('un hallazgo sin citas no aporta ningún grupo', () => {
    expect([...gruposDe(finding())]).toEqual([])
    expect([...gruposDe(null)]).toEqual([])
  })
})

describe('cada recuento es el número de filas que deja pasar su filtro', () => {
  const items = [
    finding({ id: 'a', severity: 'critical', plenoDate: '2026-05-11', quotes: [q('PSOE')] }),
    // El caso del defecto: cuatro citas del mismo grupo en UN hallazgo.
    finding({
      id: 'b',
      severity: 'informational',
      plenoDate: '2026-05-11',
      quotes: [q('PSOE'), q('PSOE'), q('PSOE'), q('PP')],
    }),
    finding({ id: 'c', severity: 'informational', plenoDate: '2026-03-02', quotes: [q(null)] }),
  ]

  it('la invariante, sobre las tres dimensiones', () => {
    const { bySeverity, bySpeaker, byPleno } = contarHallazgos(items)
    for (const [k, n] of Object.entries(bySeverity)) {
      expect(items.filter((f) => pasaFiltros(f, { severidad: k })).length).toBe(n)
    }
    for (const [k, n] of Object.entries(bySpeaker)) {
      expect(items.filter((f) => pasaFiltros(f, { grupo: k })).length).toBe(n)
    }
    for (const [k, n] of Object.entries(byPleno)) {
      expect(items.filter((f) => pasaFiltros(f, { pleno: k })).length).toBe(n)
    }
  })

  /**
   * El número concreto que estaba mal: el hallazgo `b` tiene 4 citas del PSOE y
   * es UN hallazgo del PSOE. Contando citas daba 5; contando filas da 2.
   */
  it('un hallazgo con cuatro citas de un grupo cuenta UNA vez', () => {
    expect(contarHallazgos(items).bySpeaker.PSOE).toBe(2)
  })

  /**
   * Que la columna de grupo sume MÁS que el total no es el defecto: un hallazgo
   * con citas de dos grupos sale en los dos, que es lo que hace el filtro. Lo
   * que no puede pasar es que el chip no sea el número de filas.
   */
  it('la de pleno suma el total y la de grupo puede pasarse, y las dos son ciertas', () => {
    const { bySpeaker, byPleno } = contarHallazgos(items)
    const suma = (o) => Object.values(o).reduce((a, b) => a + b, 0)
    expect(suma(byPleno)).toBe(items.length)
    expect(suma(bySpeaker)).toBeGreaterThan(items.length)
  })

  it('los filtros se combinan y un filtro vacío no filtra', () => {
    expect(items.filter((f) => pasaFiltros(f, {})).length).toBe(3)
    expect(items.filter((f) => pasaFiltros(f, { grupo: 'PSOE', pleno: '2026-03-02' })).length).toBe(
      0,
    )
    expect(
      items.filter((f) => pasaFiltros(f, { grupo: 'PSOE', severidad: 'critical' })).length,
    ).toBe(1)
  })
})

/**
 * Y sobre el corpus REAL, porque el defecto era una propiedad del corpus: los
 * hallazgos con varias citas del mismo grupo son la mayoría, y con un fixture
 * de tres filas la invariante se cumple por casualidad más de lo que debería.
 */
describe('la invariante sobre los hallazgos publicados', () => {
  const items = JSON.parse(readFileSync('public/data/pleno-findings.json', 'utf8')).items ?? []

  it('mide algo: hay hallazgos publicados y alguno con citas repetidas de grupo', () => {
    expect(items.length).toBeGreaterThan(0)
    const conRepetido = items.filter(
      (f) => (f.quotes ?? []).length > gruposDe(f).size && gruposDe(f).size > 0,
    )
    expect(conRepetido.length).toBeGreaterThan(0)
  })

  it('cada chip de grupo cuenta exactamente sus filas', () => {
    const { bySpeaker } = contarHallazgos(items)
    for (const [k, n] of Object.entries(bySpeaker)) {
      expect(items.filter((f) => pasaFiltros(f, { grupo: k })).length).toBe(n)
    }
  })
})

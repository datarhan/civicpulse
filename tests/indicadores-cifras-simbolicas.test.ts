import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCeselInforme, type CesteRow } from '../src/scraper/coste-efectivo'
import { SERVICIOS } from '../src/scraper/indicador-registry'
import { MAPA_URL } from '../src/scraper/cesel-entregas'
import {
  construirIndicadores,
  resolverCoste,
  resolverUnidad,
  motivoFueraDePares,
  MOTIVOS_FUERA_DE_PARES,
  COSTES_SIMBOLICOS,
  UNIDADES_SIMBOLICAS,
} from '../src/scraper/indicadores'

/**
 * Las cifras de relleno del coste efectivo no son medidas.
 *
 * El formulario del ministerio no deja una casilla vacía, y hay ayuntamientos
 * que la llenan con 0,01 o con 1 €. El motor sólo rechazaba lo que valía 0 o
 * menos, así que esas cifras se dividían como cualquier otra:
 *
 *  - la serie propia de limpieza viaria declaraba 0,01 m² en 2014 y 2015, y la
 *    división daba 53 y 67 millones de euros por m²;
 *  - biblioteca, 0,01 préstamos en 2014;
 *  - entre los pares de 2024, Puçol declara 0,01 € para instalaciones
 *    deportivas, Calp 0,01 € para pavimentación, Borriana 1 € para los
 *    colegios, y Aldaia y Benetússer 0,01 efectivos para promoción del deporte.
 *    Con esos dos dentro, la mediana publicada de promoción del deporte era
 *    161.045 €; sin ellos, 129.518 €.
 *
 * «1 efectivo» NO es un relleno: es una plantilla de una persona, y once
 * municipios de la banda lo declaran con costes muy distintos. Nada lo
 * convierte en marca.
 *
 * Fixtures reales: el informe de la Comunitat Valenciana de 2024 recortado a la
 * banda para los servicios afectados, y los de 2014 y 2015 recortados a
 * Riba-roja (scripts/build-cesel-ccaa-fixture.ts).
 */
const fx = (n: string) => readFileSync(join(__dirname, 'fixtures', n))
const f24 = parseCeselInforme(fx('cesel_ccaa17_2024_pares.xlsx'), { anio: 2024 })
const RR = '46214'
const de = (ine: string, filas: CesteRow[] = f24) => filas.filter((f) => f.ine === ine)

const PUCOL = '46205'
const CALP = '03047'
const BORRIANA = '12032'
const ALDAIA = '46021'
const BENETUSSER = '46054'
const ALBAL = '46007'
const CARLET = '46085'

describe('cifras de relleno: no constan como medida', () => {
  it('exporta los rellenos, y son los medidos', () => {
    expect([...COSTES_SIMBOLICOS].sort()).toEqual([0.01, 1])
    expect([...UNIDADES_SIMBOLICAS]).toEqual([0.01])
  })

  it.each([
    [PUCOL, 'a342/340P', 0.01],
    [CALP, 'a1532/150P', 0.01],
    [BORRIANA, 'b323/324/320P', 1],
  ])('el coste de %s en %s (%s €) no consta', (ine, programa, cifra) => {
    const filas = de(ine)
    // La fixture trae la cifra de verdad: la prueba mide algo.
    expect(filas.find((f) => f.programa === programa)!.costeTotal).toBe(cifra)
    const n = resolverCoste(filas, programa, 2024)
    expect(n.estado).toBe('no-declarado')
    expect(n.motivo).toBe('cifra-simbolica')
    expect(n.valor).toBeNull()
    const d = resolverUnidad(filas, programa, 2024, SERVICIOS[programa].denominador)
    expect(motivoFueraDePares(n, d)).toBe('coste-simbolico')
  })

  it.each([ALDAIA, BENETUSSER])('los 0,01 efectivos de %s no constan', (ine) => {
    const filas = de(ine)
    const d = resolverUnidad(filas, 'b341/340P', 2024, SERVICIOS['b341/340P'].denominador)
    expect(d.estado).toBe('no-declarado')
    expect(d.motivo).toBe('cifra-simbolica')
    const n = resolverCoste(filas, 'b341/340P', 2024)
    expect(n.estado).toBe('declarado')
    expect(motivoFueraDePares(n, d)).toBe('unidad-simbolica')
  })

  it.each([ALBAL, CARLET])(
    '«1 efectivo» de %s sigue siendo una plantilla, no un relleno',
    (ine) => {
      const d = resolverUnidad(de(ine), 'b341/340P', 2024, SERVICIOS['b341/340P'].denominador)
      expect(d.estado).toBe('declarado')
      expect(d.valor).toBe(1)
    },
  )

  it('la serie propia: limpieza viaria 2014 y 2015, biblioteca 2014', () => {
    const rr = [
      ...parseCeselInforme(fx('cesel_ccaa17_2014_46214.xlsx'), { anio: 2014 }),
      ...parseCeselInforme(fx('cesel_ccaa17_2015_46214.xlsx'), { anio: 2015 }),
    ]
    const casos: [string, number][] = [
      ['a163', 2014],
      ['a163', 2015],
      ['a3321/330P', 2014],
    ]
    for (const [programa, anio] of casos) {
      const fila = rr.find((f) => f.programa === programa && f.anio === anio)!
      const atributo = SERVICIOS[programa].denominador
      expect(fila.unidades.find((u) => u.atributo === atributo)!.valor).toBe(0.01)
      const d = resolverUnidad(rr, programa, anio, atributo)
      expect(d.estado, `${programa} ${anio}`).toBe('no-declarado')
      expect(d.motivo).toBe('cifra-simbolica')
    }
  })
})

describe('promoción del deporte 2024: el grupo sin los dos rellenos', () => {
  const miembros = [...new Set(f24.map((r) => r.ine))].map((ine) => ({
    ine,
    nombre: f24.find((r) => r.ine === ine)!.nombre,
    poblacion: 0,
  }))
  const snap = construirIndicadores({
    municipio: { ine: RR, nombre: 'Riba-roja de Túria', filas: de(RR) },
    pares: { conjunto: 'cv-15k-40k', anios: [2024], miembros, filas: f24 },
    anioBase: 2024,
    origenes: { 2024: { documento: 'informe-ccaa', url: MAPA_URL, ccaa: 17 } },
  })
  const deporte = snap.indicadores.find((i) => i.id === 'b341-340p-coste-unitario')!

  it('Aldaia y Benetússer quedan fuera, con su motivo contado', () => {
    expect(deporte.pares).not.toBeNull()
    const ines = deporte.pares!.miembros.map((m) => m.ine)
    expect(ines).not.toContain(ALDAIA)
    expect(ines).not.toContain(BENETUSSER)
    expect(ines).toContain(ALBAL)
    expect(ines).toContain(CARLET)
    expect(deporte.pares!.fuera['unidad-simbolica']).toBe(2)
    expect(Object.keys(deporte.pares!.fuera).sort()).toEqual([...MOTIVOS_FUERA_DE_PARES].sort())
  })

  it('la mediana es la del grupo sin rellenos', () => {
    expect(deporte.pares!.mediana).toBeCloseTo(129517.91, 2)
  })

  it('y la salvedad de «muy por debajo de la mediana» ya no se dispara', () => {
    expect(deporte.caveats.some((c) => /muy por debajo de la mediana/.test(c))).toBe(false)
  })

  it('cada relleno de los pares cuenta en su ficha', () => {
    const fichas: [string, keyof typeof deporte.pares.fuera, number][] = [
      ['a342-340p-coste-unitario', 'coste-simbolico', 1],
      ['a1532-150p-coste-unitario', 'coste-simbolico', 1],
      ['b323-324-320p-coste-unitario', 'coste-simbolico', 1],
    ]
    for (const [id, motivo, n] of fichas) {
      const i = snap.indicadores.find((x) => x.id === id)!
      expect(i.pares, id).not.toBeNull()
      expect(i.pares!.fuera[motivo], id).toBeGreaterThanOrEqual(n)
    }
  })
})

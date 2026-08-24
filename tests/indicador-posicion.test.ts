import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  POSICIONES,
  cruzaMediana,
  posicionServicio,
  razonMediana,
  particionPosiciones,
} from '../src/scraper/indicador-areas'
import type { Indicador } from '../src/scraper/indicadores'

/**
 * Una sola definición de «no se distingue», y esta prueba es su contrato.
 *
 * La expresión `banda[0] <= 50 && banda[1] >= 50` vivía suelta dentro de
 * `indicador-lectura.ts`, convertida en una frase y en nada más. El libro de
 * servicios necesita la MISMA sentencia en cuatro sitios —el punto hueco de la
 * fila, la pastilla, el recuento de cabecera y la ficha—, así que se exporta
 * una vez y todos la importan. Restatarla en cada sitio es el modo de fallo 1
 * de docs/DATA_INTEGRITY.md: seis pruebas copiaron una forma a mano y siguieron
 * en verde mientras producción no casaba con nada.
 *
 * Se comprueba contra el snapshot PUBLICADO, no contra filas inventadas.
 */
const snap = JSON.parse(readFileSync(join(__dirname, '..', 'public/data/indicadores.json'), 'utf8'))
const indicadores: Indicador[] = snap.indicadores

describe('cruzaMediana — una banda que toca el 50 no sostiene un lado', () => {
  it('mide algo: hay fichas con banda plausible en el snapshot', () => {
    const conBanda = indicadores.filter((i) => i.pares?.percentilBanda)
    expect(conBanda.length).toBeGreaterThan(8)
  })

  it('cruza cuando la banda contiene el 50, y no cuando no', () => {
    expect(cruzaMediana({ percentilBanda: [46, 82] })).toBe(true)
    expect(cruzaMediana({ percentilBanda: [50, 50] })).toBe(true)
    expect(cruzaMediana({ percentilBanda: [73, 95] })).toBe(false)
    expect(cruzaMediana({ percentilBanda: [3, 27] })).toBe(false)
  })

  it('sin banda no afirma nada: null, no false', () => {
    expect(cruzaMediana(null)).toBe(null)
    expect(cruzaMediana({})).toBe(null)
  })

  it('los seis que cruzan en el snapshot son exactamente estos', () => {
    const cruzan = indicadores.filter((i) => cruzaMediana(i.pares) === true).map((i) => i.id)
    expect(cruzan.sort()).toEqual(
      [
        'a1532-150p-coste-unitario',
        'a163-coste-unitario',
        'a164-coste-unitario',
        'a165-coste-unitario',
        'a342-340p-coste-unitario',
        'a3321-330p-coste-unitario',
      ].sort(),
    )
  })
})

describe('posicionServicio — el veredicto, con su enum exportado', () => {
  it('devuelve siempre un valor del enum exportado, nunca una cadena suelta', () => {
    for (const i of indicadores) {
      expect(POSICIONES, `${i.id} salió del enum`).toContain(posicionServicio(i))
    }
  })

  /**
   * El techo de reserva del modo de fallo 1: si un cambio de forma colapsara
   * todo a un cubo, el recuento seguiría sumando y esta prueba seguiría en
   * verde sin él.
   */
  it('no colapsa a un solo cubo: al menos tres categorías en uso', () => {
    const usados = new Set(indicadores.map(posicionServicio))
    expect(usados.size).toBeGreaterThanOrEqual(3)
  })

  it('una banda que cruza gana al percentil: indistinguible aunque el puesto sea 85', () => {
    const i = {
      valor: 9.33,
      pares: { percentil: 64, percentilBanda: [49, 77] },
    } as unknown as Indicador
    expect(posicionServicio(i)).toBe('indistinguible')
  })

  it('sin cociente no se sitúa', () => {
    expect(posicionServicio({ valor: null } as Indicador)).toBe('sin-comparacion')
  })
})

describe('razonMediana — la columna × mediana', () => {
  it('divide el valor entre la mediana de los pares', () => {
    const i = { valor: 100.35, pares: { mediana: 32.51 } } as unknown as Indicador
    expect(razonMediana(i)).toBeCloseTo(3.0867, 4)
  })

  it('null cuando no hay pares o no hay cociente', () => {
    expect(razonMediana({ valor: 12, pares: undefined } as unknown as Indicador)).toBe(null)
    expect(razonMediana({ valor: null } as Indicador)).toBe(null)
  })

  it('colegios pagan ×3,09 la mediana en el snapshot publicado', () => {
    const colegios = indicadores.find((i) => i.id === 'b323-324-320p-coste-unitario')!
    expect(razonMediana(colegios)).toBeCloseTo(3.09, 2)
  })
})

describe('particionPosiciones — el reparto que titula la página', () => {
  const p = particionPosiciones(indicadores)

  it('mide algo: hay fichas situadas', () => {
    expect(p.situados).toBeGreaterThan(5)
  })

  it('doce comparables: seis no se distinguen, cuatro abajo, dos arriba', () => {
    expect(p).toMatchObject({
      situados: 12,
      indistinguibles: 6,
      abajo: 4,
      arriba: 2,
      sinSituar: 1,
    })
  })

  it('los cubos suman los situados: nada se pierde por el camino', () => {
    expect(p.abajo + p.arriba + p.indistinguibles).toBe(p.situados)
  })

  it('ninguna ficha que cruce la mediana se cuenta con lado', () => {
    const conLado = indicadores.filter((i) => ['arriba', 'abajo'].includes(posicionServicio(i)))
    for (const i of conLado) {
      expect(cruzaMediana(i.pares), `${i.id} tiene lado y banda que cruza`).toBe(false)
    }
  })
})

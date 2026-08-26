import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ATIPICO_FACTOR } from '../src/scraper/indicadores'
import type { Indicador } from '../src/scraper/indicadores'

/**
 * Los comparables que quedan fuera de un orden de magnitud, y las dos cosas que
 * la marca tiene que seguir siendo.
 *
 * La ficha enseñaba los bordes del grupo rotulados «p0» y «p100», o sea como
 * suelo y techo del reparto y sin marca ninguna. En policía local eso ponía
 * 831,03 EUR/efectivo —que no puede ser el coste anual de un agente— con la
 * autoridad de un cuantil detrás. La revisión lo llamó un hallazgo alto y tenía
 * razón: un reparto que empieza ahí no es un rango de referencia.
 *
 * La regla NO es nueva y este fichero no la reescribe: importa `ATIPICO_FACTOR`,
 * que ya juzgaba la serie propia de Riba-roja contra la mediana de sus pares.
 * Copiar el 20 aquí sería el modo de fallo 1 de DATA_INTEGRITY —seis pruebas
 * restataron una forma a mano y siguieron verdes mientras producción no casaba
 * con nada— y además dejaría que alguien moviera el umbral en producción sin
 * que ninguna prueba se enterara.
 *
 * Lo que se fija, y por qué son dos afirmaciones y no una:
 *
 *   1. La marca coincide con la regla EN LAS DOS DIRECCIONES. Sólo comprobar
 *      que los marcados cumplen la regla dejaría pasar que se marcaran de menos.
 *   2. Los marcados SIGUEN CONTANDO en el percentil. Es la mitad que se puede
 *      perder sin que se note: «limpiar» el reparto quitándolos parece una
 *      mejora y movería posiciones ya publicadas de veinte municipios que no
 *      tienen derecho de réplica en este sitio. El percentil publicado se
 *      recalcula aquí desde los miembros ENTEROS y tiene que salir igual.
 */
const PANEL = JSON.parse(
  readFileSync(join(process.cwd(), 'public/data/indicadores.json'), 'utf8'),
) as { indicadores: Indicador[] }

const CON_PARES = PANEL.indicadores.filter((i) => i.pares && i.pares.miembros?.length)

describe('pares atípicos · la marca', () => {
  it('mide algo: hay servicios con grupo comparable y alguno trae atípicos', () => {
    expect(CON_PARES.length).toBeGreaterThan(0)
    expect(CON_PARES.some((i) => (i.pares!.atipicos ?? 0) > 0)).toBe(true)
  })

  it('la constante es la del motor, no una copia', () => {
    expect(ATIPICO_FACTOR).toBeGreaterThan(1)
  })

  for (const i of CON_PARES) {
    it(`${i.id} · la marca coincide con la regla en las dos direcciones`, () => {
      const p = i.pares!
      for (const m of p.miembros) {
        if (m.valor <= 0) {
          expect(m.atipico ?? false, `${m.nombre}: valor no positivo, no se juzga`).toBe(false)
          continue
        }
        const razon = m.valor / p.mediana
        const fuera = razon > ATIPICO_FACTOR || razon < 1 / ATIPICO_FACTOR
        expect(
          m.atipico ?? false,
          `${m.nombre} (${m.valor}) razón ×${razon.toFixed(4)} sobre la mediana ${p.mediana}`,
        ).toBe(fuera)
      }
    })

    it(`${i.id} · el recuento publicado no se cuenta a mano`, () => {
      const p = i.pares!
      expect(p.atipicos).toBe(p.miembros.filter((m) => m.atipico).length)
    })

    it(`${i.id} · un atípico SIGUE contando en el percentil`, () => {
      const p = i.pares!
      // El percentil publicado, recalculado desde los miembros enteros. Si
      // alguien excluyera los marcados, esto dejaría de cuadrar.
      const orden = p.miembros.map((m) => m.valor).sort((a, b) => a - b)
      const recalculado = Math.round(
        (100 * orden.filter((v) => v <= i.valor!).length) / orden.length,
      )
      expect(recalculado, 'el percentil publicado ya no sale de TODOS los comparables').toBe(
        p.percentil,
      )
      expect(p.n, 'n dejó de ser el total de comparables').toBe(p.miembros.length)
    })
  }
})

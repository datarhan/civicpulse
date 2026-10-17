/**
 * La línea de cobertura de la portada imprime `universe.situatedAmount` al lado de
 * unas chinchetas que pinta `placeAmountsAt`. Esta prueba mira, sobre el snapshot
 * publicado, que las dos sumas coinciden con los filtros apagados y el cursor al
 * final, que es como abre la portada.
 *
 * No coinciden por construcción. `situatedAmount` (src/scraper/tender-geo.ts)
 * suma toda asignación con `place`, tenga fecha o no; `placeAmountsAt` se salta
 * las que no tienen fecha, porque no sabe en qué punto de la línea de tiempo
 * ponerlas. Hoy son iguales sólo porque no hay ninguna asignación situada sin
 * fecha. El día que llegue una, la línea contará dinero que ninguna chincheta
 * pinta, y esta prueba lo dirá antes que un lector.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { placeAmountsAt } from '../src/lib/tender-points'

const snap = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'data', 'tender-geo.json'), 'utf8'),
)

describe('tender-geo.json: la línea de cobertura cuenta lo que pintan las chinchetas', () => {
  it('la suma de las chinchetas es universe.situatedAmount', () => {
    const situadas = snap.assignments.filter((a) => a?.place?.sourceId)
    // Que la prueba mida algo: un snapshot sin chinchetas daría 0 = 0.
    expect(situadas.length).toBeGreaterThan(0)
    expect(snap.universe.situatedAmount).toBeGreaterThan(0)

    const chinchetas = [...placeAmountsAt(snap.assignments).values()]
    const suma = chinchetas.reduce((s, p) => s + p.amount, 0)
    const sinFecha = situadas.filter((a) => !a.date).map((a) => a.id)
    expect(
      Math.abs(suma - snap.universe.situatedAmount),
      `chinchetas ${suma} ≠ situatedAmount ${snap.universe.situatedAmount}; ` +
        `asignaciones situadas sin fecha: ${JSON.stringify(sinFecha)}`,
    ).toBeLessThan(1e-6)
  })
})

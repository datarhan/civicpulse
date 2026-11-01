import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { construirGrafoRutas, rutasRevisables } from '../../scripts/lib/route-graph'
import { leerDeDisco } from '../../scripts/lib/fichas-representativas'

/**
 * Cada «Ver el detalle ↓» de un «En breve» aterriza en algo que existe.
 *
 * Un ancla rota no da error: el vecino pulsa y se queda donde estaba, en lo alto
 * de una página larga, sin saber dónde mirar. /presupuesto y /metodologia
 * tenían ya su prueba, cada una con su lista; /eficiencia no tenía ninguna. Ésta
 * mira todas las rutas de la revisión lectora y cualquier bloque
 * `[data-en-breve-bloque]` que encuentre, así que la próxima página con
 * «En breve» entra sola.
 */
const grafo = construirGrafoRutas(resolve('src'))
const RUTAS = [
  ...new Set(
    rutasRevisables(grafo, leerDeDisco(resolve('public/data'))).map((c) => c.split(' [')[0]),
  ),
]

/** Las anclas internas de los bloques «En breve» de una ruta, sin repetir. */
async function anclas(page: import('@playwright/test').Page, ruta: string) {
  await page.goto(ruta, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  return page
    .locator('[data-en-breve-bloque] a[href^="#"]')
    .evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href') ?? ''))])
}

// Las páginas que hoy llevan «En breve»: si alguna lo pierde, esta prueba lo
// dice en vez de que la de abajo pase sin mirar nada.
const CON_EN_BREVE = ['/presupuesto', '/eficiencia', '/metodologia']

test('mide algo: las páginas con «En breve» tienen anclas que mirar', async ({ page }) => {
  for (const ruta of CON_EN_BREVE) {
    expect(RUTAS, `${ruta} no está en la revisión lectora`).toContain(ruta)
    expect((await anclas(page, ruta)).length, `${ruta}: ningún ancla`).toBeGreaterThan(0)
  }
})

for (const ruta of RUTAS) {
  test(`${ruta}: cada ancla del «En breve» aterriza en un elemento`, async ({ page }) => {
    for (const href of await anclas(page, ruta)) {
      expect(href.length, `${ruta}: ancla vacía`).toBeGreaterThan(1)
      // Por id, no por selector: `useId` da ids con «:», que `#…` no admite.
      const n = await page.evaluate(
        (id) => document.querySelectorAll(`[id="${CSS.escape(id)}"]`).length,
        href.slice(1),
      )
      expect(n, `${ruta}: ${href} no está en la página`).toBe(1)
    }
  })
}

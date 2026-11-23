import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { RUTAS_LOCALES, construirGrafoRutas } from '../../scripts/lib/route-graph'
import { fichaDe, leerDeDisco } from '../../scripts/lib/fichas-representativas'
import { JARGON, medirLecturas } from './_medida-lecturas'

/**
 * Cada capa vecinal lleva `data-lectura-vecinal`, y cada cifra marcada de
 * «En breve» dice lo mismo que el detalle al que enlaza (plan revisado de las
 * dos lecturas, 4a.5).
 *
 * El atributo es lo que lee la medida (`medida-lecturas.spec.ts`), que no
 * bloquea; esta prueba sí, porque una capa sin atributo es una página que la
 * medida no ve, y una cifra marcada que no coincide con su detalle es la página
 * contradiciéndose. Una cifra SIN marcar no la bloquea: la medida la lista
 * («sin-marcar») hasta que alguien case sus dos lados.
 *
 * Las rutas salen del grafo: las que alcanzan `EnBreve.jsx` o
 * `DivisorLecturas.jsx` (toda página con las dos lecturas pinta el divisor). Y
 * /datos, cuya capa vecinal es una frase suelta sin divisor.
 */
const grafo = construirGrafoRutas(resolve('src'))
const leer = leerDeDisco(resolve('public/data'))
const alcanzan = (f: string) => [...(grafo.rutasPorFichero.get(resolve(f)) ?? [])]
const RUTAS = [
  ...new Set([
    ...alcanzan('src/components/EnBreve.jsx'),
    ...alcanzan('src/components/DivisorLecturas.jsx'),
    '/datos',
  ]),
]
  .filter((r) => !RUTAS_LOCALES.includes(r))
  .sort()

function url(ruta: string): string | null {
  if (!ruta.includes(':')) return ruta
  const { id } = fichaDe(ruta, leer)
  return id ? ruta.replace(/:[A-Za-z]+/, encodeURIComponent(id)) : null
}

test('mide algo: el grafo encuentra las páginas con capa vecinal', () => {
  for (const r of ['/presupuesto', '/contratos', '/empleo', '/cambios', '/datos', '/quejas']) {
    expect(RUTAS).toContain(r)
  }
})

test('mide algo: /presupuesto casa al menos una cifra con su detalle', async ({ page }) => {
  await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-en-breve] [data-cifra]').first()).toBeVisible({
    timeout: 10_000,
  })
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  const m = await page.evaluate(medirLecturas, { jerga: JARGON, alto: 629 })
  expect(m.cifras.filter((c) => c.estado === 'coincide').length).toBeGreaterThan(0)
})

for (const ruta of RUTAS) {
  const destino = url(ruta)
  test(`${ruta}: la capa vecinal lleva su atributo, y sus cifras marcadas coinciden`, async ({
    page,
  }) => {
    test.skip(!destino, `${ruta}: SIN FICHA con la que leerla`)
    await page.goto(destino!, { waitUntil: 'domcontentloaded' })
    const capa = page.locator('[data-lectura-vecinal]').first()
    await expect(capa, `${ruta}: ninguna capa con data-lectura-vecinal`).toBeVisible({
      timeout: 10_000,
    })
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
    // La capa vecinal va antes que el divisor: lo de arriba es lo esencial.
    const antesDelDivisor = await page.evaluate(() => {
      const divisor = document.querySelector('[data-divisor-lecturas]')
      const capa = document.querySelector('[data-lectura-vecinal]')
      if (!divisor || !capa) return true
      return Boolean(capa.compareDocumentPosition(divisor) & Node.DOCUMENT_POSITION_FOLLOWING)
    })
    expect(antesDelDivisor, `${ruta}: la capa vecinal va debajo del divisor`).toBe(true)

    const m = await page.evaluate(medirLecturas, { jerga: JARGON, alto: 629 })
    const rotas = m.cifras.filter((c) => c.estado === 'no-coincide' || c.estado === 'sin-pareja')
    expect(rotas, `${ruta}: cifras marcadas que su detalle no sostiene`).toEqual([])
  })
}

import { test, expect } from '@playwright/test'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { RUTAS_LOCALES, construirGrafoRutas } from '../../scripts/lib/route-graph'
import { fichaDe, leerDeDisco } from '../../scripts/lib/fichas-representativas'
import { JARGON, medirLecturas } from './_medida-lecturas'

/**
 * Cada capa vecinal lleva `data-lectura-vecinal`, y cada cifra marcada de
 * «En breve» dice lo mismo que el detalle al que enlaza (plan revisado de las
 * dos lecturas, 4a.5).
 *
 * El atributo es lo que lee la medida (`medida-lecturas.spec.ts`), que no
 * bloquea; esta prueba sí, porque lo que mira son errores, no estilo:
 *
 * - una capa sin el atributo es una capa que la medida no ve. Las páginas se
 *   sacan del grafo: las que alcanzan `EnBreve.jsx`, `DivisorLecturas.jsx` o
 *   cualquier fichero que ponga el atributo (así entra una capa de una sola
 *   frase, como la de /datos o /laboratorio/cobertura). Y en cada una, todo
 *   bloque con la forma de la capa vecinal (`.cp-en-breve`) lo lleva: un
 *   segundo bloque sin marcar no se esconde detrás del primero;
 * - la capa va antes que el divisor: lo de arriba es lo esencial;
 * - una cifra marcada cuyo detalle no tiene esa cifra, no tiene valor o dice
 *   otro. Una cifra SIN marcar no bloquea: la medida la lista («sin-marcar»)
 *   hasta que alguien case sus dos lados.
 *
 * Lo que la pareja demuestra, dicho sin inflar: en /presupuesto, límite,
 * gastado y descuadre salen de la misma función que su detalle, así que lo
 * que vigilan es que los dos lados sigan cableados al mismo dato y que el
 * ancla exista. La deuda sí compara dos lecturas distintas del fichero (el
 * último saldo y el último punto de la serie).
 */
const grafo = construirGrafoRutas(resolve('src'))
const leer = leerDeDisco(resolve('public/data'))
const alcanzan = (f: string) => [...(grafo.rutasPorFichero.get(resolve(f)) ?? [])]

/** Los ficheros de `src/` que ponen el atributo. */
function conAtributo(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = join(dir, e.name)
    if (e.isDirectory()) return conAtributo(ruta)
    return /\.(jsx|tsx|js|ts)$/.test(e.name) &&
      readFileSync(ruta, 'utf8').includes('data-lectura-vecinal=')
      ? [ruta]
      : []
  })
}
const MARCADORES = conAtributo(resolve('src'))
const RUTAS = [
  ...new Set(
    ['src/components/EnBreve.jsx', 'src/components/DivisorLecturas.jsx', ...MARCADORES].flatMap(
      alcanzan,
    ),
  ),
]
  .filter((r) => !RUTAS_LOCALES.includes(r))
  .sort()

function url(ruta: string): string | null {
  if (!ruta.includes(':')) return ruta
  const { id } = fichaDe(ruta, leer)
  return id ? ruta.replace(/:[A-Za-z]+/, encodeURIComponent(id)) : null
}

/** La cifra de cada tarjeta de /presupuesto que tiene pareja en su detalle. */
const PAREJAS_PRESUPUESTO: Record<string, string> = {
  limite: 'definitivo',
  gastado: 'ejecutado',
  deuda: 'deuda',
  rareza: 'descuadre',
}

test('mide algo: el grafo encuentra las páginas con capa vecinal', () => {
  expect(MARCADORES.length).toBeGreaterThanOrEqual(7)
  for (const r of [
    '/presupuesto',
    '/contratos',
    '/empleo',
    '/cambios',
    '/datos',
    '/quejas',
    '/laboratorio/cobertura',
  ]) {
    expect(RUTAS).toContain(r)
  }
})

test('/presupuesto: cada tarjeta con pareja sigue marcada, y coincide', async ({ page }) => {
  await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
  // La deuda es la última en llegar (su propio fichero): con ella a la vista,
  // las tarjetas que hoy existen ya están.
  await expect(page.locator('[data-en-breve="deuda"]')).toBeVisible({ timeout: 10_000 })
  const m = await page.evaluate(medirLecturas, { jerga: JARGON, alto: 629 })
  const conPareja = m.cifras.filter((c) => c.tarjeta in PAREJAS_PRESUPUESTO)
  expect(conPareja.length, 'ninguna tarjeta con pareja en /presupuesto').toBeGreaterThanOrEqual(3)
  for (const c of conPareja) {
    expect(c, `la tarjeta «${c.tarjeta}» perdió su marca o su pareja`).toEqual({
      tarjeta: c.tarjeta,
      clave: PAREJAS_PRESUPUESTO[c.tarjeta],
      estado: 'coincide',
    })
  }
})

for (const ruta of RUTAS) {
  const destino = url(ruta)
  test(`${ruta}: la capa vecinal lleva su atributo, y sus cifras marcadas coinciden`, async ({
    page,
  }) => {
    test.skip(!destino, `${ruta}: SIN FICHA con la que leerla`)
    await page.goto(destino!, { waitUntil: 'domcontentloaded' })
    // Sin su flag de lanzamiento, /eficiencia redirige a la portada (CLAUDE.md:
    // los flags se leen al construir y en local no están).
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
    test.skip(
      new URL(page.url()).pathname !== new URL(destino!, 'http://x').pathname,
      `${ruta}: la página redirige; ¿build sin su flag de lanzamiento?`,
    )
    const capa = page.locator('[data-lectura-vecinal]').first()
    await expect(capa, `${ruta}: ninguna capa con data-lectura-vecinal`).toBeVisible({
      timeout: 10_000,
    })

    const sinMarcar = await page
      .locator('.cp-en-breve:not([data-lectura-vecinal])')
      .evaluateAll((els) => els.map((e) => e.outerHTML.slice(0, 120)))
    expect(sinMarcar, `${ruta}: bloques de la capa vecinal sin el atributo`).toEqual([])

    const antesDelDivisor = await page.evaluate(() => {
      const divisor = document.querySelector('[data-divisor-lecturas]')
      if (!divisor) return true
      return [...document.querySelectorAll('[data-lectura-vecinal]')].every((capa) =>
        Boolean(capa.compareDocumentPosition(divisor) & Node.DOCUMENT_POSITION_FOLLOWING),
      )
    })
    expect(antesDelDivisor, `${ruta}: una capa vecinal va debajo del divisor`).toBe(true)

    const m = await page.evaluate(medirLecturas, { jerga: JARGON, alto: 629 })
    const rotas = m.cifras.filter((c) => c.estado !== 'coincide' && c.estado !== 'sin-marcar')
    expect(rotas, `${ruta}: cifras marcadas que su detalle no sostiene`).toEqual([])
  })
}

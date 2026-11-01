import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { collectErrors, appErrors } from './_console'
import { REPORTAJE_SLUGS } from '../../src/reportajes'

// Las piezas publicadas, leídas de sus snapshots: una en borrador no pinta su
// columna, y saltársela sin decirlo sería medir menos de lo que dice el título.
const publicadas = REPORTAJE_SLUGS.filter(
  (slug) =>
    JSON.parse(readFileSync(`public/data/reportajes/${slug}.json`, 'utf8')).meta.estado ===
    'publicado',
)

test.describe('Reportajes index (/reportajes)', () => {
  test('lists both published reportajes and navigates to the newest', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/reportajes', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { level: 1, name: /Reportajes/ })).toBeVisible({
      timeout: 8000,
    })
    // Both published piezas list, newest first (shared registry order).
    await expect(page.getByRole('heading', { name: /panel se enciende y se apaga/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: /destino inteligente/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: /calle a calle/ })).toBeVisible()

    // Card title links straight into the pieza.
    await page
      .getByRole('link', { name: /destino inteligente/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/reportajes\/inteligencia-turistica$/)
    await expect(page.getByRole('heading', { name: /destino inteligente/ })).toBeVisible({
      timeout: 8000,
    })

    expect(appErrors(errors)).toEqual([])
  })

  // La ficha entera es un enlace (un `::after` del titular la cubre). El término
  // del glosario en «Con N correcciones publicadas» tiene que quedar ENCIMA de
  // esa capa: si no, el clic abre la pieza en vez de la definición. Playwright
  // falla el clic si otro elemento recibe el puntero, así que esto lo mide.
  for (const ancho of [1280, 375]) {
    test(`«correcciones publicadas» abre su definición sin salir del índice (${ancho} px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: ancho, height: 900 })
      await page.goto('/reportajes', { waitUntil: 'domcontentloaded' })
      const termino = page
        .getByRole('button', { name: /^correcci(ón publicada|ones publicadas)$/ })
        .first()
      await expect(termino).toBeVisible({ timeout: 8000 })
      await termino.click()
      await expect(termino).toHaveAttribute('aria-expanded', 'true')
      const panel = page.locator(`[id="${await termino.getAttribute('aria-controls')}"]`)
      await expect(panel).toContainText(
        'Una nota fechada que añadimos al final de una pieza ya publicada',
      )
      await expect(page).toHaveURL(/\/reportajes$/)
    })
  }
})

test.describe('Landing editorial feed', () => {
  test('teases every published reportaje, not just the first', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('link', { name: /destino inteligente/ }).first()).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByRole('link', { name: /calle a calle/ }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /Quince años/ }).first()).toBeVisible()
  })

  test('las correcciones se dicen en una frase neutra que abre el glosario', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const chip = page.locator('[data-correcciones]').first()
    await expect(chip).toBeVisible({ timeout: 10_000 })
    await expect(chip).toHaveText(/^Con \d+ correcci(ón publicada|ones publicadas)$/)
    await expect(chip).toHaveCSS('text-transform', 'none')
    const termino = chip.getByRole('button')
    await termino.click()
    await expect(termino).toHaveAttribute('aria-expanded', 'true')
    await expect(
      page.locator(`[id="${await termino.getAttribute('aria-controls')}"]`),
    ).toContainText('Una nota fechada que añadimos al final de una pieza ya publicada')
  })
})

// La columna de lectura: el texto de cuerpo va a la medida y las cajas a todo el
// ancho, pero TODO arranca en el mismo borde izquierdo. Con la medida centrada,
// el texto empezaba 90px a la derecha de tablas y tarjetas, y ninguna spec lo
// veía: todas afirman sobre texto y datos, no sobre dónde cae un borde.
test.describe('La columna de las piezas', () => {
  test('mira algo: hay piezas publicadas que medir', () => {
    expect(publicadas.length).toBeGreaterThan(0)
  })

  for (const slug of publicadas) {
    test(`${slug}: texto y cajas comparten el borde izquierdo`, async ({ page }) => {
      await page.goto(`/reportajes/${slug}`, { waitUntil: 'domcontentloaded' })
      await page.locator('.cp-pieza [data-seccion]').first().waitFor({ timeout: 8000 })
      const r = await page.evaluate(() => {
        const pieza = document.querySelector('.cp-pieza') as HTMLElement
        const cs = getComputedStyle(pieza)
        const caja = pieza.getBoundingClientRect()
        const L = caja.left + parseFloat(cs.paddingLeft)
        const columna = caja.right - parseFloat(cs.paddingRight) - L
        const medida = parseFloat(getComputedStyle(document.documentElement).fontSize) * 38
        const bloques = Array.from(pieza.children)
          // La banda de cierre (`.cp-registro`) se mide por dentro, como un
          // <article>: el borde que importa es el de su texto, no sólo el suyo.
          .flatMap((c) =>
            c.tagName === 'ARTICLE'
              ? Array.from(c.children)
              : c.classList.contains('cp-registro')
                ? [c, ...Array.from(c.children)]
                : [c],
          )
          .map((el) => el.getBoundingClientRect())
          .filter((b) => b.width > 0)
        const parrafos = Array.from(
          pieza.querySelectorAll(
            ':scope > p:not(.cp-ancho), :scope > article > p:not(.cp-ancho), :scope > .cp-registro > p:not(.cp-ancho)',
          ),
        ).map((p) => p.getBoundingClientRect().width)
        return {
          columna,
          medida,
          desvios: bloques.map((b) => Math.round(b.left - L)).filter((d) => Math.abs(d) > 1),
          estrechos: bloques.filter((b) => b.width <= medida + 1 && b.width < columna - 1).length,
          anchos: bloques.filter((b) => b.width >= columna - 1).length,
          parrafos: parrafos.length,
          parrafoMasAncho: Math.max(...parrafos),
        }
      })
      // Mira algo: la medida está activa —hay texto más estrecho que la columna—
      // y hay cajas a todo el ancho; sin las dos, «mismo borde» no distingue nada.
      expect(r.medida).toBeLessThan(r.columna)
      expect(r.estrechos).toBeGreaterThanOrEqual(5)
      expect(r.anchos).toBeGreaterThanOrEqual(1)
      expect(r.parrafos).toBeGreaterThan(0)
      expect(r.desvios, 'bloques que no arrancan en el borde de la columna').toEqual([])
      expect(r.parrafoMasAncho).toBeLessThanOrEqual(r.medida + 1)
    })
  }
})

// «Lo que hemos encontrado»: cada clave lleva a la sección que la prueba. Un
// número de sección que la pieza no pinta sería un enlace a ninguna parte, y
// eso sólo se ve con la pieza pintada: la numeración vive en su JSX.
test.describe('Las claves de las piezas', () => {
  for (const slug of publicadas) {
    test(`${slug}: cada clave enlaza a una sección que existe, y el salto llega`, async ({
      page,
    }) => {
      const { claves } = JSON.parse(readFileSync(`public/data/reportajes/${slug}.json`, 'utf8'))
      await page.goto(`/reportajes/${slug}`, { waitUntil: 'domcontentloaded' })
      const caja = page.locator('[data-claves]')
      await expect(caja.getByRole('heading', { name: 'Lo que hemos encontrado' })).toBeVisible({
        timeout: 8000,
      })
      await expect(caja.locator('li')).toHaveCount(claves.length)
      for (const c of claves) {
        await expect(
          page.locator(`[data-seccion="${c.seccion}"]#seccion-${c.seccion}`),
        ).toHaveCount(1)
      }
      // El salto, con la última: la más lejos de la caja.
      const ultima = claves[claves.length - 1]
      await caja.locator(`a[href="#seccion-${ultima.seccion}"]`).first().click()
      await expect(page.locator(`#seccion-${ultima.seccion}`)).toBeInViewport()
    })
  }
})

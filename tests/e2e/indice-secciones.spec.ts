import { test, expect, type Page } from '@playwright/test'

/**
 * El índice de la lectura experta. Una página de dieciséis pantallas a 375 px sin
 * forma de saltar es la carga que el índice existe para quitar, así que se mide
 * lo que le pasa a un lector: que lo encuentra, que le acompaña al bajar y que al
 * elegir un apartado aterriza en él sin que nada se lo tape.
 */
const RUTAS = ['/presupuesto', '/contratos', '/cargos', '/plenos', '/quejas']

const indice = (page: Page) => page.locator('nav.cp-indice-pegado')
const seccionesConDatos = (page: Page) =>
  page.evaluate(
    () =>
      [...document.querySelectorAll('.cp-page [data-seccion-experta]')].filter(
        (s) => (s.querySelector('.cp-experta-cuerpo')?.childNodes.length ?? 0) > 0,
      ).length,
  )

for (const [nombre, ancho, alto] of [
  ['escritorio', 1280, 900],
  ['375 px', 375, 812],
] as const) {
  test.describe(`índice de secciones · ${nombre}`, () => {
    test.use({ viewport: { width: ancho, height: alto } })

    for (const ruta of RUTAS) {
      test(`${ruta}: acompaña al bajar y aterriza sin taparse`, async ({ page }) => {
        await page.goto(ruta, { waitUntil: 'domcontentloaded' })
        const nav = indice(page)
        await expect(nav.locator('summary')).toContainText('apartados', { timeout: 15000 })

        // El recuento es el de las secciones que hay de verdad, una vez cargadas.
        await expect
          .poll(async () => {
            const n = await seccionesConDatos(page)
            const dice = await nav.locator('summary').innerText()
            return dice.includes(`${n} apartados`)
          })
          .toBe(true)

        // Sigue a la vista al final de la página.
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
        await expect
          .poll(() => nav.evaluate((el) => Math.round(el.getBoundingClientRect().top)))
          .toBeLessThan(80)

        // Se elige el último, el más lejano.
        await nav.locator('summary').click()
        const enlaces = nav.getByRole('link')
        await expect(enlaces.first()).toBeVisible()
        const n = await enlaces.count()
        expect(n, 'el índice no tiene ningún apartado').toBeGreaterThanOrEqual(3)
        const href = await enlaces.nth(n - 1).getAttribute('href')
        await enlaces.nth(n - 1).click()
        await expect(page).toHaveURL(new RegExp(`${href}$`))

        // Se ha cerrado, y el destino queda debajo de la barra y del índice.
        await expect(nav.locator('details')).not.toHaveAttribute('open')
        const id = href!.slice(1)
        await expect
          .poll(() =>
            page.evaluate((i) => {
              const destino = document.getElementById(i)!.getBoundingClientRect().top
              const indice = document.querySelector('nav.cp-indice-pegado')!
              return destino - indice.getBoundingClientRect().bottom
            }, id),
          )
          .toBeGreaterThanOrEqual(0)
      })
    }

    test('abre el apartado aunque el lector haya plegado la lectura experta', async ({ page }) => {
      await page.addInitScript(() =>
        localStorage.setItem('cp:tweaks', JSON.stringify({ lecturas: 'esencial' })),
      )
      await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
      const nav = indice(page)
      await expect(nav.locator('summary')).toContainText('apartados', { timeout: 15000 })
      await nav.locator('summary').click()
      const enlaces = nav.getByRole('link')
      await expect(enlaces.first()).toBeVisible()
      const href = await enlaces.nth(1).getAttribute('href')
      await enlaces.nth(1).click()
      const cuerpo = page.locator(`${href}-cuerpo`)
      await expect(cuerpo).toBeVisible()
    })

    test('por encima del mapa, que se pinta con sus propios planos', async ({ page }) => {
      await page.goto('/contratos#mapa-gasto', { waitUntil: 'domcontentloaded' })
      const nav = indice(page)
      await expect(nav.locator('summary')).toContainText('apartados', { timeout: 15000 })
      await expect
        .poll(() =>
          nav.evaluate((el) => {
            const b = el.getBoundingClientRect()
            const arriba = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
            return !!arriba && el.contains(arriba)
          }),
        )
        .toBe(true)
    })
  })
}

test('una página corta no lleva índice', async ({ page }) => {
  await page.goto('/empleo', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('[data-divisor-lecturas]')).toBeVisible({ timeout: 15000 })
  await expect(page.locator('nav.cp-indice-pegado')).toHaveCount(0)
})

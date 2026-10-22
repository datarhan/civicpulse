import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

/**
 * «En breve», la primera capa de /presupuesto (src/components/EnBreve.jsx).
 *
 * La prueba unitaria mide las cifras y las palabras; ésta mide lo que sólo se
 * ve con la página entera: que cada «Ver el detalle» lleva a una sección que
 * EXISTE en esta página —un ancla rota deja al vecino en lo alto sin decirle
 * nada—, que el término del glosario se abre con el teclado, y que a 375 px el
 * bloque no se sale de su columna.
 */
test.describe('/presupuesto · En breve', () => {
  test('cada respuesta enlaza a una sección que existe', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    const bloque = page.locator('[data-en-breve-bloque]')
    await expect(bloque.getByRole('heading', { name: 'En breve' })).toBeVisible({ timeout: 10000 })

    const hrefs = await bloque
      .locator('a[href^="#"]')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href')))
    // Mide algo: las cuatro tarjetas, el mapa y el «saltar».
    expect(hrefs.length).toBeGreaterThanOrEqual(6)
    for (const href of new Set(hrefs)) {
      await expect(page.locator(href!), `${href} no está en la página`).toHaveCount(1)
    }
    expect(appErrors(errors)).toEqual([])
  })

  test('el término del glosario se abre con el teclado', async ({ page }) => {
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    const termino = page.locator('[data-en-breve="gastado"] .cp-termino')
    await expect(termino).toBeVisible({ timeout: 10000 })
    await termino.focus()
    await page.keyboard.press('Enter')
    await expect(termino).toHaveAttribute('aria-expanded', 'true')
    // `useId` da ids como «:r3:-def», que un selector `#…` no admite sin escapar.
    const panel = page.locator(`[id="${await termino.getAttribute('aria-controls')}"]`)
    await expect(panel).toContainText('Obligaciones reconocidas')
  })

  test('a 375 px ninguna tarjeta se sale del bloque', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-en-breve="deuda"]')).toBeVisible({ timeout: 10000 })
    const medidas = await page.evaluate(() => {
      const bloque = document.querySelector('[data-en-breve-bloque]')!.getBoundingClientRect()
      return [...document.querySelectorAll('[data-en-breve-bloque] *')].map((el) => {
        const r = el.getBoundingClientRect()
        return { fuera: r.width > 0 && (r.left < bloque.left - 1 || r.right > bloque.right + 1) }
      })
    })
    expect(medidas.length, 'el bloque no tiene nada que medir').toBeGreaterThan(50)
    expect(medidas.filter((m) => m.fuera)).toEqual([])
  })
})

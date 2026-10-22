import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

/**
 * «En breve» de /metodologia (src/components/metodologia/EnBreveMetodologia.jsx):
 * cada respuesta lleva a la regla que la sostiene, en la página compuesta, y a
 * 375 px el recorrido de cinco pasos cabe en su columna.
 */
test.describe('/metodologia · En breve', () => {
  test('cada ancla del bloque aterriza en una regla de la página', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/metodologia', { waitUntil: 'domcontentloaded' })
    const bloque = page.locator('[data-en-breve-bloque]')
    await expect(bloque.getByRole('heading', { name: 'En breve' })).toBeVisible({ timeout: 10000 })
    const hrefs = await bloque
      .locator('a[href^="#"]')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href')))
    expect(hrefs.length).toBeGreaterThanOrEqual(5)
    for (const href of new Set(hrefs)) {
      await expect(page.locator(href!), `${href} no está en la página`).toHaveCount(1)
    }
    expect(appErrors(errors)).toEqual([])
  })

  test('a 375 px nada se sale del bloque', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto('/metodologia', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-en-breve="error"]')).toBeVisible({ timeout: 10000 })
    const fuera = await page.evaluate(() => {
      const b = document.querySelector('[data-en-breve-bloque]')!.getBoundingClientRect()
      return [...document.querySelectorAll('[data-en-breve-bloque] *')].filter((el) => {
        const r = el.getBoundingClientRect()
        return r.width > 0 && (r.left < b.left - 1 || r.right > b.right + 1)
      }).length
    })
    expect(fuera).toBe(0)
  })
})

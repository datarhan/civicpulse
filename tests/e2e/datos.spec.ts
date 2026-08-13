import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('Datos (/datos)', () => {
  test('renders Wikidata + padrón chart + dataset catalog', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/datos', { waitUntil: 'domcontentloaded' })

    // i18n title (src/i18n.jsx:91).
    await expect(page.getByText('Datos abiertos').first()).toBeVisible({ timeout: 8000 })

    // Padrón section heading (src/pages/Datos.jsx:372).
    await expect(page.getByText('Población residente').first()).toBeVisible()

    // Dataset catalog list copy (src/pages/Datos.jsx:513).
    await expect(
      page.getByText(/Catálogo de datasets · snapshots JSON regenerados por el pipeline/i).first(),
    ).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })
})

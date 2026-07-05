import { test, expect } from '@playwright/test'

test.describe('Empleo (/empleo)', () => {
  test('lists open vacancies, filters, and drills into a detail ficha', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/empleo', { waitUntil: 'domcontentloaded' })

    // i18n page title (src/i18n.jsx empleo.title).
    await expect(page.getByText('Ofertas de empleo').first()).toBeVisible({ timeout: 8000 })

    // At least one offer row links to a detail route.
    const offerRows = page.locator('a[href^="/empleo/"]')
    await expect(offerRows.first()).toBeVisible()
    const initialCount = await offerRows.count()
    expect(initialCount).toBeGreaterThan(0)

    // "Solo Riba-roja" toggle narrows the list (agency feed is comarca-wide).
    await page.getByRole('checkbox').check()
    await expect(async () => {
      const filtered = await offerRows.count()
      expect(filtered).toBeGreaterThan(0)
      expect(filtered).toBeLessThanOrEqual(initialCount)
    }).toPass()
    await page.getByRole('checkbox').uncheck()

    // Search narrows by title/código.
    await page.getByRole('searchbox').fill('zzz-no-match-xyz')
    await expect(page.getByText(/No hay ofertas que coincidan/i)).toBeVisible()
    await page.getByRole('searchbox').fill('')

    // Drill into the first offer → detail page renders código + apply CTA.
    await offerRows.first().click()
    await expect(page).toHaveURL(/\/empleo\/[^/]+$/)
    await expect(page.getByText('Datos generales').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('link', { name: /Inscribirse en el portal/i })).toBeVisible()

    // Back link returns to the list.
    await page.getByRole('link', { name: /Volver a ofertas/i }).click()
    await expect(page).toHaveURL(/\/empleo$/)

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })
})

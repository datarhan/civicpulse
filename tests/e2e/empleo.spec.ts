import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('Empleo (/empleo)', () => {
  test('renders stats + charts and paginates the list', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/empleo', { waitUntil: 'domcontentloaded' })

    // i18n page title (empleo.title).
    await expect(page.getByText('Ofertas de empleo').first()).toBeVisible({ timeout: 8000 })

    // Stats block: KPI + a chart panel title.
    await expect(page.getByText('Puestos ofertados').first()).toBeVisible()
    await expect(page.getByText('Tipo de contrato').first()).toBeVisible()

    // Paginated list: at most a page of offers, and a working pager.
    const offerRows = page.locator('a[href^="/empleo/"]')
    await expect(offerRows.first()).toBeVisible()
    expect(await offerRows.count()).toBeLessThanOrEqual(12)
    await expect(page.getByText(/Página 1 \/ \d+/)).toBeVisible()
    await page.getByRole('button', { name: /Siguiente/ }).click()
    await expect(page.getByText(/Página 2 \/ \d+/)).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })

  test('opens the lazy municipality map on demand', async ({ page }) => {
    await page.goto('/empleo', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Ofertas de empleo').first()).toBeVisible({ timeout: 8000 })
    // The map (and Leaflet) is not mounted until the reader opts in.
    await expect(page.locator('.leaflet-container')).toHaveCount(0)
    await page.getByRole('button', { name: /Ver mapa de ofertas/ }).click()
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 8000 })
    // Each located municipality renders as a CircleMarker (an SVG path).
    await expect(page.locator('.leaflet-container path').first()).toBeVisible()
  })

  test('filters narrow the list and drill into a detail ficha', async ({ page }) => {
    await page.goto('/empleo', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Ofertas de empleo').first()).toBeVisible({ timeout: 8000 })

    const offerRows = page.locator('a[href^="/empleo/"]')
    await expect(offerRows.first()).toBeVisible()

    // "Solo Riba-roja" toggle activates the clear-filters affordance.
    await page.getByRole('checkbox').check()
    await expect(page.getByRole('button', { name: /Limpiar filtros/ })).toBeVisible()

    // A dimension dropdown (Municipio) is applied, then cleared.
    await page.getByLabel('Municipio').selectOption({ index: 1 })
    await page.getByRole('button', { name: /Limpiar filtros/ }).click()
    await expect(page.getByRole('button', { name: /Limpiar filtros/ })).toHaveCount(0)

    // Text search shows the honest empty state, then is cleared.
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
  })
})

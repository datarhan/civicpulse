import { test, expect } from '@playwright/test'

test.describe('Landing (/)', () => {
  test('renders editorial column + KPI strip with real data', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Editorial header — municipality name always present
    await expect(page.getByText('Riba-roja de Túria').first()).toBeVisible()

    // Mayor name from officials.json (real data, not mock)
    await expect(page.getByText(/Robert Raga/i).first()).toBeVisible({ timeout: 8000 })

    // KPI strip: the labels include the current year ("Población 2025", "Presup. 2025" etc.)
    await expect(page.getByText(/Población/i).first()).toBeVisible()
    await expect(page.getByText(/Presup/i).first()).toBeVisible()

    // Map tiles loaded (Leaflet attribution link appears when tiles are live)
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 8000 })

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })

  test('interactive map layers: control, Servicios default, money toggle, neighborhood popup', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 8000 })

    // Layer control is present. Servicios (civic-POI) is the default flagship,
    // so its legend shows on load and the money timeline does NOT (money is
    // opt-in via its chip).
    await expect(page.getByRole('group', { name: /Capas del mapa/i })).toBeVisible()
    await expect(page.getByText(/Servicios públicos/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /línea de tiempo del gasto/i })).toBeHidden()

    // A neighborhood marker opens the aggregated civic card.
    await page.locator('.cp-osm-neigh').first().click({ force: true })
    await expect(
      page
        .locator('.leaflet-popup-content')
        .getByText(/Población/i)
        .first(),
    ).toBeVisible({ timeout: 6000 })

    // Toggling "Gasto municipal" mounts the money timeline (its play button).
    await page.getByRole('button', { name: /^Gasto municipal$/i }).click()
    await expect(page.getByRole('button', { name: /línea de tiempo del gasto/i })).toBeVisible()
  })
})

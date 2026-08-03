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

  test('has a heading outline a screen reader can navigate', async ({ page }) => {
    // Regression guard. The landing's ONLY heading used to be the LeadStory
    // press headline — so the homepage h1 was a third-party article title, and
    // retiring that block left the page with zero headings. The axe gate stayed
    // green throughout: `page-has-heading-one` and `empty-heading` are
    // best-practice rules, outside the wcag2a/wcag2aa tags a11y.spec.ts filters
    // on. Nothing else in the suite would have noticed.
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.locator('h1')).toHaveText('El Mirador')

    // Every editorial section band is a real h2, so H-key navigation lands on
    // the column's structure instead of skipping the page entirely.
    const h2 = page.locator('h2')
    await expect.poll(() => h2.count(), { timeout: 8000 }).toBeGreaterThanOrEqual(6)

    // No empty headings, and no level skipped between h1 and the first h2.
    const levels = await page.evaluate(() =>
      [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({
        level: +h.tagName[1],
        text: (h.textContent || '').trim(),
      })),
    )
    expect(levels.filter((l) => !l.text)).toEqual([])
    expect(Math.min(...levels.map((l) => l.level))).toBe(1)
  })

  test('interactive map layers: money default, coverage disclosure, neighborhood popup', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 8000 })

    // Located spend is the default layer, not the Servicios directory. A
    // municipal-accountability map opening on a static OSM list of schools put
    // the least mission-relevant layer in the most valuable position.
    await expect(page.getByRole('group', { name: /Capas del mapa/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /línea de tiempo del gasto/i })).toBeVisible()
    await expect(page.locator('path.cp-money-pin').first()).toBeVisible({ timeout: 8000 })

    // The layer must state what share of contracting it can actually show.
    // It paints ~3% of the money — every pin honest, the label implying
    // completeness — so the coverage line is not decoration, it is the
    // difference between a map and a claim.
    await expect(page.getByText(/M€ de [\d.,]+\s?M€ · [\d,]+%/).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(/servicios de ámbito municipal/i).first()).toBeVisible()

    // Named for what it is. "Gasto municipal" promised all of it.
    const control = page.getByRole('group', { name: /Capas del mapa/i })
    await expect(control.getByRole('button', { name: /^Gasto situado$/i })).toBeVisible()
    await expect(control.getByRole('button', { name: /^Gasto municipal$/i })).toHaveCount(0)

    // Obras lost its chip: its source is frozen and 6 of its 11 geolocated
    // fichas shared a point with a located contract. It rides with the money
    // layer now.
    await expect(control.getByRole('button', { name: /Obras/i })).toHaveCount(0)

    // Civic POIs still render underneath, as context for the spend pins.
    await expect(page.getByText(/Servicios públicos/i).first()).toBeVisible()

    // Clicking a money pin opens the contract card with the winner + € detail,
    // and a barrio dot opens the aggregated civic card.
    //
    // Both go through `toPass`, which retries the CLICK, not just the
    // assertion. A single click can land before Leaflet has bound the popup
    // handler for a freshly-mounted layer — this test failed exactly once in a
    // full parallel run and passed alone every time, which is the signature of
    // a race rather than a broken expectation. Retrying the interaction is the
    // honest fix; a longer timeout on the assertion would only have widened the
    // window on a click that never registered.
    await expect(async () => {
      await page.locator('path.cp-money-pin').first().click({ force: true })
      await expect(
        page
          .locator('.leaflet-popup-content')
          .getByText(/Adjudicatario/i)
          .first(),
      ).toBeVisible({ timeout: 2500 })
    }).toPass({ timeout: 15000 })

    // Close the open popup first: an open Leaflet popup swallows the next click.
    await page.keyboard.press('Escape')
    await expect(async () => {
      await page.locator('.cp-osm-neigh-dot').first().click({ force: true })
      await expect(
        page
          .locator('.leaflet-popup-content')
          .getByText(/Población/i)
          .first(),
      ).toBeVisible({ timeout: 2500 })
    }).toPass({ timeout: 15000 })

    // The retired "Tren L9" schematic-train chip is gone; toggling its
    // replacement "Quejas" mounts the citizen-complaint heat layer and shows
    // its per-barrio legend. Scoped to the layer control so unrelated "Quejas"
    // text elsewhere on the landing can't satisfy the assertion.
    const layerControl = page.getByRole('group', { name: /Capas del mapa/i })
    await expect(layerControl.getByRole('button', { name: /Tren L9/i })).toHaveCount(0)
    await layerControl.getByRole('button', { name: /^Quejas$/i }).click()
    await expect(page.getByText(/Quejas por barrio/i).first()).toBeVisible({ timeout: 6000 })
  })
})

import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('Landing (/)', () => {
  test('renders editorial column + KPI strip with real data', async ({ page }) => {
    const errors = collectErrors(page)

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

    expect(appErrors(errors)).toEqual([])
  })

  test('every cumulative contract figure carries its period in visible text', async ({ page }) => {
    // This defect survived two review rounds because it lives in FOUR places.
    // Each round fixed the instance that had been named and shipped; the
    // reviewer read the page again and flagged the next one. So the guard has
    // to be plural: enumerate every surface that publishes the accumulated
    // contract figure, and require each to carry its own span.
    //
    // «Visible text» is load-bearing. An earlier fix put the years in a `title`
    // tooltip, which no phone shows, no scanning reader sees and no `innerText`
    // carries — so the surface reviewer could not observe the fix and re-flagged
    // the page. Everything below reads `innerText`.
    //
    // Count and span are both DERIVED FROM THE SNAPSHOT, never typed here. A
    // hand-copied «698 · 2017–2026» keeps asserting yesterday's numbers after
    // the scraper moves, and pinning the span is what makes this guard bite:
    // the first draft accepted any four-digit year, which the award list's own
    // «28 jul 2026» satisfied — the test passed with the fix ablated.
    const snap = await (await page.request.get('/data/tenders.json')).json()
    const committed = (
      snap.contracts as { status?: string; assignee?: string; awardDate?: string }[]
    ).filter((c) => {
      if (['void', 'abandoned', 'revoked', 'withdrawn'].includes(c.status ?? '')) return false
      if (['awarded', 'formalized', 'finalized', 'closed'].includes(c.status ?? '')) return true
      return (!c.status || c.status === 'unknown') && Boolean(c.assignee)
    })
    const awarded = String(snap.stats.awardedContracts)
    const years = committed
      .map((c) => String(c.awardDate ?? '').slice(0, 4))
      .filter((y) => /^\d{4}$/.test(y))
      .sort()
    const span = years[0] === years[years.length - 1] ? years[0] : `${years[0]}–${years.at(-1)}`
    expect(Number(awarded)).toBeGreaterThan(0)
    expect(span).toMatch(/^\d{4}(–\d{4})?$/)

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Robert Raga/i).first()).toBeVisible({ timeout: 8000 })

    // Every assertion below uses the RETRYING `toContainText`, never a one-shot
    // `innerText()`. The KPI cell exists before its snapshot arrives, rendering
    // «Contratos adj. / — / —» — so `toBeVisible()` passes on a placeholder and
    // a snapshot read taken right after it can measure the empty state. That
    // raced under full-suite parallel load exactly once in four runs.
    // `toContainText` compares against `textContent`, which is also why the
    // uppercase text-transform is not in the way.

    // 1 · KPI strip cell — sits two cells away from «Presup. 2025 · €41,6M».
    const kpi = page.locator('.d-kpi-cell', { hasText: /Contratos adj/i }).first()
    await expect(kpi).toContainText(`Contratos adj. ${span}`, { timeout: 8000 })
    await expect(kpi).toContainText(awarded)

    // 2 · editorial column band — the count sits directly above a list of
    // awards all dated this July, which is what invites "recent" over
    // "accumulated". The span may live in the band or in the line under it, so
    // assert over the whole section, not the band alone.
    const section = page
      .locator('[data-section-band]')
      .filter({ hasText: /Contratos/i })
      .first()
      .locator('xpath=..')
    await expect(section).toContainText(awarded, { timeout: 8000 })
    await expect(section).toContainText(span)

    // 3 · the mayor's government strip, under a «Gobierno municipal · 2025»
    // heading beside a one-year budget.
    const govLink = page
      .locator('a[href="/presupuesto"]')
      .filter({ hasText: /contratos/i })
      .first()
    await expect(govLink).toContainText(awarded, { timeout: 8000 })
    await expect(govLink).toContainText(span)
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

    // The layer must state what share of contracting it can actually show —
    // AND over what period. It paints ~3% of the money — every pin honest, the
    // label implying completeness — so the coverage line is not decoration, it
    // is the difference between a map and a claim. The denominator is nine
    // exercises of awards sitting a few hundred pixels above a one-year
    // «Presup. 2025 · €41,6M», so the span is part of the disclosure, not a
    // decoration on it: the regex requires it rather than tolerating it.
    const coverage = page.getByText(/M€ de [\d.,]+\s?M€ \(\d{4}(–\d{4})?\) · [\d,]+%/).first()
    await expect(coverage).toBeVisible({ timeout: 8000 })
    // Assert the check evaluated something: a regex that matched an empty or
    // absent node would pass `toBeVisible` on nothing at all.
    expect((await coverage.innerText()).trim().length).toBeGreaterThan(10)
    await expect(page.getByText(/servicios de ámbito municipal/i).first()).toBeVisible()

    // Named for what it is. "Gasto municipal" promised all of it.
    const control = page.getByRole('group', { name: /Capas del mapa/i })
    await expect(control.getByRole('button', { name: /^Gasto situado$/i })).toBeVisible()
    await expect(control.getByRole('button', { name: /^Gasto municipal$/i })).toHaveCount(0)

    // Obras lost its chip: its source is frozen and 6 of its 11 geolocated
    // fichas shared a point with a located contract. It rides with the money
    // layer now.
    await expect(control.getByRole('button', { name: /Obras/i })).toHaveCount(0)

    // A chip that reads OFF means nothing of that layer is on the map. The
    // Servicios layer used to paint dimmed underneath the money layer as
    // "context", so the landing opened with its dots down and its legend card
    // up while its own chip read OFF. Both halves are asserted: the chip is
    // off-state AND neither the markers nor the legend exist.
    const servicios = control.getByRole('button', { name: /^Servicios$/i })
    await expect(servicios).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.cp-poi-marker')).toHaveCount(0)
    await expect(page.locator('.cp-poi-legend')).toHaveCount(0)

    // ...and turning it on paints them, so the counts above are a real absence
    // and not two selectors that never matched anything.
    await servicios.click()
    await expect(page.locator('.cp-poi-marker').first()).toBeVisible({ timeout: 6000 })
    expect(await page.locator('.cp-poi-marker').count()).toBeGreaterThan(5)
    await expect(page.locator('.cp-poi-legend')).toBeVisible()

    // The category rides on the silhouette, not on a colour: six greys were one
    // grey. Assert the legend draws as many DISTINCT shapes as it lists rows —
    // a ramp that collapsed back to one encoding would satisfy "has a swatch".
    const siluetas = await page
      .locator('.cp-poi-legend svg path')
      .evaluateAll((ps) => ps.map((p) => p.getAttribute('d')))
    expect(siluetas.length).toBeGreaterThan(3)
    expect(new Set(siluetas).size).toBe(siluetas.length)

    await servicios.click()
    await expect(page.locator('.cp-poi-marker')).toHaveCount(0)

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

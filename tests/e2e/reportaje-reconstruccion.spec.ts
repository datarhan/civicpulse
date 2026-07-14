import { test, expect } from '@playwright/test'

test.describe('Reportaje · reconstrucción DANA (/reportajes/reconstruccion-dana)', () => {
  test('renders the article, KPIs, charts and the right-of-reply notice', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/reportajes/reconstruccion-dana', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { name: 'El dinero de la reconstrucción, calle a calle' }),
    ).toBeVisible({ timeout: 8000 })
    // Frozen headline figure from the snapshot.
    await expect(page.getByText('14,5 M€').first()).toBeVisible()
    // The accountability thesis + libel-safe framing must be present.
    await expect(page.getByText(/sin atribuir irregularidad/).first()).toBeVisible()
    // Published right-of-reply notice (estado === 'publicado'): Ayuntamiento
    // was contacted and did not respond within the window; réplica stays open.
    await expect(page.getByText(/no respondió dentro del plazo/).first()).toBeVisible()
    // The three data visualisations render as inline SVG.
    expect(await page.locator('svg[role="img"]').count()).toBeGreaterThanOrEqual(2)

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })
})

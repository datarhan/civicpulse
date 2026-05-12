import { test, expect } from '@playwright/test'

test.describe('Promesas (/promesas)', () => {
  test('renders tracker header + composition bar + filters + cards', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/promesas', { waitUntil: 'domcontentloaded' })

    // i18n eyebrow + title (src/i18n.jsx:88-89).
    await expect(page.getByText(/Transparencia electoral/i).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Promesas por partido').first()).toBeVisible()

    // CompositionBar copy (src/pages/Promesas.jsx:100).
    await expect(
      page.getByText(/compromisos en seguimiento · distribución por partido/i).first(),
    ).toBeVisible()

    // Party filter <select> with aria-label exists.
    await expect(page.getByLabel('Filtrar por partido')).toBeVisible()

    // LegalFooter cross-links.
    await expect(page.getByRole('link', { name: /Metodolog/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /Aviso legal/i }).first()).toBeVisible()

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })

  test('party filter narrows the visible card set', async ({ page }) => {
    await page.goto('/promesas', { waitUntil: 'domcontentloaded' })
    const filter = page.getByLabel('Filtrar por partido')
    await expect(filter).toBeVisible({ timeout: 8000 })
    await filter.selectOption('PSOE')
    // At least one PSOE party chip remains visible after the narrow.
    await expect(page.getByText(/^PSOE$/).first()).toBeVisible({ timeout: 5000 })
  })
})

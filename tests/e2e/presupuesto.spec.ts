import { test, expect } from '@playwright/test'

test.describe('Presupuesto (/presupuesto)', () => {
  test('renders contracts + BDNS subsidies + spend charts', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })

    // Section heads, hard-coded in src/pages/Presupuesto.jsx
    await expect(page.getByText('Últimos contratos adjudicados').first()).toBeVisible({
      timeout: 8000,
    })
    await expect(page.getByText('Subvenciones · Base Nacional').first()).toBeVisible()
    await expect(page.getByText('En qué se gasta el dinero público').first()).toBeVisible()
    await expect(page.getByText('De dónde vienen los ingresos municipales').first()).toBeVisible()

    // Euro glyph appears somewhere (numeric formatting check, no data echo).
    await expect(page.getByText(/€/).first()).toBeVisible()

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })
})

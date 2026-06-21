import { test, expect } from '@playwright/test'

test.describe('Presupuesto (/presupuesto)', () => {
  test('renders money map dashboard + spend charts + subsidies', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })

    // New money-map dashboard (src/components/Presupuesto/GastoDashboard.jsx)
    await expect(page.getByText('¿A dónde va el dinero en obras?').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('tab', { name: /Explorar contratos/ })).toBeVisible()

    // Existing budget context + subsidies still present
    await expect(page.getByText('En qué se gasta el dinero público').first()).toBeVisible()
    await expect(page.getByText('De dónde vienen los ingresos municipales').first()).toBeVisible()
    await expect(page.getByText('Subvenciones · Base Nacional').first()).toBeVisible()
    await expect(page.getByText(/€/).first()).toBeVisible()

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })

  test('clicking a tab switches the panel', async ({ page }) => {
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    await page.getByRole('tab', { name: /Quién recibe el dinero/ }).click()
    // Leaderboard rows render contractor names; the explorer search box is gone.
    await expect(page.getByPlaceholder('Buscar contrato o empresa…')).toHaveCount(0)
  })
})

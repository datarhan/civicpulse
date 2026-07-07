import { test, expect } from '@playwright/test'

test.describe('Presupuesto · ejecución', () => {
  test('renders the execution section from budget-execution.json', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Ejecución presupuestaria').first()).toBeVisible({ timeout: 8000 })
    // execution figures render (a % and the "ejecutados" label)
    await expect(page.getByText(/Gastos ejecutados/).first()).toBeVisible()
    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })
})

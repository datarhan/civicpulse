import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('Presupuesto · ejecución', () => {
  test('renders the execution section from budget-execution.json', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Ejecución presupuestaria').first()).toBeVisible({ timeout: 8000 })
    // execution figures render (a % and the "ejecutados" label)
    await expect(page.getByText(/Gastos ejecutados/).first()).toBeVisible()
    expect(appErrors(errors)).toEqual([])
  })
})

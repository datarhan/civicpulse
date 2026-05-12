import { test, expect } from '@playwright/test'

test.describe('Plenos (/plenos)', () => {
  test('renders pleno list + agenda + claim ledger sections', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/plenos', { waitUntil: 'domcontentloaded' })

    // Section headers anchored in src/pages/Plenos.jsx (162, 222, 693).
    await expect(page.getByText('Departamentos con más presencia en el pleno').first()).toBeVisible(
      { timeout: 8000 },
    )
    await expect(page.getByText('Plenos recientes').first()).toBeVisible()
    await expect(
      page.getByText('Declaraciones hechas en el pleno · contraste con los datos').first(),
    ).toBeVisible()

    // At least one TopDepartmentsCard chip should link into /departamentos/<slug>.
    await expect(page.locator('a[href^="/departamentos/"]').first()).toBeVisible()

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })

  test('"Ver" expander reveals agenda items inline', async ({ page }) => {
    await page.goto('/plenos', { waitUntil: 'domcontentloaded' })
    // Button label is the literal "Ver" / "Ocultar" toggle (src/pages/Plenos.jsx:109).
    const expander = page.getByRole('button', { name: /^Ver$/ }).first()
    await expect(expander).toBeVisible({ timeout: 8000 })
    await expander.click()
    // Once expanded, agenda rows render canonical UPPERCASE department tags.
    await expect(page.getByText(/URBANISMO|HACIENDA|EDUCACI/).first()).toBeVisible({
      timeout: 5000,
    })
  })
})

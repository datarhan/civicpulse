import { test, expect } from '@playwright/test'

test.describe('Cambios (/cambios)', () => {
  test('renders the rolling-window header + window toggle', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/cambios', { waitUntil: 'domcontentloaded' })

    // i18n eyebrow + title (src/i18n.jsx:109-110).
    await expect(page.getByText('Esta semana en Riba-roja').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Novedades').first()).toBeVisible()

    // WindowToggle buttons (src/pages/Cambios.jsx:9-11).
    await expect(page.getByRole('button', { name: '7 días' })).toBeVisible()
    await expect(page.getByRole('button', { name: '14 días' })).toBeVisible()
    await expect(page.getByRole('button', { name: '30 días' })).toBeVisible()

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })

  test('window toggle updates without crashing', async ({ page }) => {
    await page.goto('/cambios', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '30 días' }).click()
    // The header should still be there after re-render.
    await expect(page.getByText('Novedades').first()).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Queja detail (/quejas/:id)', () => {
  test('unknown id renders the not-found state with a back link', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))

    // quejas.json currently has 0 items, so every /quejas/<id> hits this branch.
    await page.goto('/quejas/q-no-existe', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('No encontrada').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(/Queja q-no-existe/i).first()).toBeVisible()
    const backLink = page.getByRole('link', { name: /Volver al feed público/i })
    await expect(backLink).toHaveAttribute('href', '/quejas')

    expect(errors).toEqual([])
  })
})

import { test, expect } from '@playwright/test'

test.describe('Reportajes index (/reportajes)', () => {
  test('lists both published reportajes and navigates to the newest', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/reportajes', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { level: 1, name: /Reportajes/ })).toBeVisible({
      timeout: 8000,
    })
    // Both published piezas list, newest first (shared registry order).
    await expect(page.getByRole('heading', { name: /destino inteligente/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: /calle a calle/ })).toBeVisible()

    // Card title links straight into the pieza.
    await page
      .getByRole('link', { name: /destino inteligente/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/reportajes\/inteligencia-turistica$/)
    await expect(page.getByRole('heading', { name: /destino inteligente/ })).toBeVisible({
      timeout: 8000,
    })

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })
})

test.describe('Landing editorial feed', () => {
  test('teases every published reportaje, not just the first', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('link', { name: /destino inteligente/ }).first()).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByRole('link', { name: /calle a calle/ }).first()).toBeVisible()
  })
})

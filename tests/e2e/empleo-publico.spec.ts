import { test, expect } from '@playwright/test'

test.describe('Empleo público (/empleo-publico)', () => {
  test('renders the municipal hiring processes', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await page.goto('/empleo-publico', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Empleo público' })).toBeVisible({
      timeout: 8000,
    })
    // distinct from the ADL feed
    await expect(
      page.getByText(/procesos selectivos del propio Ayuntamiento/i).first(),
    ).toBeVisible()
    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })
})

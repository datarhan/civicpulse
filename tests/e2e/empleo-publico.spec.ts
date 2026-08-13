import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('Empleo público (/empleo-publico)', () => {
  test('renders the municipal hiring processes', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/empleo-publico', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Empleo público' })).toBeVisible({
      timeout: 8000,
    })
    // distinct from the ADL feed
    await expect(
      page.getByText(/procesos selectivos del propio Ayuntamiento/i).first(),
    ).toBeVisible()
    expect(appErrors(errors)).toEqual([])
  })
})

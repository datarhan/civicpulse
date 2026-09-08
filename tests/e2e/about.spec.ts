import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('About (/about, English)', () => {
  test('renders the funder-facing thesis page', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/about', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { name: 'CivicPulse — municipal accountability infrastructure' }),
    ).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByText('Who runs your town hall, what it does, what it costs').first(),
    ).toBeVisible()
    await expect(page.getByText("Spain's municipal news deserts").first()).toBeVisible()
    await expect(page.getByText('T1 · Auto').first()).toBeVisible()
    await expect(page.getByText('Operator and independence').first()).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })
})

import { test, expect } from '@playwright/test'

test.describe('About (/about, English)', () => {
  test('renders the funder-facing thesis page', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/about', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { name: 'CivicPulse — municipal accountability infrastructure' }),
    ).toBeVisible({ timeout: 8000 })
    await expect(page.getByText("Spain's municipal news deserts").first()).toBeVisible()
    await expect(page.getByText('T1 · Auto').first()).toBeVisible()
    await expect(page.getByText('Operator and independence').first()).toBeVisible()

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })
})

import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('Blog — Building CivicPulse (/blog/building-civicpulse-with-ai, English)', () => {
  test('renders the engineering post with its section structure', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/blog/building-civicpulse-with-ai', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { name: /accountability stack for my Spanish town/i }),
    ).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('heading', { name: /No backend, on purpose/i })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /Where the AI is not allowed to decide/i }),
    ).toBeVisible()
    // Until 2026-10-15 this asserted «machine inference is never the last step
    // before publication» — a sentence that was false when it was published.
    // The corrected principle is in place, and the sentence it replaced is
    // quoted in the corrections log, which must exist and be reachable.
    await expect(
      page.getByText(/a model never gets the last word on a person or on a failure/i).first(),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Corrections' })).toBeVisible()
    await expect(page.locator('a[href="#corrections"]')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Try it / break it' })).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })
})

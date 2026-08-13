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
    await expect(
      page.getByText(/machine inference is never the last step before publication/i).first(),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Try it / break it' })).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })
})

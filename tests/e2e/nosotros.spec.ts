import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('Nosotros (/nosotros)', () => {
  test('renders identity, funding transparency and impact sections', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/nosotros', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: 'Quiénes somos' })).toBeVisible({
      timeout: 8000,
    })
    await expect(page.getByText('Identidad y responsabilidad editorial').first()).toBeVisible()
    await expect(page.getByText('Quién financia esto').first()).toBeVisible()
    await expect(page.getByText('Impacto en cifras').first()).toBeVisible()
    // Funding-independence commitment is the page's editorial core.
    await expect(page.getByText(/Sin publicidad/).first()).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })
})

import { test, expect } from '@playwright/test'

test.describe('Quejas feed + dashboard', () => {
  test('shows empty-state copy when no quejas have been captured', async ({ page }) => {
    await page.goto('/quejas', { waitUntil: 'networkidle' })
    await expect(page.getByText('Quejas ciudadanas').first()).toBeVisible()

    // With no quejas.json data yet, the feed must not fabricate complaints —
    // it must show the "El canal de quejas ciudadanas ya está abierto" empty state.
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toMatch(/canal de quejas|aún no hay quejas|está abierto/i)
  })

  test('/quejas ↔ /quejas/dashboard are linked and navigate', async ({ page }) => {
    await page.goto('/quejas')
    await page.getByRole('link', { name: /Dashboard analítico/i }).click()
    await expect(page).toHaveURL(/\/quejas\/dashboard$/)
    await expect(page.getByText('Salud del canal de quejas').first()).toBeVisible()

    await page.getByRole('link', { name: /Feed público/i }).click()
    await expect(page).toHaveURL(/\/quejas$/)
  })
})

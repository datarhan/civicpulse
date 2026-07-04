import { test, expect } from '@playwright/test'
import { quejasIsEmpty } from './_quejas'

test.describe('Quejas feed + dashboard', () => {
  test('shows empty-state copy when no quejas have been captured', async ({ page }) => {
    await page.goto('/quejas', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Quejas ciudadanas').first()).toBeVisible()

    // The empty-state only renders when stats.total === 0. Once the bot captures
    // a real queja the committed snapshot is non-empty and this copy is
    // (correctly) gone — gate on the snapshot so coverage restores automatically
    // when it is empty again.
    test.skip(!quejasIsEmpty(), 'quejas.json snapshot is non-empty; empty-state cannot render')

    // With stats.total === 0 the EmptyState renders. Wait for it explicitly so
    // we don't race the fetch — body.innerText() snapshots were flaky here.
    await expect(
      page.getByText(/canal de quejas|aún no hay quejas|está abierto/i).first(),
    ).toBeVisible({ timeout: 8000 })
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

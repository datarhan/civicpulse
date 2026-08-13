import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('LabHealth (/lab-health)', () => {
  test('renders header + stats row + at least one source row', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/lab-health', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText(/Diagnóstico de fuentes/i).first()).toBeVisible({
      timeout: 8000,
    })
    await expect(page.getByRole('heading', { name: 'Salud del laboratorio' })).toBeVisible()

    // Stats row contains at least the "Fuentes" total and the per-tone buckets.
    await expect(page.getByText(/Fuentes/i).first()).toBeVisible()
    await expect(page.getByText(/Frescas/i).first()).toBeVisible()
    await expect(page.getByText(/Sin refresco/i).first()).toBeVisible()

    // At least one source group renders (the dashboard always loads at least
    // one snapshot — officials.json — successfully in this repo).
    await expect(page.getByText(/Corpus c.vico/i).first()).toBeVisible({ timeout: 10_000 })

    // Methodology backlink renders at the foot of the page.
    await expect(page.getByRole('link', { name: /Metodología/i }).first()).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })

  test('linked from /datos header', async ({ page }) => {
    await page.goto('/datos', { waitUntil: 'domcontentloaded' })
    const link = page.locator('a[href="/lab-health"]').first()
    await expect(link).toBeVisible({ timeout: 8000 })
    await link.click()
    await expect(page).toHaveURL(/\/lab-health$/)
  })

  test('linked from /metodologia laboratorio section', async ({ page }) => {
    await page.goto('/metodologia', { waitUntil: 'domcontentloaded' })
    const link = page.locator('a[href="/lab-health"]').first()
    await expect(link).toBeVisible({ timeout: 8000 })
  })
})

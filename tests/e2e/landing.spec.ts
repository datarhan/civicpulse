import { test, expect } from '@playwright/test'

test.describe('Landing (/)', () => {
  test('renders editorial column + KPI strip with real data', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

    await page.goto('/', { waitUntil: 'networkidle' })

    // Editorial header — municipality name always present
    await expect(page.getByText('Riba-roja de Túria').first()).toBeVisible()

    // Mayor name from officials.json (real data, not mock)
    await expect(page.getByText(/Robert Raga/i).first()).toBeVisible({ timeout: 8000 })

    // KPI strip: the labels include the current year ("Población 2025", "Presup. 2025" etc.)
    await expect(page.getByText(/Población/i).first()).toBeVisible()
    await expect(page.getByText(/Presup/i).first()).toBeVisible()

    // Map tiles loaded (Leaflet attribution link appears when tiles are live)
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 8000 })

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })
})

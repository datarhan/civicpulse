import { test, expect } from '@playwright/test'

test.describe('Presupuesto · obras en curso', () => {
  test('renders the obras section from obras.json', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Obras de infraestructura/i).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Porta del Barranc').first()).toBeVisible()
    // Plan RENOVE lote (fichas feb 2024) renders alongside the FEDER lote
    await expect(page.getByText('Asfaltado La Llobatera II').first()).toBeVisible()
    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })
})

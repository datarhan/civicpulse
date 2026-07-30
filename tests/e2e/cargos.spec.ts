import { test, expect } from '@playwright/test'

test.describe('Cargos (/cargos)', () => {
  test('renders the corporación grid with mayor + party breakdown', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })

    // Mayor anchor — officials.json role=alcalde slug is stable.
    await expect(page.getByText('Robert Raga Gadea').first()).toBeVisible({ timeout: 8000 })

    // At least one party label appears (PSOE / PP / VOX / Compromís).
    await expect(page.getByText(/PSOE|PP|VOX|Compromís/).first()).toBeVisible()

    // Concejal cards link to /cargos/<slug>.
    const detailLink = page.locator('a[href^="/cargos/"]').first()
    await expect(detailLink).toBeVisible({ timeout: 8000 })

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })

  test('the alcalde card links Biografía to the published journalist report', async ({ page }) => {
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    // The alcalde has a published agent report, so his Biografía link must be
    // the INTERNAL report route (the old external transparency-listing URL
    // was useless as a biography). Other councillors keep the cvUrl fallback.
    const bioLink = page.locator('a[href^="/laboratorio/agentes/"]', { hasText: 'Biografía' })
    await expect(bioLink.first()).toBeVisible({ timeout: 8000 })
    await bioLink.first().click()
    await expect(page).toHaveURL(/\/laboratorio\/agentes\/a-robert-raga-bio/)
    await expect(page.getByText('Robert Raga Gadea').first()).toBeVisible({ timeout: 8000 })
  })

  test('clicking a councillor link navigates into the detail view', async ({ page }) => {
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    const link = page.locator('a[href^="/cargos/"]').first()
    await expect(link).toBeVisible({ timeout: 8000 })
    const href = await link.getAttribute('href')
    expect(href).toMatch(/^\/cargos\/[a-z0-9-]+$/)
    await link.click()
    await expect(page).toHaveURL(new RegExp(`${href!.replace(/\//g, '\\/')}$`))
    await expect(page.getByText(/nivel de grupo parlamentario|Atribución/i).first()).toBeVisible({
      timeout: 8000,
    })
  })
})

import { test, expect } from '@playwright/test'

test.describe('Laboratorio (/laboratorio)', () => {
  test('renders header, KPI strip, and dashboard rail', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/laboratorio', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByText(/Observatorio de medios · Riba-roja de Túria/i).first(),
    ).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByRole('heading', { name: 'Laboratorio de verificación de prensa' }),
    ).toBeVisible()

    await expect(page.getByText('Artículos auditados').first()).toBeVisible()
    await expect(page.getByText('Tasa de verificación').first()).toBeVisible()
    await expect(page.getByText('Tasa de discrepancia').first()).toBeVisible()
    await expect(page.getByText('Triangulación').first()).toBeVisible()
    await expect(page.getByText('Hallazgos editoriales').first()).toBeVisible()

    await expect(page.getByLabel('Filtrar por medio')).toBeVisible()
    await expect(page.getByLabel('Filtrar por veredicto')).toBeVisible()

    await expect(page.getByText(/Medios auditados/i).first()).toBeVisible()
    await expect(
      page.getByText(/Lo que la prensa local no está siguiendo/i).first(),
    ).toBeVisible()

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })

  test('sidebar has a Laboratorio link that lands on /laboratorio', async ({ page }) => {
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    const link = page
      .locator('.cp-shell-sidebar')
      .getByRole('link', { name: /Laboratorio/i })
      .first()
    await expect(link).toBeVisible({ timeout: 8000 })
    await link.click()
    await expect(page).toHaveURL(/\/laboratorio$/)
  })

  test('methodology footer + right-of-reply CTA render', async ({ page }) => {
    await page.goto('/laboratorio', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Política editorial/i).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('link', { name: /Leer metodología/i }).first()).toBeVisible()
  })
})

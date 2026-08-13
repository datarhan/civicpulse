import { test, expect } from '@playwright/test'
import { appErrors, collectErrors, collectPageErrors } from './_console'

test.describe('Editorial chrome (/metodologia, /aviso-legal, catch-all)', () => {
  test('/metodologia renders the published editorial contract', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/metodologia', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { name: 'Metodología del tracker de promesas' }),
    ).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Qué hacemos y qué no hacemos').first()).toBeVisible()
    await expect(page.getByText(/Verificación de declaraciones de pleno/i).first()).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })

  test('/aviso-legal renders identity + privacy + LOREG sections', async ({ page }) => {
    const errors = collectPageErrors(page)

    await page.goto('/aviso-legal', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { name: 'Aviso legal y política editorial' }),
    ).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Identidad y responsabilidad').first()).toBeVisible()
    await expect(page.getByText('Modo congelado LOREG').first()).toBeVisible()
    await expect(page.getByText(/Datos personales de cargos electos/i).first()).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })

  test('catch-all path redirects to /', async ({ page }) => {
    await page.goto('/this-route-does-not-exist', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/$/)
    // Landing's editorial header is the canonical proof we landed on /.
    await expect(page.getByText('Riba-roja de Túria').first()).toBeVisible({ timeout: 8000 })
  })
})

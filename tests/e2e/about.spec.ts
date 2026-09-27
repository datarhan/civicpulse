import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { collectErrors, appErrors } from './_console'
import { sensibilidadCestas } from '../../src/scraper/dea-sensibilidad'

const DEA = JSON.parse(readFileSync('public/data/dea.json', 'utf8'))

test.describe('About (/about, English)', () => {
  test('renders the funder-facing thesis page', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/about', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { name: 'CivicPulse — municipal accountability infrastructure' }),
    ).toBeVisible({ timeout: 8000 })
    await expect(
      page.getByText('Who runs your town hall, what it does, what it costs').first(),
    ).toBeVisible()
    await expect(page.getByText("Spain's municipal news deserts").first()).toBeVisible()
    await expect(page.getByText('T1 · Auto').first()).toBeVisible()
    await expect(page.getByText('Operator and independence').first()).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })

  test('the no-score rationale comes from the lab snapshot, not a hand-typed figure', async ({
    page,
  }) => {
    // It said four baskets moved the figure "across half the scale"; the lab
    // never measured more than 0.43 against 0.53.
    const s = sensibilidadCestas(DEA.especificaciones)
    await page.goto('/about', { waitUntil: 'domcontentloaded' })
    const parrafo = page.locator('p', { hasText: 'What it will not give you is a score' })
    await expect(parrafo).toBeVisible({ timeout: 8000 })
    await expect(parrafo).not.toContainText('half the scale')
    if (s.puestos && s.puestos.movimiento > 0) {
      await expect(parrafo).toContainText(`in a ranking of ${s.puestos.de} municipalities`)
    } else {
      await expect(parrafo).toContainText('Such a score depends on choices we make')
    }
  })
})

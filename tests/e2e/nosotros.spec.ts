import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { collectErrors, appErrors } from './_console'
import { sensibilidadCestas } from '../../src/scraper/dea-sensibilidad'

const DEA = JSON.parse(readFileSync('public/data/dea.json', 'utf8'))

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

  test('el porqué de «no hay nota» sale del experimento, no de una cifra escrita a mano', async ({
    page,
  }) => {
    // Decía que cuatro cestas movían la puntuación «media escala»; el
    // experimento nunca dio más que 0,43 frente a 0,53. Ahora la frase dice
    // cuántos puestos se mueve Riba-roja, leídos de dea.json.
    const s = sensibilidadCestas(DEA.especificaciones)
    await page.goto('/nosotros', { waitUntil: 'domcontentloaded' })
    const parrafo = page.locator('p', { hasText: 'Lo que no vas a encontrar aquí es una nota' })
    await expect(parrafo).toBeVisible({ timeout: 8000 })
    await expect(parrafo).not.toContainText('media escala')
    if (s.puestos && s.puestos.movimiento > 0) {
      await expect(parrafo).toContainText(`en una clasificación de ${s.puestos.de} municipios`)
    } else {
      await expect(parrafo).toContainText('Una puntuación así depende de decisiones nuestras')
    }
  })
})

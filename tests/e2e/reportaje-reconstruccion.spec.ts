import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { primeraFrase } from '../../src/components/reportajes/CorrectionNote'
import { collectErrors, appErrors } from './_console'

const META = JSON.parse(
  readFileSync('public/data/reportajes/reconstruccion-dana.json', 'utf8'),
).meta

test.describe('Reportaje · reconstrucción DANA (/reportajes/reconstruccion-dana)', () => {
  test('renders the article, KPIs, charts and the right-of-reply notice', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/reportajes/reconstruccion-dana', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { name: 'El dinero de la reconstrucción, calle a calle' }),
    ).toBeVisible({ timeout: 8000 })
    // Frozen headline figure from the snapshot.
    await expect(page.getByText('14,5 M€').first()).toBeVisible()
    // The accountability thesis + libel-safe framing must be present.
    await expect(page.getByText(/sin atribuir irregularidad/).first()).toBeVisible()
    // Published right-of-reply notice (estado === 'publicado'): Ayuntamiento
    // was contacted and did not respond within the window; réplica stays open.
    await expect(page.getByText(/no respondió dentro del plazo/).first()).toBeVisible()
    // The three data visualisations render as inline SVG.
    expect(await page.locator('svg[role="img"]').count()).toBeGreaterThanOrEqual(2)

    expect(appErrors(errors)).toEqual([])
  })

  test('las correcciones van plegadas: el hecho a la vista, el detalle se abre', async ({
    page,
  }) => {
    // El contrato del pliegue (17-08-2026): la corrección sigue llegando al
    // lector ANTES que las cifras —fecha + primera frase visibles— y lo que se
    // pliega es el cuerpo. Derivado del fichero real, no de una cadena.
    expect(META.correcciones.length, 'la pieza perdió sus correcciones').toBeGreaterThan(0)
    await page.goto('/reportajes/reconstruccion-dana', { waitUntil: 'domcontentloaded' })

    const c = META.correcciones[0]
    const resumen = primeraFrase(c.texto)
    await expect(page.getByText(`Corrección · ${c.fecha}`)).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(resumen).first()).toBeVisible()

    // Un trozo del cuerpo que NO está en el summary: oculto hasta abrir.
    const cuerpo = c.texto
      .replace(/\*\*/g, '')
      .slice(resumen.length + 1)
      .trim()
      .split(/\s+/)
      .slice(0, 6)
      .join(' ')
    expect(cuerpo.length, 'la corrección real cabe entera en el summary').toBeGreaterThan(10)
    await expect(page.getByText(cuerpo, { exact: false })).toBeHidden()

    await page.getByText(`Corrección · ${c.fecha}`).click()
    await expect(page.getByText(cuerpo, { exact: false })).toBeVisible()
  })
})

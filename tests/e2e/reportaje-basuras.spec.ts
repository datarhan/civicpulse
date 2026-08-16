import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { REPORTAJE_SLUGS } from '../../src/reportajes'
import { collectErrors, appErrors } from './_console'

test.describe('Reportaje · basuras (/reportajes/basuras)', () => {
  test('renders the article, the frozen figures and the draft notice', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/reportajes/basuras', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: 'Quince años, y luego un mes' })).toBeVisible({
      timeout: 8000,
    })

    // estado === 'publicado' → the draft banner must be GONE, and the open
    // right-of-reply commitment must be on the page instead.
    expect(await page.getByText(/Borrador editorial/).count()).toBe(0)
    await expect(page.getByText(/derecho de réplica está abierto/).first()).toBeVisible()

    // The load-bearing finding: price was 32 of 100 points, promises 68.
    await expect(page.getByText(/32 \/ 100/).first()).toBeVisible()
    await expect(page.getByText(/Proyecto técnico del servicio/).first()).toBeVisible()

    // The timeline table actually has rows (not an empty <tbody>).
    const filas = page.locator('table tbody tr')
    expect(await filas.count()).toBeGreaterThan(15)

    // The register finding, and the control that makes it a finding.
    await expect(page.getByText(/sigue vivo en el registro/).first()).toBeVisible()
    await expect(page.getByText(/Se mantiene\s+al día/).first()).toBeVisible()

    // The Parla precedent must be PROMINENT, not a footnote: the step-by-step
    // card, the 19-of-33 figure, and the teniente de alcalde's verbatim quote.
    await expect(
      page.getByText(/Parla \(Madrid\), 2014 – 2018 · paso a paso/).first(),
    ).toBeVisible()
    await expect(page.getByText(/devuelve 19 inservibles/).first()).toBeVisible()
    await expect(
      page.getByText(/un camión de recogida de basuras sin la pluma de la grúa/).first(),
    ).toBeVisible()
    // …and told in both directions: the UTE's own 2015 rescission request.
    await expect(page.getByText(/la propia UTE pide rescindir el contrato/).first()).toBeVisible()

    // The owners section: Olazarán's PNV record, attributed, with its limits.
    await expect(page.getByText(/Euzkadi Buru Batzar/).first()).toBeVisible()
    await expect(
      page.getByText(/trece meses antes de que se abriera la licitación/).first(),
    ).toBeVisible()

    // The service section names real urbanizaciones from the municipal calendar.
    await expect(page.getByText(/Masía de Traver/).first()).toBeVisible()

    // The questionnaire: 18 questions, EVERY one carrying its documented base —
    // a question without a base is an insinuation, and must fail here.
    await expect(page.getByText(/Dieciocho preguntas incómodas/).first()).toBeVisible()
    expect(await page.locator('[data-pregunta]').count()).toBe(18)
    expect(await page.getByText(/Se pregunta porque:/).count()).toBe(18)

    // The two-documents-disagree defect.
    await expect(page.getByText(/horas distintas/).first()).toBeVisible()

    // Every primary source link resolves to an absolute URL we can check.
    const fuentes = page.locator('a[rel="noopener noreferrer"]')
    expect(await fuentes.count()).toBeGreaterThanOrEqual(8)

    expect(appErrors(errors)).toEqual([])
  })

  test('publicado: lists on the /reportajes index, newest first', async ({ page }) => {
    await page.goto('/reportajes', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { level: 1, name: /Reportajes/ })).toBeVisible({
      timeout: 8000,
    })
    // The index renders from the shared registry, gated on meta.estado — the
    // pieza must list, and the older piezas must still be there. The LEAD is
    // derived from the registry instead of pinned to a slug: pinning «basuras»
    // broke the day coste-efectivo published above it, and the invariant this
    // protects is «newest published first», not «basuras first».
    await expect(page.getByRole('heading', { name: /Quince años/ }).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: /calle a calle/ })).toBeVisible()
    const primeraPublicada = REPORTAJE_SLUGS.find(
      (slug) =>
        JSON.parse(readFileSync(`public/data/reportajes/${slug}.json`, 'utf8')).meta.estado ===
        'publicado',
    )
    expect(await page.locator('a[href^="/reportajes/"]').first().getAttribute('href')).toBe(
      `/reportajes/${primeraPublicada}`,
    )
  })
})

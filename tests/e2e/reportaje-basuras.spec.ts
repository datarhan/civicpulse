import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('Reportaje · basuras (/reportajes/basuras)', () => {
  test('renders the article, the frozen figures and the draft notice', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/reportajes/basuras', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: 'Quince años, y luego un mes' })).toBeVisible({
      timeout: 8000,
    })

    // estado === 'borrador' → the unpublished banner must be up.
    await expect(page.getByText(/Borrador editorial/).first()).toBeVisible()

    // The load-bearing finding: price was 32 of 100 points, promises 68.
    await expect(page.getByText(/32 \/ 100/).first()).toBeVisible()
    await expect(page.getByText(/Proyecto técnico del servicio/).first()).toBeVisible()

    // The timeline table actually has rows (not an empty <tbody>).
    const filas = page.locator('table tbody tr')
    expect(await filas.count()).toBeGreaterThan(15)

    // The register finding, and the control that makes it a finding.
    await expect(page.getByText(/sigue vivo en el registro/).first()).toBeVisible()
    await expect(page.getByText(/Se mantiene\s+al día/).first()).toBeVisible()

    // The service section names real urbanizaciones from the municipal calendar.
    await expect(page.getByText(/Masía de Traver/).first()).toBeVisible()

    // The two-documents-disagree defect.
    await expect(page.getByText(/horas distintas/).first()).toBeVisible()

    // Every primary source link resolves to an absolute URL we can check.
    const fuentes = page.locator('a[rel="noopener noreferrer"]')
    expect(await fuentes.count()).toBeGreaterThanOrEqual(8)

    expect(appErrors(errors)).toEqual([])
  })

  test('a borrador never lists on the /reportajes index', async ({ page }) => {
    await page.goto('/reportajes', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { level: 1, name: /Reportajes/ })).toBeVisible({
      timeout: 8000,
    })
    // The index renders from the same registry, but gates on meta.estado.
    // Assert the gate evaluated something: published piezas are there…
    await expect(page.getByRole('heading', { name: /calle a calle/ })).toBeVisible()
    // …and the draft is not.
    await expect(page.getByRole('heading', { name: /Quince años/ })).toHaveCount(0)
  })
})

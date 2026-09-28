import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { collectErrors, appErrors } from './_console'

const PENDING_REVIEW_COUNT = JSON.parse(
  readFileSync('public/data/promises.json', 'utf8'),
).items.filter(
  (p: { autoPublished?: { reviewState?: string } }) =>
    p.autoPublished?.reviewState === 'pending-review',
).length

test.describe('Promesas (/promesas)', () => {
  test('renders tracker header + composition bar + filters + cards', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/promesas', { waitUntil: 'domcontentloaded' })

    // i18n eyebrow + title (src/i18n.jsx:88-89).
    await expect(page.getByText(/Transparencia electoral/i).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Promesas por partido').first()).toBeVisible()

    // CompositionBar copy (src/pages/Promesas.jsx:100).
    await expect(
      page.getByText(/compromisos en seguimiento · distribución por partido/i).first(),
    ).toBeVisible()

    // Party filter <select> with aria-label exists.
    await expect(page.getByLabel('Filtrar por partido')).toBeVisible()

    // LegalFooter cross-links.
    await expect(page.getByRole('link', { name: /Metodolog/i }).first()).toBeVisible()
    await expect(page.getByRole('link', { name: /Aviso legal/i }).first()).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })

  test('party filter narrows the visible card set', async ({ page }) => {
    await page.goto('/promesas', { waitUntil: 'domcontentloaded' })
    const filter = page.getByLabel('Filtrar por partido')
    await expect(filter).toBeVisible({ timeout: 8000 })
    await filter.selectOption('PSOE')
    // At least one PSOE party chip remains visible after the narrow.
    await expect(page.getByText(/^PSOE$/).first()).toBeVisible({ timeout: 5000 })
  })

  test('auto-published badge renders iff a pending-review promise exists', async ({ page }) => {
    await page.goto('/promesas', { waitUntil: 'domcontentloaded' })
    // Wait for cards to render before asserting presence/absence.
    await expect(
      page.getByText(/compromisos en seguimiento · distribución por partido/i).first(),
    ).toBeVisible({ timeout: 8000 })

    const badge = page.getByText('publicada automáticamente · revisión pendiente')
    if (PENDING_REVIEW_COUNT > 0) {
      await expect(badge.first()).toBeVisible({ timeout: 5000 })
    } else {
      await expect(badge).toHaveCount(0)
    }
  })

  /**
   * La insignia es la frase más larga de su fila, y la fila no partía línea: a
   * 375 px se apretaba en cuatro renglones de 133 px y asomaba 27 px fuera de la
   * tarjeta. Con las fuentes de reserva de la CI (Linux, antes de que cargue la
   * web) empujaba además el documento a 382 px, y sólo ESO lo ve la prueba de
   * anchura de `mobile.spec.ts` — el desborde dentro de la página no lo ve
   * nadie. Ésta mide la insignia contra su propia fila, con las fuentes web
   * cortadas y una promesa en revisión puesta a mano: no depende de lo que el
   * curador automático haya publicado esa semana, así que nunca mide nada.
   */
  test('at 375px the auto-published badge stays inside its card', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort())
    await page.route('**/data/promises.json', async (route) => {
      const datos = await (await route.fetch()).json()
      datos.items[0] = {
        ...datos.items[0],
        autoPublished: { ...datos.items[0].autoPublished, reviewState: 'pending-review' },
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(datos),
      })
    })

    await page.goto('/promesas', { waitUntil: 'domcontentloaded' })
    const badge = page.getByText('publicada automáticamente · revisión pendiente').first()
    await expect(badge).toBeVisible({ timeout: 8000 })

    const m = await badge.evaluate((el) => {
      const b = el.getBoundingClientRect()
      const fila = el.parentElement!.getBoundingClientRect()
      return {
        izquierda: b.left,
        derecha: b.right,
        filaIzquierda: fila.left,
        filaDerecha: fila.right,
        documento: document.documentElement.scrollWidth,
        vista: document.documentElement.clientWidth,
      }
    })
    expect(m.derecha, 'la insignia asoma por la derecha de su fila').toBeLessThanOrEqual(
      m.filaDerecha + 0.5,
    )
    expect(m.izquierda).toBeGreaterThanOrEqual(m.filaIzquierda - 0.5)
    expect(m.documento).toBeLessThanOrEqual(m.vista)
  })
})

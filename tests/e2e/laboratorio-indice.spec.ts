import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

// /laboratorio, el índice (auditoría de las dos lecturas, §23). Hasta el
// 29-10-2026 esta ruta era el laboratorio de prensa entero; ahora presenta los
// experimentos, una pregunta cada uno, y el de prensa vive en su ruta.
test.describe('Laboratorio, el índice (/laboratorio)', () => {
  test('presenta los experimentos con su pregunta, y cada tarjeta lleva a su página', async ({
    page,
  }) => {
    const errors = collectErrors(page)
    await page.goto('/laboratorio', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1, name: 'Laboratorio' })).toBeVisible({
      timeout: 8000,
    })
    await expect(page.locator('[data-laboratorio-lede]')).toContainText(
      'Nada de esto es una nota sobre nadie',
    )

    const tarjetas = page.locator('[data-experimento]')
    const rutas = await tarjetas.evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-experimento')),
    )
    // Mira algo: los experimentos, los datos y su salud.
    expect(rutas.length).toBeGreaterThan(5)
    expect(rutas).toContain('/laboratorio/prensa')
    expect(rutas).toContain('/laboratorio/frontera')
    expect(rutas).toContain('/lab-health')
    expect(rutas).not.toContain('/laboratorio')
    // Ni una clave cruda del catálogo pintada como pregunta.
    for (const h of await tarjetas.locator('h2').allInnerTexts()) {
      expect(h).not.toMatch(/laboratorio\.pregunta|undefined/)
    }

    await page.locator('[data-experimento="/laboratorio/prensa"] h2 a').click()
    await expect(page).toHaveURL(/\/laboratorio\/prensa$/)
    await expect(
      page.getByRole('heading', { name: 'Laboratorio de verificación de prensa' }),
    ).toBeVisible({ timeout: 8000 })
    expect(appErrors(errors)).toEqual([])
  })

  test('el laboratorio de prensa dice que es uno de los experimentos y enlaza al índice', async ({
    page,
  }) => {
    await page.goto('/laboratorio/prensa', { waitUntil: 'domcontentloaded' })
    const vuelta = page
      .getByText('Es uno de los experimentos del')
      .locator('a[href="/laboratorio"]')
    await expect(vuelta).toBeVisible({ timeout: 8000 })
    await vuelta.click()
    await expect(page).toHaveURL(/\/laboratorio$/)
  })
})

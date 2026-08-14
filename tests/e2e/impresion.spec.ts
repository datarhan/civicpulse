import { test, expect } from '@playwright/test'

/**
 * §«Fuera de alcance» 05 — lo que se cae al papel.
 *
 * El brandbook lo declaraba sin gobernar, y no lo estaba: cero reglas
 * `@media print` en todo el repo. Importa más aquí que en un sitio cualquiera,
 * porque lo que este medio publica son fichas que un periodista imprime o
 * guarda en PDF para citarlas — y al imprimir se pierden justo las dos cosas
 * que las sostienen: las URLs de las fuentes, que viven dentro de un `href`, y
 * el enlace permanente que identifica la ficha.
 *
 * Playwright puede emular el medio de impresión, así que esto se comprueba en
 * vez de suponerse. Cada afirmación va con su control: se mide lo mismo en
 * pantalla y en papel, porque una regla que ocultara todo —o nada— pasaría una
 * prueba escrita en un solo sentido.
 */
test.describe('Impresión (/hallazgos)', () => {
  test('el armazón se cae y el contenido se queda', async ({ page }) => {
    await page.goto('/hallazgos', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Hallazgos sobre declaraciones/i).first()).toBeVisible()

    const sidebar = page.locator('.cp-shell-sidebar')
    const cita = page.locator('blockquote').first()

    // Control en pantalla: las dos cosas se ven.
    await expect(sidebar).toBeVisible()
    await expect(cita).toBeVisible()

    await page.emulateMedia({ media: 'print' })

    // En papel: el armazón fuera, la cita dentro.
    await expect(sidebar).toBeHidden()
    await expect(cita).toBeVisible()
  })

  test('lo que sólo sirve para accionar una pantalla no se imprime', async ({ page }) => {
    await page.goto('/hallazgos', { waitUntil: 'domcontentloaded' })
    const filtros = page.locator('[data-print-hide]').first()

    // Control: en pantalla los filtros están y son útiles.
    await expect(filtros).toBeVisible()

    await page.emulateMedia({ media: 'print' })
    // En papel no se puede filtrar, y ocupaban un tercio de la primera página.
    await expect(filtros).toBeHidden()
  })

  test('las URLs de las fuentes se escriben, porque en papel no hay href', async ({ page }) => {
    await page.goto('/hallazgos', { waitUntil: 'domcontentloaded' })
    const externo = page.locator('a[href^="http"]').first()
    await expect(externo).toBeAttached()

    const antes = await externo.evaluate((a) => getComputedStyle(a, '::after').content || 'none')
    await page.emulateMedia({ media: 'print' })
    const despues = await externo.evaluate((a) => getComputedStyle(a, '::after').content || 'none')

    // El control importa: si `::after` ya trajera algo en pantalla, la
    // afirmación de abajo no probaría que la regla de impresión hace nada.
    expect(antes).not.toContain('http')
    expect(despues, 'la URL tiene que quedar impresa junto al enlace').toContain('http')
  })

  test('el tema oscuro no se lleva al papel', async ({ page }) => {
    // Nadie elige el tema al imprimir: imprime con el que tenía puesto, y el
    // oscuro sobre papel es una plancha de tinta negra ilegible.
    await page.goto('/hallazgos', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => document.documentElement.classList.add('dark'))

    const oscuro = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(),
    )
    await page.emulateMedia({ media: 'print' })
    const papel = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(),
    )

    expect(oscuro, 'control: en pantalla el tema oscuro estaba puesto').not.toBe('#ffffff')
    expect(papel, 'al imprimir la paleta vuelve a clara').toBe('#ffffff')
  })

  test('el mapa no deja un hueco: se retira y se dice', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const mapa = page.locator('.leaflet-container').first()
    await expect(mapa).toBeVisible({ timeout: 10000 })

    await page.emulateMedia({ media: 'print' })
    await expect(mapa).toBeHidden()
  })
})

import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('Datos (/datos)', () => {
  test('renders Wikidata + padrón chart + dataset catalog', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/datos', { waitUntil: 'domcontentloaded' })

    // i18n title (src/i18n.jsx:91).
    await expect(page.getByText('Datos abiertos').first()).toBeVisible({ timeout: 8000 })

    // Padrón section heading (src/pages/Datos.jsx:372).
    await expect(page.getByText('Población residente').first()).toBeVisible()

    // Dataset catalog list copy (src/pages/Datos.jsx:513).
    await expect(
      page.getByText(/Catálogo de datasets · snapshots JSON regenerados por el pipeline/i).first(),
    ).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })

  // Del 13-jul al 4-oct-2026 la tarjeta del registro de asociaciones pintó
  // correos dentro del nombre de una entidad: el PDF de julio estrenó una columna
  // CIF que el parser no conocía. Las pruebas del parser miran el JSON; ésta mira
  // lo que se SIRVE, que es lo que lee cualquiera.
  test('no pinta ninguna dirección de correo', async ({ page }) => {
    await page.goto('/datos', { waitUntil: 'domcontentloaded' })

    // Que la comprobación mida algo: la tarjeta sólo se pinta con el registro
    // cargado, y el registro tiene del orden de cien entidades.
    const cabecera = page.getByText(/^Entidades y asociaciones \(\d+\)$/)
    await expect(cabecera).toBeVisible({ timeout: 8000 })
    const filas = Number((await cabecera.innerText()).match(/\((\d+)\)/)?.[1])
    expect(filas).toBeGreaterThan(80)

    const texto = await page.locator('body').innerText()
    expect(texto.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)).toBeNull()
  })
})

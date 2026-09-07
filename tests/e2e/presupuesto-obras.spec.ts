import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('Presupuesto · obras en curso', () => {
  test('renders the obras section from obras.json', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Obras de infraestructura/i).first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Porta del Barranc').first()).toBeVisible()
    // Plan RENOVE lote (fichas feb 2024) renders alongside the FEDER lote
    await expect(page.getByText('Asfaltado La Llobatera II').first()).toBeVisible()
    expect(appErrors(errors)).toEqual([])
  })

  test('las fichas van de diez en diez, y la segunda página trae el resto', async ({ page }) => {
    // Catorce fichas seguidas medían más de 1.800 px y dejaban la sección
    // siguiente fuera de la pantalla.
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    const tarjeta = page.locator('.cp-card').filter({ hasText: 'Obras de infraestructura' })
    await expect(tarjeta).toBeVisible({ timeout: 8000 })

    const fichas = () => tarjeta.getByRole('link', { name: /Ver ficha/ }).count()
    // El nombre de la obra vive en la misma fila que su enlace «Ver ficha»;
    // basta el de la primera para saber QUÉ página se está viendo.
    const primera = () =>
      page.evaluate(() => {
        const card = [...document.querySelectorAll('.cp-card')].find((c) =>
          /Obras de infraestructura/.test(c.textContent ?? ''),
        )
        const fila = card?.querySelector('a[rel="noopener noreferrer"]')?.parentElement
        return (fila?.textContent ?? '').trim().slice(0, 40)
      })

    expect(await fichas(), 'la primera página no trae diez fichas').toBe(10)
    const p1 = await primera()
    expect(p1.length, 'no se leyó ninguna ficha en la primera página').toBeGreaterThan(0)

    // El total sigue dicho en la entradilla, aunque en pantalla haya diez.
    await expect(tarjeta).toContainText(/14 obras publicadas/)

    const siguiente = page.getByRole('button', { name: 'Página siguiente del listado de obras' })
    await expect(siguiente).toBeEnabled()
    await siguiente.click()

    // La última página trae el RESTO, no una página vacía ni diez repetidas.
    expect(await fichas(), 'la segunda página no trae las cuatro restantes').toBe(4)
    await expect(siguiente).toBeDisabled()
    // Y son OTRAS fichas: una paginación que repite la página no pagina.
    expect(await primera(), 'la segunda página empieza por la misma obra').not.toBe(p1)
  })
})

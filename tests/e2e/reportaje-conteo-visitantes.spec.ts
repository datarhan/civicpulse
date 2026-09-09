import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

test.describe('Reportaje · conteo de visitantes (/reportajes/conteo-visitantes)', () => {
  test('renders the article, the frozen figures and the load-bearing finding', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/reportajes/conteo-visitantes', { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: /Contar visitantes en un pueblo/ })).toBeVisible(
      { timeout: 8000 },
    )

    // estado === 'publicado' → el aviso de borrador NO puede estar.
    expect(await page.getByText(/Borrador · no publicado/).count()).toBe(0)

    // EL HALLAZGO. Si esta cita desaparece del texto, el reportaje se ha quedado
    // sin lo único que lo sostiene: que el apartado de necesidad de los dos
    // expedientes remite a una actuación que no es ninguno de los dos.
    await expect(page.getByText(/Realidad aumentada destinada a la puesta en valor/)).toBeVisible()
    await expect(page.getByText(/actuación nº 9/).first()).toBeVisible()
    await expect(page.getByText(/actuación nº 8/).first()).toBeVisible()

    // Las dos cifras que el titular promete, congeladas en el snapshot.
    await expect(page.getByText('87.050 €').first()).toBeVisible()
    await expect(page.getByText('16/100').first()).toBeVisible()

    // Las tablas tienen filas de verdad, no un tbody vacío.
    expect(await page.locator('table tbody tr').count()).toBeGreaterThan(4)

    // Y las dos concesiones que hacen defendible la pieza: si alguien las quita
    // para que suene más fuerte, esto se pone rojo. La calidad del aire es un
    // fin legítimo, y los criterios subjetivos NO rebasaron el umbral.
    await expect(page.getByText(/calidad del aire/).first()).toBeVisible()
    await expect(page.getByText(/comité de expertos/).first()).toBeVisible()

    // El derecho de réplica tiene que estar en la página, no sólo en el aviso
    // legal: la pieza nombra a dos empresas y a un ayuntamiento.
    await expect(page.getByText(/derecho de réplica/).first()).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })
})

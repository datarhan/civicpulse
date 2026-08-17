import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { collectErrors, appErrors } from './_console'

// La pieza se ejercita en los DOS estados y el esperado se lee del snapshot
// congelado: una spec que asumiera «publicado» se saltaría el borrador entero,
// y una que asumiera «borrador» caducaría el día de la publicación.
const snap = JSON.parse(readFileSync('public/data/reportajes/coste-efectivo.json', 'utf8'))

test.describe('Reportaje · coste efectivo (/reportajes/coste-efectivo)', () => {
  test('renders the three findings with their frozen figures', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/reportajes/coste-efectivo', { waitUntil: 'domcontentloaded' })

    await expect(
      page.getByRole('heading', { name: 'La mitad de abajo de la división' }),
    ).toBeVisible({ timeout: 8000 })

    // El aviso de borrador sigue al estado del snapshot, no a una suposición.
    if (snap.meta.estado === 'publicado') {
      expect(await page.getByText(/Borrador editorial/).count()).toBe(0)
    } else {
      await expect(page.getByText(/Borrador editorial/).first()).toBeVisible()
    }
    await expect(page.getByText(/derecho de réplica/i).first()).toBeVisible()

    // Hallazgo 1 · la entrega sin rendir, con su control anti-pandemia.
    await expect(page.getByText('sin rendir').first()).toBeVisible()
    await expect(page.getByText(/503/).first()).toBeVisible()
    await expect(
      page.getByText(/rindieron.*más.*ayuntamientos valencianos que en cualquiera/s).first(),
    ).toBeVisible()

    // Hallazgo 2 · los denominadores congelados y la franja de comparables.
    await expect(page.getByText(/11\.059,41/).first()).toBeVisible()
    await expect(
      page.getByText(`mediana · ${snap.congelados.banda.mediana.toLocaleString('es-ES')} %`),
    ).toBeVisible()
    await expect(page.getByText(`Riba-roja · ${snap.congelados.banda.propio} %`)).toBeVisible()

    // Hallazgo 3 · nominal contra constante, con las cifras congeladas.
    await expect(page.getByText(/22,8\s?%/).first()).toBeVisible()
    for (const s of snap.inflacion.servicios) {
      await expect(page.getByText(s.nombre).first()).toBeVisible()
    }

    // El límite de la pieza, dicho en la pieza.
    await expect(page.getByText(/Lo que esta pieza no dice/i).first()).toBeVisible()
    await expect(page.getByText(/la declaración no es el servicio/).first()).toBeVisible()

    // Fuentes primarias con enlaces reales.
    await expect(page.getByRole('link', { name: /Orden HAP\/2075\/2014/ })).toBeVisible()
    await expect(page.getByRole('link', { name: /panel completo/ })).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })

  test('ninguna cifra del cuerpo contradice al snapshot congelado', async ({ page }) => {
    // La regla de la casa para reportajes: las cifras están CONGELADAS y la
    // página las lee del fichero, así que basta comprobar que las que más
    // riesgo tienen de reescribirse a mano siguen saliendo de ahí.
    await page.goto('/reportajes/coste-efectivo', { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByRole('heading', { name: 'La mitad de abajo de la división' }),
    ).toBeVisible({ timeout: 8000 })

    const cuerpo = await page.locator('.cp-page').innerText()
    expect(cuerpo).toContain(`${snap.congelados.propios} a la vez`)
    for (const f of snap.rendicionCV.porAnio) {
      expect(cuerpo).toContain(String(f.n))
    }
  })
})

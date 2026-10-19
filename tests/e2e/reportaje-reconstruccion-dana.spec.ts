import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { collectErrors, appErrors } from './_console'

const snap = JSON.parse(readFileSync('public/data/reportajes/reconstruccion-dana.json', 'utf8'))

test.describe('Reportaje · reconstrucción DANA (/reportajes/reconstruccion-dana)', () => {
  test('el mapa, la cronología mensual y lo que la pieza dice', async ({ page }) => {
    const errors = collectErrors(page)
    await page.goto('/reportajes/reconstruccion-dana', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 8000 })

    // Las dos palabras que JSX pegaba en §06, hasta el 19-10-2026.
    const cuerpo = await page.locator('.cp-pieza').innerText()
    expect(cuerpo).not.toMatch(/externoespecífico|esamirada/)
    expect(cuerpo).toMatch(/control externo específico de la DANA/)

    // EL MAPA, sobre el mapa base y no a mano: un círculo por lugar, en el
    // panel de Leaflet, y los dos con más gasto DANA con su nombre a la vista.
    // Se espera al mapa de verdad: el hueco que guarda su sitio mientras carga
    // lleva la misma clase, y se cambia por el mapa en cuanto llega.
    await expect(page.locator('.cp-mapa-dana .leaflet-container')).toBeAttached({ timeout: 8000 })
    const mapa = page.locator('.cp-mapa-dana', { has: page.locator('.leaflet-container') })
    await mapa.scrollIntoViewIfNeeded()
    await expect(mapa.locator('path.cp-mapa-lugar')).toHaveCount(snap.places.length)
    await expect(mapa.locator('path.cp-mapa-lugar-dana')).toHaveCount(
      snap.places.filter((p: { danaAmount: number }) => p.danaAmount > 0).length,
    )
    const rotulos = mapa.locator('.leaflet-tooltip')
    await expect(rotulos).toHaveCount(2)
    for (const p of snap.danaPlaces.slice(0, 2))
      await expect(rotulos.filter({ hasText: p.name })).toHaveCount(1)
    // La atribución de OpenStreetMap, obligatoria.
    await expect(mapa.getByText('OpenStreetMap')).toBeVisible()

    // La cronología mensual pone importe a sus picos, y el de marzo de 2026 —el
    // vallado que nombra la entradilla— tiene su mes debajo.
    const crono = page.locator('svg[aria-label="Cronograma de adjudicaciones DANA por mes"]')
    await expect(crono.getByText('mar 26', { exact: true })).toHaveCount(1)
    await expect(crono.getByText('445 k€', { exact: true })).toHaveCount(1)

    // En la columna de importes de la financiación, sólo importes.
    await expect(page.getByText('río Túria', { exact: true })).toHaveCount(0)
    await expect(page.getByText('provincial', { exact: true })).toHaveCount(0)

    // Los adjudicatarios, con su nombre entero.
    for (const c of snap.contractors)
      await expect(page.getByText(c.name, { exact: true })).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })
})

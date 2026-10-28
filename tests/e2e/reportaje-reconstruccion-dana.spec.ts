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

    // La entradilla cuenta noviembre de 2024 con la serie de la gráfica: decía
    // «22 contratos por 1,39 millones», la del 6 de julio, debajo de una barra
    // rotulada 1,33 M€ (corrección del 19-10-2026).
    const nov = snap.timelineFull.find((m: { month: string }) => m.month === '2024-11')
    const mill = (nov.amount / 1e6).toFixed(2).replace('.', ',')
    // Lo visible: la corrección, plegada, cita la frase nueva también.
    await expect(
      page
        .getByText(`${nov.count} contratos por ${mill} millones de euros`)
        .filter({ visible: true }),
    ).toHaveCount(1)
    expect(cuerpo).not.toMatch(/22 contratos por 1,39 millones/)

    // §02 decía que los contratos del mapa «se concentran donde más golpeó el
    // agua», y ningún dato de la pieza mide dónde golpeó más: el mapa sitúa
    // solo una parte, la que su título permite ubicar (corrección del
    // 28-10-2026). La parte sale de la misma lista que las barras de §04.
    expect(cuerpo).not.toMatch(/donde más golpeó el agua/)
    const situados = snap.danaPlaces.reduce(
      (a: number, p: { danaContractCount: number }) => a + p.danaContractCount,
      0,
    )
    expect(cuerpo).toContain(
      `el mapa solo sitúa los que su título permite ubicar: ${situados} de los ${snap.totals.danaContracts}, por`,
    )

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

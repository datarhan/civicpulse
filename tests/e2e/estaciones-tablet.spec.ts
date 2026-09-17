import { test } from '@playwright/test'
import { afirmaPulsables, cargaYEncuadra, sondea } from './_estaciones'

/**
 * Entre el móvil y el escritorio la pila de controles del mapa no se pliega —la regla
 * de pliegue corta en `MAPA_COMPACTO`, 560 px— y a esos anchos tapa estaciones de
 * Riba-roja. Lo dejó medido la PR #39 al arreglar los 375 px, y se quedó abierto en la
 * incidencia #38: a 600 y a 768 px, con el encuadre inicial único ya en su sitio, una
 * estación se ve y no se puede tocar.
 *
 * Se mide con la misma sonda que el móvil —`elementFromPoint` sobre el centro de cada
 * estación—, así que un globo, un pin o la pila encima cuentan igual: lo que el lector
 * no puede pulsar no está a su alcance, aunque lo vea.
 */
for (const [ancho, alto] of [
  [600, 900],
  [768, 1024],
] as const) {
  test.describe(`las estaciones de Riba-roja a ${ancho}×${alto}`, () => {
    test.use({ viewport: { width: ancho, height: alto } })

    test('cada estación se puede pulsar: nada del mapa se le pone encima', async ({ page }) => {
      await cargaYEncuadra(page)
      afirmaPulsables(await sondea(page))
    })
  })
}

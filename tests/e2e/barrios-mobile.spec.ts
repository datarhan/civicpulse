import { test, expect } from '@playwright/test'
import { cargaYEncuadra } from './_estaciones'
import { afirma, entraPorElPin, mide } from './_pines-y-barrios'

/**
 * Los pines del dinero y los puntos de barrio a 375 px: la sonda y su historia, en
 * `_pines-y-barrios.ts`. Aquí el mapa mide de 277 a 357 px de alto y la ficha de un
 * contrato lo llena, así que lo que se juega es si el enlace de la ficha del pin a la
 * del barrio queda a la vista o debajo de la pila de controles plegada: al pie de la
 * ficha, el 12-10-2026, quedaba debajo en 4 de 9 barrios.
 *
 * Dos altos, como `estaciones-mobile.spec.ts`, porque el mapa cambia de alto con la
 * pantalla y la pila no.
 */
for (const alto of [812, 629]) {
  test.describe(`los pines y los barrios a 375×${alto}`, () => {
    test.use({ viewport: { width: 375, height: alto } })

    test('ningún punto de barrio se lleva el centro de un pin, y cada barrio abre su ficha', async ({
      page,
    }) => {
      test.setTimeout(120_000)
      await cargaYEncuadra(page)
      const m = await mide(page)
      afirma(m, `a 375×${alto}`)
      expect(
        m.barriosPorElPin.length,
        'ningún punto cede: la prueba no recorre la segunda puerta',
      ).toBeGreaterThan(0)
      for (const barrio of m.barriosPorElPin) await entraPorElPin(page, barrio, 'dedo')
    })

    test('con una ficha abierta la pila se aparta, y al cerrarla vuelve la cobertura', async ({
      page,
    }) => {
      // Todo el mapa apila a z-400, igual que la pila, que gana el empate: sin esto
      // el pie de una ficha alta queda debajo de los controles plegados. Pero la
      // cobertura es la declaración de honestidad de la capa y tiene que volver.
      await cargaYEncuadra(page)
      const pila = page.locator('.cp-mapa-pila')
      const cobertura = page.locator('.cp-cobertura')
      await expect(cobertura).toBeVisible()
      const pin = await page.evaluate(() => {
        const panes = document.querySelector('.leaflet-map-pane')!
        for (const p of document.querySelectorAll('path.cp-money-pin')) {
          const r = p.getBoundingClientRect()
          const x = r.left + r.width / 2
          const y = r.top + r.height / 2
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue
          const arriba = document.elementFromPoint(x, y)
          if (arriba === p && panes.contains(arriba)) return { x, y }
        }
        return null
      })
      expect(pin, 'ningún pin del dinero recibe un toque en su centro').not.toBeNull()
      await page.touchscreen.tap(pin!.x, pin!.y)
      await expect(page.locator('.leaflet-popup')).toHaveCount(1)
      await expect(pila).toBeHidden()
      await page.locator('.leaflet-popup-close-button').click()
      await expect(page.locator('.leaflet-popup')).toHaveCount(0)
      await expect(cobertura).toBeVisible()
    })
  })
}

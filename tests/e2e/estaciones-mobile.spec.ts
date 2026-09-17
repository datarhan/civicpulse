import { test, expect } from '@playwright/test'
import { afirmaPulsables, cargaYEncuadra, sondea } from './_estaciones'

/**
 * A 375 px la pila de controles del mapa —chips de capas, tarjeta del dinero situado
 * con su deslizador y su nota de cobertura— medía más de 300 px de alto sobre un mapa
 * de 277 a 357, y al zoom del móvil tapaba las cuatro estaciones de Riba-roja: se
 * veían y no se podían tocar. Se pliega por defecto y deja a la vista los chips en una
 * fila y la línea de cobertura, que es la declaración de honestidad de la capa.
 *
 * Dos altos, porque el mapa cambia de alto con la pantalla y la pila no. Y una prueba
 * de que la sonda sabe fallar: desplegada, la pila tiene que tapar alguna estación.
 *
 * Los localizadores van dentro de la pila. Sueltos por la página fallaban por motivos
 * ajenos al pliegue: el chip de la tira «Hoy» también responde a «detalle», y la cifra
 * de cobertura lleva un espacio que no separa («2,2 M€») y comparte línea con el botón.
 */
for (const alto of [812, 629]) {
  test.describe(`las estaciones de Riba-roja a 375×${alto}`, () => {
    test.use({ viewport: { width: 375, height: alto } })

    test('la pila se pliega y cada estación se puede tocar', async ({ page }) => {
      await cargaYEncuadra(page)
      const pila = page.locator('.cp-mapa-pila')
      await expect(pila).toHaveAttribute('data-plegada', 'true')
      const cobertura = pila.locator('.cp-cobertura')
      await expect(cobertura).toBeVisible()
      await expect(cobertura).toHaveText(/M€\s*de\s*[\d.,]+\s*M€/)
      await expect(
        page.getByRole('slider', { name: /línea de tiempo de los contratos situados/i }),
      ).toBeHidden()
      afirmaPulsables(await sondea(page))
    })

    test('tocar una estación abre su globo', async ({ page }) => {
      await cargaYEncuadra(page)
      const [primera] = await sondea(page)
      expect(primera, 'no se midió ninguna estación').toBeTruthy()
      await expect(async () => {
        await page.touchscreen.tap(primera.x, primera.y)
        await expect(page.locator('.leaflet-popup-content')).toContainText(primera.nombre, {
          timeout: 2_000,
        })
      }).toPass({ timeout: 15_000 })
    })
  })
}

test.describe('la sonda sabe fallar', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('desplegada, la pila tapa al menos una estación', async ({ page }) => {
    await cargaYEncuadra(page)
    const pila = page.locator('.cp-mapa-pila')
    await pila.getByRole('button', { name: /detalle/i }).click()
    await expect(pila).toHaveAttribute('data-plegada', 'false')
    const tapadas = (await sondea(page)).filter((s) => !s.pulsable)
    expect(tapadas.length).toBeGreaterThan(0)
  })
})

/**
 * El encuadre inicial no puede depender de qué instantánea llega antes.
 *
 * El dinero situado y las obras se encuadraban cada uno por su lado, en cuanto
 * llegaba su instantánea, y el segundo encuadre medía la vista del primero a mitad
 * de su animación. Así el mapa acababa a zoom 11 o a zoom 12 según el orden: en la CI
 * de #39 cayó a zoom 12 en los tres intentos, y a 375×629 València la Vella quedó bajo
 * la pila plegada, cuando en el portátil salía a zoom 11 y libre. Retrasando cada
 * instantánea 60 ms, el orden cambia de forma reproducible, y con él el encuadre.
 */
test.describe('el encuadre inicial no depende del orden de llegada', () => {
  test.describe.configure({ mode: 'serial' })
  test.use({ viewport: { width: 375, height: 629 } })

  const encuadres: Record<string, string> = {}

  for (const tardia of ['obras', 'tender-geo']) {
    test(`con ${tardia}.json llegando 60 ms tarde, las estaciones se pueden tocar`, async ({
      page,
    }) => {
      await page.route(`**/data/${tardia}.json`, async (route) => {
        await new Promise((listo) => setTimeout(listo, 60))
        await route.continue()
      })
      await cargaYEncuadra(page)
      const sondas = await sondea(page)
      afirmaPulsables(sondas)
      encuadres[tardia] = sondas.map((s) => `${s.nombre} ${s.x},${s.y}`).join(' | ')
    })
  }

  test('las estaciones caen en el mismo sitio con los dos órdenes', () => {
    // Mide algo: las dos cargas anteriores dejaron su encuadre.
    expect(Object.keys(encuadres).sort()).toEqual(['obras', 'tender-geo'])
    expect(encuadres['tender-geo'], 'el encuadre cambia con el orden de llegada').toBe(
      encuadres.obras,
    )
  })
})

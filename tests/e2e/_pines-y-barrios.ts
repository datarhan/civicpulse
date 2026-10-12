import { expect, type Page } from '@playwright/test'
import { cargaYEncuadra } from './_estaciones'

/**
 * Los pines del dinero situado y los puntos de barrio de la portada, medidos en el
 * navegador. No es un spec: lo importan `landing.spec.ts` (1280 px) y
 * `barrios-mobile.spec.ts` (375 px).
 *
 * El 06-10-2026 el primer pin quedó justo debajo del punto de Urbanització La
 * Llobatera: el clic en su centro abría la ficha del barrio y la del contrato no se
 * podía abrir desde ahí. No era una casualidad del encuadre: cuando el título de un
 * contrato nombra una urbanización, el pin se sitúa en el punto del nomenclátor, que
 * es el del barrio, y los dos quedan concéntricos. El 12-10-2026, a 1280 px, eran 11
 * pines. Se pregunta a `elementFromPoint`, que es lo que decide a qué llega un toque,
 * y no al orden del DOM.
 *
 * La otra mitad es la que impide el arreglo fácil. Subir los pines por encima de los
 * puntos se probó y se midió: un pin mide de 12 a 52 px y el punto 8, y en el centro
 * del pueblo entre 2 y 9 barrios se quedaban sin ningún sitio donde pulsar, algunos
 * aun con dos niveles de zoom. Así que cada barrio tiene que seguir abriendo su ficha:
 * por su punto o, si su punto cede el toque al pin de debajo
 * (`src/lib/barrios-bajo-pines.js`), por la ficha de ese pin. Esa segunda puerta se
 * recorre con clics, porque que el enlace exista no dice que se alcance: a 375 px, al
 * pie de la ficha, la pila de controles plegada lo tapaba en 4 de 9.
 */

export interface Medida {
  pinesMedidos: number
  pinesTapados: string[]
  barriosMedidos: number
  barriosSinPuerta: string[]
  barriosPorElPin: string[]
}

/** Qué recibe un toque en el centro de cada pin y en el punto de cada barrio. */
export function mide(page: Page): Promise<Medida> {
  return page.evaluate(() => {
    // Lo que recibe un toque en (x, y), si cae en el mapa: fuera de la ventana o bajo
    // los controles no hay nada que medir.
    const panes = document.querySelector('.leaflet-map-pane')!
    const enElMapa = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null
      const arriba = document.elementFromPoint(x, y)
      return arriba && panes.contains(arriba) ? arriba : null
    }
    const centro = (el: Element) => {
      const r = el.getBoundingClientRect()
      return [r.left + r.width / 2, r.top + r.height / 2] as const
    }
    const tituloDe = (el: Element) =>
      el.closest('.leaflet-marker-icon')?.getAttribute('title') ?? '?'

    let pinesMedidos = 0
    const pinesTapados: string[] = []
    for (const pin of document.querySelectorAll('path.cp-money-pin')) {
      const [x, y] = centro(pin)
      const arriba = enElMapa(x, y)
      if (!arriba) continue
      pinesMedidos++
      // Encima de un pin sólo puede quedar lo que va encima a propósito: otro pin, un
      // equipamiento (450) o una estación (610). Un punto de barrio, un círculo de
      // quejas, un polígono de incendio o una vía se llevaban su centro.
      if (arriba.matches('path.cp-money-pin, path.cp-obra-pin, path.cp-estacion')) continue
      if (arriba.closest('.cp-poi-marker')) continue
      const que = arriba.closest('.cp-osm-neigh')
        ? `el punto de ${tituloDe(arriba)}`
        : `${arriba.tagName.toLowerCase()}.${arriba.getAttribute('class') ?? ''}`
      pinesTapados.push(`pin en ${Math.round(x)},${Math.round(y)} bajo ${que}`)
    }

    let barriosMedidos = 0
    const barriosSinPuerta: string[] = []
    const barriosPorElPin: string[] = []
    for (const punto of document.querySelectorAll('.cp-osm-neigh-dot')) {
      const [x, y] = centro(punto)
      const arriba = enElMapa(x, y)
      if (!arriba) continue
      barriosMedidos++
      const marcador = punto.closest('.leaflet-marker-icon')!
      if (marcador.contains(arriba)) continue
      // Una estación va encima de todo a propósito (Railways.jsx): no es cosa del
      // dinero y la mide su propia prueba (`_estaciones.ts`).
      if (arriba.matches('path.cp-estacion')) continue
      const titulo = tituloDe(punto)
      if (
        marcador.classList.contains('cp-osm-neigh--cede') &&
        arriba.matches('path.cp-money-pin, path.cp-obra-pin')
      )
        barriosPorElPin.push(titulo)
      else barriosSinPuerta.push(`${titulo} (bajo ${arriba.getAttribute('class')})`)
    }
    return { pinesMedidos, pinesTapados, barriosMedidos, barriosSinPuerta, barriosPorElPin }
  })
}

/** Algo medido, ningún pin con algo ajeno en su centro y ningún barrio sin puerta. */
export function afirma(m: Medida, cuando: string) {
  expect(m.pinesMedidos, `${cuando}: no se midió ningún pin`).toBeGreaterThan(0)
  expect(m.barriosMedidos, `${cuando}: no se midió ningún barrio`).toBeGreaterThan(0)
  expect(m.pinesTapados, `${cuando}: pines con algo ajeno encima de su centro`).toEqual([])
  expect(m.barriosSinPuerta, `${cuando}: barrios que ningún toque alcanza`).toEqual([])
}

/**
 * La segunda puerta, recorrida: un toque en el punto que cede abre la ficha del pin,
 * su enlace se alcanza, y abre la del barrio. Empieza con la portada recién cargada:
 * abrir una ficha desplaza el mapa (auto-pan), y el punto siguiente podía acabar
 * debajo de la pila de controles.
 */
export async function entraPorElPin(page: Page, barrio: string, toque: 'clic' | 'dedo') {
  await cargaYEncuadra(page)
  const punto = await page.evaluate((t) => {
    const m = [...document.querySelectorAll('.cp-osm-neigh')].find(
      (el) => el.getAttribute('title') === t,
    )!
    const r = m.querySelector('.cp-osm-neigh-dot')!.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    return { x, y, encima: document.elementFromPoint(x, y)?.getAttribute('class') ?? '' }
  }, barrio)
  expect(punto.encima, `${barrio}: lo que recibe un toque en su punto`).toMatch(
    /cp-(money|obra)-pin/,
  )
  if (toque === 'dedo') await page.touchscreen.tap(punto.x, punto.y)
  else await page.mouse.click(punto.x, punto.y)

  await expect(page.locator('.leaflet-popup')).toHaveCount(1)
  const ficha = page.locator('.leaflet-popup-content')
  await expect(
    ficha.getByText(/Población/i),
    `${barrio}: abrió su ficha y no la del pin`,
  ).toHaveCount(0)
  const enlace = ficha.locator('.cp-enlace-barrio', { hasText: barrio })
  await expect(enlace, `${barrio}: la ficha del pin no lleva a la suya`).toBeVisible({
    timeout: 2500,
  })
  // Que se vea no basta: con la ficha ya quieta tras el auto-pan, un toque en el
  // enlace tiene que llegarle a él y no a la pila de controles o a la cinta de arriba.
  await expect
    .poll(
      () =>
        enlace.evaluate((l) => {
          const r = l.getBoundingClientRect()
          return [0.2, 0.5, 0.8].some(
            (f) => document.elementFromPoint(r.left + r.width * f, r.top + r.height / 2) === l,
          )
        }),
      { message: `${barrio}: el enlace a su ficha queda tapado` },
    )
    .toBe(true)
  if (toque === 'dedo') await enlace.tap()
  else await enlace.click()

  // Una sola ficha abierta, la del barrio: la del pin se cierra al abrirse.
  await expect(page.locator('.leaflet-popup')).toHaveCount(1)
  await expect(ficha.getByText(/Población/i).first()).toBeVisible({ timeout: 2500 })
  await expect(ficha).toContainText(barrio)
}

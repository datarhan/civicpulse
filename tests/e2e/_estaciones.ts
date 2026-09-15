import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'

/**
 * Las estaciones de Riba-roja en el mapa de la portada, medidas en el navegador.
 *
 * No es un spec (Playwright sólo recoge `*.spec.ts`): lo importan `landing.spec.ts` y
 * `estaciones-mobile.spec.ts`.
 *
 * Una estación se ve y no se puede pulsar cuando algo se le pone encima. Se midieron
 * tres cosas encima, a 1280 y a 375 px: los pines del dinero situado, los puntos de
 * barrio —en el panel de marcadores, por encima de cualquier vector— y las vías de la
 * red completa, que suelen cargar las últimas y apilarse sobre los discos; a 375 px,
 * además, la pila de controles. Por eso se pregunta a `elementFromPoint` en el centro
 * de cada disco, que es lo que decide a qué llega un toque.
 */

const GEO = JSON.parse(readFileSync('public/data/geo.json', 'utf8')) as {
  railways?: { stations?: Array<{ name: string }> }
}

/** Las estaciones que pinta `Railways()`, del mismo snapshot que lee la página. */
export const ESTACIONES_LOCALES: string[] = (GEO.railways?.stations ?? []).map((s) => s.name).sort()

export interface Sonda {
  nombre: string
  x: number
  y: number
  dentroDelMapa: boolean
  pulsable: boolean
  tapadaPor: string | null
}

const posiciones = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('path.cp-estacion')]
      .map((p) => {
        const b = p.getBoundingClientRect()
        return `${Math.round(b.x)},${Math.round(b.y)}`
      })
      .join('|'),
  )

/**
 * Carga la portada y espera a lo que se pinta encima de las estaciones —la red completa,
 * los pines del dinero— y a que el encuadre deje de moverse.
 */
export async function cargaYEncuadra(page: Page) {
  const red = page.waitForResponse((r) => r.url().includes('/data/metro-network.json') && r.ok(), {
    timeout: 30_000,
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await red
  await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 15_000 })
  await expect
    .poll(() => page.locator('path.cp-money-pin').count(), { timeout: 15_000 })
    .toBeGreaterThan(0)
  await expect
    .poll(() => page.locator('path.cp-estacion').count(), { timeout: 15_000 })
    .toBe(ESTACIONES_LOCALES.length)
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  // FitToPins anima el encuadre: dos lecturas iguales, separadas 300 ms.
  await expect
    .poll(
      async () => {
        const antes = await posiciones(page)
        await page.waitForTimeout(300)
        return antes === (await posiciones(page))
      },
      { timeout: 15_000 },
    )
    .toBe(true)
}

/** Por cada disco: dónde está, si cae dentro del mapa y qué recibe un toque en su centro. */
export function sondea(page: Page): Promise<Sonda[]> {
  return page.evaluate(() => {
    const mapa = document.querySelector('.leaflet-container')?.getBoundingClientRect()
    return [...document.querySelectorAll('path.cp-estacion')].map((disco) => {
      const b = disco.getBoundingClientRect()
      const x = b.left + b.width / 2
      const y = b.top + b.height / 2
      const dentroDelMapa =
        !!mapa && x >= mapa.left && x <= mapa.right && y >= mapa.top && y <= mapa.bottom
      const arriba = document.elementFromPoint(x, y)
      const pulsable = arriba === disco
      let tapadaPor: string | null = null
      if (!pulsable) {
        if (!arriba) tapadaPor = 'nada'
        else if (arriba.closest('.cp-mapa-pila')) tapadaPor = 'la pila de controles'
        else {
          const clases = (arriba.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean)
          tapadaPor = [arriba.tagName.toLowerCase(), ...clases].join('.')
        }
      }
      return {
        nombre: disco.getAttribute('data-estacion') ?? '',
        x: Math.round(x),
        y: Math.round(y),
        dentroDelMapa,
        pulsable,
        tapadaPor,
      }
    })
  })
}

/** Todas las estaciones medidas, dentro del mapa y sin nada encima. */
export function afirmaPulsables(sondas: Sonda[]) {
  expect(sondas.length, 'no se midió ninguna estación').toBeGreaterThan(0)
  expect(sondas.map((s) => s.nombre).sort()).toEqual(ESTACIONES_LOCALES)
  expect(
    sondas.filter((s) => !s.dentroDelMapa).map((s) => s.nombre),
    'estaciones fuera del mapa',
  ).toEqual([])
  expect(
    sondas.filter((s) => !s.pulsable).map((s) => `${s.nombre} bajo ${s.tapadaPor}`),
    'estaciones que un toque no alcanza',
  ).toEqual([])
}

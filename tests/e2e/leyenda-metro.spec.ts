import { test, expect, type Page } from '@playwright/test'
import { cargaYEncuadra } from './_estaciones'

/**
 * La clave de colores de Metrovalencia se lee entera donde se enseña.
 *
 * Flotaba sola abajo a la derecha, con 397 px fijos, al mismo z que la pila de
 * controles y a su altura: medida el 18-10-2026 con `elementFromPoint`, quedaba
 * tapada un 97 % a 320 y 375 px (empezando fuera del mapa), del 30 al 100 % entre
 * 600 y 1280, y limpia sólo desde 1440. Ahora es una tarjeta de la pila
 * (NetworkLegend.jsx): en escritorio se ve siempre; en tableta, con la pila
 * desplegada; en un móvil, nunca.
 */

/** Qué parte de la leyenda recibe un toque, y si cae dentro del mapa. */
function mideLeyenda(page: Page) {
  return page.evaluate(() => {
    const l = document.querySelector('.cp-leyenda-red')
    if (!l) return null
    const r = l.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return { visible: false as const }
    const mapa = document.querySelector('.cp-stylized-map')!.getBoundingClientRect()
    let puntos = 0
    let tapados = 0
    for (let x = r.left + 2; x < r.right - 2; x += 4)
      for (let y = r.top + 2; y < r.bottom - 2; y += 4) {
        puntos++
        const e = document.elementFromPoint(x, y)
        if (!e || !l.contains(e)) tapados++
      }
    return {
      visible: true as const,
      puntos,
      tapados,
      dentro:
        r.left >= mapa.left &&
        r.right <= mapa.right &&
        r.top >= mapa.top &&
        r.bottom <= mapa.bottom,
    }
  })
}

for (const [ancho, alto] of [
  [600, 900],
  [768, 1024],
  [900, 900],
  [1024, 768],
  [1100, 900],
  [1280, 900],
  [1440, 900],
] as const) {
  test(`a ${ancho}×${alto}, la leyenda de Metrovalencia se ve entera`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: alto })
    await cargaYEncuadra(page)
    // Si a este alto la pila se pliega, la leyenda va dentro de lo plegado: se
    // despliega para medirla.
    const plegar = page.locator('.cp-pila-plegar')
    if ((await plegar.isVisible()) && (await mideLeyenda(page))?.visible === false)
      await plegar.click()
    const m = await mideLeyenda(page)
    expect(m, 'no hay leyenda: la red no cargó').not.toBeNull()
    expect(m!.visible, 'la leyenda no se ve ni con la pila desplegada').toBe(true)
    if (!m!.visible) return
    expect(m!.puntos, 'la leyenda no deja ningún punto que medir').toBeGreaterThan(0)
    expect(m!.dentro, 'la leyenda se sale del mapa').toBe(true)
    expect(m!.tapados, 'puntos de la leyenda con algo encima').toBe(0)
  })
}

// En un móvil no se enseña, ni plegada ni desplegada: desplegada empujaba la
// tarjeta del dinero bajo la cinta (MAPA_SIN_LEYENDA_ALTO en tokens.jsx). Se fija aquí
// para que sea una decisión y no un accidente.
for (const [ancho, alto] of [
  [320, 700],
  [375, 812],
  [375, 629],
] as const) {
  test(`a ${ancho}×${alto} no se enseña, ni plegada ni desplegada`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: alto })
    await cargaYEncuadra(page)
    await expect(page.locator('.cp-leyenda-red')).toHaveCount(1)
    await expect(page.locator('.cp-leyenda-red')).toBeHidden()
    await page.locator('.cp-pila-plegar').click()
    await expect(page.locator('.cp-mapa-pila')).toHaveAttribute('data-plegada', 'false')
    await expect(page.locator('.cp-leyenda-red')).toBeHidden()
  })
}

import { test, expect } from '@playwright/test'
import { cargaYEncuadra } from './_estaciones'

/**
 * Una ficha abierta se lee entera: nada de lo que flota sobre el mapa se queda
 * encima de ella.
 *
 * Todo el mapa de Leaflet —también el panel de las fichas— apila a z-400, y lo que
 * flota encima (la pila de controles, la leyenda de Metrovalencia) también es z-400
 * y va después en el DOM: gana el empate. El 18-10-2026, a 375 px, la leyenda tapaba
 * 8 de 10 fichas a 629 de alto y 8 de 11 a 812; la pila ya se apartaba desde #344.
 * La leyenda vive ahora dentro de la pila (leyenda-metro.spec.ts), y se aparta con
 * ella.
 *
 * Se abre la ficha de cada pin que recibe un toque en su centro y se pregunta a
 * `elementFromPoint`, en una rejilla de 12 px sobre la parte de la ficha que cae en
 * el mapa y en la ventana, qué recibe cada punto. La atribución no cuenta: lleva
 * `pointer-events: none` y no se lleva ningún toque.
 *
 * Sólo anchos de móvil y tableta. En escritorio la pila sigue tapando el pie de
 * algunas fichas (4 de 13 a 1280×900): está dicho en la PR y es otra decisión.
 */
for (const [ancho, alto] of [
  [375, 629],
  [375, 812],
  [768, 1024],
] as const) {
  test.describe(`las fichas a ${ancho}×${alto}`, () => {
    test.use({ viewport: { width: ancho, height: alto } })

    test('nada flota encima de una ficha abierta', async ({ page }) => {
      test.setTimeout(180_000)
      await cargaYEncuadra(page)
      const pines = await page.evaluate(() => {
        const out: Array<[number, number]> = []
        for (const p of document.querySelectorAll('path.cp-money-pin')) {
          const r = p.getBoundingClientRect()
          const x = r.left + r.width / 2
          const y = r.top + r.height / 2
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue
          if (document.elementFromPoint(x, y) === p) out.push([x, y])
        }
        return out
      })
      expect(pines.length, 'ningún pin recibe un toque en su centro').toBeGreaterThan(0)

      const tapadas: string[] = []
      let medidas = 0
      for (const [x, y] of pines) {
        await cargaYEncuadra(page)
        await page.mouse.click(x, y)
        const ficha = page.locator('.leaflet-popup')
        if ((await ficha.count()) === 0) continue
        await expect(ficha).toHaveCount(1)
        // Que el auto-pan termine antes de medir.
        await page.waitForTimeout(400)
        const m = await page.evaluate(() => {
          const pop = document.querySelector('.leaflet-popup')!
          const mapa = document.querySelector('.leaflet-container')!.getBoundingClientRect()
          const r = pop.getBoundingClientRect()
          const x0 = Math.max(r.left, mapa.left, 0)
          const x1 = Math.min(r.right, mapa.right, innerWidth)
          const y0 = Math.max(r.top, mapa.top, 0)
          const y1 = Math.min(r.bottom, mapa.bottom, innerHeight)
          let puntos = 0
          const encima = new Set<string>()
          for (let px = x0 + 4; px < x1 - 4; px += 12)
            for (let py = y0 + 4; py < y1 - 4; py += 12) {
              puntos++
              const e = document.elementFromPoint(px, py)
              if (e && pop.contains(e)) continue
              let n: Element | null = e
              let que = e ? `${e.tagName.toLowerCase()}.${e.getAttribute('class') ?? ''}` : 'nada'
              while (n && n !== document.body) {
                if (n.classList.contains('cp-mapa-pila')) que = 'la pila de controles'
                if (n.classList.contains('cp-leyenda-red')) que = 'la leyenda de Metrovalencia'
                n = n.parentElement
              }
              encima.add(que)
            }
          const titulo = pop.querySelector('.leaflet-popup-content')?.textContent?.slice(0, 40)
          return { puntos, encima: [...encima], titulo }
        })
        medidas++
        expect(m.puntos, 'la ficha no deja ningún punto que medir').toBeGreaterThan(0)
        if (m.encima.length) tapadas.push(`«${m.titulo}…» bajo ${m.encima.join(', ')}`)
      }
      expect(medidas, 'no se abrió ninguna ficha').toBeGreaterThan(0)
      expect(tapadas, 'fichas con algo encima').toEqual([])

      // Y lo que se apartó vuelve al cerrar la ficha.
      await page.locator('.leaflet-popup-close-button').click()
      await expect(page.locator('.leaflet-popup')).toHaveCount(0)
      await expect(page.locator('.cp-mapa-pila')).toBeVisible()
      await expect(page.locator('.cp-cobertura')).toBeVisible()
    })
  })
}

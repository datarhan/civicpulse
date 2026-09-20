import { test, expect } from '@playwright/test'

/**
 * La cabecera de sección a 375 px (#62).
 *
 * `SectionHead` pinta el eyebrow y el título en una columna y, si se le pasa,
 * una leyenda a la derecha. La fila es `flex` con `justify-content:
 * space-between`, la columna lleva `min-width: 0` y las leyendas llevan
 * `flexShrink: 0` — o sea que, cuando no caben las dos, la que cede es SIEMPRE
 * el título. Medido en «Capítulo a capítulo» de /presupuesto antes de
 * arreglarlo: la leyenda se quedaba 282 de los 285 px de la fila y la columna
 * del título medía 0 px de ancho por 314 de alto, una palabra por línea, con la
 * leyenda pintada encima del eyebrow. En los dos idiomas.
 *
 * Por qué no lo veía nada: no es un desbordamiento. `mobile.spec.ts` mide lo
 * que se sale de los 375 px, y aquí no se sale nada — el título se estruja
 * DENTRO. Las guardas de datos leen el texto, que seguía siendo el correcto. Un
 * título ilegible es una cosa que sólo se ve mirando, y medir es la única forma
 * de que se vea sin mirar.
 *
 * Lo que se comprueba, por cabecera que tenga algo a su derecha: que la columna
 * del título conserva el ancho por debajo del cual `.cp-sec-head-fila` manda la
 * leyenda a la línea siguiente, y que no crece a lo alto como crece un texto al
 * que le han quitado el ancho.
 *
 * Ese ancho NO se escribe aquí: se lee del `flex-basis` calculado de la propia
 * columna. Está en `rem` y la raíz de este sitio mide 14 px —el control de
 * densidad la mueve entre 13,5 y 15—, así que un número copiado mediría otra
 * cosa en cuanto alguien tocara la densidad, y de hecho la primera versión de
 * esta prueba puso 224 creyendo que 14rem eran 224 px. Leerlo tiene además un
 * efecto útil: si alguien retira la regla de `index.css`, el `flex-basis` pasa
 * a `auto` y la prueba lo dice con esas palabras en vez de dar verde.
 *
 * Lo que NO se comprueba, y merece decirse para que nadie lo añada creyendo que
 * cierra un hueco: si las dos cajas se SOLAPAN. Se escribió, se midió y no veía
 * el defecto — una caja de 0 px de ancho no interseca nada, aunque su texto se
 * desborde y se pinte sobre la leyenda, que es exactamente lo que pasaba. Una
 * afirmación que no puede fallar sobre el caso que describe es la trampa que
 * este repo ya ha pagado varias veces; se cambió por la del alto, que sí lo ve.
 *
 * Y se cuenta cuántas ha medido, por la misma razón: una página que dejara de
 * pintar leyendas —o un `[data-section-head]` que cambiara de forma— daría
 * verde sin mirar nada.
 */

/**
 * El alto por encima del cual una cabecera ya no está envolviendo, está
 * estrujada. Un título de ficha son 20 px a 1,3 de interlínea, o sea que 200 px
 * dan para cinco líneas más el eyebrow — más de lo que ocupa el título más
 * largo del sitio a 375 px. El defecto medía 314.
 */
const ALTO_MAXIMO = 200

type Ruta = { path: string; ready: RegExp; minimo: number }

const RUTAS: Ruta[] = [
  // La medida del hallazgo: la tarjeta de capítulos, la del mapa de contratos y
  // la de la deuda usan las tres la misma forma.
  { path: '/presupuesto', ready: /[\d.,]+ M€ de gastos aprobados/, minimo: 3 },
  { path: '/departamentos', ready: /De \d+ concejalías con delegación/, minimo: 1 },
  { path: '/cambios', ready: /Total: \d+ cambios · ventana de \d+ días/, minimo: 1 },
]

async function cabeceras(page: import('@playwright/test').Page, ruta: Ruta) {
  await page.goto(ruta.path, { waitUntil: 'domcontentloaded' })

  const rx = { source: ruta.ready.source, flags: ruta.ready.flags }
  await page
    .waitForFunction(
      ({ source, flags }) => {
        const root = document.querySelector('main') ?? document.body
        const text = (root as HTMLElement).innerText || ''
        return new RegExp(source, flags).test(text.replace(/\s+/g, ' '))
      },
      rx,
      { timeout: 20_000 },
    )
    .catch(() => undefined)

  // Las métricas de la tipografía cambian el ancho del texto, y estos títulos
  // son la fuente de la marca: medir antes de `fonts.ready` mide otra cosa.
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )

  return page.evaluate(() => {
    const out: {
      titulo: string
      ancho: number
      alto: number
      fila: number
      base: string
    }[] = []
    for (const h of document.querySelectorAll('[data-section-head]')) {
      const col = h.parentElement
      const fila = col?.parentElement
      if (!col || !fila || fila.children.length < 2) continue // sin nada a la derecha
      const c = col.getBoundingClientRect()
      const derecha = [...fila.children]
        .filter((e) => e !== col)
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
      if (derecha.length === 0) continue
      out.push({
        titulo: (h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
        ancho: Math.round(c.width),
        alto: Math.round(c.height),
        fila: Math.round(fila.getBoundingClientRect().width),
        base: getComputedStyle(col).flexBasis,
      })
    }
    return out
  })
}

for (const ruta of RUTAS) {
  test(`${ruta.path} · el título de sección no se estruja a 375 px`, async ({ page }) => {
    const medidas = await cabeceras(page, ruta)

    // El control: si no hay nada que medir, no hay nada que afirmar.
    expect(
      medidas.length,
      `${ruta.path}: ninguna cabecera con leyenda; ¿cambió SectionHead o no cargó la página?`,
    ).toBeGreaterThanOrEqual(ruta.minimo)

    for (const m of medidas) {
      const donde = `${ruta.path} · «${m.titulo}» (columna ${m.ancho}×${m.alto} en una fila de ${m.fila})`
      const base = Number.parseFloat(m.base)
      expect(
        Number.isFinite(base) && base > 0,
        `${donde}: la columna no tiene flex-basis («${m.base}»); ¿se fue la regla .cp-sec-head-fila?`,
      ).toBe(true)
      expect(m.ancho, `${donde}: el título se queda sin ancho de lectura`).toBeGreaterThanOrEqual(
        Math.min(base, m.fila),
      )
      expect(m.alto, `${donde}: el título crece a lo alto como uno estrujado`).toBeLessThanOrEqual(
        ALTO_MAXIMO,
      )
    }
  })
}

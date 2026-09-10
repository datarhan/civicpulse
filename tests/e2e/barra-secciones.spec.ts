import { test, expect, type Page } from '@playwright/test'

/**
 * La barra de secciones de la portada (lámina 1b de «Portada · Revisión»):
 * lo que las pruebas de unidad no pueden ver, porque no tienen maqueta.
 *
 * Vitest fija el contrato de ARIA y de teclado
 * (tests/components/barra-secciones.test.jsx). Aquí se mira lo otro: que cada
 * panel se abre ENTERO y dentro de la pantalla a todos los anchos, que abrir
 * un grupo no mueve a los demás, que la acción principal se ve en un móvil, y
 * que el teclado llega de verdad a una página.
 *
 * «Entero» no se puede medir con getBoundingClientRect: un panel recortado por
 * la fila deslizante —el fallo que evita el cambio de ancla de
 * barra-secciones.css.js— conserva su rectángulo completo. Lo que sí lo delata
 * es preguntar qué hay pintado en un punto del pie del panel: recortado, en
 * ese punto está el mapa.
 */

// Por encima de 800 px el panel cuelga de su botón; por debajo, de la barra
// entera (BARRA_COMPACTA, en barra-secciones.css.js). Se miden los dos lados.
const ANCHOS = [1440, 1024, 820, 768, 430, 375]

/** El ancho de cada botón de la barra, en el orden del DOM. */
const anchosDeBotones = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('.d-sec button[aria-controls]')].map(
      (b) => Math.round(b.getBoundingClientRect().width * 10) / 10,
    ),
  )

test.describe('Barra de secciones de la portada', () => {
  for (const ancho of ANCHOS) {
    test(`${ancho}px — cada panel se abre entero, dentro de la pantalla y sin mover a los demás`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: ancho, height: 900 })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      const barra = page.getByRole('navigation', { name: 'Secciones' })
      await expect(barra).toBeVisible({ timeout: 10_000 })

      // Los botones se leen del DOM, no de una lista escrita aquí: un grupo
      // nuevo se mide sin tocar esta prueba.
      const botones = barra.locator('button[aria-controls]')
      const cuantos = await botones.count()
      expect(cuantos, 'cinco grupos y el índice, como poco').toBeGreaterThanOrEqual(6)
      // La referencia se toma con la fuente definitiva. Medidos antes de que
      // llegue Outfit, TODOS los botones «encogen» a la vez cuando llega —dos
      // o tres píxeles cada uno—, y eso no es la negrita de un grupo abierto
      // empujando a sus vecinos. Pasó dos veces en una pasada completa.
      await page.evaluate(async () => {
        await document.fonts.ready
      })
      const anchosCerrados = await anchosDeBotones(page)

      for (let i = 0; i < cuantos; i++) {
        const boton = botones.nth(i)
        const nombre = (await boton.innerText()).trim()
        await boton.click()
        await expect(boton).toHaveAttribute('aria-expanded', 'true')
        const id = (await boton.getAttribute('aria-controls'))!
        await expect(page.locator(`#${id}`)).toBeVisible()

        const m = await page.evaluate((id) => {
          const panel = document.getElementById(id)!
          const p = panel.getBoundingClientRect()
          const barra = document.querySelector('.d-sec')!.getBoundingClientRect()
          // Un punto hacia el pie del panel: si la fila lo recortara a la
          // altura de la barra, ahí ya no quedaría nada del panel.
          const y = Math.min(p.bottom - 10, window.innerHeight - 2)
          const pintado = document.elementFromPoint(p.left + p.width / 2, y)
          return {
            izq: p.left,
            der: p.right,
            arriba: p.top,
            barraAbajo: barra.bottom,
            sondaLejos: y > barra.bottom + 40,
            seVe: !!pintado && panel.contains(pintado),
            vw: window.innerWidth,
            doc: document.documentElement.scrollWidth,
          }
        }, id)

        expect(m.izq, `${nombre} a ${ancho}px · borde izquierdo`).toBeGreaterThanOrEqual(0)
        expect(m.der, `${nombre} a ${ancho}px · borde derecho`).toBeLessThanOrEqual(m.vw)
        expect(
          Math.abs(m.arriba - m.barraAbajo),
          `${nombre} · pegado bajo la barra`,
        ).toBeLessThanOrEqual(1)
        // Que la sonda haya mirado lejos de la barra: si no, «se ve» podría ser
        // verdad de la franja que un recorte deja a la vista.
        expect(m.sondaLejos, `${nombre} · la sonda cae lejos de la barra`).toBe(true)
        expect(m.seVe, `${nombre} a ${ancho}px · el pie del panel se pinta`).toBe(true)
        expect(m.doc, `${nombre} a ${ancho}px · el documento no se ensancha`).toBeLessThanOrEqual(
          m.vw + 6,
        )
        // El abierto va en negrita; si no reservara su ancho, empujaría a los
        // de su derecha. Se comparan anchos y no posiciones: en estrecho, pulsar
        // desliza la fila y las posiciones cambian sin que nada se mueva.
        expect(await anchosDeBotones(page), `${nombre} · nadie cambia de ancho`).toEqual(
          anchosCerrados,
        )

        await page.keyboard.press('Escape')
        await expect(boton).toHaveAttribute('aria-expanded', 'false')
      }
    })
  }

  for (const ancho of [768, 430, 375]) {
    test(`${ancho}px — «Poner una queja» se ve sin deslizar la fila`, async ({ page }) => {
      // En estrecho la fila se desliza, y la acción es lo último de ella: a
      // 375 px quedaba fuera de la pantalla, sin nada que dijera que estaba
      // ahí. Es en el móvil donde más probable es que empiece una queja.
      await page.setViewportSize({ width: ancho, height: 900 })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      const accion = page
        .getByRole('navigation', { name: 'Secciones' })
        .getByRole('link', { name: /Poner una queja/ })
      await expect(accion).toBeAttached({ timeout: 10_000 })
      // Sin desplazar nada: `evaluate` no hace scroll, y toBeVisible daría por
      // visible una acción deslizada fuera de la fila.
      const m = await accion.evaluate((a) => {
        const r = a.getBoundingClientRect()
        const pintado = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return {
          izq: r.left,
          der: r.right,
          vw: window.innerWidth,
          seVe: !!pintado && a.contains(pintado),
        }
      })
      expect(m.izq, `a ${ancho}px · borde izquierdo`).toBeGreaterThanOrEqual(0)
      expect(m.der, `a ${ancho}px · borde derecho`).toBeLessThanOrEqual(m.vw)
      expect(m.seVe, `a ${ancho}px · nada la tapa`).toBe(true)
    })
  }

  test('con el teclado se llega a una sección y se entra en ella', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const barra = page.getByRole('navigation', { name: 'Secciones' })
    const gobierno = barra.getByRole('button', { name: 'Gobierno', exact: true })
    await expect(gobierno).toBeVisible({ timeout: 10_000 })

    await gobierno.focus()
    await page.keyboard.press('ArrowDown')
    const cargos = barra.getByRole('link', { name: /^Cargos/ })
    await expect(cargos).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(barra.getByRole('link', { name: /^Plenos/ })).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(gobierno).toBeFocused()
    await expect(gobierno).toHaveAttribute('aria-expanded', 'false')

    await page.keyboard.press('ArrowDown')
    await expect(cargos).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/cargos$/)
  })

  test('el índice lleva al contrato editorial, que el carril llevaba al pie', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const barra = page.getByRole('navigation', { name: 'Secciones' })
    await barra.getByRole('button', { name: 'Índice', exact: true }).click({ timeout: 10_000 })
    await barra.getByRole('link', { name: 'Metodología', exact: true }).click()
    await expect(page).toHaveURL(/\/metodologia$/)
  })
})

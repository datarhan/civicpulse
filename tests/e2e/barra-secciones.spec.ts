import { test, expect } from '@playwright/test'

/**
 * La barra de secciones de la portada (lámina 1b de «Portada · Revisión»):
 * lo que las pruebas de unidad no pueden ver, porque no tienen maqueta.
 *
 * Vitest fija el contrato de ARIA y de teclado
 * (tests/components/barra-secciones.test.jsx). Aquí se mira lo otro: que cada
 * panel se abre ENTERO y dentro de la pantalla a todos los anchos, y que el
 * teclado llega de verdad a una página.
 *
 * «Entero» no se puede medir con getBoundingClientRect: un panel recortado por
 * la fila deslizante —el fallo que evita el cambio de ancla de
 * barra-secciones.css.js— conserva su rectángulo completo. Lo que sí lo delata
 * es preguntar qué hay pintado en un punto del pie del panel: recortado, en
 * ese punto está el mapa.
 */

const GRUPOS = ['Gobierno', 'Dinero', 'Vigilancia', 'Ciudadanía', 'Laboratorio', 'Índice']

// Por encima de 800 px el panel cuelga de su botón; por debajo, de la barra
// entera (BARRA_COMPACTA, en barra-secciones.css.js). Se miden los dos lados.
const ANCHOS = [1440, 1024, 820, 768, 430, 375]

test.describe('Barra de secciones de la portada', () => {
  for (const ancho of ANCHOS) {
    test(`${ancho}px — cada panel se abre entero y dentro de la pantalla`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 900 })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      const barra = page.getByRole('navigation', { name: 'Secciones' })
      await expect(barra).toBeVisible({ timeout: 10_000 })

      let medidos = 0
      for (const nombre of GRUPOS) {
        const boton = barra.getByRole('button', { name: nombre, exact: true })
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

        await page.keyboard.press('Escape')
        await expect(boton).toHaveAttribute('aria-expanded', 'false')
        medidos++
      }
      expect(medidos).toBe(GRUPOS.length)
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

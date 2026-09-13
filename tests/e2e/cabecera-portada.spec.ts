import { test, expect } from '@playwright/test'
import { CATALOGUE } from '../../src/i18n'
import { STACK_BREAKPOINT } from '../../src/variants/direction-d/tokens'

/**
 * La cabecera de la portada: que el detalle se VEA, y que el buscador abra.
 *
 * Las dos cosas venían de la revisión de la lámina como «no arreglado». El
 * detalle del tiempo, el aire y el metro existía y no se pintaba nunca: se
 * anclaba a la tira, y la tira lleva overflow-x para deslizarse, así que
 * quedaba recortado a la altura de la fila. Y el buscador de la portada estaba
 * pintado y muerto — sin onClick, y con CmdK sin montar en la rama de `/`.
 *
 * Aquí se mide con `elementFromPoint`, no con `getBoundingClientRect`: un panel
 * recortado CONSERVA su rectángulo, así que medirlo habría dado verde sobre un
 * panel invisible. Lo que se pregunta es qué hay pintado en ese píxel.
 *
 * El chip elegido es el del metro, y no el del tiempo, a propósito: su horario
 * es cálculo puro, sin red, así que esta prueba no depende de que Open-Meteo
 * conteste desde el runner.
 */
const CHIP_METRO = CATALOGUE.es['vivo.metro.aria']

/** Qué está pintado en el pie del panel: el panel mismo, o quien lo recorta. */
async function quienPintaElPie(page: import('@playwright/test').Page, idPanel: string) {
  return page.evaluate((id) => {
    const panel = document.getElementById(id)
    if (!panel) return { error: 'sin panel' }
    const r = panel.getBoundingClientRect()
    const x = Math.round(r.left + r.width / 2)
    const y = Math.round(r.bottom - 3)
    const golpeado = document.elementFromPoint(x, y)
    return {
      alto: Math.round(r.height),
      dentro: panel.contains(golpeado),
      etiqueta: golpeado ? golpeado.tagName.toLowerCase() : null,
      clase: golpeado instanceof HTMLElement ? golpeado.className : null,
    }
  }, idPanel)
}

test.describe('Cabecera de la portada', () => {
  test('el detalle del chip se pinta, y no lo recorta la tira', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const chip = page.getByRole('button', { name: CHIP_METRO })
    await expect(chip).toBeVisible({ timeout: 8000 })
    const idPanel = String(await chip.getAttribute('aria-controls'))
    expect(idPanel).toBeTruthy()

    // ABLACIÓN: cerrado, en ese píxel no hay panel. Sin esto, «hay panel» podría
    // cumplirlo un panel que estuviera abierto desde el principio.
    await expect(page.locator(`#${idPanel}`)).toBeHidden()

    await chip.click()
    await expect(page.locator(`#${idPanel}`)).toBeVisible()
    const pie = await quienPintaElPie(page, idPanel)
    expect(pie.alto, 'el panel tiene alto de verdad').toBeGreaterThan(80)
    expect(
      pie.dentro,
      `en el pie del panel se pinta <${pie.etiqueta} class="${pie.clase}">, no el panel: está recortado`,
    ).toBe(true)
  })

  test('abrir el detalle no ensancha el documento', async ({ page }) => {
    for (const ancho of [1440, STACK_BREAKPOINT - 124, 375]) {
      await page.setViewportSize({ width: ancho, height: 900 })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      const chip = page.getByRole('button', { name: CHIP_METRO })
      await expect(chip).toBeVisible({ timeout: 8000 })
      await chip.click()
      const medida = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        vista: window.innerWidth,
      }))
      expect(medida.doc, `a ${ancho} el documento se ensancha`).toBeLessThanOrEqual(
        medida.vista + 1,
      )
    }
  })

  test('en estrecho el panel cabe en la pantalla', async ({ page }) => {
    // Anclado a la derecha del envoltorio, con la cabecera envuelta en varias
    // filas, el panel se salía por un lado. En estrecho se ancla a la cabecera.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const chip = page.getByRole('button', { name: CHIP_METRO })
    await expect(chip).toBeVisible({ timeout: 8000 })
    await chip.click()
    const idPanel = String(await chip.getAttribute('aria-controls'))
    const caja = await page.locator(`#${idPanel}`).boundingBox()
    expect(caja).not.toBeNull()
    expect(Math.round(caja!.x), 'el panel se sale por la izquierda').toBeGreaterThanOrEqual(0)
    expect(
      Math.round(caja!.x + caja!.width),
      'el panel se sale por la derecha',
    ).toBeLessThanOrEqual(376)
  })

  test('Escape cierra el detalle y el foco se queda en el chip', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const chip = page.getByRole('button', { name: CHIP_METRO })
    await expect(chip).toBeVisible({ timeout: 8000 })
    await chip.click()
    const idPanel = String(await chip.getAttribute('aria-controls'))
    await page.locator(`#${idPanel}`).press('Escape')
    await expect(page.locator(`#${idPanel}`)).toBeHidden()
    const enfocado = await page.evaluate(
      () => document.activeElement?.getAttribute('aria-label') ?? null,
    )
    expect(enfocado).toBe(CHIP_METRO)
  })

  test('el buscador de la portada abre con el botón y con el atajo', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const buscar = page.getByRole('button', { name: CATALOGUE.es['topbar.search.aria'] })
    await expect(buscar).toBeVisible({ timeout: 8000 })
    await buscar.click()
    const entrada = page.getByPlaceholder('Saltar a…')
    await expect(entrada).toBeVisible({ timeout: 5000 })
    await page.keyboard.press('Escape')
    await expect(entrada).not.toBeVisible()

    // Y el atajo, que en la portada no estaba montado en absoluto.
    await page.keyboard.press('Meta+k')
    await expect(entrada).toBeVisible({ timeout: 5000 })
  })
})

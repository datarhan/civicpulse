import { test, expect } from '@playwright/test'
import { GRUPOS_METODOLOGIA, anclaDeGrupo } from '../../src/components/metodologia/grupos'

/**
 * El índice de /metodologia en una pantalla de verdad.
 *
 * tests/metodologia-indice.test.jsx compara el índice con la página. Lo que una
 * prueba unitaria no puede ver es que uno de los dos índices se vea en cada ancho,
 * que el lateral se quede pegado sin pisar el texto y que un enlace deje su destino
 * por debajo de la barra superior.
 */
const ULTIMO = GRUPOS_METODOLOGIA[GRUPOS_METODOLOGIA.length - 1]

async function bajoLaBarra(page, id: string) {
  await expect
    .poll(
      () =>
        page.evaluate((destino) => {
          // Recién cargada, la ruta perezosa aún no ha montado nada: eso es esperar,
          // y un error aquí cortaría el sondeo en vez de repetirlo.
          const barra = document.querySelector('.cp-shell-topbar')
          const el = document.querySelector(`[id="${destino}"]`)
          if (!barra || !el) return false
          const { top } = el.getBoundingClientRect()
          return top >= barra.getBoundingClientRect().bottom && top < window.innerHeight / 2
        }, id),
      { message: `#${id} no aterriza bajo la barra`, timeout: 8000 },
    )
    .toBe(true)
}

test.describe('/metodologia · índice', () => {
  test('con sitio, va al lado del texto, se queda pegado y sigue la lectura', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/metodologia', { waitUntil: 'domcontentloaded' })
    const lateral = page.locator('[data-indice-lateral]')
    await expect(lateral).toBeVisible({ timeout: 8000 })
    await expect(page.locator('.cp-met-plegado')).toBeHidden()
    await expect(page.locator('.cp-met-volver').first()).toBeHidden()

    const medir = () =>
      page.evaluate(() => {
        const texto = document.querySelector('.cp-met .cp-page')!.getBoundingClientRect()
        const nav = document.querySelector('[data-indice-lateral]')!.getBoundingClientRect()
        return { textoDerecha: texto.right, navIzquierda: nav.left, navArriba: nav.top }
      })
    const arriba = await medir()
    expect(arriba.navIzquierda).toBeGreaterThanOrEqual(arriba.textoDerecha)

    const destino = `#${anclaDeGrupo(ULTIMO.id)}`
    await lateral.locator(`a[href="${destino}"]`).click()
    await bajoLaBarra(page, anclaDeGrupo(ULTIMO.id))
    await expect(lateral.locator('[aria-current="true"]')).toHaveAttribute('href', destino)
    await expect(lateral.locator('ol ol a')).toHaveCount(ULTIMO.secciones.length)

    // Pegado: a mitad de una página de decenas de pantallas sigue a la vista.
    const abajo = await medir()
    expect(abajo.navArriba).toBeGreaterThanOrEqual(0)
    expect(abajo.navArriba).toBeLessThan(120)
  })

  test('sin sitio, va plegado arriba, y cada grupo trae cómo volver', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/metodologia', { waitUntil: 'domcontentloaded' })
    const plegado = page.locator('.cp-met-plegado')
    await expect(plegado).toBeVisible({ timeout: 8000 })
    await expect(page.locator('[data-indice-lateral]')).toBeHidden()

    await plegado.locator('summary').click()
    const seccion = ULTIMO.secciones[0]
    await plegado.locator(`a[href="#${seccion}"]`).click()
    await bajoLaBarra(page, seccion)

    await page.locator('.cp-met-volver').last().click()
    await bajoLaBarra(page, 'indice-metodologia')
  })

  test('una remisión de otra página aterriza en su grupo', async ({ page }) => {
    await page.goto('/metodologia#grupo-promesas', { waitUntil: 'domcontentloaded' })
    await bajoLaBarra(page, 'grupo-promesas')
    await expect(page.locator('h2#grupo-promesas')).toBeVisible()
  })
})

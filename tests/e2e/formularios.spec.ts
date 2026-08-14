import { test, expect } from '@playwright/test'

/**
 * §«Fuera de alcance» 03: «El radio 8 se declara "para inputs" y en el
 * brandbook no aparece un input. Los selectores de filtro y el campo de Cmd+K
 * están sin gobernar.»
 *
 * Estaban a medias. El tamaño y el radio ya salían de la escala; la familia y
 * el placeholder, no — y los dos fallaban de una forma que ninguna prueba de
 * datos ve y que axe tampoco:
 *
 *   · `select` quedaba fuera de `font: inherit`, así que los once selectores de
 *     filtro se pintaban en Arial sobre una página compuesta en Outfit.
 *   · el placeholder era el gris por defecto del navegador (#757575), un valor
 *     FIJO: 4,61:1 sobre papel claro y 3,83:1 sobre el oscuro, que suspende.
 */
test.describe('Formularios (§fuera de alcance 03)', () => {
  test('los selectores se componen en la fuente del sitio, no en la del sistema', async ({
    page,
  }) => {
    await page.goto('/promesas', { waitUntil: 'domcontentloaded' })
    const selects = page.locator('select')
    await expect(selects.first()).toBeVisible()

    const r = await page.evaluate(() => {
      const cuerpo = getComputedStyle(document.body).fontFamily
      const fuentes = [...document.querySelectorAll('select')].map(
        (e) => getComputedStyle(e).fontFamily,
      )
      return { cuerpo, fuentes }
    })

    expect(r.fuentes.length, 'no había ningún selector que medir').toBeGreaterThan(0)
    for (const f of r.fuentes) expect(f).toBe(r.cuerpo)
  })

  test('el placeholder sale del token, así que cambia con el tema', async ({ page }) => {
    await page.goto('/hallazgos', { waitUntil: 'domcontentloaded' })
    // El armazón antes que la tecla: el listener de CmdK se engancha en un
    // useEffect, así que no está vivo hasta que React ha renderizado. Sin esta
    // espera la prueba necesitaba el reintento para pasar, y una prueba que
    // depende del reintento no está terminada.
    await expect(page.locator('.cp-shell-sidebar')).toBeVisible({ timeout: 10_000 })
    await page.keyboard.press('Meta+k')
    const campo = page.getByPlaceholder('Saltar a…')
    await expect(campo).toBeVisible({ timeout: 5000 })

    const claro = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('input[placeholder]') as Element, '::placeholder')
          .color,
    )
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    const oscuro = await page.evaluate(
      () =>
        getComputedStyle(document.querySelector('input[placeholder]') as Element, '::placeholder')
          .color,
    )

    // El control: un gris fijo del navegador daría el MISMO valor en los dos
    // temas, que es exactamente el defecto — 3,83:1 sobre el papel oscuro.
    expect(claro).not.toBe(oscuro)
    expect(claro).toContain('rgba(11, 15, 25')
    expect(oscuro).toContain('rgba(241, 245, 249')
  })
})

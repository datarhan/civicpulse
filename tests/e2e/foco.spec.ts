import { test, expect } from '@playwright/test'

/**
 * §11 · foco visible. El brandbook promete «anillo de 2 px en petróleo» y no
 * existía: la única regla de foco del sitio era la del chip del ticker, con un
 * azul que ni siquiera está en la paleta. Todo lo demás se apoyaba en el anillo
 * por defecto del navegador — distinto en cada uno, y que cualquier
 * `outline: none` futuro apaga sin dejar rastro.
 *
 * axe no cubre esto: comprueba que exista un mecanismo de foco, no que sea el
 * que el sistema de diseño dice. Y sólo se ve tabulando, que es justamente lo
 * que ninguna prueba de datos hace.
 */
test.describe('Foco visible (§11)', () => {
  test('el teclado deja anillo de petróleo, y el ratón no deja ninguno', async ({ page }) => {
    await page.goto('/hallazgos', { waitUntil: 'domcontentloaded' })

    // Tabular hasta un control real, saltándose el enlace de salto.
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    const conTeclado = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return null
      const s = getComputedStyle(el)
      const civic = getComputedStyle(document.documentElement).getPropertyValue('--civic').trim()
      return { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor, civic }
    })

    expect(conTeclado, 'nada recibió el foco al tabular').not.toBeNull()
    expect(conTeclado!.width).toBe('2px')
    expect(conTeclado!.style).toBe('solid')

    // El color se compara resuelto: el token es petróleo en claro y otro en
    // oscuro, así que se afirma que COINCIDE con el token, no un hex concreto.
    const aRgb = (hex: string) => {
      const h = hex.replace('#', '')
      const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16)
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
    }
    expect(conTeclado!.color).toBe(aRgb(conTeclado!.civic))

    // Control: con el ratón NO debe quedar anillo, o la página se llena de
    // marcas al hacer clic. Es la diferencia entre :focus y :focus-visible, y
    // sin este control la prueba de arriba pasaría con un `:focus` a secas.
    const boton = page.locator('button:visible').first()
    await boton.click({ timeout: 8000 })
    const conRaton = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return el ? getComputedStyle(el).outlineStyle : null
    })
    expect(conRaton === 'none' || conRaton === 'auto').toBe(true)
  })

  test('el anillo cambia con el tema, porque sale del token', async ({ page }) => {
    await page.goto('/hallazgos', { waitUntil: 'domcontentloaded' })
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')

    const claro = await page.evaluate(
      () => getComputedStyle(document.activeElement as Element).outlineColor,
    )
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    const oscuro = await page.evaluate(
      () => getComputedStyle(document.activeElement as Element).outlineColor,
    )

    expect(claro).not.toBe(oscuro)
  })
})

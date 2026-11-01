import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { CATALOGUE } from '../../src/i18n'
import { STRICT_ROUTES, FIRST_PLENO_ID, exigeQueResuelva } from './_rutas'

// La lista vive en `_rutas.ts` desde que una segunda puerta —la de contraste
// medido— necesitó exactamente la misma: copiarla habría dejado a una de las dos
// mirando a un sitio menos en cuanto alguien añadiera una ruta.
void FIRST_PLENO_ID

// Empty by design — when a regression is found, add the path here with a
// reason citing the axe rule id and a TODO to fix the page, not the test.
const KNOWN_DEBT_ROUTES: Array<{ path: string; reason: string }> = []

async function scanForBlockingViolations(page: import('@playwright/test').Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  return results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
}

/**
 * WCAG 2.5.3, «etiqueta en el nombre»: quien dicta por voz dice lo que lee en
 * pantalla, y eso tiene que estar en el nombre accesible del control.
 *
 * La regla se pide por su id y no se deja a las etiquetas de arriba: axe 4.13 no
 * la corre con ellas y axe 4.14 sí, así que el mismo sitio daba verde o rojo según
 * la versión instalada.
 *
 * Sólo mira controles con `aria-label` o `aria-labelledby`: uno que se llama por
 * su propio texto no puede fallarla, y en muchas rutas no queda ninguno. Por eso
 * un cero aquí no significa nada por sí solo, y el bloque «Etiqueta en el nombre»
 * prueba aparte que la regla muerde, que ve controles de verdad y que el buscador
 * y el chip, que ya no pasan por ella, siguen llamándose lo que dicen.
 */
async function etiquetaEnNombre(page: import('@playwright/test').Page) {
  const r = await new AxeBuilder({ page }).withRules(['label-content-name-mismatch']).analyze()
  const fallos = r.violations.flatMap((v) => v.nodes).map((n) => n.target.join(' '))
  return { evaluados: r.passes.flatMap((p) => p.nodes).length + fallos.length, fallos }
}

test.describe('Accessibility (WCAG 2.1 AA)', () => {
  // A run must prove it did work — docs/DATA_INTEGRITY.md rule #2, applied to
  // this gate rather than to a scraper.
  //
  // The landing reported "no contrast violations" for its entire history while
  // axe evaluated ZERO nodes on it. axe cannot resolve a background stack
  // through the Leaflet tile layer, so it abandons the rule for the whole page;
  // comparable routes get hundreds of checks (/cargos 258, /presupuesto 543).
  // Hiding the map — which carries no text of ours — lets the rule see the 222
  // nodes that do. That first honest run surfaced 26 real failures, from
  // 1.54:1 metro badges to section headings sitting at 4.0 on their own washes.
  //
  // The assertion is on the COUNT as well as the verdict: a zero means the rule
  // silently no-op'd, and any green above it is worth nothing.
  const HIDE_MAP = '.leaflet-container{display:none !important}'
  for (const path of ['/', '/cargos', '/presupuesto']) {
    test(`${path} — contrast rule runs, and passes what it sees`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(1500)
      await page.addStyleTag({ content: HIDE_MAP })
      await page.waitForTimeout(300)
      const r = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
      const violations = r.violations.flatMap((v) => v.nodes)
      const evaluated = r.passes.flatMap((p) => p.nodes).length + violations.length
      expect(
        evaluated,
        `axe checked ${evaluated} nodes for contrast on ${path} — the rule did not run, so a green result proves nothing`,
      ).toBeGreaterThan(20)
      expect(
        violations.map((n) => `${n.target.join(' ')} — ${n.any[0]?.message ?? ''}`),
        `contrast failures on ${path}`,
      ).toEqual([])
    })
  }

  for (const path of STRICT_ROUTES) {
    test(`${path} has no critical or serious axe violations`, async ({ page }) => {
      const blocking = await scanForBlockingViolations(page, path)
      await exigeQueResuelva(page, path)
      // Un solo <main>. Las reglas de puntos de referencia de axe son «best
      // practice», no WCAG, así que el filtro de arriba no las ve: la biografía
      // anidaba el suyo dentro del de App.jsx y nada lo decía.
      await expect(page.locator('main'), `${path}: más de un <main>`).toHaveCount(1)
      const { fallos } = await etiquetaEnNombre(page)
      expect(fallos, `${path}: el nombre accesible no contiene el texto visible`).toEqual([])
      if (blocking.length) {
        const summary = blocking
          .map((v) => `[${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nodes)`)
          .join('\n')
        throw new Error(`Found ${blocking.length} blocking a11y violation(s):\n${summary}`)
      }
      expect(blocking).toEqual([])
    })
  }
})

test.describe('Etiqueta en el nombre (WCAG 2.5.3)', () => {
  test('la regla muerde: un botón llamado distinto de lo que dice cae', async ({ page }) => {
    // Sonda plantada en la página de verdad, con la misma llamada que usan las
    // rutas: si una versión de axe dejara de correrla, esto se cae y el verde de
    // arriba deja de valer como prueba.
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    await page.evaluate(() => {
      const sonda = document.createElement('button')
      sonda.id = 'sonda-etiqueta'
      sonda.textContent = 'Texto que se lee'
      sonda.setAttribute('aria-label', 'Nombre que no lo contiene')
      document.querySelector('main')?.append(sonda)
    })
    const { fallos } = await etiquetaEnNombre(page)
    expect(fallos).toEqual(['#sonda-etiqueta'])
  })

  // Las que llevan controles etiquetados con texto a la vista: la pastilla de
  // WhatsApp, la paginación de los listados y los enlaces «§ ↓» de un reportaje.
  // La reproducción de la línea de tiempo no cuenta: «▶» es un símbolo, y axe lo
  // deja en `incomplete`, no en `passes`.
  for (const path of ['/cambios', '/presupuesto', '/reportajes/basuras']) {
    test(`${path}: la regla ve controles de verdad y los pasa`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(800)
      const { evaluados, fallos } = await etiquetaEnNombre(page)
      expect(evaluados, `${path}: la regla no evaluó ningún control`).toBeGreaterThan(0)
      expect(fallos).toEqual([])
    })
  }

  // El buscador y el chip se llaman por su texto, así que la regla ya no los mira:
  // lo que antes vigilaba ella hay que afirmarlo a mano. A 375 es donde muerde: la
  // pista va recortada y un `display: none` dejaría el botón sin nombre.
  for (const [ancho, alto] of [
    [1280, 900],
    [375, 812],
  ]) {
    for (const path of ['/', '/cargos']) {
      test(`${path} a ${ancho}: el buscador se llama lo que dice`, async ({ page }) => {
        await page.setViewportSize({ width: ancho, height: alto })
        await page.goto(path, { waitUntil: 'domcontentloaded' })
        const buscar = page.getByRole('button', {
          name: CATALOGUE.es['topbar.search'],
          exact: true,
        })
        await expect(buscar).toBeVisible({ timeout: 8000 })
        await expect(buscar).not.toHaveAttribute('aria-label')
        await expect(buscar).toHaveAttribute('aria-keyshortcuts', 'Meta+K Control+K')
      })
    }

    test(`/ a ${ancho}: el chip se llama lo que se lee`, async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: alto })
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      const chip = page.locator('.cp-vivo-chip')
      await expect(chip).toBeVisible({ timeout: 8000 })
      await expect(chip).not.toHaveAttribute('aria-label')
      await expect(chip).toHaveAccessibleName(/^Hoy( · |$)/)
      await expect(chip).toHaveAccessibleDescription(CATALOGUE.es['vivo.hoy.aria'])
    })
  }
})

test.describe('Accessibility — known debt (quarantined)', () => {
  for (const { path, reason } of KNOWN_DEBT_ROUTES) {
    test(`${path} (debt: ${reason})`, async ({ page }) => {
      test.fixme(true, `Known a11y debt on ${path}: ${reason}`)
      const blocking = await scanForBlockingViolations(page, path)
      expect(blocking).toEqual([])
    })
  }
})

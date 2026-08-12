import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'

// Read the committed snapshot rather than hard-coding figures: a spec that
// restates the shape it is meant to check is failure mode 1 of
// docs/DATA_INTEGRITY.md, and these numbers move with every entrega.
const SNAP = JSON.parse(readFileSync('public/data/indicadores.json', 'utf8'))
const CON_RATIO = SNAP.indicadores.filter((i: { valor: number | null }) => i.valor !== null)
const CONCESION = SNAP.indicadores.filter(
  (i: { numerador: { motivo?: string } }) => i.numerador.motivo === 'concesion',
)
const COMPARABLE = SNAP.indicadores.find((i: { pares: unknown }) => i.pares)

// The route is behind EFICIENCIA_ENABLED, and the e2e server serves a
// production build — so this needs `VITE_ENABLE_EFICIENCIA=true npm run build`.
//
// Rather than join /cargos' Biografía spec in failing every local full run
// («that is the flag, not a defect»), this skips itself when the route is not
// mounted: a build without the flag stays green, a build with it gets real
// coverage. The skip names the missing variable so nobody debugs a phantom.
test.describe('Eficiencia (/eficiencia)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/eficiencia', { waitUntil: 'domcontentloaded' })
    const montada = await page
      .getByRole('heading', { name: /Cuánto cuesta y qué se obtiene/i })
      .isVisible()
      .catch(() => false)
    test.skip(!montada, '/eficiencia no está montada — reconstruye con VITE_ENABLE_EFICIENCIA=true')
  })

  test('renders unit costs with their peer position', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text())
    })

    await page.goto('/eficiencia', { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByRole('heading', { name: /Cuánto cuesta y qué se obtiene/i }),
    ).toBeVisible({ timeout: 8000 })

    // The snapshot has something to show, and the page shows it. Guards against
    // a green run against an empty page.
    expect(CON_RATIO.length).toBeGreaterThan(0)
    await expect(page.getByRole('heading', { name: CON_RATIO[0].etiqueta })).toBeVisible()

    // Coverage strip states the page's own share of its domain.
    await expect(page.getByText(/servicios que este panel sigue/i)).toBeVisible()

    expect(errors.filter((e) => !/favicon|ws:/i.test(e))).toEqual([])
  })

  test('a concession shows no ratio and no peer position', async ({ page }) => {
    // THE trap this page was designed around: the council books €0 for water
    // because the concessionaire bears it, so a naive divide would publish
    // "cheapest in the comarca".
    expect(CONCESION.length).toBeGreaterThan(0)
    await expect(page.getByText(/Servicios sin coste unitario/i)).toBeVisible({ timeout: 8000 })

    // The service is on the page, under the blocked heading, with the reason
    // spelled out rather than a number.
    await expect(page.getByRole('heading', { name: CONCESION[0].etiqueta })).toBeVisible()
    await expect(page.getByText(/lo paga el concesionario/i).first()).toBeVisible()

    // And no peer panel leaked onto it: exactly one disclosure per comparable
    // indicator, so a concession cannot have grown one. Counting is sturdier
    // than walking the DOM up from a heading to find "the card".
    const comparables = SNAP.indicadores.filter((i: { pares: unknown }) => i.pares).length
    await expect(page.getByText(/Ver los municipios comparados/i)).toHaveCount(comparables)
  })

  test('names the municipalities it compares against', async ({ page }) => {
    expect(COMPARABLE).toBeTruthy()
    await page.goto('/eficiencia', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /Cuánto cuesta/i })).toBeVisible({
      timeout: 8000,
    })
    const disclosure = page.getByText(/Ver los municipios comparados/i).first()
    await expect(disclosure).toBeVisible()
    await disclosure.click()
    // Hiding WHICH towns we compared against would break the show-your-work
    // contract, so the roster is published in full.
    await expect(page.getByText(COMPARABLE.pares.miembros[0].nombre).first()).toBeVisible()
  })

  test('publishes the friction panel with a period on every figure', async ({ page }) => {
    const municipales = (SNAP.municipales ?? []).filter(
      (m: { valor: number | null }) => m.valor !== null,
    )
    expect(municipales.length).toBeGreaterThan(0)

    await expect(
      page.getByRole('heading', { name: /Cómo funciona la casa por dentro/i }),
    ).toBeVisible({ timeout: 8000 })
    for (const m of municipales) {
      await expect(page.getByRole('heading', { name: m.etiqueta })).toBeVisible()
      // A percentage with no period reads as "this year"; the contracts span
      // almost a decade, so the period is load-bearing, not decoration.
      await expect(page.getByText(m.periodo, { exact: true }).first()).toBeVisible()
    }

    // No peer band may appear here: there is no national dataset of municipal
    // single-bidder rates, so a percentile would be unsupported.
    const comparables = SNAP.indicadores.filter((i: { pares: unknown }) => i.pares).length
    await expect(page.getByText(/Ver los municipios comparados/i)).toHaveCount(comparables)
  })

  test('axe evaluates the page and finds nothing blocking', async ({ page }) => {
    await page.goto('/eficiencia', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(900)
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    // Assert the scan EVALUATED something. Two suites in this repo were green
    // while measuring nothing; "no violations" from a rule that never ran is
    // indistinguishable from a clean page.
    const evaluated = r.passes.flatMap((p) => p.nodes).length
    expect(
      evaluated,
      `axe checked ${evaluated} nodes on /eficiencia — a green result proves nothing if the rules did not run`,
    ).toBeGreaterThan(20)

    const blocking = r.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')
    expect(
      blocking.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`),
      'blocking a11y violations on /eficiencia',
    ).toEqual([])
  })
})

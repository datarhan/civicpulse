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
// La página ordena las tarjetas por coste descendente, así que «la primera
// tarjeta con pares» NO es la primera del array. Buscarla por orden de array
// pasaba por casualidad mientras las dos coincidían, y dejó de pasar en cuanto
// entró la entrega de 2024. Se replica el orden de la página.
const COMPARABLE = [...SNAP.indicadores]
  .filter((i: { valor: number | null }) => i.valor !== null)
  .sort(
    (a: { numerador: { valor: number } }, b: { numerador: { valor: number } }) =>
      (b.numerador.valor ?? 0) - (a.numerador.valor ?? 0),
  )
  .find((i: { pares: unknown }) => i.pares)

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
    // `isVisible()` no espera: con la SPA a medio hidratar devuelve false y el
    // test se salta en silencio, que es la misma avería que una guarda hueca
    // —verde sin haber medido nada—. Hay que esperar de verdad y sólo saltar
    // cuando la ruta no existe.
    const montada = await page
      .getByRole('heading', { name: /Cuánto cuesta y qué se obtiene/i })
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
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

  test('the signed-findings section says what its emptiness means', async ({ page }) => {
    // Cero fichas es el estado normal antes de la primera firma. Un hueco se
    // lee como «no hay nada que contar», que es la mentira por omisión que el
    // resto de la página existe para no cometer: la sección tiene que decir
    // que lo que falta es una firma, no un hallazgo.
    const FICHAS = JSON.parse(readFileSync('public/data/eficiencia-findings.json', 'utf8'))
    await expect(page.getByRole('heading', { name: /Hallazgos firmados/i })).toBeVisible({
      timeout: 8000,
    })

    if (FICHAS.items.length === 0) {
      await expect(page.getByText(/Todavía no hay ninguna ficha firmada/i)).toBeVisible()
      return
    }
    // Con fichas publicadas: cada una enseña su medición congelada y su
    // periodo, que es lo que permite volver a comprobarla contra la fuente.
    for (const f of FICHAS.items) {
      await expect(page.getByRole('heading', { name: f.titulo })).toBeVisible()
      await expect(page.getByText(f.medicion.periodo, { exact: false }).first()).toBeVisible()
    }
    // Y ninguna nombra a nadie: el esquema no tiene dónde, y esto lo comprueba
    // sobre lo que de verdad se sirve.
    const html = await page.content()
    for (const campo of ['individualSpeaker', 'speakerGroup']) {
      expect(html, `${campo} no puede aparecer en una ficha de eficiencia`).not.toContain(campo)
    }
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

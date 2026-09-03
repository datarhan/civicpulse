import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

// A real pleno id with claims, read from the committed manifest (for /plenos/:id).
const FIRST_PLENO_ID = JSON.parse(readFileSync('public/data/pleno-claims/index.json', 'utf8'))
  .plenos?.[0]?.plenoId

// A real service ficha, and specifically the one with the HIGHEST percentile.
//
// /eficiencia/:id was never in this list, so nothing measured it at 375 — and
// it was the one route of the three with a detached, absolutely-positioned
// label: the detailed axis prints «Riba-roja <cifra>» over the marker, and a
// marker high on the axis pushed that label 16px past the document edge. The
// worst case is the highest percentile, so the route is derived rather than
// written down: whichever service tops the axis in the published entrega is
// the one this spec measures.
const FICHA = (() => {
  const panel = JSON.parse(readFileSync('public/data/indicadores.json', 'utf8'))
  const conEje = (panel.indicadores ?? []).filter(
    (i: { valor: number | null; pares?: { percentil?: number } }) => i.valor !== null && i.pares,
  )
  return [...conEje].sort(
    (a: { pares: { percentil: number } }, b: { pares: { percentil: number } }) =>
      b.pares.percentil - a.pares.percentil,
  )[0] as { id: string; etiqueta: string }
})()

/** La etiqueta sale del snapshot, así que hay que escaparla antes de usarla. */
const literal = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

// ---------------------------------------------------------------------------
// Why this spec measures the way it does.
//
// It ran green over every route below while /presupuesto was 55% wider than
// the phone it claimed to fit (581px in a 375px viewport). Three separate
// reasons it could not fail, all fixed here:
//
// 1. `window.innerWidth` IS NOT THE VIEWPORT under mobile emulation. When
//    content overflows, Chrome grows the layout viewport to fit it, so the
//    reference grew with the defect. Measured on /presupuesto 2026-08-04:
//    scrollWidth 581 · window.innerWidth 581 · clientWidth 375. The old
//    assertion `docW <= viewW + 6` was therefore `581 <= 587` — it compared
//    the defect against itself and was structurally incapable of failing, at
//    any timing. The reference is now the viewport Playwright itself set,
//    which no amount of page content can move.
// 2. It waited a flat 600ms and asserted nothing about what had rendered, so
//    a route that painted an empty shell passed. Every route now names a
//    string that only exists once its OWN snapshot is on screen, and the same
//    `evaluate` that reads the width proves that string was there when it did.
// 3. Web fonts change text width, and every number on these pages is DM Mono.
//    Measuring before `document.fonts.ready` measures the fallback metrics,
//    not the ones a visitor sees.
//
// `ready` is data, not chrome: a figure, a name or a count that comes from
// `public/data`, never a hard-coded heading. The four editorial pages
// (/nosotros, /about, /metodologia, /aviso-legal) read no snapshot, so they
// anchor on their own closing paragraph — the page still cannot pass by
// rendering nothing.
// ---------------------------------------------------------------------------

type Route = { path: string; ready: RegExp }

const ROUTES: Route[] = [
  // Decimal-tolerant: the accumulated total gained a decimal when a €55,7M
  // water concession landed on 2026-08-06 («… de 123,7 M€»), and `\d+ M€`
  // stopped matching. The guard then refused to measure — correctly, but for a
  // stale reason. A readiness signal must survive the copy it waits on.
  { path: '/', ready: /M€ de [\d.,]+ M€/ }, // situated-spend ticker (tenders snapshot)
  { path: '/cargos', ready: /Robert Raga Gadea/ }, // officials snapshot
  { path: '/cargos/robert-raga-gadea', ready: /@ribarroja\.es/ }, // the official's own record
  { path: '/presupuesto', ready: /€\d+(?:,\d+)?M/ }, // CONPREL KPI figure
  // El rediseño del índice retiró el rótulo «… de 39 de 61 sesiones» de la
  // tarjeta de departamentos, que era donde vivía la señal anterior. La nueva
  // sale del lede, que es lo primero que la página escribe con datos dentro.
  { path: '/plenos', ready: /celebrado \d+ sesiones/i },
  { path: `/plenos/${FIRST_PLENO_ID}`, ready: /\d{1,2} de [a-záéíóúñ]+ de \d{4}/i }, // session date
  { path: '/promesas', ready: /\d+ compromisos en seguimiento/ },
  { path: '/departamentos', ready: /De \d+ concejalías con delegación/ },
  { path: '/departamentos/urbanismo', ready: /\d+% con evidencia · \d+ en total/ },
  { path: '/hallazgos', ready: /TOTAL HALLAZGOS \d+/ },
  { path: '/reportajes', ready: /REPORTAJE · /i },
  { path: '/declaraciones', ready: /TOTAL \d+ CON EVIDENCIA \d+/ },
  // Tablas de cinco columnas en un móvil: el sitio exacto donde una fila se
  // sale sin que ninguna prueba de datos lo note. /eficiencia/:id no estaba en
  // esta lista y por eso nadie lo midió a 375.
  { path: '/laboratorio/cobertura', ready: /DECLARACIONES PUBLICADAS/i },
  { path: '/datos', ready: /Q23701/ }, // Wikidata identity block
  { path: '/empleo', ready: /OFERTAS ABIERTAS \d+/ },
  { path: '/quejas', ready: /TOTAL QUEJAS \d+/ },
  { path: '/quejas/dashboard', ready: /TOTAL QUEJAS \d+/ },
  // Not a data row but a data ANSWER: this sentence only renders once the
  // quejas snapshot has loaded and the id was absent from it.
  { path: '/quejas/q-no-existe', ready: /no aparece en el snapshot actual/ },
  { path: '/cambios', ready: /Total: \d+ cambios · ventana de \d+ días/ },
  { path: '/laboratorio', ready: /TITULARES MONITORIZADOS \d+/ },
  // /eficiencia y /laboratorio/frontera se publicaron sin entrar en esta lista
  // ni en la de axe: dos rutas que iban al público sin que ninguna pasada
  // estricta las hubiera mirado nunca. Es «verde por no ejecutarse», el defecto
  // que este repo ya ha pagado varias veces.
  // Dos entradas, y las dos hacen falta. El sentinela viejo —«Cobertura de
  // este panel»— vive en la pestaña de cobertura, que desde agosto de 2026 no
  // es la que abre: la guarda se negaba a medir, que es lo que tiene que hacer
  // cuando el sentinela no aparece, pero medía la página equivocada.
  //
  // La segunda entrada es la que importa de verdad: el libro de servicios es
  // ocho columnas y 1.080 px de ancho mínimo, o sea LO ÚNICO de esta ruta que
  // puede desbordar 375. Medir sólo la portada de la ruta habría dado verde
  // sobre la parte que no corre riesgo.
  { path: '/eficiencia', ready: /rendición de cuentas/i },
  { path: '/eficiencia#sec-servicios', ready: /servicios del panel/i },
  { path: `/eficiencia/${FICHA.id}`, ready: literal(FICHA.etiqueta) },
  // El h1, no un titular de sección: «Plazos, concurrencia y ejecución» era el
  // título de una tarjeta y se movió con el libro de gestión. Un centinela que
  // vive dentro de un componente caduca en cuanto ese componente cambia.
  { path: '/gestion', ready: /Cómo funciona la casa por dentro/ },
  { path: '/laboratorio/frontera', ready: /series de unidad física/ },
  {
    path: '/laboratorio/coste-esperado',
    ready: /veces\s+lo esperado|municipios en gestión directa/,
  },
  { path: '/nosotros', ready: /es el primer municipio/ },
  { path: '/about', ready: /All funding is disclosed publicly/ },
  { path: '/metodologia', ready: /Última revisión de este documento/ },
  { path: '/aviso-legal', ready: /Versión vigente/ },
]

// The sparsest legitimate page is /quejas/q-no-existe (a "not found" card).
// Anything below this floor is a shell, not a page.
const CONTENT_FLOOR = 150

// Routes that overflow today and are not fixed in this pass — the first thing
// the corrected guard found once it could see. They are still measured in
// full, content assertions included, but against their own recorded width, so
// the debt cannot grow quietly. Two things keep this from becoming a place
// where defects go to die: the number is the real measurement, and a route
// that starts fitting FAILS until its line is deleted. Fixing the page is the
// only way out; raising the number is not.
//
// Vacío desde 2026-08-05: /declaraciones era la última entrada y su cabecera
// ya envuelve, así que todas las rutas se miden contra el mismo listón.
const KNOWN_OVERFLOW: Record<string, { widthPx: number; reason: string }> = {}

async function measure(page: import('@playwright/test').Page, route: Route, readyTimeout = 20_000) {
  await page.goto(route.path, { waitUntil: 'domcontentloaded' })

  const rx = { source: route.ready.source, flags: route.ready.flags }

  // Real signal, not a sleep: wait for the route's own data to be on screen.
  // On timeout we fall through deliberately — the assertion in the test reads
  // better than a raw waitForFunction timeout, and reports what did render.
  await page
    .waitForFunction(
      ({ source, flags }) => {
        const root = document.querySelector('main') ?? document.body
        const text = (root as HTMLElement).innerText || ''
        return new RegExp(source, flags).test(text.replace(/\s+/g, ' '))
      },
      rx,
      { timeout: readyTimeout },
    )
    .catch(() => undefined)

  // Webfont metrics, then one painted frame, so the width is the settled one.
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  )

  // One atomic read: the width and the proof that content was on screen when
  // it was taken cannot drift apart, because they come from the same frame.
  return page.evaluate(({ source, flags }) => {
    const root = document.querySelector('main') ?? document.body
    const text = ((root as HTMLElement).innerText || '').replace(/\s+/g, ' ').trim()
    const doc = document.documentElement
    const widest = [...document.querySelectorAll('body *')]
      .map((el) => {
        const r = el.getBoundingClientRect()
        return { right: Math.round(r.right), el }
      })
      // Above scrollWidth means a clipped ancestor already contains it
      // (Leaflet's zoom proxy sits at right≈522730) — not a real offender.
      .filter((x) => x.right > doc.clientWidth + 6 && x.right <= doc.scrollWidth)
      .sort((a, b) => b.right - a.right)
      .slice(0, 3)
      .map(
        (x) =>
          `<${x.el.tagName.toLowerCase()}${
            x.el.className ? ` class="${String(x.el.className).slice(0, 40)}"` : ''
          }> right=${x.right} "${(x.el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`,
      )
    return {
      scrollW: doc.scrollWidth,
      clientW: doc.clientWidth,
      innerW: window.innerWidth,
      chars: text.length,
      hasData: new RegExp(source, flags).test(text),
      widest,
    }
  }, rx)
}

type Measurement = Awaited<ReturnType<typeof measure>>

// The whole assertion, in one place, so the fault-injection test below can
// prove it rejects an empty page instead of merely documenting that it should.
function assertFitsViewport(m: Measurement, width: number, path: string, ready: RegExp) {
  // 1. Prove the guard measured a rendered page. Without this the suite can go
  //    green by rendering nothing, which is how it stayed green through a 55%
  //    overrun.
  expect(
    m.hasData,
    `${path}: ${ready} never appeared, so the width was about to be measured on an empty page (main had ${m.chars} chars)`,
  ).toBe(true)
  expect(
    m.chars,
    `${path}: main rendered only ${m.chars} chars — that is a shell, not a page`,
  ).toBeGreaterThan(CONTENT_FLOOR)

  // 2. Prove the reference is the viewport and not something the overflow
  //    itself moved. window.innerWidth is reported for the record: when the
  //    two disagree, the difference IS the overflow.
  expect(
    m.clientW,
    `${path}: layout viewport drifted from the emulated ${width}px (window.innerWidth ${m.innerW})`,
  ).toBe(width)

  // 3. Only now, the actual claim. 6px of sub-pixel margin for browser
  //    rounding of map controls.
  const debt = KNOWN_OVERFLOW[path]
  expect(
    m.scrollW,
    `${path}: document is ${m.scrollW}px wide in a ${width}px viewport. Widest: ${m.widest.join(' | ') || '(none)'}`,
  ).toBeLessThanOrEqual(debt ? debt.widthPx : width + 6)

  // A debt entry that no longer describes anything is a green light for a
  // page nobody checks. If the route fits now, the entry has to go.
  if (debt) {
    expect(
      m.scrollW,
      `${path}: ya cabe en ${width}px — borra su entrada de KNOWN_OVERFLOW`,
    ).toBeGreaterThan(width + 6)
  }
}

test.describe('Mobile shell (iPhone 13 mini / 375px)', () => {
  for (const route of ROUTES) {
    test(`${route.path} fits the viewport with no horizontal scroll`, async ({ page }) => {
      const viewport = page.viewportSize()
      expect(viewport, 'the mobile project must set a viewport').not.toBeNull()
      const width = viewport!.width

      const m = await measure(page, route)
      assertFitsViewport(m, width, route.path, route.ready)
    })
  }

  // Fault injection. An empty /presupuesto genuinely FITS 375px — that is
  // precisely how a width-only suite reported green while the real page ran
  // 581px wide. So the guard is only worth having if it refuses to measure a
  // page that rendered nothing; this test deletes the data and demands the
  // refusal. Remove the content precondition above and this test goes red.
  test('with the snapshots blocked, the guard refuses to measure rather than passing', async ({
    page,
  }) => {
    await page.route(/\/data\/.*\.json/, (route) => route.abort())
    const width = page.viewportSize()!.width
    const route = ROUTES.find((r) => r.path === '/presupuesto')!

    // Short ready-timeout: here the data is never coming, and waiting the full
    // 20s to learn that is pure suite latency.
    const m = await measure(page, route, 3_000)

    expect(m.hasData, 'blocking /data/*.json must leave the CONPREL figure unrendered').toBe(false)
    expect(
      m.scrollW,
      'the empty shell fits — a width-only assertion would report green here',
    ).toBeLessThanOrEqual(width + 6)
    expect(() => assertFitsViewport(m, width, route.path, route.ready)).toThrow(
      /never appeared|shell, not a page/,
    )
  })

  test('los paneles del mapa caben DENTRO del mapa, con las capas abiertas', async ({ page }) => {
    // Ninguna suite miraba esto y por eso llevaba roto. A 375 px el mapa mide
    // ~277 px de alto y la pila de controles va anclada abajo creciendo hacia
    // arriba: con los chips y el deslizador de gasto ya se salía 59 px por
    // encima del borde, y al abrir una capa más el panel acababa FUERA de la
    // pantalla —inalcanzable, no sólo solapado—. El guardia de scroll
    // horizontal no lo ve porque el desbordamiento es vertical.
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 10000 })

    const chip = page.getByRole('button', { name: /Incendios forestales/i })
    await chip.first().click()
    // Por RECUENTO, no por visibilidad: al zoom del móvil los incendios más
    // pequeños —hay uno de 0,0005 ha— colapsan a un path de un píxel
    // (`d="M167 123L167 122z"`), que Playwright considera oculto. La capa está
    // pintando; lo que no sirve es preguntarle si se ve al más diminuto.
    await expect
      .poll(async () => page.locator('path.cp-incendio').count(), { timeout: 8000 })
      .toBeGreaterThan(20)

    const medida = await page.evaluate(() => {
      const r = (el: Element) => {
        const b = el.getBoundingClientRect()
        return { top: Math.round(b.top), bottom: Math.round(b.bottom) }
      }
      const mapa = document.querySelector('.leaflet-container')
      const chips = document.querySelector('[role="group"]')
      const pila = chips?.parentElement
      if (!mapa || !chips || !pila) return null
      return { mapa: r(mapa), pila: r(pila), chips: r(chips), alto: window.innerHeight }
    })

    // Que la comprobación haya EVALUADO algo: sin los tres nodos no mide nada
    // y pasaría igual, que es el defecto que este repo ya ha pagado dos veces.
    expect(medida).not.toBeNull()
    const m = medida!
    expect(m.mapa.bottom).toBeGreaterThan(m.mapa.top)

    expect(m.pila.top).toBeGreaterThanOrEqual(m.mapa.top)
    expect(m.pila.bottom).toBeLessThanOrEqual(m.mapa.bottom)
    // Y los chips —lo único que permite volver a apagar la capa— visibles.
    expect(m.chips.top).toBeGreaterThanOrEqual(0)
    expect(m.chips.bottom).toBeLessThanOrEqual(m.alto)
  })

  test('hamburger opens the sidebar drawer, Escape closes it', async ({ page }) => {
    await page.goto('/cargos', { waitUntil: 'domcontentloaded' })
    const sidebar = page.locator('.cp-shell-sidebar')
    const hamburger = page.getByRole('button', { name: /menú/i })

    // Drawer starts collapsed (transform translated off-screen)
    await expect(sidebar).not.toHaveClass(/cp-sidebar-open/)

    await hamburger.click()
    await expect(sidebar).toHaveClass(/cp-sidebar-open/)

    await page.keyboard.press('Escape')
    await expect(sidebar).not.toHaveClass(/cp-sidebar-open/)
  })
})

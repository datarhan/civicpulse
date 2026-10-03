import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { PRIMER_HALLAZGO } from './_rutas'
import { REPORTAJE_SLUGS } from '../../src/reportajes'

// A real pleno id with claims, read from the committed manifest (for /plenos/:id).
const FIRST_PLENO_ID = JSON.parse(readFileSync('public/data/pleno-claims/index.json', 'utf8'))
  .plenos?.[0]?.plenoId

// Una oferta real, para `/empleo/:id`: su título sale del snapshot.
const OFERTA = JSON.parse(readFileSync('public/data/empleo.json', 'utf8')).items?.[0] as {
  id: string
  titulo: string
}

// Cada pieza del registro, con el titular congelado en su propio JSON.
const PIEZAS = REPORTAJE_SLUGS.map((slug) => ({
  slug,
  titulo: JSON.parse(readFileSync(`public/data/reportajes/${slug}.json`, 'utf8')).meta
    .titulo as string,
}))

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

// `flag`: the launch flag that mounts the route. Without it App.jsx has no such
// route and sends the visit to `/`, so the entry skips and names the variable,
// as eficiencia.spec.ts does. Only a flagged route may skip: any other route
// that lands elsewhere has disappeared, and that fails.
type Route = { path: string; ready: RegExp; flag?: string }

const ROUTES: Route[] = [
  // Decimal-tolerant: the accumulated total gained a decimal when a €55,7M
  // water concession landed on 2026-08-06 («… de 123,7 M€»), and `\d+ M€`
  // stopped matching. The guard then refused to measure — correctly, but for a
  // stale reason. A readiness signal must survive the copy it waits on.
  { path: '/', ready: /M€ de [\d.,]+ M€/ }, // situated-spend ticker (tenders snapshot)
  { path: '/cargos', ready: /Robert Raga Gadea/ }, // officials snapshot
  { path: '/cargos/robert-raga-gadea', ready: /@ribarroja\.es/ }, // the official's own record
  // El rediseño «del crédito inicial a lo ejecutado» retiró la tira de cuatro
  // KPI donde vivía `€41,6M`, la forma compacta que esperaba esta señal. La
  // nueva espera la MISMA dependencia —el presupuesto aprobado de CONPREL— en
  // la línea de la cabecera donde ahora se publica esa cifra, así que el guard
  // conserva exactamente la fuerza que tenía: sin budget.json no hay señal y
  // se niega a medir, que es lo que comprueba la inyección de fallo de abajo.
  { path: '/presupuesto', ready: /[\d.,]+ M€ de gastos aprobados/ }, // CONPREL
  // El rediseño del índice retiró el rótulo «… de 39 de 61 sesiones» de la
  // tarjeta de departamentos, que era donde vivía la señal anterior. La nueva
  // sale del lede, que es lo primero que la página escribe con datos dentro.
  { path: '/plenos', ready: /celebrado \d+ sesiones/i },
  { path: `/plenos/${FIRST_PLENO_ID}`, ready: /\d{1,2} de [a-záéíóúñ]+ de \d{4}/i }, // session date
  { path: '/promesas', ready: /\d+ compromisos en seguimiento/ },
  { path: '/departamentos', ready: /De \d+ concejalías con delegación/ },
  { path: '/departamentos/urbanismo', ready: /\d+% contrastadas · \d+ en total/ },
  { path: '/hallazgos', ready: /TOTAL HALLAZGOS \d+/ },
  // La página propia de una ficha: su titular sale del snapshot, no de una cadena.
  { path: `/hallazgos/${PRIMER_HALLAZGO.id}`, ready: literal(PRIMER_HALLAZGO.title) },
  { path: '/reportajes', ready: /REPORTAJE · /i },
  // Las piezas, una por slug del registro. No estaban en esta lista y dos de
  // ellas repartían sus fuentes en columnas de 280 px que a 320 no cabían.
  ...PIEZAS.map((p) => ({ path: `/reportajes/${p.slug}`, ready: literal(p.titulo) })),
  { path: '/declaraciones', ready: /TOTAL \d+ CONTRASTADAS \d+/ },
  // Tablas de cinco columnas en un móvil: el sitio exacto donde una fila se
  // sale sin que ninguna prueba de datos lo note. /eficiencia/:id no estaba en
  // esta lista y por eso nadie lo midió a 375.
  { path: '/laboratorio/cobertura', ready: /DECLARACIONES PUBLICADAS/i },
  { path: '/datos', ready: /Q23701/ }, // Wikidata identity block
  { path: '/empleo', ready: /OFERTAS ABIERTAS \d+/ },
  // La ficha de una oferta: filas etiqueta/valor con la etiqueta en 190 px.
  { path: `/empleo/${OFERTA.id}`, ready: literal(OFERTA.titulo) },
  { path: '/quejas', ready: /TOTAL QUEJAS \d+/ },
  { path: '/quejas/dashboard', ready: /TOTAL QUEJAS \d+/ },
  // Not a data row but a data ANSWER: this sentence only renders once the
  // quejas snapshot has loaded and the id was absent from it.
  { path: '/quejas/q-no-existe', ready: /no aparece en el snapshot actual/ },
  { path: '/cambios', ready: /Total: \d+ cambios · ventana de \d+ días/ },
  { path: '/laboratorio', ready: /TITULARES MONITORIZADOS \d+/ },
  // No estaba en esta lista, así que ninguna guarda de ancho la miraba: sus
  // filas de cinco columnas se salían 69 px con la barra lateral. La señal es
  // un recuento de filas, que sólo existe cuando un snapshot se ha leído.
  { path: '/lab-health', ready: /\d[\d.]* filas/ },
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
  { path: '/eficiencia', ready: /rendición de cuentas/i, flag: 'VITE_ENABLE_EFICIENCIA' },
  {
    path: '/eficiencia#sec-servicios',
    ready: /servicios del panel/i,
    flag: 'VITE_ENABLE_EFICIENCIA',
  },
  {
    path: `/eficiencia/${FICHA.id}`,
    ready: literal(FICHA.etiqueta),
    flag: 'VITE_ENABLE_EFICIENCIA',
  },
  // El h1, no un titular de sección: «Plazos, concurrencia y ejecución» era el
  // título de una tarjeta y se movió con el libro de gestión. Un centinela que
  // vive dentro de un componente caduca en cuanto ese componente cambia.
  { path: '/gestion', ready: /Cómo funciona la casa por dentro/, flag: 'VITE_ENABLE_EFICIENCIA' },
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

/** The pathname a route asks for, without hash or trailing slash. */
const pathOf = (p: string) => new URL(p, 'http://x').pathname.replace(/(.)\/$/, '$1')

async function measure(page: import('@playwright/test').Page, route: Route, readyTimeout = 20_000) {
  await page.goto(route.path, { waitUntil: 'domcontentloaded' })

  const rx = { source: route.ready.source, flags: route.ready.flags, pedida: pathOf(route.path) }

  // Real signal, not a sleep: wait for the route's own data to be on screen —
  // or for the app to have sent us somewhere else, which no wait will undo.
  // On timeout we fall through deliberately — the assertion in the test reads
  // better than a raw waitForFunction timeout, and reports what did render.
  await page
    .waitForFunction(
      ({ source, flags, pedida }) => {
        if (location.pathname.replace(/(.)\/$/, '$1') !== pedida) return true
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
      landed: location.pathname.replace(/(.)\/$/, '$1'),
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
  assertPaginaPintada(m, path, ready)

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

// Las dos precondiciones de toda medida de este fichero, en un sitio: la del
// ancho del documento y la de las rejillas descansan en la misma prueba de que
// había una página pintada, y la inyección de fallo de abajo la ejercita.
function assertPaginaPintada(m: Measurement, path: string, ready: RegExp) {
  // 0. Prove the guard measured the route it asked for. With
  //    VITE_ENABLE_EFICIENCIA off, /eficiencia falls through App.jsx's
  //    catch-all to `/`, and the landing's own «RENDICIÓN DE CUENTAS POR
  //    CONCEJALÍA» satisfied /rendición de cuentas/i: measured on 2026-09-27,
  //    this spec went green on /eficiencia by measuring the landing page.
  expect(m.landed, `${path}: the app sent it to ${m.landed} — that is another page`).toBe(
    pathOf(path),
  )

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
}

test.describe('Mobile shell (iPhone 13 mini / 375px)', () => {
  for (const route of ROUTES) {
    test(`${route.path} fits the viewport with no horizontal scroll`, async ({ page }) => {
      const viewport = page.viewportSize()
      expect(viewport, 'the mobile project must set a viewport').not.toBeNull()
      const width = viewport!.width

      const m = await measure(page, route)
      test.skip(
        !!route.flag && m.landed !== pathOf(route.path),
        `${route.path} is not mounted — rebuild with ${route.flag}=true`,
      )
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
      const panel = document.querySelector('.d-mappane')
      const mapa = document.querySelector('.leaflet-container')
      // Por el asidero de las capas, NO por el orden del documento. Con
      // `querySelector('[role="group"]')` esto medía el primer grupo de la
      // página: al ganar la cabecera sus paneles desplegables, el ancla se mudó
      // allí —a un panel oculto, con el rectángulo a cero— y dos de las
      // aserciones de abajo empezaron a cumplirse solas. `data-capa` no se
      // traduce ni cambia de sitio.
      const chips = document.querySelector('[data-capa]')?.closest('[role="group"]')
      const pila = chips?.parentElement
      if (!panel || !mapa || !chips || !pila) return null
      return {
        mapa: r(mapa),
        pila: r(pila),
        chips: r(chips),
        alto: window.innerHeight,
        // Que el ancla siga dentro del panel del mapa: si vuelve a mudarse, esto
        // se pone en falso en vez de medir la caja equivocada en silencio.
        enElPanel: panel.contains(mapa) && panel.contains(chips),
      }
    })

    // Que la comprobación haya EVALUADO algo: sin los cuatro nodos no mide nada
    // y pasaría igual, que es el defecto que este repo ya ha pagado dos veces.
    expect(medida).not.toBeNull()
    const m = medida!
    expect(m.enElPanel, 'el ancla de las capas ya no está en el panel del mapa').toBe(true)
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

// ---------------------------------------------------------------------------
// Rejillas: ningún bloque pintado pasa el borde de la caja de su rejilla, a
// 375 px y a 320 px.
//
// La prueba de arriba mide el DOCUMENTO, y hay desbordamientos que no lo
// ensanchan: un bloque que se sale de su rejilla y se queda en el margen de la
// página, o que acaba justo en el borde de la pantalla —la nota de /eficiencia
// iba de 45 a 375 y `scrollWidth` seguía en 375 (#176)—. Aquí cada bloque se
// mide contra la caja de contenido de su propia rejilla.
//
// Tres mecanismos, medidos el 29-09-2026 sobre la build de producción con las
// dos banderas:
//
// 1. `repeat(auto-fit|auto-fill, minmax(Npx, 1fr))` decide CUÁNTAS columnas
//    caben, pero la última que queda conserva su suelo de N px aunque la caja
//    sea más estrecha: las tarjetas de /promesas (340) se salían 13 px a 375 y
//    68 a 320; las de /datos y /quejas/dashboard (320), 48 a 320.
// 2. Pistas fijas, que no ceden: `190px 1fr` dejaba al valor de la ficha de
//    una oferta 83 px a 375, y «IMPRESCINDIBLE» lo sacaba 19; las tres cifras
//    de `1fr 80px 80px 80px` pedían 270 px en una caja de 230.
// 3. Una pista `1fr` —que es `minmax(auto, 1fr)`— crece hasta el mínimo de su
//    contenido: el ancho intrínseco del `<input type=range>` de /presupuesto,
//    la tabla de medios de /laboratorio y, en la bitácora de correcciones de
//    /promesas, una URL sin un solo punto de corte que, con la bitácora
//    abierta, llevaba la página a 2.578 px en un teléfono y a 3.317 en un
//    escritorio.
//
// Por eso se ABREN los <details> antes de medir: los abre el lector. Y por eso
// se filtra con `checkVisibility()`: lo de dentro de un <details> cerrado no se
// pinta, pero Chrome le calcula una caja igual si se le pregunta, con pistas
// sin sentido (2.502 px con la bitácora cerrada).
//
// Se miden BLOQUES y no pistas: con `auto-fit` las columnas sobrantes colapsan
// a 0 px y sumarlas con sus huecos da excesos que no existen.
//
// Y 320 porque `a11y.spec.ts` apunta a WCAG 2.1 AA, que incluye el criterio
// 1.4.10 (Reflow): contenido usable a 320 px CSS sin desplazarse en
// horizontal. axe no puede comprobarlo; esta prueba mide la parte que es de
// rejillas, no el documento entero a 320.
// ---------------------------------------------------------------------------

/** El ancho del proyecto y el de WCAG 1.4.10. */
const ANCHOS_REJILLA = [375, 320]

/**
 * Rutas cuyo contenido no tiene ni una rejilla: páginas de texto. En ellas el
 * suelo no puede probar que la guarda miró algo —no hay nada que mirar—, y lo
 * que prueba que sabe fallar es la rejilla plantada de más abajo. La lista se
 * sostiene en las dos direcciones, como KNOWN_OVERFLOW: si una de estas rutas
 * gana una rejilla, su entrada tiene que irse para que el suelo la vigile.
 */
const SIN_REJILLAS = new Set([
  '/laboratorio/cobertura',
  '/quejas/q-no-existe',
  '/laboratorio/frontera',
  '/laboratorio/coste-esperado',
  '/nosotros',
  '/about',
  '/metodologia',
  '/aviso-legal',
])

type Rejilla = {
  plantilla: string
  /** Su primera clase, o '' si no lleva: las filas hermanas se agrupan por ella. */
  clase: string
  caja: number
  bloques: number
  /** Lo que más pasa un bloque del borde de la caja, en px. */
  pasa: number
  /** Dentro de #contenido y no en la barra superior del armazón. */
  enContenido: boolean
  texto: string
}

/**
 * Abre cada <details> de <main> y mide cada rejilla pintada: cuánto pasa de su
 * caja de contenido el bloque que más se sale, por la derecha o la izquierda.
 */
async function medirRejillas(page: Page): Promise<Rejilla[]> {
  await page.evaluate(async () => {
    for (const d of document.querySelectorAll('main details')) {
      ;(d as HTMLDetailsElement).open = true
    }
    await document.fonts.ready
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  })
  return page.evaluate(() => {
    const pintado = (el: Element) => {
      if (!el.checkVisibility()) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }
    // Un hijo con `display: contents` no tiene caja: los bloques son sus hijos.
    const bloquesDe = (g: Element): Element[] =>
      [...g.children].flatMap((h) =>
        getComputedStyle(h).display === 'contents' ? bloquesDe(h) : [h],
      )
    const contenido = document.getElementById('contenido')
    return [...document.querySelectorAll('main *')]
      .filter((el) => getComputedStyle(el).display.endsWith('grid') && pintado(el))
      .map((g) => {
        const cs = getComputedStyle(g)
        const b = g.getBoundingClientRect()
        const izq = b.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)
        const der = b.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight)
        const bloques = bloquesDe(g).filter(pintado)
        const pasa = Math.max(
          0,
          ...bloques.map((h) => {
            const r = h.getBoundingClientRect()
            return Math.max(r.right - der, izq - r.left)
          }),
        )
        return {
          plantilla: (g as HTMLElement).style.gridTemplateColumns || cs.gridTemplateColumns,
          clase: g.classList[0] ?? '',
          caja: Math.round(der - izq),
          bloques: bloques.length,
          pasa: Math.round(pasa * 10) / 10,
          enContenido: !!contenido?.contains(g),
          texto: (g.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50),
        }
      })
  })
}

const fuera = (rejillas: Rejilla[]) =>
  rejillas
    .filter((g) => g.pasa > 0.5)
    .map((g) => `+${g.pasa} px · ${g.plantilla} · caja de ${g.caja} px · «${g.texto}»`)

test.describe('Rejillas a 375 y 320 px: ningún bloque fuera de su caja', () => {
  for (const route of ROUTES) {
    test(`${route.path}: cada bloque cabe en la caja de su rejilla`, async ({ page }) => {
      const m = await measure(page, route)
      test.skip(
        !!route.flag && m.landed !== pathOf(route.path),
        `${route.path} no está montada — reconstruye con ${route.flag}=true`,
      )
      assertPaginaPintada(m, route.path, route.ready)

      for (const width of ANCHOS_REJILLA) {
        await page.setViewportSize({ width, height: 812 })
        const rejillas = await medirRejillas(page)

        // Que haya medido algo: rejillas con bloques en el contenido de la
        // página, no sólo el botón del menú de la barra superior.
        const conBloques = rejillas.filter((g) => g.enContenido && g.bloques > 0).length
        if (SIN_REJILLAS.has(route.path)) {
          expect(
            conBloques,
            `${width} px · ${route.path} ya tiene ${conBloques} rejillas — bórrala de SIN_REJILLAS`,
          ).toBe(0)
        } else {
          expect(
            conBloques,
            `${width} px · ${route.path}: ninguna rejilla con bloques en #contenido (${rejillas.length} en <main>)`,
          ).toBeGreaterThan(0)
        }

        expect(
          fuera(rejillas),
          `${width} px · ${route.path}: bloques fuera de la caja de su rejilla`,
        ).toEqual([])
      }
    })
  }

  // Inyección de fallo: lo que prueba que esta guarda SABE fallar. Una rejilla
  // con un suelo de 400 px, dentro de un <details> cerrado, plantada a 320 px
  // en una página de texto: si la guarda no abriera los <details> o no midiera
  // cada bloque contra su caja, la lista saldría vacía, y en verde.
  test('una rejilla plantada que se sale de su caja sale en la lista, aunque vaya en un <details> cerrado', async ({
    page,
  }) => {
    const route = ROUTES.find((r) => r.path === '/nosotros')!
    const m = await measure(page, route)
    assertPaginaPintada(m, route.path, route.ready)
    await page.setViewportSize({ width: 320, height: 812 })

    await page.evaluate(() => {
      const d = document.createElement('details')
      d.innerHTML =
        '<summary>plantada</summary>' +
        '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr))">' +
        '<p>bloque</p></div>'
      document.getElementById('contenido')!.append(d)
    })

    expect(fuera(await medirRejillas(page))).toEqual([
      expect.stringMatching(/^\+\d+(\.\d)? px · repeat\(auto-fit, minmax\(400px, 1fr\)\) · /),
    ])
  })
})

// ---------------------------------------------------------------------------
// Rejillas con la barra lateral: la misma medida, de 721 a 1100 px de ventana.
//
// Por encima de 720 px aparece la barra lateral (232 px) y la columna de
// contenido ENCOGE: a 721 px de ventana mide 489, y a 720 medía 720. Una
// rejilla que decide por @media ve una ventana de escritorio y pone su maqueta
// ancha en una columna de teléfono grande. #190 lo midió en la tira de
// /plenos/:id y lo resolvió con una consulta de contenedor; la PR #189 dejó
// apuntadas cuatro rutas más.
//
// Medido el 30-09-2026 sobre la build de producción con las dos banderas, de
// 700 a 1100 px de ventana, de píxel en píxel, en las 42 rutas públicas y en
// los dos temas —que dieron lo mismo en las 16.842 medidas de cada uno: el
// oscuro cambia colores, no cajas—:
//
//   /presupuesto   las filas de capítulos (246 + 116 + 62 px de pistas fijas)
//                  se salían hasta 67 px, de 721 a 787; las de programas, 81,
//                  de 721 a 801; las de la deuda, 27, de 901 a 927, donde la
//                  serie pasa a dos columnas y a sus filas les quedan 253 px.
//   /plenos        la tabla de siete columnas pide 844 px: se salía de su caja
//                  de 721 a 1100 —405 px a 721—, escondida en su scroll.
//   /lab-health    las filas de cinco columnas, 69 px, de 721 a 789.
//   /laboratorio   la columna de artículos bajaba a 143 px y cada ficha pedía
//                  206: 63,5 px fuera, de 721 a 783.
//
// Nada de 700 a 720: sin barra lateral, la columna es la ventana, y eso ya lo
// mide el bloque de arriba en sus dos anchos.
//
// Qué anchos: el primero del tramo, un paso de 4 px hasta el último, y el
// primer ancho de cada maqueta que un @media de las hojas de la página estrena
// dentro del tramo —justo por encima de su corte, donde esa maqueta tiene la
// columna más estrecha—. Los cortes se leen de las hojas y no de este fichero,
// así que uno nuevo se mide sin que nadie lo apunte. El paso es para lo que
// decide una consulta de contenedor: corta por el ancho de la columna, que
// ningún corte de ventana nombra, y cada corte de contenedor de estas páginas
// deja al menos 8 px de margen sobre lo que su contenido pide.
// ---------------------------------------------------------------------------

/** El tramo de ventana con barra lateral que se recorre. */
const TRAMO_BARRA = { desde: 721, hasta: 1100, paso: 4 }

/**
 * Los anchos de ventana en los que se mide: el paso fijo del tramo, su último
 * ancho y el primero de cada maqueta que estrena un @media de la página.
 */
async function anchosConBarra(page: Page): Promise<number[]> {
  const cortes = await page.evaluate(() => {
    const out: number[] = []
    const recorre = (reglas: CSSRuleList) => {
      for (const r of reglas) {
        if (r instanceof CSSMediaRule) {
          for (const [, lado, px] of r.media.mediaText.matchAll(
            /\((max|min)-width:\s*([\d.]+)px\)/g,
          )) {
            // max-width: N → la maqueta ancha empieza en N + 1; min-width: N, en N.
            out.push(lado === 'max' ? Math.floor(Number(px)) + 1 : Math.ceil(Number(px)))
          }
        }
        if ('cssRules' in r) recorre((r as CSSGroupingRule).cssRules)
      }
    }
    for (const hoja of document.styleSheets) {
      try {
        recorre(hoja.cssRules)
      } catch {
        // Una hoja de otro origen (Google Fonts) no deja leer sus reglas.
      }
    }
    return out
  })
  const { desde, hasta, paso } = TRAMO_BARRA
  const fijos = Array.from(
    { length: Math.floor((hasta - desde) / paso) + 1 },
    (_, i) => desde + i * paso,
  )
  const dentro = cortes.filter((w) => w >= desde && w <= hasta)
  return [...new Set([...fijos, hasta, ...dentro])].sort((a, b) => a - b)
}

type Recorrido = { ancho: number; rejillas: Rejilla[] }[]

/**
 * Lo que se sale en un recorrido, con los anchos seguidos agrupados en tramos
 * para que un fallo en cien anchos se lea en una línea. Un tramo se corta donde
 * hay un ancho medido que sí cabe: dos tramos son dos defectos. Una rejilla se
 * nombra por su clase —las once filas de capítulos son una sola línea— y, sin
 * clase, por su texto.
 */
function tramosFuera(recorrido: Recorrido): string[] {
  type Tramo = { desde: number; hasta: number; peor: number; caja: number }
  const porRejilla = new Map<string, { tramos: Tramo[]; textos: Set<string> }>()
  recorrido.forEach(({ ancho, rejillas }, i) => {
    const peores = new Map<string, Rejilla>()
    for (const g of rejillas.filter((g) => g.pasa > 0.5)) {
      const clave = g.clase ? `.${g.clase}` : `«${g.texto}»`
      const suya = porRejilla.get(clave) ?? { tramos: [], textos: new Set<string>() }
      suya.textos.add(g.texto)
      porRejilla.set(clave, suya)
      if (g.pasa > (peores.get(clave)?.pasa ?? 0)) peores.set(clave, g)
    }
    for (const [clave, g] of peores) {
      const { tramos } = porRejilla.get(clave)!
      const ultimo = tramos.at(-1)
      if (ultimo && recorrido[i - 1]?.ancho === ultimo.hasta) {
        ultimo.hasta = ancho
        if (g.pasa > ultimo.peor) Object.assign(ultimo, { peor: g.pasa, caja: g.caja })
      } else tramos.push({ desde: ancho, hasta: ancho, peor: g.pasa, caja: g.caja })
    }
  })
  return [...porRejilla].flatMap(([clave, { tramos, textos }]) =>
    tramos.map(
      (t) =>
        `ventana de ${t.desde} a ${t.hasta} px · +${t.peor} px · ${clave}` +
        `${textos.size > 1 ? ` (${textos.size} rejillas)` : ''} · caja de ${t.caja} px en el peor`,
    ),
  )
}

/** Recorre el tramo: en cada ancho, las rejillas y dónde empieza la columna. */
async function recorrerConBarra(page: Page) {
  const recorrido: Recorrido = []
  const sinBarra: number[] = []
  for (const width of await anchosConBarra(page)) {
    await page.setViewportSize({ width, height: 900 })
    const rejillas = await medirRejillas(page)
    // Que el tramo mida lo que dice: con la barra lateral en su sitio, la
    // columna empieza detrás de ella y no en el borde de la ventana.
    const columna = await page.evaluate(
      () => document.getElementById('contenido')?.getBoundingClientRect().left ?? 0,
    )
    if (columna < 200) sinBarra.push(width)
    recorrido.push({ ancho: width, rejillas })
  }
  return { recorrido, sinBarra }
}

test.describe('Rejillas con la barra lateral, de 721 a 1100 px: ningún bloque fuera de su caja', () => {
  // La portada no lleva barra lateral: su maqueta es otra (DirectionD).
  for (const route of ROUTES.filter((r) => r.path !== '/')) {
    test(`${route.path}: con la barra lateral, cada bloque cabe en la caja de su rejilla`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: TRAMO_BARRA.hasta, height: 900 })
      const m = await measure(page, route)
      test.skip(
        !!route.flag && m.landed !== pathOf(route.path),
        `${route.path} no está montada — reconstruye con ${route.flag}=true`,
      )
      assertPaginaPintada(m, route.path, route.ready)

      const { recorrido, sinBarra } = await recorrerConBarra(page)

      // Que haya recorrido el tramo con la barra puesta, y midiendo rejillas.
      expect(sinBarra, `${route.path}: sin barra lateral en estos anchos`).toEqual([])
      expect(recorrido.length, `${route.path}: anchos recorridos`).toBeGreaterThan(90)
      if (!SIN_REJILLAS.has(route.path)) {
        const vacios = recorrido
          .filter((r) => !r.rejillas.some((g) => g.enContenido && g.bloques > 0))
          .map((r) => r.ancho)
        expect(
          vacios,
          `${route.path}: anchos sin ninguna rejilla con bloques en #contenido`,
        ).toEqual([])
      }

      expect(
        tramosFuera(recorrido),
        `${route.path}: bloques fuera de la caja de su rejilla con la barra lateral`,
      ).toEqual([])
    })
  }

  // Inyección de fallo, como la de arriba: una rejilla de una sola pista fija
  // de 600 px, puesta en #contenido, no cabe hasta que la ventana le deja 600 px
  // (600 + 232 de barra = 832), así que el recorrido tiene que devolverla en UN
  // tramo que empieza en el primer ancho y acaba justo antes de 832, aunque por
  // medio se midan los cortes de @media de la página. Si la agrupación partiera
  // el tramo o se comiera un ancho, esto lo diría.
  test('una rejilla plantada de 600 px sale en un solo tramo, de 721 hasta justo antes de 832', async ({
    page,
  }) => {
    const route = ROUTES.find((r) => r.path === '/nosotros')!
    await page.setViewportSize({ width: TRAMO_BARRA.hasta, height: 900 })
    const m = await measure(page, route)
    assertPaginaPintada(m, route.path, route.ready)
    await page.evaluate(() => {
      const g = document.createElement('div')
      g.style.cssText = 'display: grid; grid-template-columns: 600px'
      const p = document.createElement('p')
      p.textContent = 'plantada'
      g.append(p)
      document.getElementById('contenido')!.append(g)
    })

    const { recorrido, sinBarra } = await recorrerConBarra(page)
    expect(sinBarra).toEqual([])
    expect(tramosFuera(recorrido)).toEqual([
      expect.stringMatching(/^ventana de 721 a 8[23]\d px · \+111 px · «plantada» · /),
    ])
  })
})

import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { collectErrors, appErrors } from './_console'
import { afirmaPulsables, cargaYEncuadra, sondea } from './_estaciones'
import { afirma, entraPorElPin, mide } from './_pines-y-barrios'
import { contractTermYears, isConcession } from '../../src/lib/contract-status'

/**
 * Dónde queda un ancla tras saltar a ella: el borde de arriba de su elemento en
 * la ventana. `useHashScroll` la deja bajo la barra pegajosa (unos 64 px); un
 * ancla que el lector no ve, o que se pasó por arriba, cuenta como no
 * aterrizada (`Infinity`), para que ni «fuera por abajo» ni «fuera por arriba»
 * pasen por un número pequeño.
 */
const ATERRIZA_PX = 160
function arribaDe(page: import('@playwright/test').Page, id: string) {
  return page.evaluate((id) => {
    const el = document.getElementById(id)
    if (!el) return Infinity
    const arriba = el.getBoundingClientRect().top
    return arriba < -8 ? Infinity : arriba
  }, id)
}

test.describe('Landing (/)', () => {
  test('renders editorial column + KPI strip with real data', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Editorial header — municipality name always present
    await expect(page.getByText('Riba-roja de Túria').first()).toBeVisible()

    // Mayor name from officials.json (real data, not mock)
    await expect(page.getByText(/Robert Raga/i).first()).toBeVisible({ timeout: 8000 })

    // KPI strip: the labels include the current year ("Población 2025", "Presupuesto 2025" etc.)
    //
    // Scoped to the strip's cells. The section bar's closed panels carry
    // «población» and «Presupuesto» in hidden text that comes first in the DOM,
    // and a page-wide `.first()` resolved to it — hidden, so the test failed on
    // a page that was fine.
    await expect(page.locator('.d-kpi-cell', { hasText: /Población/i }).first()).toBeVisible()
    await expect(page.locator('.d-kpi-cell', { hasText: /Presup/i }).first()).toBeVisible()

    // Map tiles loaded (Leaflet attribution link appears when tiles are live)
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 8000 })

    expect(appErrors(errors)).toEqual([])
  })

  test('every cumulative contract figure carries its period in visible text', async ({ page }) => {
    // This defect survived two review rounds because it lives in FOUR places.
    // Each round fixed the instance that had been named and shipped; the
    // reviewer read the page again and flagged the next one. So the guard has
    // to be plural: enumerate every surface that publishes the accumulated
    // contract figure, and require each to carry its own span.
    //
    // «Visible text» is load-bearing. An earlier fix put the years in a `title`
    // tooltip, which no phone shows, no scanning reader sees and no `innerText`
    // carries — so the surface reviewer could not observe the fix and re-flagged
    // the page. Everything below reads `innerText`.
    //
    // Count and span are both DERIVED FROM THE SNAPSHOT, never typed here. A
    // hand-copied «698 · 2017–2026» keeps asserting yesterday's numbers after
    // the scraper moves, and pinning the span is what makes this guard bite:
    // the first draft accepted any four-digit year, which the award list's own
    // «28 jul 2026» satisfied — the test passed with the fix ablated.
    const snap = await (await page.request.get('/data/tenders.json')).json()
    const committed = (
      snap.contracts as { status?: string; assignee?: string; awardDate?: string }[]
    ).filter((c) => {
      if (['void', 'abandoned', 'revoked', 'withdrawn'].includes(c.status ?? '')) return false
      if (['awarded', 'formalized', 'finalized', 'closed'].includes(c.status ?? '')) return true
      return (!c.status || c.status === 'unknown') && Boolean(c.assignee)
    })
    const awarded = String(snap.stats.awardedContracts)
    const years = committed
      .map((c) => String(c.awardDate ?? '').slice(0, 4))
      .filter((y) => /^\d{4}$/.test(y))
      .sort()
    const span = years[0] === years[years.length - 1] ? years[0] : `${years[0]}–${years.at(-1)}`
    expect(Number(awarded)).toBeGreaterThan(0)
    expect(span).toMatch(/^\d{4}(–\d{4})?$/)

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Robert Raga/i).first()).toBeVisible({ timeout: 8000 })

    // Every assertion below uses the RETRYING `toContainText`, never a one-shot
    // `innerText()`. The KPI cell exists before its snapshot arrives, rendering
    // «Contratos adj. / — / —» — so `toBeVisible()` passes on a placeholder and
    // a snapshot read taken right after it can measure the empty state. That
    // raced under full-suite parallel load exactly once in four runs.
    // `toContainText` compares against `textContent`, which is also why the
    // uppercase text-transform is not in the way.

    // 1 · KPI strip cell — sits two cells away from the one-year budget. The
    // count and the span share its second line: «717 en 2017–2026, sumados».
    const kpi = page.locator('.d-kpi-cell', { hasText: /Contratos adjudicados/i }).first()
    await expect(kpi).toContainText(`${awarded} en ${span}, sumados`, { timeout: 8000 })

    // 2 · editorial column band — the count sits directly above a list of
    // awards all dated this July, which is what invites "recent" over
    // "accumulated". The span may live in the band or in the line under it, so
    // assert over the whole section, not the band alone.
    const section = page
      .locator('[data-section-band]')
      .filter({ hasText: /Contratos/i })
      .first()
      .locator('xpath=..')
    await expect(section).toContainText(awarded, { timeout: 8000 })
    await expect(section).toContainText(span)

    // 3 · the mayor's government strip, under a «Gobierno municipal · 2025»
    // heading beside a one-year budget.
    //
    // Scoped to the column: the section bar's «Dinero» panel also links to
    // /presupuesto, and its sentence names contratos. Closed, that link sits
    // FIRST in the DOM and hidden — and `.first()` would pick it.
    const govLink = page
      .locator('.d-editorial a[href="/presupuesto"]')
      .filter({ hasText: /contratos/i })
      .first()
    await expect(govLink).toContainText(awarded, { timeout: 8000 })
    await expect(govLink).toContainText(span)
  })

  test('la portada pinta la salvedad de cada concesión que trae la lista', async ({ page }) => {
    // Una concesión se adjudica de una vez por todo su plazo: leída entre
    // contratos anuales, la del agua —55,7 M€ por diecisiete años— parecía un
    // compromiso puntual mayor que el presupuesto del año, impreso en esta
    // misma pantalla.
    //
    // Lo esperado se DERIVA del snapshot publicado. «Las cuatro últimas
    // adjudicaciones» es una ventana que rota con cada nocturna: el 13-09-2026
    // entraron cuatro contratos de septiembre, la concesión salió de la ventana
    // y esta prueba se puso roja sin que el código cambiara. La frase en sí la
    // vigila tests/components/concesion-nota.test.jsx, que no depende del dato
    // vivo; aquí se comprueba la mitad que sólo puede verse en la página.
    const tenders = JSON.parse(readFileSync('public/data/tenders.json', 'utf8'))
    const recientes = (tenders.top?.recentAwarded ?? []).slice(0, 4)
    // El predicado de producción, no la lista de tipos: si `isConcession` gana
    // una condición, lo esperado y lo pintado no pueden separarse.
    const concesiones = recientes.filter(isConcession)

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Que la comprobación haya EVALUADO algo: el snapshot trae filas y el
    // bloque las pinta. Sin esto, «cero salvedades» lo satisfaría una portada
    // en blanco, que es justo la forma de la que este repo ya ha pagado dos.
    expect(recientes.length, 'el snapshot no trae últimas adjudicaciones').toBeGreaterThan(0)
    const primeraFila = String(recientes[0].title ?? '').slice(0, 40)
    // Un título vacío convertiría el ancla en `getByText('')`, que casa con
    // todo: el hueco volvería por la puerta de al lado.
    expect(primeraFila.length, 'la primera adjudicación no trae título').toBeGreaterThan(10)
    await expect(page.getByText(primeraFila).first()).toBeVisible({ timeout: 8000 })

    const notas = page.locator('.cp-concesion-nota')
    await expect(notas).toHaveCount(concesiones.length)

    if (concesiones.length > 0) {
      // Y que NO la lleven todas: una salvedad en todas las filas no distingue
      // nada.
      expect(concesiones.length).toBeLessThan(recientes.length)
      // El plazo sale del dato, nunca de la prosa.
      const anios = contractTermYears(concesiones[0])
      if (anios) await expect(notas.first()).toContainText(new RegExp(`${anios} años`))
      await expect(notas.first()).toContainText(/no un gasto anual/)
    }
  })

  // La cinta «DIRECTO» se quitó de la portada (auditoría «dos lecturas»,
  // 25-10-2026, §1.5). Pasaba luz, Euríbor, BCE e IPC nacionales, avisos de la
  // provincia y «N incidencias» de la DGT contadas a lo largo de la A-7 y la A-3
  // en toda España —el dato no trae lugar, así que no se puede ceñir al
  // municipio—; lo único del Ayuntamiento, los titulares y los plazos vencidos,
  // ya está en la columna. Y un punto rojo latiendo con «DIRECTO» prometía datos
  // del Ayuntamiento en vivo que no había.
  test('no hay cinta «DIRECTO» sobre el mapa', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    // Mide algo: la portada ha pintado el mapa y su pila de controles.
    await expect(page.locator('.cp-mapa-pila .cp-cobertura')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('[data-live-ticker]')).toHaveCount(0)
    await expect(page.getByText('DIRECTO', { exact: true })).toHaveCount(0)
  })

  test('has a heading outline a screen reader can navigate', async ({ page }) => {
    // Regression guard. The landing's ONLY heading used to be the LeadStory
    // press headline — so the homepage h1 was a third-party article title, and
    // retiring that block left the page with zero headings. The axe gate stayed
    // green throughout: `page-has-heading-one` and `empty-heading` are
    // best-practice rules, outside the wcag2a/wcag2aa tags a11y.spec.ts filters
    // on. Nothing else in the suite would have noticed.
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.locator('h1')).toHaveText('El Mirador')

    // Every editorial section band is a real h2, so H-key navigation lands on
    // the column's structure instead of skipping the page entirely.
    const h2 = page.locator('h2')
    await expect.poll(() => h2.count(), { timeout: 8000 }).toBeGreaterThanOrEqual(6)

    // No empty headings, and no level skipped between h1 and the first h2.
    const levels = await page.evaluate(() =>
      [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => ({
        level: +h.tagName[1],
        text: (h.textContent || '').trim(),
      })),
    )
    expect(levels.filter((l) => !l.text)).toEqual([])
    expect(Math.min(...levels.map((l) => l.level))).toBe(1)
  })

  test('«Tu ayuntamiento en 30 segundos»: cada tarjeta lleva a una página que existe', async ({
    page,
  }) => {
    // La lectura vecinal de la portada: cada respuesta enlaza a la página que la
    // demuestra, y a otra ruta, así que en-breve-anclas.spec.ts (que sigue los
    // `#…` de la misma página) no la mira. Un destino que no existe deja al vecino
    // en la portada sin saberlo.
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const bloque = page.locator('[data-en-breve-bloque]')
    await expect(bloque).toBeVisible({ timeout: 10_000 })
    // Quién manda, el dinero, el último pleno y el barrio.
    await expect
      .poll(() => bloque.locator('[data-en-breve]').count(), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(4)
    const destinos = await bloque
      .locator('.cp-en-breve-ancla')
      .evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))
    expect(destinos.length).toBeGreaterThanOrEqual(3)
    for (const href of destinos) {
      expect(href, 'una tarjeta de la portada sin destino').toMatch(/^\/[a-z]/)
      await page.goto(href, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('h1'), `${href} no pinta su <h1>`).toHaveCount(1, {
        timeout: 10_000,
      })
      const fragmento = href.split('#')[1]
      if (fragmento) {
        await expect(page.locator(`[id="${fragmento}"]`), `${href}: el ancla no está`).toHaveCount(
          1,
          { timeout: 10_000 },
        )
        // Que exista no dice que el lector llegue: se mide dónde queda.
        await expect
          .poll(() => arribaDe(page, fragmento), { message: `${href}: no aterriza en su ancla` })
          .toBeLessThan(ATERRIZA_PX)
      }
    }
  })

  test.describe('a 375 px', () => {
    test.use({ viewport: { width: 375, height: 812 } })

    test('«Ver sus contratos» deja la lista del barrio a la vista, no el rótulo de la sección', async ({
      page,
    }) => {
      // Lo vio el operador el 26-10-2026: a 375 px el ancla de la sección
      // (#mapa-gasto) dejaba a la vista su rótulo y su párrafo, con el mapa debajo y
      // la lista del barrio fuera de la pantalla. En escritorio no se ve: la lista
      // va al lado del mapa.
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      const tarjeta = page.locator('[data-en-breve="barrio"]')
      const selector = tarjeta.getByLabel('Elige tu barrio')
      await expect(selector).toBeVisible({ timeout: 10_000 })
      const slug = await selector
        .locator('option')
        .evaluateAll((os) =>
          os.map((o) => (o as HTMLOptionElement).value).find((v) => v && !v.startsWith('__')),
        )
      await selector.selectOption(slug!)
      await tarjeta.getByRole('button', { name: 'Ver sus contratos' }).click()
      await expect(page).toHaveURL(new RegExp(`/presupuesto\\?barrio=${slug}#mapa-gasto-barrio$`))
      await expect
        .poll(() => arribaDe(page, 'mapa-gasto-barrio'), { timeout: 10_000 })
        .toBeLessThan(ATERRIZA_PX)
      await expect(
        page.locator('#mapa-gasto-barrio').getByText('← todas las zonas'),
      ).toBeInViewport()
    })

    test('«Saltar el resumen» baja al bloque de después, no sube al mapa', async ({ page }) => {
      // Apuntaba a #contenido, el <main> que contiene el propio resumen: a 375 px,
      // con el mapa encima, el enlace subía al principio de la página.
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      const saltar = page.locator('[data-en-breve-bloque] .cp-en-breve-saltar')
      await expect(saltar).toBeVisible({ timeout: 10_000 })
      await saltar.scrollIntoViewIfNeeded()
      const antes = await page.evaluate(() => window.scrollY)
      await saltar.click()
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(antes)
      await expect.poll(() => arribaDe(page, 'portada-tras-resumen')).toBeLessThan(ATERRIZA_PX)
    })
  })

  test('interactive map layers: money default, coverage disclosure, neighborhood popup', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 8000 })

    // Located spend is the default layer, not the Servicios directory. A
    // municipal-accountability map opening on a static OSM list of schools put
    // the least mission-relevant layer in the most valuable position.
    await expect(page.getByRole('group', { name: /Capas del mapa/i })).toBeVisible()
    // Se fija el DESLIZADOR, no el botón de reproducir: la etiqueta del botón
    // es neutra a propósito —la comparten esta capa y la de incendios— así que
    // no distingue una de otra. La del deslizador sí es sólo de ésta.
    await expect(
      page.getByRole('slider', { name: /línea de tiempo de los contratos situados/i }),
    ).toBeVisible()
    await expect(page.locator('path.cp-money-pin').first()).toBeVisible({ timeout: 8000 })

    // The layer must state what share of contracting it can actually show —
    // AND over what period. It paints ~3% of the money — every pin honest, the
    // label implying completeness — so the coverage line is not decoration, it
    // is the difference between a map and a claim. The denominator is nine
    // exercises of awards sitting a few hundred pixels above a one-year
    // «Presupuesto 2025», so the span is part of the disclosure, not a
    // decoration on it: the regex requires it rather than tolerating it.
    //
    // Since 2026-10-26 the visible line is the resident's sentence, with the
    // period inside it; the exact euro ratio is its title. The sentence never
    // folds, at any map height.
    const coverage = page
      .getByText(
        /El mapa sólo sitúa (\d+|menos de 1) de cada 100 € de contratos \(\d{4}(–\d{4})?\)/,
      )
      .first()
    await expect(coverage).toBeVisible({ timeout: 8000 })
    // Assert the check evaluated something: a regex that matched an empty or
    // absent node would pass `toBeVisible` on nothing at all.
    expect((await coverage.innerText()).trim().length).toBeGreaterThan(10)
    await expect(page.getByText(/servicios de ámbito municipal/i).first()).toBeVisible()

    // Named for what it is. "Gasto municipal" promised all of it.
    const control = page.getByRole('group', { name: /Capas del mapa/i })
    await expect(control.getByRole('button', { name: /^Contratos situados$/i })).toBeVisible()
    await expect(control.getByRole('button', { name: /^Gasto municipal$/i })).toHaveCount(0)

    // Obras lost its chip: its source is frozen and 6 of its 11 geolocated
    // fichas shared a point with a located contract. It rides with the money
    // layer now.
    await expect(control.getByRole('button', { name: /Obras/i })).toHaveCount(0)

    // A chip that reads OFF means nothing of that layer is on the map. The
    // Servicios layer used to paint dimmed underneath the money layer as
    // "context", so the landing opened with its dots down and its legend card
    // up while its own chip read OFF. Both halves are asserted: the chip is
    // off-state AND neither the markers nor the legend exist.
    const servicios = control.getByRole('button', { name: /^Servicios$/i })
    await expect(servicios).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('.cp-poi-marker')).toHaveCount(0)
    await expect(page.locator('.cp-poi-legend')).toHaveCount(0)

    // ...and turning it on paints them, so the counts above are a real absence
    // and not two selectors that never matched anything.
    await servicios.click()
    await expect(page.locator('.cp-poi-marker').first()).toBeVisible({ timeout: 6000 })
    expect(await page.locator('.cp-poi-marker').count()).toBeGreaterThan(5)
    await expect(page.locator('.cp-poi-legend')).toBeVisible()

    // The category rides on colour AND silhouette, and the legend has to deliver
    // both: six slate steps were one colour, and a legend row that promises a
    // distinction the map cannot draw is the defect this replaced. Asserted as
    // rendered, not as configured — «has a swatch» is what the old ramp passed.
    const swatches = await page
      .locator('.cp-poi-legend svg path')
      .evaluateAll((ps) =>
        ps.map((p) => ({ d: p.getAttribute('d'), fill: p.getAttribute('fill') })),
      )
    expect(swatches.length).toBeGreaterThan(3)
    expect(new Set(swatches.map((s) => s.d)).size).toBe(swatches.length)
    expect(new Set(swatches.map((s) => s.fill)).size).toBe(swatches.length)
    // and the marker on the map wears the same fill as the row that explains it
    const fillsEnMapa = new Set(
      await page
        .locator('.cp-poi-marker svg path')
        .evaluateAll((ps) => ps.map((p) => p.getAttribute('fill'))),
    )
    for (const { fill } of swatches) expect([...fillsEnMapa]).toContain(fill)

    await servicios.click()
    await expect(page.locator('.cp-poi-marker')).toHaveCount(0)

    // Clicking a money pin opens the contract card with the winner + € detail,
    // and a barrio dot opens the aggregated civic card.
    //
    // Both go through `toPass`, which retries the CLICK, not just the
    // assertion. A single click can land before Leaflet has bound the popup
    // handler for a freshly-mounted layer — this test failed exactly once in a
    // full parallel run and passed alone every time, which is the signature of
    // a race rather than a broken expectation. Retrying the interaction is the
    // honest fix; a longer timeout on the assertion would only have widened the
    // window on a click that never registered.
    //
    // Y se pulsa el primer pin, o punto de barrio, que no tapa nada. Los pines
    // salen en el orden de tender-geo.json, que la nocturna reordena: el
    // 06-10-2026 el primero quedó debajo del punto de un barrio (Urbanització La
    // Llobatera), el clic caía en el punto y abría la ficha del barrio, y esta
    // prueba se puso roja sin que cambiara la página; el 10-10-2026 le pasó lo
    // mismo al primer punto de barrio. Un punto de barrio es HTML (un divIcon),
    // así que vale que el centro caiga en él o en algo suyo.
    //
    // Cerrar la ficha abierta y elegir el elemento van DENTRO del reintento.
    // Escape no siempre la cierra (el mapa no tiene el foco), y su auto-pan
    // sigue moviendo el mapa: el 11-10-2026 se eligió el punto en mitad del
    // desplazamiento, al hacer clic el pin de La Llobatera ya estaba encima, el
    // clic reabría la ficha del contrato y los tres reintentos fallaban igual
    // (1 de 12 en local). Medido una sola vez fuera del reintento, el mismo
    // índice viejo se repetía en cada intento. El aspa se pulsa con un evento y
    // no con un clic en sus coordenadas: una ficha alta llega hasta arriba del
    // mapa y dejaba el aspa debajo de la cinta «DIRECTO» (quitada el 27-10-2026),
    // que se llevaba el clic.
    const pulsaElPrimeroLibre = (selector: string, enLaFicha: RegExp) =>
      expect(async () => {
        const aspa = page.locator('.leaflet-popup-close-button')
        if (await aspa.count()) await aspa.first().dispatchEvent('click')
        await expect(page.locator('.leaflet-popup')).toHaveCount(0, { timeout: 1000 })
        const libre = await page.locator(selector).evaluateAll((els) =>
          els.findIndex((el) => {
            const r = el.getBoundingClientRect()
            const encima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
            return encima !== null && el.contains(encima)
          }),
        )
        expect(libre, `ningún ${selector} queda a la vista sin tapar`).toBeGreaterThanOrEqual(0)
        await page.locator(selector).nth(libre).click({ force: true })
        await expect(
          page.locator('.leaflet-popup-content').getByText(enLaFicha).first(),
        ).toBeVisible({ timeout: 2500 })
      }).toPass({ timeout: 15000 })
    await pulsaElPrimeroLibre('path.cp-money-pin', /Adjudicatario/i)
    // Y el mapa, recién encuadrado, antes de buscar el punto. Esta prueba no espera a
    // que el encuadre se asiente, y en CI, más lenta, el primer pin libre era uno de
    // arriba del racimo: el auto-pan de su ficha bajaba el mapa entero unos 235 px y
    // los puntos que no ceden su toque (`lib/barrios-bajo-pines`) acababan bajo la
    // caja transparente de la pila de controles, que se lleva los clics. Las tres
    // pasadas de CI, sin ninguno libre; forzando ese pin en local, 3 de 3 igual, y 3
    // de 3 bien con el mapa recargado. Recargar no rebaja la prueba: el punto se
    // sigue eligiendo por lo que recibe un toque en su centro.
    await cargaYEncuadra(page)
    await pulsaElPrimeroLibre('.cp-osm-neigh-dot', /Población/i)

    // The retired "Tren L9" schematic-train chip is gone; toggling its
    // replacement "Quejas" mounts the citizen-complaint heat layer and shows
    // its per-barrio legend. Scoped to the layer control so unrelated "Quejas"
    // text elsewhere on the landing can't satisfy the assertion.
    const layerControl = page.getByRole('group', { name: /Capas del mapa/i })
    await expect(layerControl.getByRole('button', { name: /Tren L9/i })).toHaveCount(0)
    await layerControl.getByRole('button', { name: /^Quejas$/i }).click()
    await expect(page.getByText(/Quejas por barrio/i).first()).toBeVisible({ timeout: 6000 })
  })

  test('las estaciones de Riba-roja se pueden pulsar: nada del mapa se les pone encima', async ({
    page,
  }) => {
    // Los pines del dinero situado, los puntos de barrio y las vías de la red completa
    // se pintaban encima de los discos de las estaciones: se veían y un clic no les
    // llegaba. La medida vive en tests/e2e/_estaciones.ts.
    await cargaYEncuadra(page)
    afirmaPulsables(await sondea(page))
  })

  test('un pin del dinero se pulsa por su centro aunque caiga sobre un barrio, y el barrio sigue teniendo puerta', async ({
    page,
  }) => {
    // La historia y la sonda, en `_pines-y-barrios.ts`; a 375 px, en
    // `barrios-mobile.spec.ts`.
    //
    // Aquí, además, se mide dos veces, porque cada capa se monta y se desmonta con su
    // botón, y en el panel compartido de vectores mandaba el orden de llegada: con las
    // quejas encendidas después del dinero, sus círculos quedaban encima de los pines.
    // Se apaga y se enciende el dinero con las quejas ya pintadas, y tiene que seguir
    // igual. No con incendios ni servicios: con sus leyendas, la caja transparente de
    // la pila de controles cubre a 1280 px el centro del pueblo y no queda ningún pin
    // que medir.
    //
    // Recorrer la segunda puerta recarga la portada una vez por barrio: el plazo de
    // 30 s por prueba no alcanza.
    test.setTimeout(120_000)
    await cargaYEncuadra(page)
    const alCargar = await mide(page)
    afirma(alCargar, 'al cargar')
    expect(
      alCargar.barriosPorElPin.length,
      'ningún punto cede: la prueba no recorre la segunda puerta',
    ).toBeGreaterThan(0)
    for (const barrio of alCargar.barriosPorElPin) await entraPorElPin(page, barrio, 'clic')
    await cargaYEncuadra(page)

    const capas = page.getByRole('group', { name: /Capas del mapa/i })
    const dinero = capas.getByRole('button', { name: /Contratos situados/i })
    await dinero.click()
    await expect(page.locator('path.cp-money-pin')).toHaveCount(0)
    // Sin pines, ningún punto tiene a quién ceder.
    await expect(page.locator('.cp-osm-neigh--cede')).toHaveCount(0)
    await capas.getByRole('button', { name: /^Quejas$/i }).click()
    await expect(page.getByText(/Quejas por barrio/i).first()).toBeVisible({ timeout: 6000 })
    await dinero.click()
    await expect.poll(() => page.locator('path.cp-money-pin').count()).toBeGreaterThan(0)
    // Encender el dinero vuelve a encuadrar: se espera a que el mapa se quede quieto.
    await expect
      .poll(
        async () => {
          const pos = () =>
            page.evaluate(() =>
              [...document.querySelectorAll('path.cp-money-pin')]
                .map((p) => `${Math.round(p.getBoundingClientRect().x)}`)
                .join('|'),
            )
          const antes = await pos()
          await page.waitForTimeout(300)
          return antes === (await pos())
        },
        { timeout: 15_000 },
      )
      .toBe(true)

    afirma(await mide(page), 'tras apagar y encender el dinero, con las quejas pintadas')
  })
})

test.describe('capa de incendios forestales', () => {
  test('apagada no pinta ni leyenda ni polígonos; encendida, las dos cosas', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.leaflet-container')).toBeVisible({ timeout: 8000 })

    // Las DOS mitades. Un interruptor que dice OFF mientras su capa pinta es
    // el defecto que este par de asserts existe para cazar.
    const control = page.getByRole('group', { name: /Capas del mapa/i })
    const chip = control.getByRole('button', { name: /Incendios forestales/i })
    await expect(chip).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('path.cp-incendio')).toHaveCount(0)
    await expect(page.locator('.cp-incendios-legend')).toHaveCount(0)

    await chip.click()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    const poligonos = page.locator('path.cp-incendio')
    await expect(poligonos.first()).toBeVisible({ timeout: 8000 })
    // Que la comprobación haya EVALUADO algo: «cero polígonos» también pasaría
    // un toBeVisible sobre nada.
    expect(await poligonos.count()).toBeGreaterThan(20)

    // La cobertura no es decoración: dice qué NO enseña la capa.
    const leyenda = page.locator('.cp-incendios-legend')
    await expect(leyenda).toBeVisible()
    const texto = await leyenda.innerText()
    expect(texto).toMatch(/No están cartografiados todos los incendios/i)
    // El año final se DERIVA del snapshot; si alguien lo escribe a mano en la
    // prosa, esta línea deja de cuadrar con el dato.
    expect(texto).toMatch(/\d{4}–\d{4}/)
    expect(texto).toMatch(/con causa determinada/i)

    // El deslizador recorta la serie: 1993 tiene que pintar menos que el total.
    const deslizador = page.locator('.cp-incendios-slider input[type="range"]')
    await expect(deslizador).toBeVisible()
    const todos = await poligonos.count()
    await deslizador.fill('1993')
    await expect(async () => {
      expect(await poligonos.count()).toBeLessThan(todos)
    }).toPass({ timeout: 5000 })
  })
})

import { test, expect } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

/**
 * Espera a que el listado tenga FILAS, no a que tenga texto.
 *
 * Primero se esperaba `/resultados/`, y el estado vacío dice «0 resultados» —
 * así que la espera la satisfacía justo la pantalla que la prueba existe para
 * descartar, y las dos salían «flaky». Es el defecto de la propia suite: una
 * condición de paso que la avería cumple.
 */
async function esperaPastillas(page: import('@playwright/test').Page, minimo = 10) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            [...document.querySelectorAll('[role="tabpanel"] span')].filter(
              (s) => getComputedStyle(s).display === 'inline-flex',
            ).length,
        ),
      { timeout: 10000, message: 'el listado nunca pintó pastillas de estado' },
    )
    .toBeGreaterThanOrEqual(minimo)
}

test.describe('Presupuesto (/presupuesto)', () => {
  test('renders money map dashboard + spend charts + subsidies', async ({ page }) => {
    const errors = collectErrors(page)

    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })

    // New money-map dashboard (src/components/Presupuesto/GastoDashboard.jsx)
    await expect(page.getByText('¿A dónde va el dinero en contratos?').first()).toBeVisible({
      timeout: 8000,
    })
    await expect(page.getByRole('tab', { name: /Explorar contratos/ })).toBeVisible()

    // Existing budget context + subsidies still present
    await expect(page.getByText('En qué se gasta el dinero público').first()).toBeVisible()
    await expect(page.getByText('De dónde vienen los ingresos municipales').first()).toBeVisible()
    await expect(page.getByText('Subvenciones · Base Nacional').first()).toBeVisible()
    await expect(page.getByText(/€/).first()).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })

  test('the money-map heading matches what the figure under it counts', async ({ page }) => {
    // «¿A dónde va el dinero en obras?» sat directly above «De 68 M€
    // adjudicados en contratos», of which obras are roughly a quarter — the
    // heading promised public works and the figure delivered all municipal
    // contracting, majority town-wide services. The section's own small print
    // already said so four lines below, so the page contradicted itself.
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })

    // Anchored on a phrase that is a direct text node of the intro div, not on
    // the bolded clause — `getByText` resolves to the innermost match, and the
    // <strong> alone carries no percentage.
    const intro = page.getByText(/el desglose completo está en/i).first()
    // Wait for the SHARE, not merely for the sentence. The section mounts as
    // soon as tender-geo.json lands, while the percentage needs tenders.json
    // too — until then the copy degrades to «el grueso», which is honest on
    // screen but would let this test read a state with no claim in it and pass.
    await expect(intro).toContainText(/las obras son el \d+ %/, { timeout: 8000 })
    await expect(intro).toContainText(/todo el gasto en contratos, no solo obras/i)

    // The heading's obras share and the chart that proves it come from one
    // computation, so they cannot disagree one scroll apart. Compare them.
    const introText = await intro.innerText()
    const claimed = introText.match(/las obras son el (\d+) %/)
    expect(claimed, `no obras share in: ${introText}`).not.toBeNull()

    await page.getByRole('tab', { name: /Tipos de gasto/ }).click()
    const panelLoc = page.locator('[role="tabpanel"]')
    await expect(panelLoc).toContainText('Obras', { timeout: 8000 })
    const panel = await panelLoc.innerText()
    // Assert the check evaluated something: an empty panel would let any claim
    // through unchallenged.
    expect(panel).toMatch(/Obras/)
    const rows = panel.split('\n')
    const obrasPct = rows[rows.findIndex((r) => r.trim() === 'Obras') + 2]?.trim()
    expect(obrasPct).toBe(`${claimed![1]}%`)

    // And the claim has to be a minority share, or «no solo obras» would be the
    // wrong correction — this is the sentence's whole point.
    expect(Number(claimed![1])).toBeLessThan(50)
  })

  test('el listado no pinta estados en inglés, y dice cuántos son de verdad', async ({ page }) => {
    // Dos defectos que ninguna suite veía, porque todas afirman sobre datos y
    // texto y éstos eran de RÓTULO:
    //
    //  1. `STATUS_LABEL` rehacía a mano el enum de `src/scraper/tenders.ts` y se
    //     desfasó: 413 de 1.234 filas publicadas caían al `|| c.status` de Pill
    //     y pintaban `formalized` / `void` / `abandoned` en crudo y en el gris
    //     del centinela. `formalized` significa FIRMADO.
    //  2. El contador se medía DESPUÉS del corte a 60, así que decía siempre
    //     «60 resultados» — con 806 coincidencias sin filtrar.
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    const panel = page.locator('[role="tabpanel"]')
    await esperaPastillas(page)

    const visto = await page.evaluate(() => {
      const p = document.querySelector('[role="tabpanel"]')
      const pills = [...(p?.querySelectorAll('span') ?? [])].filter(
        (s) => getComputedStyle(s).display === 'inline-flex',
      )
      return {
        etiquetas: pills.map((s) => (s.textContent || '').trim()),
        texto: (p?.textContent || '').slice(0, 400),
      }
    })

    // Que la prueba evaluó algo: un panel vacío la dejaría pasar sola, que es
    // exactamente el fallo que persigue.
    expect(visto.etiquetas.length).toBeGreaterThanOrEqual(10)
    expect(new Set(visto.etiquetas).size).toBeGreaterThanOrEqual(2)

    const CRUDO =
      /^(awarded|formalized|void|abandoned|provisionally_awarded|revoked|in_progress|open|finalized|draft|pending|closed|evaluation|withdrawn|unknown)$/
    const crudas = [...new Set(visto.etiquetas.filter((t) => CRUDO.test(t)))]
    expect(crudas, `estados en inglés en el listado: ${crudas.join(', ')}`).toEqual([])
    // Y que el estado más común de todos SE PINTA, no sólo que no haya crudos.
    expect(visto.etiquetas).toContain('Formalizado')

    // El recuento habla del conjunto entero, no de lo que cupo en pantalla.
    const total = Number(visto.texto.match(/(\d+)\s+resultados/)?.[1])
    expect(Number.isFinite(total)).toBe(true)
    const pintadas = visto.etiquetas.length
    expect(total).toBeGreaterThanOrEqual(pintadas)
    expect(total, 'el contador vuelve a medirse después del corte').toBeGreaterThan(60)
    await expect(panel).toContainText(/se muestran los \d+ primeros/)
    await expect(panel).toContainText(/son dinero comprometido \(adjudicado o formalizado\)/)
  })

  test('a 375 px y en densidad espaciada, nada se sale de la fila', async ({ page }) => {
    // La condición de paso mira DESBORDAMIENTO, no presencia: una maqueta
    // recortada satisface un `toBeVisible` igual de bien que una correcta, que
    // es cómo la suite móvil de este repo estuvo verde midiendo nada.
    //
    // Y mide el caso PEOR a propósito, porque el bueno no prueba nada. La
    // columna de estado tenía 90 px fijos, y un ancho fijo lo fija la fuente:
    //
    //   · en el runner de CI —Linux, con DM Mono llegando de Google Fonts—
    //     la monoespaciada de reserva es más ancha y «Formalizado» se salía
    //     encima del importe en 29 filas de 60. En local no pasaba, porque la
    //     de reserva de macOS es más estrecha; bloquear la webfont TAMPOCO lo
    //     reproducía aquí, por lo mismo.
    //   · pero no hace falta ir a buscar una fuente: `densidad: espaciada` del
    //     panel de ajustes sube la raíz de 14 a 15 px, y con eso se sale en
    //     CUALQUIER sistema. Es un ajuste que un lector puede elegir, no una
    //     hipótesis.
    //
    // Así que se fuerza esa densidad, y la columna se dimensiona a su
    // contenido en vez de a un número.
    await page.addInitScript(() =>
      localStorage.setItem('cp:tweaks', JSON.stringify({ dark: false, density: 'spacious' })),
    )
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    await esperaPastillas(page)

    const m = await page.evaluate(() => {
      const p = document.querySelector('[role="tabpanel"]')
      const pills = [...(p?.querySelectorAll('span') ?? [])].filter(
        (s) => getComputedStyle(s).display === 'inline-flex',
      )
      const doc = document.documentElement
      return {
        n: pills.length,
        // Que la prueba mide el caso que cree medir. Si el ajuste no llegara a
        // aplicarse, mediría el caso fácil y pasaría por la razón equivocada.
        raiz: getComputedStyle(doc).fontSize,
        fuera: pills.filter((s) => {
          const fila = s.parentElement?.parentElement
          if (!fila) return false
          return s.getBoundingClientRect().right > fila.getBoundingClientRect().right + 1
        }).length,
        anchoMax: Math.max(...pills.map((s) => s.getBoundingClientRect().width)),
        scrollH: doc.scrollWidth - doc.clientWidth,
      }
    })
    expect(m.n, 'no se midió ninguna pastilla').toBeGreaterThanOrEqual(10)
    expect(m.raiz, 'la densidad espaciada no llegó a aplicarse').toBe('15px')
    // El caso peor tiene que SERLO: con la raíz a 15 px la pastilla más ancha
    // pasa de los 90 px que tenía la columna fija, o esto no prueba nada.
    expect(m.anchoMax, 'la pastilla más ancha no supera los 90 px de antes').toBeGreaterThan(90)
    expect(m.fuera, 'pastillas de estado fuera de su fila a 375 px').toBe(0)
    expect(m.scrollH, 'la página desborda a lo ancho a 375 px').toBeLessThanOrEqual(1)
  })

  test('clicking a tab switches the panel', async ({ page }) => {
    await page.goto('/presupuesto', { waitUntil: 'domcontentloaded' })
    await page.getByRole('tab', { name: /Quién recibe el dinero/ }).click()
    // Leaderboard rows render contractor names; the explorer search box is gone.
    await expect(page.getByPlaceholder('Buscar contrato o empresa…')).toHaveCount(0)
  })
})

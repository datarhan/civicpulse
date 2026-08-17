import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { chipDeclaracion, GLOSA_TIER } from '../../src/scraper/indicador-lectura'
import { seriesDibujables, aniosSinEntrega } from '../../src/components/eficiencia/multiples'
import type { Indicador } from '../../src/scraper/indicadores'
import type { IndicadorMunicipal } from '../../src/scraper/indicadores-friccion'
import { collectErrors, appErrors } from './_console'

type MunicipalLike = Pick<IndicadorMunicipal, 'id' | 'panel' | 'valor' | 'etiqueta' | 'periodo'>

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

// Las fichas que vive ESTA página, derivadas del mismo `panel` que usa la
// página. Antes se daban por hechas todas las del fichero, y eso dejó de ser
// cierto al separar /gestion: la comprobación cruzada —cada spec exige que las
// de la otra NO estén— es lo que impide que las dos listas se desincronicen.
const IDS_AQUI: string[] = [
  ...SNAP.indicadores.map((i: Indicador) => i.id),
  ...(SNAP.municipales ?? [])
    .filter((m: MunicipalLike) => m.panel === 'coste-efectivo')
    .map((m: MunicipalLike) => m.id),
]
const FICHAS = JSON.parse(readFileSync('public/data/eficiencia-findings.json', 'utf8'))
const MIAS = FICHAS.items.filter((f: { indicadorId: string }) => IDS_AQUI.includes(f.indicadorId))
const AJENAS = FICHAS.items.filter(
  (f: { indicadorId: string }) => !IDS_AQUI.includes(f.indicadorId),
)

// The route is behind EFICIENCIA_ENABLED, and the e2e server serves a
// production build — so this needs `VITE_ENABLE_EFICIENCIA=true npm run build`.
//
// Rather than join /cargos' Biografía spec in failing every local full run
// («that is the flag, not a defect»), this skips itself when the route is not
// mounted: a build without the flag stays green, a build with it gets real
// coverage. The skip names the missing variable so nobody debugs a phantom.
test.describe('Eficiencia (/eficiencia)', () => {
  test.beforeEach(async ({ page }) => {
    const errores = collectErrors(page)
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
    // «No montada» tiene DOS causas y sólo una es saltable. Con la bandera
    // apagada la ruta no existe y saltar es correcto; con la página REVENTADA
    // el h1 tampoco llega, y el salto convertía un crash en nueve specs verdes:
    // pasó de verdad — un formatea(undefined) tumbó la página entera y esta
    // suite imprimió «passed» sin haber medido nada. Un error de consola con la
    // ruta caída es fallo, nunca salto.
    if (!montada && appErrors(errores).length > 0) {
      throw new Error(
        `/eficiencia no montó Y la consola trae errores — la página está rota, no apagada:\n` +
          appErrors(errores).join('\n'),
      )
    }
    test.skip(!montada, '/eficiencia no está montada — reconstruye con VITE_ENABLE_EFICIENCIA=true')
  })

  test('renders unit costs with their peer position', async ({ page }) => {
    const errors = collectErrors(page)

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

    expect(appErrors(errors)).toEqual([])
  })

  test('avisa de los cocientes cuyo denominador nadie vuelve a medir', async ({ page }) => {
    // La avería que esto vigila no es un número mal: es una tarjeta que deja de
    // avisar. El cociente publicado seguiría resolviendo perfectamente a su
    // celda, así que ninguna otra comprobación de datos lo notaría.
    //
    // La marca se pide a `chipDeclaracion` en vez de rescribir aquí su regla:
    // un test que restata la forma que vigila es el fallo nº1 de
    // docs/DATA_INTEGRITY.md, y ya costó 298 contratos una vez.
    const congelados = SNAP.indicadores.filter(
      (i: Indicador) => i.valor !== null && chipDeclaracion(i),
    )
    if (congelados.length === 0) {
      // Que el ayuntamiento vuelva a medir es el desenlace bueno, y entonces la
      // franja NO debe aparecer. Se comprueba también esa dirección.
      await expect(
        page.getByText(/denominador que el ayuntamiento no vuelve a medir/i),
      ).toHaveCount(0)
      return
    }
    // La franja de arriba lo cuenta entero, una vez.
    await expect(page.getByText(/denominador que el ayuntamiento no vuelve a medir/i)).toBeVisible({
      timeout: 8000,
    })
    // Y cada tarjeta afectada lo lleva marcado con su año, visible sin abrir
    // nada: es lo que condiciona cómo se lee el resto de la tarjeta, así que no
    // puede quedarse dentro del desplegable con las demás salvedades.
    for (const i of congelados) {
      await expect(
        page.getByText(chipDeclaracion(i)!.texto, { exact: true }).first(),
        `${i.servicio} publica su cociente sin marcar el denominador parado`,
      ).toBeVisible()
    }
  })

  test('sitúa los servicios juntos antes de pedir que se lean uno a uno', async ({ page }) => {
    // La página tenía todos los percentiles calculados y no los enseñaba
    // juntos en ningún sitio: había que recorrer trece pantallas para saber
    // cuáles son los dos caros. El resumen no añade ninguna afirmación —cada
    // punto es el percentil que su propia ficha ya publica— así que lo que hay
    // que vigilar es que no se desincronice de las fichas.
    const situados = SNAP.indicadores.filter((i: Indicador) => i.valor !== null && i.pares)
    expect(situados.length, 'ningún servicio situado en el snapshot').toBeGreaterThan(0)

    await expect(page.getByText(/Dónde queda cada servicio/i)).toBeVisible({ timeout: 8000 })

    // Un enlace por servicio situado en la franja, más uno por mini-serie de
    // la rejilla contigua — ni uno más. El recuento de la rejilla no se
    // restata: lo decide el mismo módulo que usa el componente.
    const enlaces = page.locator('a[href^="#s-"]')
    await expect(enlaces).toHaveCount(situados.length + seriesDibujables(SNAP.indicadores).length)

    // Y cada enlace tiene destino: un ancla rota no da error, sencillamente no
    // hace nada, y nadie se entera.
    for (const i of situados) {
      await expect(
        page.locator(`#s-${i.id}`),
        `el resumen enlaza a #s-${i.id} y esa ficha no existe`,
      ).toHaveCount(1)
    }

    // El total es el de los servicios CON cociente, no el del panel entero: es
    // la diferencia entre una suma correcta y una que se cuela tres servicios
    // sin coste utilizable.
    const conRatio = SNAP.indicadores.filter((i: Indicador) => i.valor !== null)
    const total = conRatio.reduce((s: number, i: Indicador) => s + (i.numerador.valor ?? 0), 0)
    await expect(
      page.getByText(
        total.toLocaleString('es-ES', {
          style: 'currency',
          currency: 'EUR',
          maximumFractionDigits: 0,
        }),
        { exact: false },
      ),
    ).toBeVisible()
  })

  test('la rejilla de mini-series va en el orden de la franja y cada una abre su ficha', async ({
    page,
  }) => {
    // El punto (posición hoy) y la mini-serie (la década) responden preguntas
    // distintas y van contiguos EN EL MISMO ORDEN: quien localiza un servicio
    // en la franja lo encuentra en el mismo sitio de la rejilla. El orden
    // esperado no se restata aquí — lo exporta `multiples.js`, el módulo que
    // consume el propio componente.
    const dibujables = seriesDibujables(SNAP.indicadores)
    expect(dibujables.length, 'sin series dibujables en el snapshot').toBeGreaterThanOrEqual(2)

    await expect(page.getByText(/La década, servicio a servicio/i)).toBeVisible({ timeout: 8000 })

    const minis = page.getByRole('link', { name: /abre su ficha/i })
    await expect(minis).toHaveCount(dibujables.length)
    const hrefs = await minis.evaluateAll((els) => els.map((e) => e.getAttribute('href')))
    expect(hrefs).toEqual(dibujables.map((s) => `#s-${s.indicador.id}`))

    // Cada ancla tiene destino: una rota no da error, sencillamente no hace nada.
    for (const s of dibujables) {
      await expect(
        page.locator(`#s-${s.indicador.id}`),
        `la rejilla enlaza a #s-${s.indicador.id} y esa ficha no existe`,
      ).toHaveCount(1)
    }

    // El pie declara la retícula (escala propia) y nombra los años sin entrega
    // — derivados del dato, no escritos, para que no puedan quedarse rancios.
    await expect(page.getByText(/escala vertical propia/i)).toBeVisible()
    const sinEntrega = aniosSinEntrega(dibujables.map((s) => s.declarados))
    if (sinEntrega.length > 0) {
      await expect(page.getByText(`sin entrega de ${sinEntrega.join(', ')}`)).toBeVisible()
    }
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

  test('sólo trae los indicadores que salen del mismo cuaderno', async ({ page }) => {
    // El corte con /gestion es por FUENTE, y lo declara cada indicador al
    // construirse. Esto comprueba que la página respeta ese reparto en las dos
    // direcciones: enseñar aquí el plazo de pago devolvería la mezcla que la
    // separación vino a deshacer, y esconder el recuento de denominadores
    // dejaría los diez cocientes sin la cifra que habla de ellos.
    const aqui = (SNAP.municipales ?? []).filter(
      (m: MunicipalLike) => m.valor !== null && m.panel === 'coste-efectivo',
    )
    const alli = (SNAP.municipales ?? []).filter(
      (m: MunicipalLike) => m.valor !== null && m.panel === 'gestion',
    )
    expect(aqui.length, 'ningún indicador de coste efectivo').toBeGreaterThan(0)
    expect(alli.length, 'ningún indicador de gestión — no habría nada que separar').toBeGreaterThan(
      0,
    )

    for (const m of aqui) {
      await expect(page.getByRole('heading', { name: m.etiqueta })).toBeVisible({ timeout: 8000 })
      // Un porcentaje sin periodo se lee como «este año».
      await expect(page.getByText(m.periodo, { exact: true }).first()).toBeVisible()
    }
    for (const m of alli) {
      await expect(
        page.getByRole('heading', { name: m.etiqueta }),
        `${m.id} es de /gestion y se está publicando en /eficiencia`,
      ).toHaveCount(0)
    }

    // No peer band may appear here: there is no national dataset of municipal
    // single-bidder rates, so a percentile would be unsupported.
    const comparables = SNAP.indicadores.filter((i: { pares: unknown }) => i.pares).length
    await expect(page.getByText(/Ver los municipios comparados/i)).toHaveCount(comparables)
  })

  test('la cabecera indexa los hallazgos sin adelantar lo que dicen', async ({ page }) => {
    if (MIAS.length === 0) {
      // Sin fichas propias no hay índice: un enlace a una sección vacía es peor
      // que ningún enlace.
      await expect(page.locator('a[href="#hallazgos"]')).toHaveCount(0)
      return
    }
    const enlace = page.locator('a[href="#hallazgos"]').first()
    await expect(enlace).toBeVisible({ timeout: 8000 })
    // Cuenta las de ESTA página, no las del fichero: /gestion tiene las suyas.
    await expect(enlace).toContainText(String(MIAS.length))

    // Índice, no conclusión: las fichas siguen al final porque son una lectura
    // del panel y el panel se lee primero. El índice dice cuántas hay y dónde,
    // nunca qué concluyen.
    const texto = (await enlace.textContent()) ?? ''
    for (const f of FICHAS.items) {
      expect(texto, 'el índice de cabecera está adelantando el titular de una ficha').not.toContain(
        f.titulo.slice(0, 25),
      )
    }
  })

  test('explica qué son los escalones antes de usarlos como chapa', async ({ page }) => {
    const enUso = [
      ...new Set(
        SNAP.indicadores.filter((i: Indicador) => i.valor !== null).map((i: Indicador) => i.tier),
      ),
    ] as (keyof typeof GLOSA_TIER)[]
    // `outcome` no sale de las tarjetas de coste sino del bloque de resultados:
    // presente exactamente cuando el snapshot publica alguno. Pinarlo ausente
    // era correcto mientras CESEL era la única fuente; ahora la presencia se
    // DERIVA, igual que el resto.
    if ((SNAP.resultados?.items?.length ?? 0) > 0) enUso.push('outcome')
    expect(enUso.length).toBeGreaterThan(0)
    for (const tier of enUso) {
      await expect(
        page.getByText(GLOSA_TIER[tier], { exact: false }).first(),
        `el escalón ${tier} se usa como chapa y no se explica en ningún sitio`,
      ).toBeVisible({ timeout: 8000 })
    }
    // Y no se anuncia un escalón que nada usa: listarlo sugeriría que existe.
    const ausentes = (Object.keys(GLOSA_TIER) as (keyof typeof GLOSA_TIER)[]).filter(
      (t) => !enUso.includes(t),
    )
    for (const tier of ausentes) {
      await expect(page.getByText(GLOSA_TIER[tier], { exact: false })).toHaveCount(0)
    }
  })

  test('el resultado se publica AL LADO del coste, con su frase no-causal', async ({ page }) => {
    // Las tres reglas del escalón, medidas sobre la página: el bloque existe
    // dentro de la tarjeta a la que acompaña, dice en el cuerpo que no se lee
    // como causa, declara su N propio, y NINGÚN texto divide un coste por él.
    for (const r of SNAP.resultados?.items ?? []) {
      const bloque = page.locator(`#r-${r.servicioRelacionado}`)
      await expect(bloque).toBeVisible({ timeout: 8000 })
      await expect(bloque.getByText(/al lado, nunca dividido/i)).toBeVisible()
      await expect(bloque.getByText(r.comoSeLee.slice(0, 60))).toBeVisible()
      if (r.pares) {
        await expect(
          bloque.getByText(new RegExp(`Mediana de ${r.pares.n} municipios`)),
        ).toBeVisible()
      }
      await expect(bloque.getByText(r.fuente.atribucion)).toBeVisible()
    }
    // Las ausencias medidas también se publican.
    for (const a of SNAP.resultados?.ausencias ?? []) {
      await expect(page.getByText(a.tema).first()).toBeVisible()
    }
  })

  test('el historial de correcciones de una ficha va plegado, con el hecho a la vista', async ({
    page,
  }) => {
    // Mismo contrato que CorrectionNote en los reportajes (17-08-2026): el
    // summary dice CUÁNTAS correcciones y de cuándo; el antes/después se abre.
    const FICHAS = JSON.parse(readFileSync('public/data/eficiencia-findings.json', 'utf8'))
    const conHistorial = (FICHAS.items ?? []).find(
      (i: { corrections?: unknown[] }) => (i.corrections?.length ?? 0) > 0,
    )
    test.skip(!conHistorial, 'ninguna ficha publicada lleva correcciones ahora mismo')

    const n = conHistorial.corrections.length
    const resumen =
      n === 1
        ? `Corregido el ${conHistorial.corrections[0].correctedAt}`
        : `${n} correcciones, la última el ${conHistorial.corrections[n - 1].correctedAt}`
    await expect(page.getByText(resumen)).toBeVisible({ timeout: 8000 })

    const motivo = `Motivo: ${conHistorial.corrections[0].reason}`
    await expect(page.getByText(motivo, { exact: false })).toBeHidden()
    await page.getByText(resumen).click()
    await expect(page.getByText(motivo, { exact: false }).first()).toBeVisible()
  })

  test('the signed-findings section says what its emptiness means', async ({ page }) => {
    // Cero fichas es el estado normal antes de la primera firma. Un hueco se
    // lee como «no hay nada que contar», que es la mentira por omisión que el
    // resto de la página existe para no cometer: la sección tiene que decir
    // que lo que falta es una firma, no un hallazgo.
    await expect(page.getByRole('heading', { name: /Hallazgos firmados/i })).toBeVisible({
      timeout: 8000,
    })

    if (MIAS.length === 0) {
      await expect(page.getByText(/Todavía no hay ninguna ficha firmada/i)).toBeVisible()
    }
    // Con fichas publicadas: cada una enseña su medición congelada y su
    // periodo, que es lo que permite volver a comprobarla contra la fuente.
    for (const f of MIAS) {
      await expect(page.getByRole('heading', { name: f.titulo })).toBeVisible()
      await expect(page.getByText(f.medicion.periodo, { exact: false }).first()).toBeVisible()
    }
    // Las de la otra página no se cuelan aquí, y esta lo dice en vez de
    // callarlo: «no hay ninguna» mientras la hermana tiene dos sería la mentira
    // por omisión que toda esta sección existe para no cometer.
    for (const f of AJENAS) {
      await expect(
        page.getByRole('heading', { name: f.titulo }),
        `${f.id} habla de un indicador que no vive aquí`,
      ).toHaveCount(0)
    }
    if (AJENAS.length > 0) {
      await expect(page.locator('a[href="/gestion"]').first()).toBeVisible()
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

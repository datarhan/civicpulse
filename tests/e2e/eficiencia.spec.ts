import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import { chipDeclaracion, GLOSA_TIER } from '../../src/scraper/indicador-lectura'
import { calendarioEntrega } from '../../src/scraper/cesel-entregas'
import { seriesDibujables, aniosSinEntrega } from '../../src/components/eficiencia/multiples'
import {
  agruparPorArea,
  particionPosiciones,
  fraseParticion,
} from '../../src/scraper/indicador-areas'
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
const PREGUNTAS = JSON.parse(readFileSync('public/data/eficiencia-preguntas.json', 'utf8'))
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
/**
 * Abre un apartado.
 *
 * Desde agosto de 2026 los seis apartados de /eficiencia son PESTAÑAS y no
 * anclas de una página de seis mil píxeles: se ve uno cada vez. La forma de
 * llegar a uno sigue siendo su fragmento —los permalinks publicados no
 * cambian— así que estas pruebas entran por donde entra un lector que pincha
 * un enlace, y de paso ejercitan ese camino en lugar de suponerlo.
 *
 * Espera al panel VISIBLE, no al elemento: con `hidden` el nodo existe desde
 * el primer render, y un `waitForSelector` a secas pasaría sin que la pestaña
 * se hubiera abierto — que es la puerta hueca de siempre.
 */
async function abrir(page: import('@playwright/test').Page, seccion: string) {
  await page.goto(`/eficiencia#${seccion}`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator(`#${seccion}`)).toBeVisible({ timeout: 8000 })
}

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

    await abrir(page, 'sec-servicios')
    await expect(
      page.getByRole('heading', { name: /Cuánto cuesta y qué se obtiene/i }),
    ).toBeVisible({ timeout: 8000 })

    // The snapshot has something to show, and the page shows it. Guards against
    // a green run against an empty page.
    expect(CON_RATIO.length).toBeGreaterThan(0)
    // Una fila por servicio del panel —incluidos los que no tienen cociente,
    // que van dentro de la tabla y no en una sección aparte— y cada una lleva
    // a su ficha.
    await expect(page.locator('.cp-libro tbody tr')).toHaveCount(SNAP.indicadores.length)
    await expect(
      page.locator(`.cp-libro .cp-c-servicio a[href="/eficiencia/${CON_RATIO[0].id}"]`),
    ).toBeVisible()

    // La franja de cobertura vive en SU pestaña, y por eso se abre: desde que
    // los seis apartados son pestañas, una aserción que cruza de uno a otro es
    // una aserción sobre algo que el lector no está viendo.
    await abrir(page, 'sec-cobertura')
    await expect(page.getByText(/servicios que este panel sigue/i)).toBeVisible()

    expect(appErrors(errors)).toEqual([])
  })

  test('el estado de la rendición cuenta lo que la fuente declara de sí misma', async ({
    page,
  }) => {
    // Las cuatro cifras se RE-DERIVAN aquí del mismo snapshot: si la página y
    // este test divergen, uno de los dos cuenta mal. Restatarlas a mano es el
    // fallo nº1 de docs/DATA_INTEGRITY.md.
    const p = particionPosiciones(SNAP.indicadores)
    const hero = page.locator('#sec-lectura')
    await expect(hero).toBeVisible({ timeout: 8000 })

    const congelados = CON_RATIO.filter((i: Indicador) => i.declaracion?.denominador?.congelada)
    const medibles = CON_RATIO.filter((i: Indicador) => i.declaracion?.denominador).length
    expect(congelados.length, 'el snapshot no trae denominadores congelados').toBeGreaterThan(0)
    await expect(hero.getByText(`${congelados.length} de ${medibles}`)).toBeVisible()

    const sinRendir: number[] = SNAP.cobertura?.entregasNoPresentadas ?? []
    if (sinRendir.length > 0) {
      await expect(hero.getByText(sinRendir.join(' · '), { exact: true })).toBeVisible()
    }

    // Las entregas inverosímiles y los servicios sin cociente, contados igual
    // que los cuenta el componente.
    const inverosimiles = SNAP.indicadores.reduce(
      (n: number, i: Indicador) => n + (i.serie ?? []).filter((s) => s.atipico).length,
      0,
    )
    const sinCociente = SNAP.indicadores.length - CON_RATIO.length
    if (inverosimiles > 0) {
      await expect(hero.getByText(String(inverosimiles), { exact: true })).toBeVisible()
    }
    if (sinCociente > 0) {
      await expect(hero.getByText(String(sinCociente), { exact: true })).toBeVisible()
    }

    // La parte que MANDA va delante y con su recuento derivado: sin ella, doce
    // percentiles se leen como doce hechos.
    await expect(
      hero.getByText(
        new RegExp(`de los ${p.situados} servicios comparables, ${p.indistinguibles} no se`),
      ),
    ).toBeVisible()

    // Y la separación explícita entre lo que estas cifras permiten y lo que no.
    await expect(hero.getByText(/Lo que estas cifras permiten concluir/i)).toBeVisible()
    await expect(hero.getByText(/^Lo que no$/)).toBeVisible()
    await expect(hero.getByText(/miden la/i)).toContainText('rendición de cuentas')
    await expect(hero.getByText(/No hay nota global del ayuntamiento/i)).toBeVisible()

    // Contrato del índice: la cabecera dice cuántas cosas hay y dónde, nunca
    // qué concluye una ficha firmada.
    const texto = (await hero.textContent()) ?? ''
    for (const f of FICHAS.items) {
      expect(texto, 'la cabecera adelanta el titular de una ficha').not.toContain(
        f.titulo.slice(0, 25),
      )
    }
  })

  test('el libro se agrupa por área funcional cuando se le pide', async ({ page }) => {
    await abrir(page, 'sec-servicios')
    // La agrupación la declara cada servicio en el registro y la ordena el
    // gasto. Ya no es la estructura de la página —el libro llega ordenado por
    // coste— pero sigue estando, y aquí se comprueba que el DOM la respeta
    // entera cuando se activa: cabecera de área con su mini-frase derivada, y
    // las filas dentro en el orden que exporta el mismo módulo que consume la
    // página.
    const grupos = agruparPorArea(SNAP.indicadores)
    expect(grupos.length, 'sin grupos de área en el snapshot').toBeGreaterThan(1)

    await page.getByRole('button', { name: /Agrupar por área/i }).click()

    for (const g of grupos) {
      const cabecera = page.locator(`#g-${g.area}`)
      await expect(cabecera).toBeVisible({ timeout: 8000 })
      await expect(cabecera).toContainText(g.etiqueta)
      const frase = fraseParticion(g.particion)
      if (frase) await expect(cabecera).toContainText(`${frase}.`)
    }

    // El orden real de las filas en el DOM es exactamente el de los grupos,
    // con las que no tienen cociente al pie: `agruparPorArea` sólo reparte las
    // que sí lo tienen, a propósito.
    const enDom = await page
      .locator('.cp-libro tbody .cp-c-servicio a')
      .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href')))
    const esperado = [
      ...grupos.flatMap((g) => g.indicadores.map((i) => `/eficiencia/${i.id}`)),
      ...SNAP.indicadores
        .filter((i: Indicador) => i.valor === null)
        .map((i: Indicador) => `/eficiencia/${i.id}`),
    ]
    expect(enDom).toEqual(esperado)
  })

  test('cada fila contesta «¿caro o barato?» sin abrir nada, y cuándo no puede', async ({
    page,
  }) => {
    await abrir(page, 'sec-servicios')
    // La posición va en la fila: percentil, banda y —cuando la banda cruza la
    // mediana— la advertencia de que no se distingue. Los que no llegan a
    // quince comparables lo dicen en vez de situarse.
    const situados = CON_RATIO.filter((i: Indicador) => i.pares)
    expect(situados.length).toBeGreaterThan(5)

    for (const i of situados) {
      const celda = page.locator(
        `.cp-libro tbody tr:has(a[href="/eficiencia/${i.id}"]) .cp-c-posicion`,
      )
      await expect(celda, i.id).toContainText(`p${i.pares.percentil}`, { timeout: 8000 })
      const b = i.pares.percentilBanda
      if (Array.isArray(b)) {
        await expect(celda, i.id).toContainText(`banda ${b[0]}–${b[1]}`)
        if (b[0] <= 50 && b[1] >= 50) await expect(celda, i.id).toContainText('cruza la mediana')
      }
    }

    const sinSituar = CON_RATIO.length - situados.length
    if (sinSituar > 0) {
      // `getByText` casa también con los ancestros, así que se cuentan FILAS
      // y no nodos: tres coincidencias en una sola celda son una.
      await expect(
        page.locator('.cp-libro tbody tr', {
          has: page.locator('.cp-c-posicion', { hasText: /no llegan a quince comparables/ }),
        }),
      ).toHaveCount(sinSituar)
    }
  })

  test('el punto hueco marca exactamente las posiciones que la muestra no sostiene', async ({
    page,
  }) => {
    await abrir(page, 'sec-servicios')
    // La geometría y el veredicto salen de la MISMA función, así que aquí se
    // cuenta lo pintado contra lo derivado. Es la comprobación que ninguna
    // suite de esta casa podía hacer antes: todas leían texto, y el defecto que
    // abrió este rediseño —el punto al 11 % bajo un rótulo que decía 85— vivía
    // sólo en el atributo `left`.
    const p = particionPosiciones(SNAP.indicadores)
    expect(p.indistinguibles, 'ninguna banda cruza la mediana en este snapshot').toBeGreaterThan(0)

    const tbody = page.locator('.cp-libro tbody')
    await expect(tbody.locator('[data-eje-marcador="hueco"]')).toHaveCount(p.indistinguibles, {
      timeout: 8000,
    })
    await expect(tbody.locator('[data-eje-marcador="solido"]')).toHaveCount(p.abajo + p.arriba)
    await expect(tbody.getByText('≈ indistinguible')).toHaveCount(p.indistinguibles)

    // Y el marcador cae donde dice el rótulo, medido en píxeles.
    const desviacion = await tbody.evaluate((tb) => {
      const filas = [...tb.querySelectorAll('tr')]
      let peor = 0
      for (const tr of filas) {
        const eje = tr.querySelector('[role="img"]')
        const m = tr.querySelector('[data-eje-marcador]')
        const rot = tr.querySelector('.cp-c-posicion .cp-fila-meta')?.textContent ?? ''
        const dicho = /p(\d+)/.exec(rot)
        if (!eje || !m || !dicho) continue
        const re = eje.getBoundingClientRect()
        const rm = m.getBoundingClientRect()
        const pintado = ((rm.left + rm.width / 2 - re.left) / re.width) * 100
        peor = Math.max(peor, Math.abs(pintado - Number(dicho[1])))
      }
      return peor
    })
    expect(desviacion, 'el punto no cae en el percentil que rotula').toBeLessThan(1)
  })

  test('avisa de los cocientes cuyo denominador nadie vuelve a medir', async ({ page }) => {
    // La frase larga vive en la franja de cobertura; la marca corta, en cada
    // fila del libro. Se comprueban las dos, cada una donde está.
    await abrir(page, 'sec-cobertura')
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
    // Y cada fila del libro lo lleva marcado con SU AÑO, visible sin abrir
    // nada: es lo que condiciona cómo se lee el resto de la fila, así que no
    // puede quedarse dentro del desplegable con las demás salvedades.
    //
    // El año, no la frase entera. Doce filas dicen 2019 y una dice 2018: la
    // frase completa repetida trece veces dejaba el ámbar significando «fila»
    // —y borraba justo la que se sale—, así que la frase sube a una banda
    // sobre la tabla y en la fila queda lo que la distingue. Las dos mitades
    // se comprueban aquí, y las dos salen de `chipDeclaracion`, nunca de una
    // cadena rescrita en el test.
    await abrir(page, 'sec-servicios')
    const banda = page.locator('.cp-libro-comun')
    await expect(banda).toBeVisible({ timeout: 8000 })
    await expect(banda).toContainText(String(congelados.length))

    const anios = new Set(congelados.map((i: Indicador) => chipDeclaracion(i)!.desde))
    expect(anios.size, 'ningún año de congelación — ¿se cayó el campo `desde`?').toBeGreaterThan(0)
    for (const i of congelados) {
      const fila = page.locator(`.cp-libro tbody tr:has(a[href="/eficiencia/${i.id}"])`)
      await expect(
        fila.locator('.cp-fila-declara'),
        `${i.servicio} publica su cociente sin marcar el denominador parado`,
      ).toHaveText(`desde ${chipDeclaracion(i)!.desde}`)
    }
  })

  test('los quince caben juntos, y el total es el de los que tienen cociente', async ({ page }) => {
    await abrir(page, 'sec-servicios')
    // La página tenía todos los percentiles calculados y no los enseñaba
    // juntos en ningún sitio: había que recorrer trece pantallas para saber
    // cuáles son los dos caros. El libro no añade ninguna afirmación —cada fila
    // es lo que su propia ficha publica— así que lo que hay que vigilar es que
    // no se desincronice de las fichas.
    const situados = SNAP.indicadores.filter((i: Indicador) => i.valor !== null && i.pares)
    expect(situados.length, 'ningún servicio situado en el snapshot').toBeGreaterThan(0)

    // Un enlace por servicio del panel, ni uno más, y cada uno con destino: un
    // enlace roto no da error, sencillamente no hace nada y nadie se entera.
    const enlaces = page.locator('.cp-libro tbody .cp-c-servicio a')
    await expect(enlaces).toHaveCount(SNAP.indicadores.length, { timeout: 8000 })
    const hrefs = await enlaces.evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute('href')),
    )
    for (const i of SNAP.indicadores) {
      expect(hrefs, `el libro no enlaza la ficha de ${i.id}`).toContain(`/eficiencia/${i.id}`)
    }

    // El total es el de los servicios CON cociente, no el del panel entero: es
    // la diferencia entre una suma correcta y una que se cuela dos servicios
    // sin coste utilizable.
    const total = CON_RATIO.reduce((s: number, i: Indicador) => s + (i.numerador.valor ?? 0), 0)
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

  test('la década va en la fila, con la mediana de sus pares detrás', async ({ page }) => {
    await abrir(page, 'sec-servicios')
    // El punto (posición hoy) y la serie (la década) responden preguntas
    // distintas y ahora van en la misma fila. El recuento no se restata aquí:
    // lo decide `multiples.js`, el módulo que consume el propio componente.
    const dibujables = seriesDibujables(SNAP.indicadores)
    expect(dibujables.length, 'sin series dibujables en el snapshot').toBeGreaterThanOrEqual(2)

    const celdas = page.locator('.cp-libro tbody .cp-c-decada svg')
    await expect(celdas).toHaveCount(dibujables.length, { timeout: 8000 })

    // El pie declara en qué euros va la serie, UNA vez y no quince.
    await expect(page.locator('.cp-libro caption')).toContainText(/euros constantes de/i)
    const sinEntrega = aniosSinEntrega(dibujables.map((s) => s.declarados))
    expect(sinEntrega.length, 'el snapshot no tiene años sin entrega').toBeGreaterThan(0)
  })

  test('a concession shows no ratio and no peer position', async ({ page }) => {
    await abrir(page, 'sec-servicios')
    // THE trap this page was designed around: the council books €0 for water
    // because the concessionaire bears it, so a naive divide would publish
    // "cheapest in the comarca".
    expect(CONCESION.length).toBeGreaterThan(0)

    // Va DENTRO de la tabla, no en una sección aparte: sacarla la dejaría
    // pareciendo completa. Sin cociente, sin posición y sin múltiplo.
    const fila = page.locator(`.cp-libro tbody tr:has(a[href="/eficiencia/${CONCESION[0].id}"])`)
    await expect(fila).toBeVisible({ timeout: 8000 })
    await expect(fila.locator('.cp-c-unidad')).toHaveText('—')
    await expect(fila.locator('.cp-c-razon')).toHaveText('—')
    await expect(fila.locator('[data-eje-marcador]')).toHaveCount(0)
    await expect(fila.getByText(/sin comparación/i)).toBeVisible()

    // Y el motivo se explica entero en su ficha, no en un hueco.
    await page.goto(`/eficiencia/${CONCESION[0].id}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/lo paga el concesionario/i).first()).toBeVisible({
      timeout: 8000,
    })
  })

  test('sólo trae los indicadores que salen del mismo cuaderno', async ({ page }) => {
    await abrir(page, 'sec-declaracion')
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
      await expect(
        page.locator('#sec-declaracion').getByText(m.periodo, { exact: true }).first(),
      ).toBeVisible()
    }
    for (const m of alli) {
      await expect(
        page.getByRole('heading', { name: m.etiqueta }),
        `${m.id} es de /gestion y se está publicando en /eficiencia`,
      ).toHaveCount(0)
    }

    // No peer band may appear here: there is no national dataset of municipal
    // single-bidder rates, so a percentile would be unsupported. El desglose de
    // comparables vive en la ficha de cada servicio, así que en el libro no
    // debe aparecer ninguno.
    await expect(page.getByText(/Ver los municipios comparados/i)).toHaveCount(0)
  })

  test('la cabecera indexa los hallazgos sin adelantar lo que dicen', async ({ page }) => {
    await abrir(page, 'sec-lectura')
    if (MIAS.length === 0) {
      // Sin fichas propias no hay índice: un enlace a una sección vacía es peor
      // que ningún enlace. El submenú sigue el mismo contrato: su ítem de
      // hallazgos es condicional al recuento.
      await expect(page.locator('a[href="#hallazgos"]')).toHaveCount(0)
      return
    }
    // Con fichas hay DOS índices legítimos —la casilla de la lectura rápida y
    // el ítem del submenú— y el recuento vive en la casilla.
    const casilla = page.locator('#sec-lectura a[href="#hallazgos"]')
    await expect(casilla).toBeVisible({ timeout: 8000 })
    // Cuenta las de ESTA página, no las del fichero: /gestion tiene las suyas.
    await expect(casilla).toContainText(String(MIAS.length))

    // Índice, no conclusión: las fichas siguen al final porque son una lectura
    // del panel y el panel se lee primero. NINGÚN enlace al ancla —casilla o
    // submenú— adelanta lo que una ficha concluye.
    const enlaces = page.locator('a[href="#hallazgos"]')
    const cuantos = await enlaces.count()
    expect(cuantos).toBeGreaterThan(0)
    for (let e = 0; e < cuantos; e++) {
      const texto = (await enlaces.nth(e).textContent()) ?? ''
      for (const f of FICHAS.items) {
        expect(texto, 'un índice está adelantando el titular de una ficha').not.toContain(
          f.titulo.slice(0, 25),
        )
      }
    }
  })

  test('el submenú es una pestaña de verdad: enseña uno y esconde los otros', async ({ page }) => {
    const subnav = page.locator('.cp-subnav')
    await expect(subnav).toBeVisible({ timeout: 8000 })

    // Es un tablist, no una lista de anclas: el rol es lo que hace que un
    // lector de pantalla anuncie «pestaña 3 de 6» en vez de un enlace suelto.
    await expect(subnav.getByRole('tablist')).toBeVisible()
    const pestanas = subnav.getByRole('tab')
    const cuantas = await pestanas.count()
    expect(cuantas, 'ninguna pestaña — ¿se cayó el modo tablist?').toBeGreaterThan(3)

    // Uno visible y SÓLO uno. Es la afirmación entera del cambio: la página
    // medía 6.140 px y ahora se lee de una en una.
    const paneles = page.locator('[role="tabpanel"]')
    await expect(paneles).toHaveCount(cuantas)
    const visibles = async () =>
      (await paneles.evaluateAll((ns) => ns.filter((n) => !(n as HTMLElement).hidden).length)) as
        | number
        | never
    expect(await visibles()).toBe(1)

    await subnav.getByRole('tab', { name: 'Declaración' }).click()
    await page.waitForTimeout(300)
    expect(await visibles()).toBe(1)
    await expect(page.locator('#sec-declaracion')).toBeVisible()
    await expect(page.locator('#sec-servicios')).toBeHidden()
    // La URL sigue siendo citable: el fragmento es el contrato con todos los
    // permalinks ya publicados.
    expect(page.url()).toContain('#sec-declaracion')

    // Y el destino queda POR DEBAJO del borde inferior de la barra. Se mide
    // con getBoundingClientRect porque la banda de 2020 se publicó tapando la
    // mitad de su hueco con todas las suites verdes: los tests de texto no ven
    // geometría.
    const destino = await page.locator('#sec-declaracion').boundingBox()
    const barra = await subnav.boundingBox()
    expect(destino, 'el panel de declaración no se pintó').toBeTruthy()
    expect(destino!.y).toBeGreaterThanOrEqual(barra!.y + barra!.height - 1)
  })

  test('con un apartado largo la barra sigue pegajosa bajo la topbar', async ({ page }) => {
    await abrir(page, 'sec-servicios')
    const subnav = page.locator('.cp-subnav')
    const antes = await subnav.boundingBox()
    await page.mouse.wheel(0, 4000)
    await page.waitForTimeout(300)
    const caja = await subnav.boundingBox()
    expect(caja, 'el submenú desapareció al hacer scroll').toBeTruthy()
    // Se ha desplazado hacia arriba (estaba en flujo) y se ha quedado clavada
    // justo bajo la topbar, que mide 52.
    expect(caja!.y).toBeLessThan(antes!.y)
    expect(caja!.y).toBeGreaterThanOrEqual(40)
    expect(caja!.y).toBeLessThanOrEqual(56)
  })

  test('explica qué son los escalones antes de usarlos como chapa', async ({ page }) => {
    await abrir(page, 'sec-servicios')
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
    // Se busca DENTRO del panel abierto, y se recorren los apartados hasta dar
    // con la glosa. Con los seis montados a la vez y ocultos con `hidden`, un
    // `.first()` sobre el documento entero se queda con la copia de otro
    // apartado y devuelve «hidden» sobre algo que sí está en pantalla: verde o
    // rojo por el sitio equivocado.
    //
    // Recorrer en vez de fijar el apartado no es pereza: la glosa la pinta
    // `LeyendaEscalones`, que hoy vive con la cobertura y ayer vivía con las
    // tarjetas. Lo que esta prueba defiende es que un escalón usado como chapa
    // se explique EN ALGÚN SITIO que el lector pueda abrir, no en cuál.
    const apartados = await page
      .locator('[role="tabpanel"]')
      .evaluateAll((ns) => ns.map((n) => n.id))
    for (const tier of enUso) {
      let visto: string | null = null
      for (const ap of apartados) {
        await abrir(page, ap)
        const glosa = page.locator(`#${ap}`).getByText(GLOSA_TIER[tier], { exact: false }).first()
        if ((await glosa.count()) > 0 && (await glosa.isVisible())) {
          visto = ap
          break
        }
      }
      expect(
        visto,
        `el escalón ${tier} se usa como chapa y no se explica en ningún sitio`,
      ).not.toBe(null)
    }
    // Y no se anuncia un escalón que nada usa: listarlo sugeriría que existe.
    const ausentes = (Object.keys(GLOSA_TIER) as (keyof typeof GLOSA_TIER)[]).filter(
      (t) => !enUso.includes(t),
    )
    for (const tier of ausentes) {
      await expect(page.getByText(GLOSA_TIER[tier], { exact: false })).toHaveCount(0)
    }
  })

  test('dice por qué la entrega más reciente es de hace dos años', async ({ page }) => {
    // La queja que lo motiva: un lector entra en 2026, lee «entrega 2024» y
    // concluye que el sitio está abandonado. No lo está — 2024 es lo último que
    // el ministerio ha publicado, porque un ejercicio se rinde antes del 1 de
    // noviembre del siguiente. La página no lo decía en ninguna parte.
    await abrir(page, 'sec-cobertura')
    const cal = calendarioEntrega(SNAP.anioBase, new Date())
    expect(cal, 'el snapshot no trae anioBase: la frase no puede derivarse').not.toBeNull()

    const nota = page.getByText(`Por qué la cifra más reciente es de ${cal!.ultima}`, {
      exact: false,
    })
    await expect(nota).toBeVisible({ timeout: 8000 })

    // El plazo, derivado y en pantalla: sin él la frase explica el desfase pero
    // no deja comprobar cuándo deja de ser una explicación y pasa a ser un
    // retraso de verdad.
    await expect(
      page.getByText(`1 de noviembre de ${cal!.venceEn}`, { exact: false }).first(),
    ).toBeVisible()

    // Y no se afirma lo contrario de lo que toca a cada lado del plazo.
    const cuerpo = (await page.locator('#sec-cobertura').innerText()).replace(/\s+/g, ' ')
    if (cal!.estado === 'en-plazo') {
      expect(cuerpo).toContain(`La entrega de ${cal!.proxima} no viene con retraso`)
    } else {
      expect(cuerpo).toContain(`El plazo para rendir la entrega de ${cal!.proxima} terminó`)
    }
  })

  test('las ausencias de resultado se publican, con su porqué medido', async ({ page }) => {
    await abrir(page, 'sec-declaracion')
    // Un resultado que no existe se dice, con su motivo, en vez de dejar que el
    // hueco parezca un olvido.
    const ausencias = SNAP.resultados?.ausencias ?? []
    expect(ausencias.length, 'el snapshot no declara ausencias de resultado').toBeGreaterThan(0)
    for (const a of ausencias) {
      await expect(page.getByText(a.tema).first()).toBeVisible({ timeout: 8000 })
    }
  })

  test('el historial de correcciones de una ficha va plegado, con el hecho a la vista', async ({
    page,
  }) => {
    await abrir(page, 'hallazgos')
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
    await abrir(page, 'hallazgos')
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
      await expect(
        page.locator('#hallazgos').getByText(f.medicion.periodo, { exact: false }).first(),
      ).toBeVisible()
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

  test('las preguntas registradas del panel, numeradas y con su base', async ({ page }) => {
    await abrir(page, 'sec-preguntas')
    type ItemPregunta = { q: string; base: string; href?: string }
    const panel = PREGUNTAS.panels?.['coste-efectivo']
    test.skip(!panel, 'sin preguntas registradas para este panel')
    const items: ItemPregunta[] = panel.bloques.flatMap((b: { items: ItemPregunta[] }) => b.items)
    expect(items.length, 'panel de preguntas vacío').toBeGreaterThan(0)

    await expect(page.locator('#sec-preguntas')).toBeVisible({ timeout: 8000 })
    await expect(page.locator('[data-pregunta]')).toHaveCount(items.length)
    // La cabecera muestra la primera pregunta como anticipo, así que el texto
    // aparece dos veces en la página a propósito: se busca DENTRO de la
    // sección, no en el documento.
    const seccion = page.locator('#sec-preguntas')
    await expect(seccion.getByText(items[0].q)).toBeVisible()
    await expect(seccion.getByText(items[items.length - 1].q)).toBeVisible()

    // El reparto por panel en las dos direcciones, como fichas e indicadores.
    const otras: ItemPregunta[] = (PREGUNTAS.panels?.['gestion']?.bloques ?? []).flatMap(
      (b: { items: ItemPregunta[] }) => b.items,
    )
    if (otras.length > 0) {
      await expect(
        page.getByText(otras[0].q),
        'una pregunta de /gestion se está publicando en /eficiencia',
      ).toHaveCount(0)
    }

    // Toda base enlazada tiene destino de verdad: una pregunta que enlaza a una
    // cifra inexistente pierde su base ante el lector.
    //
    // `eficiencia-preguntas.json` es CURADO y cita un `#s-<id>` y un `#r-<id>`,
    // que eran las anclas de una ficha y de su bloque de resultado cuando las
    // quince vivían en esta página. Ahora cada servicio es su propia ruta y la
    // página traduce los dos enlaces viejos, así que lo que se comprueba es que
    // la traducción llega — no que el ancla siga existiendo.
    for (const it of items) {
      if (!it.href) continue
      const aFicha = /^\/eficiencia#[sr]-(.+)$/.exec(it.href)
      if (aFicha) {
        const id = aFicha[1]
        await page.goto(it.href, { waitUntil: 'domcontentloaded' })
        await expect(page, `${it.href} no aterriza en su ficha`).toHaveURL(
          new RegExp(`/eficiencia/${id}$`),
          { timeout: 8000 },
        )
        await abrir(page, 'sec-preguntas')
      } else if (it.href.startsWith('/eficiencia#')) {
        const id = it.href.split('#')[1]
        await expect(page.locator(`#${id}`), `${it.href} no resuelve`).toHaveCount(1)
      }
    }

    // Y el submenú la indexa.
    await expect(page.locator('.cp-subnav a[href="#sec-preguntas"]')).toHaveCount(1)
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

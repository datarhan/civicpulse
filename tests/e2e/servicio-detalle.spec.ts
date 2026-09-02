import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { readFileSync } from 'node:fs'
import type { Indicador } from '../../src/scraper/indicadores'
import { cruzaMediana } from '../../src/scraper/indicador-areas'
import { collectErrors, appErrors } from './_console'

/**
 * La ficha de un servicio, /eficiencia/:id.
 *
 * Hasta agosto de 2026 esto vivía dentro de /eficiencia como una de quince
 * tarjetas. Se mide contra el snapshot COMMITTEADO y nunca contra cifras
 * escritas a mano: un spec que restata la forma que vigila es el fallo nº1 de
 * docs/DATA_INTEGRITY.md.
 */
const SNAP = JSON.parse(readFileSync('public/data/indicadores.json', 'utf8'))
const MAPA = JSON.parse(readFileSync('public/data/competencias.json', 'utf8'))
const CON_RATIO: Indicador[] = SNAP.indicadores.filter((i: Indicador) => i.valor !== null)
const COMPARABLE: Indicador = [...CON_RATIO]
  .sort((a, b) => (b.numerador.valor ?? 0) - (a.numerador.valor ?? 0))
  .find((i) => i.pares)!
// Ver la nota del mismo selector en eficiencia.spec.ts: `motivo === 'concesion'`
// dejó de nombrar a las fichas de concesión cuando dejaron de estar bloqueadas.
const CONCESION: Indicador[] = SNAP.indicadores.filter(
  (i: Indicador) => i.modoGestion === 'concesion' && i.valor !== null,
)
const CONGELADO: Indicador | undefined = CON_RATIO.find(
  (i) => i.declaracion?.denominador?.congelada,
)

test.describe('Ficha de servicio (/eficiencia/:id)', () => {
  test.beforeEach(async ({ page }) => {
    const errores = collectErrors(page)
    await page.goto(`/eficiencia/${COMPARABLE.id}`, { waitUntil: 'domcontentloaded' })
    const montada = await page
      .getByRole('heading', { name: COMPARABLE.etiqueta })
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false)
    // «No montada» tiene dos causas y sólo una es saltable: con la bandera
    // apagada la ruta no existe; con la página reventada tampoco llega el h1, y
    // saltar entonces convertiría un crash en una suite verde.
    if (!montada && appErrors(errores).length > 0) {
      throw new Error(
        `/eficiencia/:id no montó Y la consola trae errores — está rota, no apagada:\n` +
          appErrors(errores).join('\n'),
      )
    }
    test.skip(!montada, '/eficiencia/:id no está montada — VITE_ENABLE_EFICIENCIA=true')
  })

  test('la división se enseña entera: sus dos mitades y sus dos fechas', async ({ page }) => {
    // El defecto que esto congela: la página publicaba «81.965 €/efectivo» y
    // ninguna frase que dijera qué era eso. Un lector lo preguntó tal cual.
    const i = COMPARABLE
    await expect(
      page
        .getByText(i.numerador.valor!.toLocaleString('es-ES', { maximumFractionDigits: 0 }))
        .first(),
    ).toBeVisible()
    await expect(page.getByText(i.denominador.valor!.toLocaleString('es-ES')).first()).toBeVisible()
    // Y la glosa del divisor, que es lo que convierte «52 efectivos» en algo
    // legible, va en la propia ficha.
    await expect(
      page.getByText(i.divisor.glosa, { exact: false }),
      `${i.id} publica un cociente sin decir qué cuenta su divisor`,
    ).toBeVisible()
  })

  test('una raya por comparable, y el punto en su propio percentil', async ({ page }) => {
    const p = COMPARABLE.pares!
    // Tantas rayas como comparables declara el snapshot: si el eje se quedara
    // corto, la ficha estaría enseñando una muestra que no es la suya.
    const eje = page.locator('[role="img"]').first()
    await expect(eje).toBeVisible({ timeout: 8000 })
    const rayas = await eje.evaluate((el) => el.querySelectorAll('[data-eje-tick]').length)
    expect(rayas, 'el eje no dibuja una raya por comparable').toBe(p.n)

    // El punto cae donde dice el rótulo. Es la comprobación que ninguna suite
    // de esta casa podía hacer: el defecto que abrió el rediseño —el punto al
    // 11 % de la tira bajo un rótulo que decía «percentil 85»— vivía sólo en el
    // atributo `left`, y todas las suites leían texto.
    const pintado = await eje.evaluate((el) => {
      const m = el.querySelector('[data-eje-marcador]')!
      const re = el.getBoundingClientRect()
      const rm = m.getBoundingClientRect()
      return ((rm.left + rm.width / 2 - re.left) / re.width) * 100
    })
    expect(Math.abs(pintado - p.percentil)).toBeLessThan(1)

    // Los cinco rótulos, cada uno donde de verdad está. Con tres y
    // `space-between`, «p25» aterrizaba en el 0 % del eje.
    //
    // Los de los bordes decían «p0» y «p100» y ahora dicen «mín./máx.
    // declarado». No es cosmética: en policía local el borde de abajo es
    // 831,03 EUR/efectivo, que no puede ser el coste anual de un agente, y
    // rotularlo como cuantil le prestaba a un dato suelto la autoridad de un
    // estadístico. El cuantil de un extremo ES el extremo; lo que consta de él
    // es que es el mínimo y el máximo DECLARADOS.
    for (const t of ['mín. declarado ·', 'p25 ·', 'mediana ·', 'p75 ·', 'máx. declarado ·']) {
      await expect(page.getByText(t, { exact: false }).first()).toBeVisible()
    }

    // Y los bordes van marcados, con el recuento MEDIDO y no con un adjetivo.
    // La revisión los encontró presentados como suelo y techo del reparto sin
    // nada que dijera que un reparto que empieza en 831 EUR no es una
    // referencia; ahora la ficha dice cuántos comparables quedan fuera de un
    // orden de magnitud, marcados con la misma regla que juzga la serie propia.
    // El número sale del snapshot, así que la aserción también.
    const atipicos: number = COMPARABLE.pares!.atipicos ?? 0
    if (atipicos > 0) {
      await expect(page.getByText(/fuera de un orden de magnitud/i).first()).toBeVisible()
      await expect(page.getByText(/siguen contando en el percentil/i)).toBeVisible()
    } else {
      // Sin atípicos no se inventa una advertencia: la nota no se pinta.
      await expect(page.getByText(/fuera de un orden de magnitud/i)).toHaveCount(0)
    }

    // Y la banda dice si la posición se sostiene o no, sin ambigüedad.
    const cruza = cruzaMediana(p)
    await expect(page.getByText(cruza ? /no se distingue/ : /sí se distingue/)).toBeVisible()
  })

  test('la declaración, entrega a entrega, con la cantidad SIN abreviar', async ({ page }) => {
    test.skip(!CONGELADO, 'ningún denominador congelado en este snapshot')
    const i = CONGELADO!
    await page.goto(`/eficiencia/${i.id}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/Qué declaró el ayuntamiento, entrega a entrega/i)).toBeVisible({
      timeout: 8000,
    })

    // La afirmación de esta ficha es que es la MISMA cifra, así que la cifra va
    // entera: «32 k» cinco veces seguidas no demuestra nada.
    const declarados = (i.serie ?? []).filter((s) => s.estado === 'declarado')
    const ultimo = declarados[declarados.length - 1]
    expect(typeof ultimo.denominador, 'la serie no publica su denominador').toBe('number')
    const exacta = ultimo.denominador!.toLocaleString('es-ES', { maximumFractionDigits: 0 })
    const repes = i.declaracion.denominador.repeticionesFinales
    await expect(page.getByText(exacta, { exact: true })).toHaveCount(repes)

    // La entrega que falta se marca, y su «—» va sobre una pastilla sólida:
    // contraste.spec.ts se salta cualquier elemento con background-image, así
    // que texto sobre el rayado sería verde por no ejecutarse.
    const noPresentadas: number[] = SNAP.cobertura?.entregasNoPresentadas ?? []
    for (const a of noPresentadas) {
      await expect(page.getByText(String(a), { exact: true }).first()).toBeVisible()
    }
  })

  test('publica contra quién se compara, con nombres', async ({ page }) => {
    // Esconder CONTRA QUIÉN se compara rompería el contrato de mostrar el
    // trabajo: son cifras oficiales y el desglose se publica entero.
    const disclosure = page.getByText(/Ver los municipios comparados/i).first()
    await expect(disclosure).toBeVisible({ timeout: 8000 })
    await disclosure.click()
    await expect(page.getByText(COMPARABLE.pares!.miembros[0].nombre).first()).toBeVisible()
  })

  test('la fuente, la réplica y quién responde van al final, después del matiz', async ({
    page,
  }) => {
    const cita = COMPARABLE.citas?.[0]
    expect(cita, 'la ficha no tiene cita que comprobar').toBeTruthy()
    await expect(page.getByText(/Fuente y réplica/i)).toBeVisible({ timeout: 8000 })
    await expect(page.locator(`a[href="${cita!.url}"]`).first()).toBeVisible()
    await expect(page.locator('a[href="/aviso-legal"]').first()).toBeVisible()
    await expect(page.locator('a[href="/metodologia#reglas-eficiencia"]')).toHaveCount(1)

    // Un nombre propio pegado a la cifra construye «mira lo que cuesta lo suyo»
    // antes de que el lector llegue a la frase que lo desarma. Por eso la
    // competencia va DESPUÉS, y esto lo mide en píxeles.
    const nombre = page.getByText(/Competencia delegada/i)
    if (await nombre.count()) {
      const yNombre = (await nombre.first().boundingBox())!.y
      const yCifra = (await page
        .getByText(/al año, por cada/)
        .first()
        .boundingBox())!.y
      expect(yNombre, 'el nombre subió por encima de la cifra que lo desarma').toBeGreaterThan(
        yCifra,
      )
    }
  })

  test('un servicio concedido publica su cociente y dice quién lo paga', async ({ page }) => {
    expect(CONCESION.length).toBeGreaterThan(0)
    const c = CONCESION[0]
    await page.goto(`/eficiencia/${c.id}`, { waitUntil: 'domcontentloaded' })
    // La ficha decía «Sin cociente posible» hasta el 2026-09-02. Ahora hay
    // cifra, y con ella el eje que la sitúa — contra concesiones, nunca contra
    // una gestión directa: lo que esta página se diseñó para no publicar es «el
    // más barato de la comarca», y eso sale de comparar magnitudes distintas o
    // de dividir un cero, no de dividir.
    await expect(page.getByText(/Sin cociente posible/i)).toHaveCount(0)
    await expect(page.locator('[data-eje-marcador]')).not.toHaveCount(0)
    await expect(page.getByText(/lo cobra el concesionario del recibo/i).first()).toBeVisible({
      timeout: 8000,
    })
    await expect(
      page.getByText(/no paga el presupuesto municipal sino el recibo/i).first(),
    ).toBeVisible()
  })

  test('un identificador que no existe no finge una ficha', async ({ page }) => {
    await page.goto('/eficiencia/no-existe-este-servicio', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/No hay ninguna ficha con ese identificador/i)).toBeVisible({
      timeout: 8000,
    })
    await expect(page.locator('a[href="/eficiencia"]').first()).toBeVisible()
  })

  /**
   * El retrato de quien responde, y su ausencia.
   *
   * `/aviso-legal` promete que un cargo puede pedir «la eliminación de su
   * fotografía concreta manteniendo el resto del registro (nombre, concejalía)».
   * Esa rama NO la ejercita ningún dato: las veintiuna fichas del padrón traen
   * foto y `fotoRetirada` no está puesta en ninguna fila. Una rama que nunca se
   * pinta es una rama que nadie sabe si funciona, así que se pinta aquí
   * interceptando el fichero curado — el mismo recurso que usa la spec de la
   * ventana LOREG con `promises.json`, y por el mismo motivo: no se toca un
   * fichero bajo guarda de escrituras para montar una prueba.
   */
  test('el retrato se publica, y se retira dejando el registro entero', async ({ page }) => {
    const conCargo = new Set((MAPA.asignaciones as { clave: string }[]).map((a) => a.clave))
    const servicio = SNAP.indicadores.find((i: Indicador) => i.valor !== null && conCargo.has(i.id))
    expect(servicio, 'ningún servicio del panel tiene competencia firmada').toBeTruthy()

    const tarjeta = () =>
      page
        .locator('.cp-card')
        .filter({ hasText: /Quién responde de esta área/i })
        .first()

    // 1 · Publicado: hay retrato, y UN solo enlace a /cargos.
    await page.goto(`/eficiencia/${servicio.id}`, { waitUntil: 'domcontentloaded' })
    await expect(tarjeta()).toBeVisible({ timeout: 8000 })
    await expect(tarjeta().locator('img')).toHaveCount(1)
    // El retrato NO lleva ancla propia: el nombre de al lado ya es ese enlace, y
    // un segundo ancla al mismo destino rompería el recuento de loreg-freeze,
    // que cuenta enlaces a /cargos/ para saber a cuántos cargos nombra la página.
    await expect(tarjeta().locator('a[href^="/cargos/"]')).toHaveCount(1)
    // Y es del sitio, no del ayuntamiento: una foto enlazada en caliente haría
    // que el navegador de quien lee pidiera un recurso a ribarroja.es.
    const src = await tarjeta().locator('img').getAttribute('src')
    expect(src, 'el retrato se sirve desde fuera del sitio').toMatch(/^\//)

    // 2 · Retirado: se va la FOTO y se queda todo lo demás.
    await page.route('**/data/competencias.json', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...MAPA,
          asignaciones: MAPA.asignaciones.map((a: object) => ({ ...a, fotoRetirada: true })),
        }),
      }),
    )
    await page.goto(`/eficiencia/${servicio.id}`, { waitUntil: 'domcontentloaded' })
    await expect(tarjeta()).toBeVisible({ timeout: 8000 })
    await expect(tarjeta().locator('img'), 'la foto retirada sigue publicándose').toHaveCount(0)
    // La otra mitad, que es la que la promesa protege: el registro se queda.
    const fila = (MAPA.asignaciones as { clave: string; nombre: string; cargo: string }[]).find(
      (a) => a.clave === servicio.id,
    )!
    await expect(tarjeta()).toContainText(fila.nombre)
    await expect(tarjeta()).toContainText(fila.cargo)
    await expect(tarjeta().locator('a[href^="/cargos/"]')).toHaveCount(1)
  })

  test('axe evaluates the ficha and finds nothing blocking', async ({ page }) => {
    await page.waitForTimeout(900)
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    // Un verde no prueba nada si las reglas no llegaron a correr.
    const evaluados = r.passes.flatMap((p) => p.nodes).length
    expect(
      evaluados,
      `axe comprobó ${evaluados} nodos en la ficha — un verde sin reglas ejecutadas no dice nada`,
    ).toBeGreaterThan(20)
    const bloqueantes = r.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    )
    expect(
      bloqueantes.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`),
      'violaciones bloqueantes en /eficiencia/:id',
    ).toEqual([])
  })
})

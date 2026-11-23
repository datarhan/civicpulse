import { test, expect, type Page } from '@playwright/test'
import { resolve } from 'node:path'
import { construirGrafoRutas, rutasRevisables } from '../../scripts/lib/route-graph'
import { leerDeDisco } from '../../scripts/lib/fichas-representativas'
import { JARGON, medirLecturas, type Medida } from './_medida-lecturas'

/**
 * La medida de las dos lecturas, sobre todas las rutas de la revisión lectora
 * (plan revisado, 4a.5). NO BLOQUEA: imprime su tabla y sólo falla si no ha
 * medido nada. Se corre a mano —`npm run medir:lecturas`— ahora y después de
 * cada PR de 4b, y la tabla se compara con la anterior.
 *
 * Por qué no bloquea: sus objetivos son de estilo (en qué pantalla cae la
 * primera respuesta, cuánta jerga queda sin enlace), y CLAUDE.md lo dice: un
 * control determinista estirado hasta el estilo es una máquina de falsos
 * positivos. Lo que sí es un error —una capa sin su atributo, una cifra marcada
 * que su detalle contradice— bloquea en `lectura-vecinal.spec.ts`.
 *
 * Objetivos (plan revisado, 4a.5):
 * - la primera frase de respuesta cabe en 375 × 629 (`1.ª resp.` ≤ 1);
 * - ningún término de la lista ni sigla sin su enlace al glosario;
 * - cada cifra de «En breve» coincide con su ancla (las `sin-marcar` se
 *   cuentan aparte: todavía nadie ha casado sus dos lados);
 * - en cada página de 4b, un techo de pantallas antes de la primera respuesta
 *   y otro de palabras con «lo esencial». El segundo sólo vale cuando la página
 *   tiene `SeccionExperta`. Cada PR de 4b pone el techo de su página en
 *   `TECHOS`, con la cifra medida aquí antes de empezar.
 *
 * 629 px de alto: lo que queda a la vista en un móvil de 375 × 812 cuando el
 * navegador pinta sus barras. Es el alto del objetivo del plan.
 */
const ANCHO = 375
const ALTO = 629

/** Los techos de cada página de 4b. Vacío hasta que su PR lo fije. */
const TECHOS: Record<string, { pantallasAntes?: number; palabrasEsencial?: number }> = {}

const grafo = construirGrafoRutas(resolve('src'))
const RUTAS = [
  ...new Set(
    rutasRevisables(grafo, leerDeDisco(resolve('public/data'))).map((c) => c.split(' [')[0]),
  ),
]
  // Una plantilla sin ficha («/x/:id») no es una URL que se pueda abrir.
  .filter((r) => !r.includes('/:'))
  .sort()

async function mide(page: Page, ruta: string): Promise<Medida> {
  await page.goto(ruta, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  return page.evaluate(medirLecturas, { jerga: JARGON, alto: ALTO })
}

const marca = (ok: boolean | null) => (ok == null ? ' ' : ok ? '✓' : '✗')

test.describe('la medida de las dos lecturas', () => {
  test.skip(!process.env.MEDIR_LECTURAS, 'se corre a mano: npm run medir:lecturas')
  test.use({ viewport: { width: ANCHO, height: ALTO } })

  test('imprime la tabla de todas las rutas', async ({ page, browser }, info) => {
    test.setTimeout(15 * 60_000)
    // «Lo esencial» en una página aparte: el pliegue se guarda en localStorage
    // y se lee al cargar.
    const esencial = await browser.newPage({ viewport: { width: ANCHO, height: ALTO } })
    await esencial.addInitScript(() => {
      try {
        localStorage.setItem('cp:tweaks', JSON.stringify({ lecturas: 'esencial' }))
      } catch {
        /* sin almacenamiento, se mide «todo» y la columna lo dirá */
      }
    })

    const filas: Array<Medida & { final: string; palabrasEsencial: number | null }> = []
    for (const ruta of RUTAS) {
      const m = await mide(page, ruta)
      const palabrasEsencial = m.experta ? (await mide(esencial, ruta)).palabras : null
      // `final`: dónde acabó la página. Una ruta que redirige (sin su flag de
      // lanzamiento, /eficiencia va a la portada) mediría otra página.
      filas.push({ ...m, ruta, final: m.ruta, palabrasEsencial })
    }
    await esencial.close()

    const lineas = [
      `Medida de las dos lecturas · ${ANCHO} × ${ALTO} · ${new Date().toISOString().slice(0, 10)} · ${info.project.use.baseURL ?? ''}`,
      'ruta | capa (pant.) | 1.ª resp. | jerga sin enlace (en la capa) | siglas sin enlace (en la capa) | cifras ✓/✗/sin-pareja/sin-valor/sin-marcar | palabras | con «lo esencial»',
    ]
    for (const f of filas) {
      const techo = TECHOS[f.ruta] ?? {}
      const cuenta = (e: string) => f.cifras.filter((c) => c.estado === e).length
      const capa =
        f.capas === 0
          ? 'sin capa'
          : `${f.pantallasAntes}${techo.pantallasAntes != null ? ` ${marca((f.pantallasAntes ?? 0) <= techo.pantallasAntes)}` : ''}`
      const resp =
        f.primeraRespuesta == null ? '—' : `${f.primeraRespuesta} ${marca(f.primeraRespuesta <= 1)}`
      const jerga =
        f.capas === 0
          ? '—'
          : `${f.jergaSinEnlace.length} ${marca(f.jergaSinEnlace.length === 0)}${f.jergaSinEnlace.length ? ` (${f.jergaSinEnlace.join(', ')})` : ''}`
      const siglas =
        f.capas === 0
          ? '—'
          : `${f.siglasSinEnlace.length} ${marca(f.siglasSinEnlace.length === 0)}${f.siglasSinEnlace.length ? ` (${f.siglasSinEnlace.join(', ')})` : ''}`
      const cifras = f.cifras.length
        ? `${cuenta('coincide')}/${cuenta('no-coincide')}/${cuenta('sin-pareja')}/${cuenta('sin-valor')}/${cuenta('sin-marcar')}`
        : '—'
      const esen =
        f.palabrasEsencial == null
          ? '—'
          : `${f.palabrasEsencial}${techo.palabrasEsencial != null ? ` ${marca(f.palabrasEsencial <= techo.palabrasEsencial)}` : ''}`
      const nombre = f.final === f.ruta ? f.ruta : `${f.ruta} → ${f.final} (redirige)`
      lineas.push([nombre, capa, resp, jerga, siglas, cifras, f.palabras, esen].join(' | '))
    }
    const tabla = lineas.join('\n')
    console.log(`\n${tabla}\n`)
    await info.attach('medida-lecturas.txt', { body: tabla, contentType: 'text/plain' })
    await info.attach('medida-lecturas.json', {
      body: JSON.stringify(filas, null, 2),
      contentType: 'application/json',
    })

    // Lo único que falla: no haber medido. Una tabla vacía se leería como «todo
    // en orden».
    expect(filas.length, 'ninguna ruta medida').toBeGreaterThan(20)
    expect(
      filas.filter((f) => f.capas > 0).length,
      'ninguna capa vecinal encontrada',
    ).toBeGreaterThanOrEqual(8)
  })
})

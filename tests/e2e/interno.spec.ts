import { test, expect } from '@playwright/test'
import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { construirGrafoRutas, rutasRevisables } from '../../scripts/lib/route-graph'
import { leerDeDisco } from '../../scripts/lib/fichas-representativas'

/**
 * Lo que lee un vecino no lleva instrucciones para quien mantiene el sitio: ni
 * una orden (`npm run …`, `npx …`), ni una ruta del repositorio o de la caché
 * (`scripts/…`, `.cache/…`), ni el nombre de un fichero que el sitio no sirve.
 *
 * El 25-10-2026 /departamentos/:slug decía «npm run pleno-vote» (arreglado en
 * #423), y el 26-10-2026 /eficiencia explicaba las entregas que faltan con
 * «se pide con `npm run fetch:cesel-ccaa` y se guarda en .cache/cesel/ccaa».
 *
 * El nombre de un fichero PUBLICADO sí puede salir: «el listado completo está
 * en sindic-expedientes.json» le dice al lector qué descargar. Por eso un
 * `*.json` se acepta sólo si existe bajo public/data, y lo demás es interno.
 *
 * Se excluyen, con su motivo: /datos y /lab-health enseñan ficheros y campos;
 * /metodologia es el contrato publicado y nombra las herramientas con las que
 * se corrige, para que el proceso se pueda auditar. La prosa en inglés
 * (`lang="en"`, el blog técnico) cuenta cómo está hecho el sitio, y no se lee.
 */
const EXCLUIDAS = new Set(['/datos', '/lab-health', '/metodologia'])

const PUBLICADOS = new Set<string>()
;(function recorrer(dir: string) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) recorrer(p)
    else PUBLICADOS.add(f)
  }
})(resolve('public/data'))

/** Lo que nunca es para el lector, encuentre donde lo encuentre. */
const INTERNO: Array<[string, RegExp]> = [
  ['una orden npm', /\bnpm run [\w:.-]+/g],
  ['una orden npx/tsx', /\b(?:npx|tsx) [\w./:-]+/g],
  ['una ruta del repositorio', /(?<![\w/])(?:src|scripts|tests|editorial|bot\/src)\/[\w./-]+/g],
  ['una ruta oculta', /(?<![\w])\.(?:cache|husky|claude|github)\/[\w./-]*/g],
]

/**
 * Las palabras del taller: cómo lo llamamos dentro, no lo que el lector ve. El
 * 02-11-2026, re-medido: «claims» 32 veces en /laboratorio/prensa («sin claims
 * auditados» en cada titular), «Quejas asignadas por el router» en cada ficha
 * de cargo, «Ver tracker completo» y «Ver dashboard…» en la portada,
 * «Dashboard analítico» en /quejas y «MVP público» al pie de la barra lateral
 * de todas las páginas. Ésta se busca en la página entera, no sólo en <main>:
 * la barra lateral queda fuera de <main> y es lo que más se lee.
 */
const DEL_TALLER = /\b(?:claims?|router|tracker|dashboard|MVP)\b/gi

/** Los nombres de fichero `.json` que se mencionan y no se sirven. */
function jsonNoPublicados(texto: string): string[] {
  const nombres = texto.match(/[\w.-]+\.json\b/g) ?? []
  return [...new Set(nombres)].filter((n) => !PUBLICADOS.has(n.replace(/^.*\//, '')))
}

const grafo = construirGrafoRutas(resolve('src'))
const RUTAS = [
  ...new Set(
    rutasRevisables(grafo, leerDeDisco(resolve('public/data'))).map((c) => c.split(' [')[0]),
  ),
].filter((r) => !EXCLUIDAS.has(r))

async function textoVisible(page: import('@playwright/test').Page, ruta: string) {
  await page.goto(ruta, { waitUntil: 'domcontentloaded' })
  // Con tope: la portada no calla nunca (el mapa vivo; ver codigos.spec.ts).
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => (d.open = true))
    document
      .querySelectorAll<HTMLElement>('[lang^="en"]')
      .forEach((n) => (n.style.display = 'none'))
  })
  return page.evaluate(() => {
    const main = (document.querySelector('main') ?? document.body).innerText
    // Las palabras del taller se buscan en lo que escribimos, no en lo que se
    // imprime tal como llegó del dato (`data-literal`): una corrección firmada,
    // el resumen que guardó el verificador, el aviso del fichero curado de
    // promesas. Eso no se reescribe en la página; se corrige en su origen.
    const literales = [...document.querySelectorAll<HTMLElement>('[data-literal]')]
    const antes = literales.map((n) => n.style.display)
    literales.forEach((n) => (n.style.display = 'none'))
    const pagina = document.body.innerText
    literales.forEach((n, i) => (n.style.display = antes[i]))
    return { main, pagina }
  })
}

test('mide algo: los patrones cazan los casos reales y dejan pasar lo publicado', () => {
  const real = 'se pide con `npm run fetch:cesel-ccaa` y se guarda en .cache/cesel/ccaa.'
  expect(INTERNO.filter(([, re]) => new RegExp(re.source).test(real)).length).toBe(2)
  expect(jsonNoPublicados('el listado completo está en sindic-expedientes.json')).toEqual([])
  expect(jsonNoPublicados('lo guarda .automation-measurements.json')).toEqual([
    '.automation-measurements.json',
  ])
  expect(PUBLICADOS.has('coste-efectivo.json')).toBe(true)
  expect(RUTAS.length).toBeGreaterThan(30)
  expect('sin claims auditados · Quejas asignadas por el router'.match(DEL_TALLER)).toEqual([
    'claims',
    'router',
  ])
  // Palabras enteras, en mayúsculas o no: un plural no es la palabra.
  expect('Ver Dashboard · MVP'.match(DEL_TALLER)).toEqual(['Dashboard', 'MVP'])
  expect('dashboards, trackers y routers'.match(DEL_TALLER)).toBeNull()
})

for (const ruta of RUTAS) {
  test(`${ruta}: nada para quien mantiene el sitio`, async ({ page }) => {
    const { main: texto, pagina } = await textoVisible(page, ruta)
    const hallado = [
      ...INTERNO.flatMap(([que, re]) => (texto.match(re) ?? []).map((m) => `${que}: ${m}`)),
      ...jsonNoPublicados(texto).map((n) => `un fichero que no se sirve: ${n}`),
      ...(pagina.match(DEL_TALLER) ?? []).map((m) => `una palabra del taller: ${m}`),
    ]
    expect(hallado, `${ruta} enseña algo interno`).toEqual([])
  })
}

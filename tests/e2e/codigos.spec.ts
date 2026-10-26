import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { construirGrafoRutas, rutasRevisables } from '../../scripts/lib/route-graph'
import { leerDeDisco } from '../../scripts/lib/fichas-representativas'
import { CATALOGUE } from '../../src/i18n'
import { ESTADO_LLANO } from '../../src/lib/estado-llano'
import { CLAIM_VERDICTS, PASADAS } from '../../src/scraper/claim-verdicts'
import { ALLOWED_ASSIGNMENT_KINDS } from '../../src/scraper/journalist'
import { ESTADOS_ESPERADO } from '../../src/scraper/coste-esperado'

/**
 * Ningún código de un vocabulario de EstadoLlano llega tal cual al texto que se
 * lee. La prueba unitaria (`tests/estado-llano.test.js`) asegura que cada código
 * TIENE rótulo; ésta, que la página lo USA. El 26-10-2026 cuatro páginas
 * pintaban el código: «SIN-DATOS» en /declaraciones, «biography» en cada
 * tarjeta de /laboratorio/agentes, «muestra-insuficiente» en
 * /laboratorio/coste-esperado y «verdict-engine» en /laboratorio/cobertura.
 *
 * Las rutas son las de la revisión lectora, como en titulos.spec.ts. Se excluyen
 * tres, con su motivo: /metodologia es el contrato publicado y nombra los
 * códigos de los datos a propósito, para que quien descargue un fichero sepa qué
 * lee; /datos y /lab-health enseñan ficheros y campos.
 */
const VOCABULARIOS: Record<keyof typeof ESTADO_LLANO, readonly string[]> = {
  veredicto: CLAIM_VERDICTS,
  encargo: ALLOWED_ASSIGNMENT_KINDS,
  pasada: PASADAS,
  especificacionEsperada: ESTADOS_ESPERADO,
}
const NOMBRAN_CODIGOS = new Set(['/metodologia', '/datos', '/lab-health'])

// Un código que se escribe igual que su rótulo («parcial») no se puede delatar
// en el texto, y no hace falta: el lector ya lee la palabra.
const CODIGOS = Object.entries(VOCABULARIOS).flatMap(([tipo, valores]) =>
  valores.filter((v) => {
    const rotulo = CATALOGUE.es[`${ESTADO_LLANO[tipo as keyof typeof ESTADO_LLANO]}.${v}`]
    return rotulo?.toLowerCase() !== v.toLowerCase()
  }),
)

const grafo = construirGrafoRutas(resolve('src'))
const RUTAS = [
  ...new Set(
    rutasRevisables(grafo, leerDeDisco(resolve('public/data'))).map((c) => c.split(' [')[0]),
  ),
].filter((r) => !NOMBRAN_CODIGOS.has(r))

/**
 * El texto que se lee, con los pliegues abiertos y sin la prosa en inglés
 * (`lang="en"`, /about y el blog): allí «profile» o «investigation» son palabras.
 */
async function textoVisible(page: import('@playwright/test').Page, ruta: string) {
  await page.goto(ruta, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    document.querySelectorAll('details').forEach((d) => (d.open = true))
    document
      .querySelectorAll<HTMLElement>('[lang^="en"]')
      .forEach((n) => (n.style.display = 'none'))
  })
  return page.evaluate(() => (document.querySelector('main') ?? document.body).innerText)
}

/**
 * Un código compuesto («sin-datos») no es nunca una palabra, y se busca sin
 * distinguir mayúsculas porque el CSS lo puede subir («SIN-DATOS»). Uno de una
 * palabra se busca tal cual se escribe el código, en minúscula: «NLI» o «LLM»
 * en una frase son siglas, no la marca `nli` pintada.
 */
const patron = (c: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}_-])${c}(?=$|[^\\p{L}\\p{N}_-])`, /[-_]/.test(c) ? 'iu' : 'u')

test('mide algo: hay códigos que vigilar, rutas que leer, y la página los rotula', async ({
  page,
}) => {
  expect(CODIGOS).toContain('sin-datos')
  expect(CODIGOS).toContain('biography')
  expect(RUTAS.length).toBeGreaterThan(30)
  // /declaraciones pinta el recuento de «sin datos»: sin esto, una página que no
  // cargara pasaría la prueba de abajo sin haber enseñado nada.
  const texto = await textoVisible(page, '/declaraciones')
  expect(texto.toLowerCase()).toContain(
    CATALOGUE.es['declaraciones.veredicto.sin-datos'].toLowerCase(),
  )
})

for (const ruta of RUTAS) {
  test(`${ruta}: ningún código de estado tal cual`, async ({ page }) => {
    const texto = await textoVisible(page, ruta)
    const vistos = CODIGOS.filter((c) => patron(c).test(texto))
    expect(vistos, `${ruta} pinta el código en vez del rótulo`).toEqual([])
  })
}

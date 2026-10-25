import { test, expect, type Page } from '@playwright/test'
import { resolve } from 'node:path'
import { construirGrafoRutas, rutasRevisables } from '../../scripts/lib/route-graph'
import { leerDeDisco } from '../../scripts/lib/fichas-representativas'

/**
 * Cada página tiene UN `<h1>` y un `document.title` propio.
 *
 * El 25-10-2026, 15 de las 33 rutas leídas no tenían `<h1>`. Su título
 * visible era un `div` o un `h2` con estilo, así que ni un lector de pantalla
 * ni quien salta por encabezados encontraba de qué iba la página. El título de
 * la pestaña lo ponían cinco páginas. El resto heredaba el de la página por la
 * que se había entrado: el HTML que escribe `prerender-meta` trae el título de
 * SU ruta, y nada lo cambiaba al navegar dentro de la aplicación. `/gestion`
 * salía como «Novedades · CivicPulse» si se llegaba desde /cambios.
 *
 * La lista de rutas no está escrita aquí: es la de la revisión lectora
 * (`rutasRevisables`). Son todas las rutas públicas de App.jsx más una ficha
 * real de cada ruta con parámetro, elegida de los datos por
 * `fichas-representativas`. Una ruta nueva entra sola, y una plantilla de
 * detalle se mira con una ficha que existe.
 *
 * El axe de a11y.spec.ts no lo veía: `page-has-heading-one` es una regla de
 * buenas prácticas, fuera de las etiquetas wcag2a/wcag2aa que filtra (lo
 * cuenta landing.spec.ts).
 */
const SITIO = 'CivicPulse · Riba-roja de Túria'

const grafo = construirGrafoRutas(resolve('src'))
const RUTAS = [
  ...new Set(
    // «/plenos/k4olcs [pestanas]» es una clave con estado de la revisión: aquí
    // basta la URL.
    rutasRevisables(grafo, leerDeDisco(resolve('public/data'))).map((c) => c.split(' [')[0]),
  ),
]
const CON_PARAMETRO = new Set(grafo.rutas.filter((r) => r.includes(':')))

/** La ruta de la plantilla de la que sale una ficha: `/cargos/x` → `/cargos/:slug`. */
function plantillaDe(ruta: string): string | null {
  for (const p of CON_PARAMETRO) {
    const re = new RegExp('^' + p.replace(/:[A-Za-z]+/g, '[^/]+') + '$')
    if (re.test(ruta)) return p
  }
  return null
}

async function h1sYTitulo(page: Page, ruta: string) {
  await page.goto(ruta, { waitUntil: 'domcontentloaded' })
  // El `<h1>` de una ficha sale del dato (el nombre de un cargo, la fecha de
  // un pleno), así que se espera a que tenga texto, no sólo a que exista.
  await page
    .waitForFunction(
      () => [...document.querySelectorAll('h1')].some((h) => h.textContent?.trim()),
      {
        timeout: 15_000,
      },
    )
    .catch(() => {})
  return page.evaluate(() => ({
    h1: [...document.querySelectorAll('h1')].map((h) => (h.textContent || '').trim()),
    titulo: document.title,
  }))
}

test('la lista de rutas sale del grafo y trae fichas de detalle', () => {
  // Que la prueba de abajo mire algo: sin esto, un grafo vacío daría verde.
  expect(RUTAS.length).toBeGreaterThan(30)
  expect(RUTAS.some((r) => plantillaDe(r))).toBe(true)
})

for (const ruta of RUTAS) {
  test(`${ruta}: un <h1> con texto y un título propio`, async ({ page }) => {
    const { h1, titulo } = await h1sYTitulo(page, ruta)

    expect(h1, 'exactamente un <h1>').toHaveLength(1)
    expect(h1[0], 'el <h1> dice algo').not.toBe('')

    if (ruta === '/') {
      expect(titulo).toBe(SITIO)
      return
    }
    expect(titulo, 'el título acaba en el nombre del sitio').toMatch(
      new RegExp(` · ${SITIO.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    )
    expect(titulo, 'el título no es el del sitio a secas').not.toBe(SITIO)

    // Una ficha no se titula como su sección: «Teresa Pozuelo Martín · …», no
    // «Cargos · …». Se compara con el título de la ruta madre servida tal cual.
    const plantilla = plantillaDe(ruta)
    if (plantilla) {
      const madre = '/' + plantilla.split('/')[1]
      const deLaMadre = (await h1sYTitulo(page, madre)).titulo
      expect(titulo, `${ruta} se titula igual que ${madre}`).not.toBe(deLaMadre)
    }
  })
}

test('el título sigue a la navegación dentro de la aplicación', async ({ page }) => {
  // El caso que se vio: se entra por /cambios y se navega a /gestion sin
  // recargar. Antes, la pestaña seguía diciendo «Novedades».
  await page.goto('/cambios', { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveTitle(/^Novedades · /)
  await page.getByRole('navigation').getByRole('link', { name: 'Presupuesto' }).first().click()
  await expect(page).toHaveURL(/\/presupuesto$/)
  await expect(page).toHaveTitle(/^Presupuesto · /)
})

import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { collectErrors, appErrors } from './_console'

/**
 * La ventana LOREG, comprobada donde importa: en la página.
 *
 * `/aviso-legal` promete que quien aparece nombrado como titular de una
 * competencia delegada desaparece «de las dos páginas» durante el periodo
 * electoral (LOREG art. 50). Eso es una promesa del contrato editorial
 * publicado, y hasta el 24-08-2026 **era falsa en `/gestion`**: allí no había
 * nombres que congelar porque `PanelMunicipal` nunca los recibió. Nadie se
 * enteró porque el único test de la congelación
 * (`tests/competencias-freeze-agreement.test.ts`) comprueba la función pura
 * `nombresVisibles` — que las tres lecturas de la fecha coincidan— y no que una
 * página deje de pintar a una persona.
 *
 * LAS DOS MITADES SON OBLIGATORIAS, y esa es toda la gracia. «Congelada: cero
 * nombres» pasa igual de verde con la capa entera desconectada, con la página
 * en blanco o con un selector mal escrito — es el «verde por no ejecutarse» que
 * este repositorio ya ha pagado dos veces (la spec móvil cuyo pase lo daba el
 * propio bug de recorte, y la puerta de contraste que no evaluaba nada). Así
 * que primero se exige que SIN congelar haya nombres, y sólo entonces significa
 * algo que con congelación no haya ninguno.
 *
 * La fecha se inyecta interceptando `promises.json` — el mismo interruptor que
 * `npm run freeze:set` — en vez de tocar el fichero curado, que está bajo la
 * guarda de escrituras y no debe moverse para un test.
 */

const COMPETENCIAS = JSON.parse(readFileSync('public/data/competencias.json', 'utf8'))
const PROMESAS = JSON.parse(readFileSync('public/data/promises.json', 'utf8'))
const PANEL = JSON.parse(readFileSync('public/data/indicadores.json', 'utf8'))

/** Los nombres que el mapa firmado puede llegar a pintar. Del fichero, no a mano. */
const NOMBRES: string[] = [
  ...new Set((COMPETENCIAS.asignaciones ?? []).map((a: { nombre: string }) => a.nombre)),
] as string[]

type Etiquetado = { id: string; etiqueta: string; panel?: string; valor: number | null }

/**
 * Un ANCLA por página: una tarjeta que sólo existe DESPUÉS de que el snapshot
 * cargue. Sin esto la mitad congelada era vacua — «cero nombres» también es
 * verdad en una página en blanco que aún no ha pedido su JSON, y la primera
 * pasada de esta spec salió «2 flaky» justamente por ahí. Se espera al ancla y
 * sólo entonces se cuenta; así el cero significa «la capa decidió no pintar» y
 * no «todavía no había nada».
 *
 * La etiqueta sale del propio snapshot, no escrita a mano: si el panel cambia
 * de indicadores, el ancla le sigue.
 */
const PAGINAS = [
  {
    // Con el fragmento, no a secas: desde que los seis apartados de
    // /eficiencia son pestañas, la capa de competencias vive en el libro de
    // servicios y el libro no es la pestaña por defecto. Entrar por
    // «/eficiencia» y contar nombres daría CERO en las dos direcciones —y la
    // prueba de la ventana congelada pasaría en verde sin haber congelado
    // nada, que es exactamente la puerta hueca que este fichero vigila.
    ruta: '/eficiencia#sec-servicios',
    h1: /¿Cuánto cuesta y qué se obtiene\?/i,
    ancla: (PANEL.indicadores as Etiquetado[]).find((i) => i.valor !== null)!.etiqueta,
  },
  {
    ruta: '/gestion',
    h1: /Cómo funciona la casa por dentro/i,
    ancla: (PANEL.municipales as Etiquetado[]).find(
      (m) => m.panel === 'gestion' && m.valor !== null,
    )!.etiqueta,
  },
]

/** Muy por delante de cualquier `frozenUntil` real: la ventana está abierta. */
const DENTRO_DE_LA_VENTANA = '2099-01-01'

async function congelar(page: Page) {
  await page.route('**/data/promises.json', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...PROMESAS, frozenUntil: DENTRO_DE_LA_VENTANA }),
    })
  })
}

/** Monta la ruta, salta si falta la bandera, y espera a que el panel CARGUE. */
async function montar(page: Page, ruta: string, h1: RegExp, ancla: string): Promise<void> {
  const errores = collectErrors(page)
  await page.goto(ruta, { waitUntil: 'domcontentloaded' })
  const montada = await page
    .getByRole('heading', { name: h1 })
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  if (!montada && appErrors(errores).length > 0) {
    throw new Error(
      `${ruta} no montó Y la consola trae errores — está rota, no apagada:\n` +
        appErrors(errores).join('\n'),
    )
  }
  test.skip(!montada, `${ruta} no está montada — reconstruye con VITE_ENABLE_EFICIENCIA=true`)

  // El h1 es estático; el ancla no. Esperar sólo al h1 dejaba contar el texto
  // antes de que llegara el snapshot, y entonces «cero nombres» no significaba
  // nada. `.first()` porque la etiqueta se repite (tarjeta + mini-serie).
  await expect(page.getByText(ancla, { exact: false }).first()).toBeVisible({ timeout: 15000 })
}

/**
 * Cuántas veces aparece cada cosa en lo que un navegador pintó.
 *
 * `etiquetas` cuenta ENLACES de atribución —uno por cargo nombrado, apuntando a
 * su ficha en /cargos— y no el rótulo «Competencia delegada». El rótulo era el
 * proxy mientras la capa vivía sólo en tarjetas; el libro de servicios la pinta
 * como una columna con otra cabecera, y contar el rótulo daba cero con
 * veintidós nombres a la vista. El enlace es la afirmación de verdad: es lo que
 * lleva de una cifra a una persona, y es lo que la ventana LOREG apaga.
 */
async function cuenta(page: Page): Promise<{ etiquetas: number; nombres: number }> {
  const texto = await page.locator('body').innerText()
  const slugs = new Set((COMPETENCIAS.asignaciones as { oficial: string }[]).map((a) => a.oficial))
  const enlaces = await page
    .locator('a[href^="/cargos/"]')
    .evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href') ?? ''))
  return {
    etiquetas: enlaces.filter((h) => slugs.has(h.replace('/cargos/', ''))).length,
    nombres: NOMBRES.filter((n) => texto.includes(n)).length,
  }
}

test.describe('Ventana LOREG · la capa de nombres', () => {
  test('el mapa firmado tiene nombres que congelar (si no, esto no mide nada)', () => {
    expect(NOMBRES.length).toBeGreaterThan(0)
    expect(COMPETENCIAS.asignaciones.length).toBeGreaterThan(0)
  })

  for (const { ruta, h1, ancla } of PAGINAS) {
    test(`${ruta} · SIN congelar pinta nombres`, async ({ page }) => {
      await montar(page, ruta, h1, ancla)
      const { etiquetas, nombres } = await cuenta(page)
      expect(etiquetas, `${ruta} no pinta ninguna «Competencia delegada»`).toBeGreaterThan(0)
      expect(nombres, `${ruta} no nombra a nadie de competencias.json`).toBeGreaterThan(0)
    })

    test(`${ruta} · congelada no pinta ninguno`, async ({ page }) => {
      await congelar(page)
      await montar(page, ruta, h1, ancla)
      const { etiquetas, nombres } = await cuenta(page)
      expect(etiquetas, `${ruta} sigue rotulando competencias dentro de la ventana`).toBe(0)
      expect(nombres, `${ruta} sigue nombrando a alguien dentro de la ventana`).toBe(0)
    })
  }
})

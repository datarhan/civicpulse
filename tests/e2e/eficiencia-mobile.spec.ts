import { test, expect, type Page } from '@playwright/test'
import { collectErrors, appErrors } from './_console'

/**
 * /eficiencia y /gestion en un teléfono: ningún bloque pasa el borde de su caja.
 *
 * La nota de cobertura de /eficiencia reparte sus párrafos en una rejilla
 * `repeat(auto-fit, minmax(330px, 1fr))`. `auto-fit` decide CUÁNTAS columnas
 * caben, pero no encoge la última que queda: a 375 px la tarjeta deja 285 px de
 * caja y la única columna seguía midiendo 330, así que los bloques de la nota
 * —los dos avisos con filete ámbar incluidos— iban de x=45 a x=375: 45 px fuera
 * de la caja, 24 fuera de la tarjeta y pegados al borde de la pantalla. Medido
 * el 29-09-2026 sobre la build de producción. Cambiar el texto de un párrafo
 * por «x» no lo movía: era la pista, no el contenido.
 *
 * `mobile.spec.ts` tiene /eficiencia en su lista y aun así no podía verlo: mide
 * lo que ensancha el DOCUMENTO, y 45 + 330 = 375 justo, así que `scrollWidth`
 * seguía en 375 con el defecto dentro. A 360 px el mismo defecto sí ensanchaba
 * la página (376), y a 414 se salía 6 px. Aquí se mide cada bloque contra su
 * propia caja.
 *
 * Por qué también 320 px: las otras tres rejillas `auto-fit` de estas páginas
 * —«Cómo se lee», «Lo que estas cifras permiten concluir» y las preguntas
 * registradas— tenían el mismo suelo fijo, de 260 y 280 px, que a 375 cabe y a
 * 320 se salía entre 8 y 30 px. Una guarda sólo a 375 no vería una rejilla
 * nueva con un suelo de 250.
 *
 * Se miden los BLOQUES y no las pistas: con `auto-fit` las columnas sobrantes
 * colapsan a 0 px y sumarlas con sus huecos da excesos que no existen.
 */

type Ruta = { path: string; h1: RegExp; seccion: string }

// Cada ruta, con la sección cuya rejilla prueba que se midió algo. Son anclas
// publicadas —los permalinks no cambian—, no clases de maquetación.
const RUTAS: Ruta[] = [
  { path: '/eficiencia', h1: /Cuánto cuesta y qué se obtiene/i, seccion: 'sec-cobertura' },
  { path: '/gestion', h1: /Cómo funciona la casa por dentro/i, seccion: 'sec-preguntas' },
]

const ANCHOS = [375, 320]

/**
 * Abre la ruta y espera a su sección, que sólo se pinta con el snapshot dentro:
 * medir antes sería medir una página vacía, que cabe siempre.
 *
 * Salta sólo si la bandera dejó la ruta fuera. Una ruta reventada tampoco monta
 * su h1, y saltar ahí convertiría un crash en verde (eficiencia.spec.ts cuenta
 * cuándo pasó).
 */
async function montar(page: Page, ruta: Ruta) {
  const errores = collectErrors(page)
  await page.goto(ruta.path, { waitUntil: 'domcontentloaded' })
  const montada = await page
    .getByRole('heading', { name: ruta.h1 })
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => true)
    .catch(() => false)
  if (!montada && appErrors(errores).length > 0) {
    throw new Error(
      `${ruta.path} no montó Y la consola trae errores — la página está rota, no apagada:\n` +
        appErrors(errores).join('\n'),
    )
  }
  test.skip(!montada, `${ruta.path} no está montada — reconstruye con VITE_ENABLE_EFICIENCIA=true`)
  await expect(page.locator(`#${ruta.seccion}`)).toBeVisible({ timeout: 8000 })
}

/** Pone el ancho y deja que la maquetación se asiente: fuentes y dos cuadros. */
async function aAncho(page: Page, width: number) {
  await page.setViewportSize({ width, height: 812 })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  )
}

test('/eficiencia: cada bloque de la nota de cobertura cabe en la caja de su tarjeta', async ({
  page,
}) => {
  await montar(page, RUTAS[0])
  const tarjeta = page.locator('#sec-cobertura .cp-card').first()

  for (const width of ANCHOS) {
    await aAncho(page, width)
    const m = await tarjeta.evaluate((t) => {
      const cs = getComputedStyle(t)
      const b = t.getBoundingClientRect()
      const izq = b.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)
      const der = b.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight)
      const rejilla = [...t.children].find((h) => getComputedStyle(h).display === 'grid')
      const bloques = [...(rejilla?.children ?? [])]
        .map((h) => {
          const r = h.getBoundingClientRect()
          return {
            texto: (h.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 60),
            izq: r.left,
            der: r.right,
            pintado: r.width > 0 && r.height > 0,
          }
        })
        .filter((x) => x.pintado)
      return { izq, der, bloques }
    })

    // Que haya medido la nota, y no una tarjeta sin rejilla: la caja tiene
    // ancho, hay más de un bloque y entre ellos está el que abre la nota.
    expect(m.der - m.izq, `${width} px · la tarjeta de cobertura no tiene caja`).toBeGreaterThan(0)
    expect(m.bloques.length, `${width} px · la nota no tiene bloques`).toBeGreaterThan(1)
    expect(
      m.bloques.some((x) => /servicios que este panel sigue/i.test(x.texto)),
      `${width} px · no se midió el párrafo que abre la nota`,
    ).toBe(true)

    const fuera = m.bloques
      .filter((x) => x.der > m.der + 0.5 || x.izq < m.izq - 0.5)
      .map(
        (x) =>
          `«${x.texto}» va de ${Math.round(x.izq)} a ${Math.round(x.der)} en una caja de ${Math.round(m.izq)} a ${Math.round(m.der)}`,
      )
    expect(fuera, `${width} px · bloques de la nota fuera de la caja de su tarjeta`).toEqual([])
  }
})

for (const ruta of RUTAS) {
  test(`${ruta.path}: ninguna rejilla pinta un bloque fuera de su caja`, async ({ page }) => {
    await montar(page, ruta)

    for (const width of ANCHOS) {
      await aAncho(page, width)
      const rejillas = await page.evaluate(() => {
        const pintado = (el: Element) => {
          const r = el.getBoundingClientRect()
          return r.width > 0 && r.height > 0
        }
        return [...document.querySelectorAll('main *')]
          .filter((el) => getComputedStyle(el).display.endsWith('grid') && pintado(el))
          .map((g) => {
            const cs = getComputedStyle(g)
            const b = g.getBoundingClientRect()
            const izq = b.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)
            const der = b.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight)
            const bloques = [...g.children].filter(pintado)
            const pasa = Math.max(
              0,
              ...bloques.map((h) => {
                const r = h.getBoundingClientRect()
                return Math.max(r.right - der, izq - r.left)
              }),
            )
            return {
              seccion: g.closest('[id^="sec-"]')?.id ?? null,
              plantilla: (g as HTMLElement).style.gridTemplateColumns || cs.gridTemplateColumns,
              caja: Math.round(der - izq),
              bloques: bloques.length,
              pasa: Math.round(pasa * 10) / 10,
              texto: (g.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50),
            }
          })
      })

      // Que haya medido algo: una rejilla con bloques dentro de la sección que
      // ancla la ruta. Sin ella la lista de abajo sale vacía y pasa sola.
      expect(
        rejillas.some((g) => g.seccion === ruta.seccion && g.bloques > 0),
        `${width} px · ninguna rejilla con bloques en #${ruta.seccion} (${rejillas.length} medidas en total)`,
      ).toBe(true)
      expect(
        rejillas.filter((g) => g.pasa > 0.5),
        `${width} px · rejillas con un bloque fuera de su caja`,
      ).toEqual([])
    }
  })
}

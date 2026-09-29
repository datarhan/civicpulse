import { test, expect, type Page } from '@playwright/test'
import { FIRST_PLENO_ID } from './_rutas'

/**
 * La tira de resumen de /plenos/:id —orden del día, votaciones, declaraciones
 * contrastadas, hallazgos editoriales—: cada rótulo cabe en su ficha.
 *
 * Eran cuatro columnas a cualquier ancho, declaradas en el `style` del JSX. Un
 * rótulo no se parte dentro de una palabra, y «DECLARACIONES» —trece letras de
 * DM Mono en mayúsculas, con su espaciado— pide 94 px. Medido el 29-09-2026
 * sobre la build de producción: a 375 px cada ficha dejaba 48 px de caja, y ese
 * rótulo se pintaba 46 px encima de la ficha de al lado; «Votaciones» se salía
 * 24 y «Hallazgos editoriales» 32, hasta el margen de la página. A 320 px la
 * página ya tenía scroll horizontal (328 de ancho).
 *
 * Por qué no lo veía `mobile.spec.ts`, que tiene esta ruta en su lista: mide lo
 * que ensancha el DOCUMENTO, y a 375 px el texto más a la derecha acababa en
 * 369,6, dentro de la página. Aquí se mide el texto PINTADO de cada ficha —los
 * rectángulos de un `Range` sobre su contenido— contra la caja de contenido de
 * la ficha, que es la única comparación que ve un rótulo encima del vecino.
 *
 * Por qué se recorre el ancho de la TIRA y no el de la ventana: por encima de
 * 720 px aparece la barra lateral (232 px) y la tira ENCOGE —a 721 px de ventana
 * mide 441; a 720 medía 672—, así que el mismo defecto salía en dos tramos de
 * ventana sin relación aparente, de 280 a 556 px y de 724 a 788, con la tableta
 * de 768 dentro. Por eso la tira se decide con una consulta de contenedor
 * (`.cp-pleno-resumen`, src/index.css), y esta prueba le fija a ese contenedor,
 * de píxel en píxel, cada ancho que puede tener: desde el que le deja la
 * ventana más estrecha en uso (280 px, la pantalla exterior de un plegable)
 * hasta el que tiene en escritorio. Es exacto y cuesta menos que tres anchos de
 * ventana. Después mira cuatro ventanas de verdad —320, 375, 768 con la barra
 * lateral y 1280—, que es donde se ve que la página le da a la tira el ancho que
 * el recorrido supone.
 *
 * La densidad amplia es el peor caso: su raíz de 15 px sube --fs-micro por
 * encima de su suelo de 11 px y los rótulos ensanchan un 7 %. Se recorre con
 * ella y con la de serie, y en los dos idiomas: hoy el valenciano pide menos en
 * las cuatro fichas, pero eso lo decide una traducción, no esta prueba.
 *
 * Y cuenta lo que midió: cuatro fichas con texto pintado en cada ancho. Una tira
 * que dejara de pintarse, o una clase que cambiara de nombre, daría verde sin
 * mirar nada.
 */

type Medida = {
  ancho: number
  columnas: number
  fichas: { rotulo: string; trozos: number; sale: number; arriba: number }[]
}

/**
 * Mide la tira tal como está o, con `anchos`, fijándole antes cada ancho a su
 * contenedor. Lo que «sale» de una ficha es lo que su texto pintado pasa de su
 * caja de contenido, sin borde ni relleno.
 */
async function medir(page: Page, anchos: number[] | null = null): Promise<Medida[] | null> {
  return page.evaluate((anchos) => {
    const caja = document.querySelector<HTMLElement>('.cp-pleno-resumen')
    const tira = caja?.querySelector<HTMLElement>('.cp-pleno-fichas')
    if (!caja || !tira) return null
    const una = () => ({
      ancho: Math.round(tira.getBoundingClientRect().width * 10) / 10,
      columnas: getComputedStyle(tira).gridTemplateColumns.split(' ').length,
      fichas: [...tira.children].map((f) => {
        const cs = getComputedStyle(f)
        const b = f.getBoundingClientRect()
        const izq = b.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)
        const der = b.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight)
        const r = document.createRange()
        r.selectNodeContents(f)
        const trozos = [...r.getClientRects()].filter((x) => x.width > 0)
        return {
          rotulo: (f.firstElementChild?.textContent ?? '').trim(),
          trozos: trozos.length,
          sale: Math.max(0, ...trozos.map((x) => Math.max(x.right - der, izq - x.left))),
          arriba: Math.round(b.top),
        }
      }),
    })
    if (!anchos) return [una()]
    const medidas = anchos.map((w) => {
      caja.style.width = `${w}px`
      return una()
    })
    caja.style.width = ''
    return medidas
  }, anchos)
}

/**
 * Lo que no cuadra en una serie de medidas, con los anchos seguidos agrupados en
 * tramos para que un fallo en setecientos anchos se lea en tres líneas. Un tramo
 * se corta donde hay un ancho que sí cabe: dos tramos son dos defectos.
 */
function fallos(medidas: Medida[], donde: string): string[] {
  const vacias = medidas
    .filter((m) => m.fichas.length !== 4 || m.fichas.some((f) => !f.rotulo || f.trozos === 0))
    .map((m) => `${donde} · tira de ${m.ancho} px: ${m.fichas.length} fichas, o alguna sin texto`)
  const tramos = new Map<string, { desde: number; hasta: number; peor: number }[]>()
  medidas.forEach((m, i) => {
    for (const f of m.fichas) {
      if (f.sale <= 0.5) continue
      const suyos = tramos.get(f.rotulo) ?? []
      const ultimo = suyos.at(-1)
      const seguido = ultimo && medidas[i - 1]?.ancho === ultimo.hasta
      if (seguido) {
        ultimo.hasta = m.ancho
        ultimo.peor = Math.max(ultimo.peor, f.sale)
      } else suyos.push({ desde: m.ancho, hasta: m.ancho, peor: f.sale })
      tramos.set(f.rotulo, suyos)
    }
  })
  const fuera = [...tramos].flatMap(([rotulo, suyos]) =>
    suyos.map(
      (t) =>
        `${donde} · «${rotulo}» se sale de su ficha con la tira de ${t.desde} a ${t.hasta} px (hasta ${t.peor.toFixed(1)} px)`,
    ),
  )
  return [...vacias, ...fuera]
}

/** Abre la sesión con la densidad y el idioma pedidos y espera a sus cuatro fichas. */
async function montar(page: Page, densidad: string, idioma: string) {
  await page.addInitScript(
    ({ densidad, idioma }) => {
      localStorage.setItem('cp:tweaks', JSON.stringify({ dark: false, density: densidad }))
      localStorage.setItem('cp:lang', idioma)
    },
    { densidad, idioma },
  )
  await page.goto(`/plenos/${FIRST_PLENO_ID}`, { waitUntil: 'domcontentloaded' })
  await expect(
    page.locator('.cp-pleno-resumen .cp-pleno-fichas > *'),
    'la tira de resumen no pintó sus cuatro fichas',
  ).toHaveCount(4, { timeout: 20_000 })
  // Las métricas de DM Mono, y un cuadro pintado: medir con la fuente de reserva
  // es medir otra cosa.
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

/** Pone el ancho de ventana y deja que la maquetación se asiente. */
async function aVentana(page: Page, width: number) {
  await page.setViewportSize({ width, height: 812 })
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  )
}

const COMBINACIONES = [
  { densidad: 'comfortable', idioma: 'es' },
  { densidad: 'spacious', idioma: 'es' },
  { densidad: 'comfortable', idioma: 'ca' },
  { densidad: 'spacious', idioma: 'ca' },
]

for (const { densidad, idioma } of COMBINACIONES) {
  test(`/plenos/:id · cada rótulo cabe en su ficha, a cualquier ancho de la tira (${idioma}, ${densidad})`, async ({
    page,
  }) => {
    await montar(page, densidad, idioma)

    // Los dos extremos salen de la página, no de este fichero.
    await aVentana(page, 280)
    const estrecha = await medir(page)
    await aVentana(page, 1280)
    const ancha = await medir(page)
    expect(estrecha, 'no encontró la tira a 280 px').not.toBeNull()
    expect(ancha, 'no encontró la tira a 1280 px').not.toBeNull()

    const desde = Math.floor(estrecha![0].ancho)
    const hasta = Math.floor(ancha![0].ancho)
    const anchos = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i)
    const medidas = (await medir(page, anchos)) ?? []

    // Que haya recorrido algo: cientos de anchos, no un puñado.
    expect(hasta - desde, `la tira va de ${desde} a ${hasta} px`).toBeGreaterThan(400)
    expect(medidas.length, 'medidas del recorrido').toBe(anchos.length)
    expect(fallos(medidas, `${idioma} · ${densidad}`)).toEqual([])
  })
}

test('/plenos/:id · la tira cabe en ventanas de verdad, y en escritorio sigue siendo una fila de cuatro', async ({
  page,
}) => {
  await montar(page, 'comfortable', 'es')

  for (const width of [320, 375, 768, 1280]) {
    await aVentana(page, width)
    const medidas = await medir(page)
    expect(medidas, `${width} px · no encontró la tira`).not.toBeNull()
    expect(fallos(medidas!, `ventana de ${width} px`)).toEqual([])

    if (width === 1280) {
      const [m] = medidas!
      expect(m.columnas, '1280 px · la tira de escritorio tiene cuatro columnas').toBe(4)
      expect(
        new Set(m.fichas.map((f) => f.arriba)).size,
        '1280 px · las cuatro fichas van en la misma fila',
      ).toBe(1)
    }
  }
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * La tarjeta social dice lo que dice la fuente, y en su orden.
 *
 * `docs/DESCRIPCION.md` fijó el 2026-09-08 que toda descripción empieza por
 * **quién** y sigue por **medir**: el sitio ya empezaba por ahí —`/cargos` es la
 * primera ruta tras la portada— y la descripción hablaba de dinero y de promesas
 * sin mencionar a nadie.
 *
 * El PR que llevó ese orden a las etiquetas de texto de `index.html`
 * (`description`, `og:description`, `twitter:description`) dejó fuera las DOS
 * superficies que describen la imagen: el `aria-label` de `public/og.svg` y el
 * `og:image:alt`. O sea que la pieza más vista del proyecto —la que se abre en
 * WhatsApp— siguió meses anunciando «qué hace el ayuntamiento, con una cita por
 * cada afirmación», el orden retirado y una promesa que el one-liner ya no hace.
 *
 * `tests/metaetiquetas.test.js` vigila las tres de texto. Esto vigila las dos de
 * la imagen, con la misma regla: **el texto se DERIVA del one-liner**, no se
 * recita aquí. Una copia escrita en este fichero dejaría la prueba verde
 * mientras el documento y la tarjeta se separan, que es exactamente cómo se
 * produjo el desfase que arregla.
 *
 * Lo que NO comprueba: el aspecto. Que una línea se salga de la caja no lo ve
 * ninguna suite —la tarjeta es una imagen—, así que eso se mide en el navegador
 * al rasterizar (`scripts/render-og.mjs` ya exige que las fuentes de marca hayan
 * cargado antes de escribir el PNG).
 */
const RAIZ = join(__dirname, '..')
const SVG = readFileSync(join(RAIZ, 'public/og.svg'), 'utf8')
const HTML = readFileSync(join(RAIZ, 'index.html'), 'utf8')
const DESCRIPCION = readFileSync(join(RAIZ, 'docs/DESCRIPCION.md'), 'utf8')

/**
 * El one-liner ES: la cita que sigue a su encabezado, con las líneas unidas.
 *
 * Misma forma que `tests/metaetiquetas.test.js`, a propósito: las dos leen la
 * misma sección del mismo documento, y si el encabezado se renombra las dos
 * tienen que enterarse igual.
 */
function oneLiner(md) {
  const m = /^### One-liner ES\s*\n+((?:>.*\n?)+)/m.exec(md)
  if (!m) return null
  return m[1]
    .split('\n')
    .map((l) => l.replace(/^>\s?/, '').trim())
    .filter(Boolean)
    .join(' ')
}

const ariaLabel = /aria-label="([^"]+)"/.exec(SVG)?.[1]?.trim() ?? null
const imageAlt =
  /<meta[^>]*property="og:image:alt"[^>]*content="([^"]*)"/.exec(HTML)?.[1]?.trim() ??
  // El atributo `content` puede ir en la línea siguiente al `property`.
  /property="og:image:alt"\s*\n\s*content="([^"]*)"/.exec(HTML)?.[1]?.trim() ??
  null

/** El texto visible de la tarjeta, en orden de aparición. */
const textoTarjeta = [...SVG.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)]
  .map((m) =>
    m[1]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
  .filter(Boolean)
  .join(' ')

/** «quién» antes que «qué hace», que es el orden que fija la fuente. */
function ordenCorrecto(frase) {
  const s = frase.toLowerCase()
  const quien = s.indexOf('quién dirige')
  const queHace = s.indexOf('qué hace')
  return { quien, queHace, ok: quien >= 0 && queHace > quien }
}

describe('la tarjeta social sigue el orden de la fuente', () => {
  const esperado = oneLiner(DESCRIPCION)

  // Anti-hueco. Sin esto, un encabezado renombrado o un atributo escrito de otra
  // forma dejarían las comparaciones de abajo midiendo null contra null: verde
  // por no haber mirado nada.
  it('mide algo: hay one-liner, aria-label, og:image:alt y texto en la tarjeta', () => {
    expect(esperado, 'no se encontró «### One-liner ES» en docs/DESCRIPCION.md').toBeTruthy()
    expect(ariaLabel, 'public/og.svg no declara aria-label').toBeTruthy()
    expect(imageAlt, 'index.html no declara og:image:alt').toBeTruthy()
    expect(textoTarjeta.length, 'no se extrajo texto de los <text> de og.svg').toBeGreaterThan(80)
  })

  it('el aria-label del SVG y el og:image:alt son la MISMA frase', () => {
    // Describen la misma imagen. Dos copias que se separan es cómo una quedó con
    // el orden viejo mientras la otra se corregía.
    expect(
      imageAlt,
      'el alt de index.html y el aria-label de og.svg describen la misma imagen y tienen que decir lo mismo',
    ).toBe(ariaLabel)
  })

  for (const [dónde, frase] of [
    ['el aria-label de og.svg', () => ariaLabel],
    ['el og:image:alt de index.html', () => imageAlt],
    ['el texto visible de la tarjeta', () => textoTarjeta],
  ]) {
    it(`${dónde} nombra «quién dirige» antes que «qué hace»`, () => {
      const o = ordenCorrecto(frase())
      expect(
        o.quien,
        `${dónde} no menciona «quién dirige». El orden fijo de DESCRIPCION.md empieza por quién ocupa cada cargo, no por el dinero`,
      ).toBeGreaterThanOrEqual(0)
      expect(
        o.ok,
        `${dónde} pone «qué hace» (posición ${o.queHace}) antes que «quién dirige» (posición ${o.quien})`,
      ).toBe(true)
    })
  }

  /**
   * La promesa de la tarjeta es la del one-liner, no una propia.
   *
   * No se compara la frase entera —el alt lleva además el nombre del sitio y el
   * municipio, y el titular va partido en dos líneas— así que se comprueba el
   * TRAMO que hace la promesa, extraído del one-liner en vez de recitado.
   */
  it('la tarjeta hace la promesa del one-liner, y no la retirada', () => {
    const promesa = /—\s*(?:con\s+)?(una fuente para cada cifra)/i.exec(esperado)?.[1]
    expect(
      promesa,
      'el one-liner de DESCRIPCION.md ya no termina en «una fuente para cada cifra»: actualiza esta prueba junto con la tarjeta, no sólo una de las dos',
    ).toBeTruthy()

    for (const [dónde, frase] of [
      ['el alt', imageAlt],
      ['el texto de la tarjeta', textoTarjeta],
    ]) {
      expect(frase.toLowerCase(), `${dónde} no hace la promesa del one-liner`).toContain(
        promesa.toLowerCase(),
      )
      expect(
        frase.toLowerCase(),
        `${dónde} sigue prometiendo «una cita por cada afirmación», que es la promesa que el one-liner retiró`,
      ).not.toContain('cita por cada afirmación')
    }
  })
})

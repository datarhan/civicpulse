/**
 * La figura de cabecera de cada reportaje (src/components/reportajes/Emblema.jsx).
 *
 * Tres cosas, cada una con su forma de quedarse en verde sin medir nada:
 *
 * 1. Cada pieza del registro tiene figura. Se lee REPORTAJE_SLUGS, no una lista
 *    copiada: una pieza nueva sin emblema debe romper aquí, no pasar sin cabecera.
 * 2. La serie congelada del agua dice lo mismo que el titular de su pieza —«cifra en
 *    cinco de las diez entregas y cero en las otras cinco»—, contado sobre el dato y
 *    no sobre un número escrito en el test.
 * 3. Cada figura dibuja de verdad: se pinta con el snapshot PUBLICADO, se exige un
 *    mínimo de marcas y que ningún NaN/undefined se cuele en el SVG. Una figura
 *    vacía también es «sin errores».
 * 4. Las tarjetas de cabecera que la pieza esconde donde la figura se ve
 *    (`cifrasDelEmblema`) están de verdad escritas en la figura, tal cual, y son
 *    tarjetas de la pieza. Esconder una cifra que la figura no enseña la haría
 *    desaparecer de la cabecera; por eso se lee el SVG pintado y no la
 *    declaración.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Emblema, { EMBLEMAS, cifrasDelEmblema } from '../../src/components/reportajes/Emblema'
import { kpisReconstruccion } from '../../src/pages/reportajes/ReconstruccionDana'
import { REPORTAJE_SLUGS } from '../../src/reportajes'

const pieza = (slug) =>
  JSON.parse(readFileSync(join(__dirname, '../../public/data/reportajes', `${slug}.json`), 'utf8'))

describe('emblemas de reportaje', () => {
  it('hay una figura para cada pieza del registro', () => {
    expect(REPORTAJE_SLUGS.length).toBeGreaterThan(0)
    for (const slug of REPORTAJE_SLUGS) expect(EMBLEMAS, slug).toHaveProperty(slug)
  })

  it('la serie congelada del agua coincide con lo que afirma la pieza', () => {
    const p = pieza('coste-efectivo')
    const agua = p.emblema.agua
    const conCifra = agua.filter((f) => f.coste > 0).length
    const enCero = agua.filter((f) => f.coste === 0).length
    // «declara cifra en cinco de las diez entregas y cero en las otras cinco»
    expect(p.meta.subtitulo).toMatch(
      /cifra en cinco de las diez entregas y cero en las otras cinco/,
    )
    expect(agua.length).toBe(10)
    expect(conCifra).toBe(5)
    expect(enCero).toBe(5)
    // Las entregas no presentadas no tienen fila: un año sin entrega no es un cero.
    for (const y of p.entregas.noPresentadas) expect(agua.map((f) => f.anio)).not.toContain(y)
    // Y las que sí tienen fila son exactamente las publicadas menos las ausentes.
    const esperadas = p.entregas.publicadas.filter((y) => !p.entregas.noPresentadas.includes(y))
    expect(agua.map((f) => f.anio)).toEqual(esperadas)
  })

  for (const slug of REPORTAJE_SLUGS) {
    it(`«${slug}» dibuja con su snapshot publicado`, () => {
      const html = renderToStaticMarkup(<Emblema slug={slug} data={pieza(slug)} />)
      const marcas = (html.match(/<(rect|circle|path|line)\b/g) || []).length
      expect(marcas).toBeGreaterThanOrEqual(3)
      expect(html).toMatch(/aria-label="[^"]{20,}"/)
      expect(html).not.toMatch(/NaN|undefined|Infinity/)
    })
  }

  // Las tarjetas de cada pieza: las del snapshot, salvo la DANA, que las arma en
  // la propia página a partir de sus totales.
  const tarjetas = (slug, p) =>
    slug === 'reconstruccion-dana' ? kpisReconstruccion(p.totals) : (p.kpis ?? [])
  /** Los textos del SVG pintado, uno por <text>. */
  const textosDelSvg = (html) =>
    [...html.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) =>
      m[1]
        .replace(/&amp;/g, '&')
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"'),
    )
  const escapa = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  for (const slug of REPORTAJE_SLUGS) {
    it(`«${slug}» sólo esconde tarjetas cuya cifra la figura escribe tal cual`, () => {
      const p = pieza(slug)
      const cifras = cifrasDelEmblema(slug, p)
      const textos = textosDelSvg(renderToStaticMarkup(<Emblema slug={slug} data={p} />))
      expect(
        textos.length,
        'el SVG no trae textos: la comprobación no miraría nada',
      ).toBeGreaterThan(2)
      for (const c of cifras) {
        // Como palabra entera: «0» no vale dentro de «2011», ni «62» dentro de «1962».
        const suelta = new RegExp(`(^|[\\s(·])${escapa(c)}($|[\\s),·])`)
        expect(
          textos.some((t) => suelta.test(t)),
          `«${c}» se esconde de la cabecera pero la figura no lo escribe`,
        ).toBe(true)
        expect(
          tarjetas(slug, p).filter((k) => k.n === c),
          `«${c}» no es exactamente una tarjeta de la pieza`,
        ).toHaveLength(1)
      }
      // Y la cabecera nunca se queda sin tarjetas: siempre queda alguna a la vista.
      expect(tarjetas(slug, p).filter((k) => !cifras.includes(k.n)).length).toBeGreaterThan(0)
    })
  }

  it('mira algo: al menos una pieza esconde tarjetas repetidas', () => {
    const escondidas = REPORTAJE_SLUGS.flatMap((s) => cifrasDelEmblema(s, pieza(s)))
    expect(escondidas.length).toBeGreaterThan(0)
  })

  it('una pieza sin figura no pinta nada, en vez de una genérica', () => {
    expect(renderToStaticMarkup(<Emblema slug="no-existe" data={{}} />)).toBe('')
  })
})

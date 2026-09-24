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
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import Emblema, { EMBLEMAS } from '../../src/components/reportajes/Emblema'
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

  it('una pieza sin figura no pinta nada, en vez de una genérica', () => {
    expect(renderToStaticMarkup(<Emblema slug="no-existe" data={{}} />)).toBe('')
  })
})

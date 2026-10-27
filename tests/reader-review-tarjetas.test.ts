/**
 * Las marcas de tarjeta, del lado del texto: cómo se reparten en fragmentos,
 * qué cita se acepta, qué cuenta la cobertura y qué le dice el prompt al modelo.
 *
 * El lado del DOM —de dónde salen las marcas— está en
 * tests/components/tarjetas-en-la-lectura.test.jsx, con la historia de
 * /plenos/c8kr44 que lo motivó.
 */
import { describe, it, expect } from 'vitest'
import {
  chunkRenderedText,
  partitionFindings,
  sinMarcas,
  MARCAS_DE_TARJETA,
  REVIEW_CHUNK_CHARS,
  type ReaderFinding,
} from '../src/scraper/reader-review'
import { buildReaderReviewSystemPrompt } from '../src/llm/prompts'

const { inicio, fin } = MARCAS_DE_TARJETA
const strip = (s: string) => s.replace(/\s+/g, '')
const ultima = (c: string) => c.split('\n').at(-1)

describe('el reparto en fragmentos no separa una tarjeta de su marca', () => {
  it('un fragmento nunca acaba en la marca que abre una tarjeta', () => {
    // Sólo marcas, que no deciden fronteras: todo corte es por tamaño, y con
    // 50 caracteres de máximo cae una y otra vez justo detrás de una de inicio.
    // Ahí la marca pasa al fragmento siguiente, con la tarjeta que abre. Cada
    // tarjeta se cierra, como en una página de verdad: una marca de inicio con
    // la que acaba el texto no tiene detrás nada con lo que irse.
    const texto = Array.from({ length: 40 }, () => [inicio, fin])
      .flat()
      .join('\n')
    const cs = chunkRenderedText(texto, 50)
    expect(cs.length).toBeGreaterThan(1)
    for (const c of cs) expect(ultima(c)).not.toBe(inicio)
    expect(cs.join('\n')).toBe(texto)
  })

  it('una línea demasiado larga tras la marca: la marca encabeza su primer trozo', () => {
    const texto = ['antes', inicio, 'x'.repeat(250), fin].join('\n')
    const cs = chunkRenderedText(texto, 100)
    expect(cs.some((c) => c.startsWith(`${inicio}\nx`))).toBe(true)
    for (const c of cs) {
      expect(ultima(c)).not.toBe(inicio)
      expect(c.length).toBeLessThanOrEqual(100)
    }
    expect(strip(cs.join(''))).toBe(strip(texto))
  })

  it('las marcas no deciden fronteras: una página hecha sólo de marcas se corta por tamaño', () => {
    // `esFrontera` decide por el contenido de la línea, y una marca se repite
    // idéntica en cada tarjeta: si la suerte del hash la hiciera frontera, la
    // página se cortaría tras cada tarjeta en cientos de fragmentos de una
    // llamada cada uno.
    const texto = Array.from({ length: 400 }, () => [inicio, fin])
      .flat()
      .join('\n')
    expect(texto.length).toBeGreaterThan(2 * REVIEW_CHUNK_CHARS)
    const cs = chunkRenderedText(texto)
    for (const c of cs.slice(0, -1)) {
      expect(c.length).toBeGreaterThan(REVIEW_CHUNK_CHARS - fin.length - inicio.length - 2)
    }
  })

  it('en una página de muchas tarjetas, ninguna marca de inicio cierra un fragmento ni se pierde nada', () => {
    const tarjetas = Array.from({ length: 300 }, (_, i) => [
      inicio,
      `Declaración ${i}`,
      `Fuentes comprobadas: contratos · ${'presupuesto '.repeat(i % 7)}`,
      `Veredicto ${i}`,
      fin,
    ])
    const texto = tarjetas.flat().join('\n')
    const cs = chunkRenderedText(texto)
    expect(cs.length).toBeGreaterThan(2)
    for (const c of cs) {
      expect(ultima(c)).not.toBe(inicio)
      expect(c.length).toBeLessThanOrEqual(REVIEW_CHUNK_CHARS)
    }
    expect(cs.join('\n')).toBe(texto)
  })

  /**
   * La auditoría del 27-10-2026 lo encontró en /laboratorio: las marcas alargan
   * el texto un 3 %, el corte por tamaño se movió y cayó dentro de la tabla de
   * cobertura —una sola tarjeta—, entre «0 de 14 cotejadas» y «33 sin cotejar»,
   * justo la fila de un señalamiento vivo. Sin marcas había caído en otro sitio
   * por suerte. Cuando es el máximo quien corta, ahora corta tras la última
   * tarjeta cerrada, si lo que pasa al siguiente cabe.
   */
  it('cuando corta el máximo, corta entre dos tarjetas: ninguna que quepa queda partida', () => {
    const fila = (i: number) => `fila ${i}`
    const filas = Array.from({ length: 10 }, (_, i) => fila(i))
    // Que estas líneas no son frontera por contenido se MIDE, no se supone:
    // sin marcas, todo corte es por tamaño y cada fragmento sale lleno.
    const sinTarjetas = chunkRenderedText(
      Array.from({ length: 200 }, () => filas)
        .flat()
        .join('\n'),
      300,
    )
    for (const c of sinTarjetas.slice(0, -1)) expect(c.length).toBeGreaterThan(300 - 8)

    const texto = Array.from({ length: 60 }, () => [inicio, ...filas, fin])
      .flat()
      .join('\n')
    const cs = chunkRenderedText(texto, 300)
    expect(cs.length).toBeGreaterThan(10)
    for (const c of cs) {
      expect(c.split('\n')[0]).toBe(inicio)
      expect(ultima(c)).toBe(fin)
      expect(c.length).toBeLessThanOrEqual(300)
    }
    expect(cs.join('\n')).toBe(texto)
  })
})

describe('una cita no puede coser dos tarjetas', () => {
  const pagina = [
    'Sesión ordinaria del pleno',
    inicio,
    'Fuentes comprobadas: contratos',
    'Veredicto: subido por una persona',
    fin,
    inicio,
    'Afirmación numérica',
    '2025-09-08 · 92 €',
    fin,
  ].join('\n')
  const entrada = { route: '/plenos/x', renderedText: pagina, facts: {} }
  const f = (quote: string): ReaderFinding => ({
    quote,
    inference: 'una tarjeta dice dos cosas',
    contradictedBy: 'un hecho',
    severity: 'misleading',
  })

  it('la que une el pie de una con la cabecera de la siguiente se descarta, con las marcas o sin ellas', () => {
    const sinLasMarcas = 'Veredicto: subido por una persona\nAfirmación numérica'
    const conLasMarcas = `Veredicto: subido por una persona\n${fin}\n${inicio}\nAfirmación numérica`
    const r = partitionFindings([f(sinLasMarcas), f(conLasMarcas)], entrada)
    expect(r.kept).toEqual([])
    expect(r.dropped).toHaveLength(2)
  })

  it('la que cabe en una tarjeta, o fuera de todas, se queda', () => {
    const r = partitionFindings(
      [f('Fuentes comprobadas: contratos'), f('Sesión ordinaria del pleno')],
      entrada,
    )
    expect(r.kept).toHaveLength(2)
    expect(r.dropped).toEqual([])
  })

  it('sin marcas el filtro de literalidad es el de siempre', () => {
    const plano = sinMarcas(pagina)
    const r = partitionFindings([f('Veredicto: subido por una persona\nAfirmación numérica')], {
      ...entrada,
      renderedText: plano,
    })
    expect(r.kept).toHaveLength(1)
  })
})

describe('la cobertura cuenta el texto de la página, no las marcas', () => {
  it('`sinMarcas` quita las líneas de marca y nada más', () => {
    expect(sinMarcas([inicio, 'abc', fin, 'de'].join('\n'))).toBe('abc\nde')
    expect(sinMarcas('sin tarjetas\nni marcas')).toBe('sin tarjetas\nni marcas')
  })

  it('una página leída entera da el mismo total con marcas que sin ellas', () => {
    const sin = Array.from({ length: 600 }, (_, i) => `Línea ${i} de una tarjeta.`)
    const con = sin.flatMap((l, i) => (i % 3 === 0 ? [inicio, l] : i % 3 === 2 ? [l, fin] : [l]))
    const total = sin.join('\n').length
    expect(sinMarcas(con.join('\n')).length).toBe(total)
    // Lo que suma cada fragmento: como antes de las marcas, sólo se pierde el
    // salto de línea que había entre dos fragmentos.
    const cs = chunkRenderedText(con.join('\n'))
    const leidos = cs.reduce((s, c) => s + sinMarcas(c).length, 0)
    expect(leidos).toBeLessThanOrEqual(total)
    expect(leidos).toBeGreaterThanOrEqual(total - cs.length)
  })
})

describe('el prompt explica las marcas', () => {
  it('el sistema nombra las dos, sacadas de las constantes y no copiadas', () => {
    const s = buildReaderReviewSystemPrompt()
    expect(s).toContain(inicio)
    expect(s).toContain(fin)
  })
})

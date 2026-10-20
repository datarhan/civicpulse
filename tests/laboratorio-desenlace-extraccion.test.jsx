import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { esAnuncioClasificado } from '../src/scraper/press-clasificado'
import Laboratorio from '../src/pages/Laboratorio'
import { desenlaceVigente, textoLibroVacio } from '../src/lib/press-lab'
import { DESENLACES_EXTRACCION } from '../src/scraper/press-extraccion'
import { installFetchMock } from './setup/mockFetch'

/**
 * /laboratorio imprimía «El extractor no sacó ninguna afirmación de este titular» en
 * TODA tarjeta sin afirmaciones, también en las que el extractor nunca vio: la pasada
 * auditada en octubre de 2026 sólo había mirado los titulares del 7 al 9. Es la regla 2
 * de CLAUDE.md —«nunca intentado» doblado en «intentado, no encontró nada»—. Ahora el
 * extractor guarda un desenlace por artículo (src/scraper/press-extraccion.ts), el
 * verificador lo copia a press-claims-verified.json y la tarjeta dice el suyo.
 */
describe('el libro vacío dice qué pasó', () => {
  it('nunca intentado no se lee como «no sacó nada»', () => {
    expect(textoLibroVacio(null)).toMatch(/aún no ha pasado por el extractor/)
    expect(textoLibroVacio(null)).not.toMatch(/no sacó/)
  })
  it('cada desenlace sin afirmaciones tiene su frase', () => {
    for (const d of DESENLACES_EXTRACCION.filter((d) => d !== 'extraido'))
      expect(textoLibroVacio(d)).toBeTruthy()
    expect(textoLibroVacio('sin-afirmaciones')).toMatch(/No es lo mismo que no las tenga/)
    // No afirma una lectura del cuerpo que muchas veces no hubo: sin `needsBody`, con
    // --headline-only o con la descarga fallida, la extracción trabaja sobre el titular.
    expect(textoLibroVacio('sin-afirmaciones')).toMatch(/revisó este titular/)
    expect(textoLibroVacio('sin-afirmaciones')).not.toMatch(/leyó la noticia/)
    expect(textoLibroVacio('llm-no-disponible')).toMatch(/no pudo/)
  })
  it('«extraído» sin nada publicado tampoco se lee como «no sacó nada»', () => {
    // Pasa cuando el filtro editorial del verificador retiene todas las de un artículo.
    expect(textoLibroVacio('extraido')).toBeTruthy()
    expect(textoLibroVacio('extraido')).not.toMatch(/no sacó|aún no ha pasado/)
  })
  it('una fila de otro titular no vale: si la huella cambió, la tarjeta está pendiente', () => {
    const fila = {
      articleId: 'a1',
      fingerprint: 'f1',
      desenlace: 'sin-afirmaciones',
      procesadoEl: '2026-10-15',
    }
    expect(desenlaceVigente({ fingerprint: 'f1' }, fila)).toBe('sin-afirmaciones')
    expect(desenlaceVigente({ fingerprint: 'f2' }, fila)).toBeNull()
    expect(desenlaceVigente({}, fila)).toBeNull()
    expect(desenlaceVigente({ fingerprint: 'f1' }, undefined)).toBeNull()
  })
  it('las cuatro frases son distintas: ninguna se dobla en otra', () => {
    const frases = [null, ...DESENLACES_EXTRACCION].map(textoLibroVacio)
    expect(new Set(frases).size).toBe(frases.length)
  })
})

// Filas reales del 28-09-2026, las de tests/laboratorio-contador.test.jsx: 46 tarjetas
// en la ventana, 12 con afirmaciones.
const ROOT = join(__dirname, '..')
const leer = (f) => JSON.parse(readFileSync(join(ROOT, 'tests/fixtures', f), 'utf8'))
const PRESS = leer('press_2026-09-28.json')
const VERIFICADAS = leer('press-claims-verified_2026-09-28.json')
const AHORA = new Date('2026-09-29T09:00:00Z')
const DIA = 86_400_000
const HOY_SIN_REGISTRO =
  'El extractor no sacó ninguna afirmación de este titular. No es lo mismo que no las tenga.'

const conAfirmaciones = new Set(VERIFICADAS.items.map((r) => r.claim.articleId))
const corte = AHORA.getTime() - 30 * DIA
// Sin el anuncio de fotocasa.es (1auaoi4): desde el 19-10-2026 no es prensa y no se
// pinta (press-clasificado.ts).
const sinAfirmaciones = PRESS.items
  .filter(
    (p) => Date.parse(p.date) >= corte && !conAfirmaciones.has(p.id) && !esAnuncioClasificado(p),
  )
  .map((p) => p.id)
  .sort()

// Una pasada que miró tres tarjetas sin afirmaciones, una con cada desenlace, y las de
// las afirmaciones; el resto no lo ha visto nunca. Con la huella de la tarjeta, que es
// la del titular que se procesó.
const huella = new Map([
  ...VERIFICADAS.items.map((r) => [r.claim.articleId, r.claim.articleFingerprint]),
  ...PRESS.items.map((p) => [p.id, p.fingerprint]),
])
const procesado = (articleId, desenlace, fingerprint = huella.get(articleId)) => ({
  articleId,
  fingerprint,
  desenlace,
  procesadoEl: '2026-09-28T08:00:00.000Z',
})
const ARTICULOS = [
  procesado(sinAfirmaciones[0], 'sin-afirmaciones'),
  procesado(sinAfirmaciones[1], 'descartado-en-triaje'),
  procesado(sinAfirmaciones[2], 'llm-no-disponible'),
  ...[...conAfirmaciones].map((id) => procesado(id, 'extraido')),
]

function montar(verificadas) {
  installFetchMock({
    '/data/press.json': PRESS,
    '/data/press-claims-verified.json': verificadas,
  })
  render(
    <MemoryRouter>
      <Laboratorio />
    </MemoryRouter>,
  )
  return screen.findByText(/· ventana 30 días$/)
}
const tarjetas = () => screen.queryAllByText('Solicitar derecho de réplica →').length
const veces = (texto) => screen.queryAllByText(texto).length
const RECUENTO =
  /^(\d+) con afirmaciones · (\d+) descartados por el extractor · (\d+) sin procesar todavía$/
const recuento = () => {
  const el = screen.getByText(RECUENTO)
  const [, con, descartados, pendientes] = el.textContent.match(RECUENTO).map(Number)
  return { con, descartados, pendientes, el }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
})
afterEach(() => vi.useRealTimers())

describe('/laboratorio con el desenlace de cada artículo', () => {
  it('la premisa, medida: hay tarjetas sin afirmaciones de sobra para las tres', () => {
    expect(sinAfirmaciones.length).toBeGreaterThan(3)
  })

  it('cada tarjeta sin afirmaciones dice lo que le pasó, y la que nadie miró lo dice', async () => {
    await montar({ ...VERIFICADAS, extraccion: { articulos: ARTICULOS } })
    expect(veces(textoLibroVacio('sin-afirmaciones'))).toBe(1)
    expect(veces(textoLibroVacio('descartado-en-triaje'))).toBe(1)
    expect(veces(textoLibroVacio('llm-no-disponible'))).toBe(1)
    expect(veces(textoLibroVacio(null))).toBe(sinAfirmaciones.length - 3)
    // Y la frase de antes ya no sale en ninguna: el extractor no miró la mayoría.
    expect(veces(HOY_SIN_REGISTRO)).toBe(0)
  })

  it('el recuento suma las tarjetas que se ven, con cualquier filtro', async () => {
    await montar({ ...VERIFICADAS, extraccion: { articulos: ARTICULOS } })
    const r = recuento()
    expect(r.el).toHaveClass('mono')
    expect(r).toMatchObject({
      con: conAfirmaciones.size,
      // `sin-afirmaciones` y `descartado-en-triaje`.
      descartados: 2,
      // Lo nunca visto y el `llm-no-disponible`, que se reintentará.
      pendientes: sinAfirmaciones.length - 2,
    })
    expect(r.con + r.descartados + r.pendientes).toBe(tarjetas())
    // 45 del feed menos el anuncio, más 1 fuera del feed.
    expect(tarjetas()).toBe(45)

    const medio = screen.getByLabelText('Filtrar por medio')
    const veredicto = screen.getByLabelText('Filtrar por veredicto')
    let comprobados = 0
    for (const m of [...medio.options].map((o) => o.value)) {
      for (const v of [...veredicto.options].map((o) => o.value)) {
        fireEvent.change(medio, { target: { value: m } })
        fireEvent.change(veredicto, { target: { value: v } })
        const { con, descartados, pendientes } = recuento()
        expect(con + descartados + pendientes, `${m} × ${v}`).toBe(tarjetas())
        comprobados += 1
      }
    }
    expect(comprobados).toBeGreaterThan(20)
  })

  it('un desenlace de un titular que ya cambió no se le atribuye al de ahora', async () => {
    // La fila se procesó con otra huella: el titular de la tarjeta no es el que miró
    // el extractor, y para él vuelve a estar en la cola (`elegirPendientes`).
    const cambiado = [
      procesado(sinAfirmaciones[0], 'sin-afirmaciones', 'huella-de-otro-titular'),
      ...ARTICULOS.slice(1),
    ]
    await montar({ ...VERIFICADAS, extraccion: { articulos: cambiado } })
    expect(veces(textoLibroVacio('sin-afirmaciones'))).toBe(0)
    expect(veces(textoLibroVacio(null))).toBe(sinAfirmaciones.length - 2)
    const r = recuento()
    expect(r).toMatchObject({ descartados: 1, pendientes: sinAfirmaciones.length - 1 })
    expect(r.con + r.descartados + r.pendientes).toBe(tarjetas())
  })

  it('un snapshot sin `extraccion` dice lo de siempre y no inventa un recuento', async () => {
    await montar(VERIFICADAS)
    expect(veces(HOY_SIN_REGISTRO)).toBe(45 - conAfirmaciones.size)
    expect(veces(textoLibroVacio(null))).toBe(0)
    expect(screen.queryByText(RECUENTO)).toBeNull()
  })
})

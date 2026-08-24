import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describirConsulta, seConsultoAlgo, type IntentoFuente } from '../src/scraper/factcheck'

/**
 * El snapshot que mentía sobre sí mismo.
 *
 * `factcheck.json` derivaba su `description` del RECUENTO DE FILAS:
 *
 *     apiRows.length > 0 ? 'Google Fact Check Tools API' : null
 *     …
 *     : 'No sources active (API key missing AND RSS feeds returned nothing)'
 *
 * Así que una llamada con su clave puesta, que respondía 200 y devolvía
 * legítimamente cero resultados sobre este municipio, se describía como «API
 * key missing». El inverso del defecto de `r?.findings ?? []`: en vez de un
 * fallo imprimiendo un todo-claro, una comprobación limpia imprimiendo un
 * fallo.
 *
 * No es teórico y costó caro: se informó DOS VECES de que la clave no estaba
 * puesta. Estaba en `.env`, `press-lab-pipeline.sh` la carga con `set -a`, y
 * responde 200 — su único resultado es un bulo sobre la presa de Ribaroja del
 * EBRO, que el filtro de municipio descarta con razón.
 */

const api = (o: Partial<IntentoFuente> = {}): IntentoFuente => ({
  fuente: 'Google Fact Check Tools API',
  estado: 'consultada',
  examinadas: 1,
  aceptadas: 0,
  ...o,
})
const rss = (o: Partial<IntentoFuente> = {}): IntentoFuente => ({
  fuente: 'Maldita.es RSS',
  estado: 'consultada',
  examinadas: 0,
  aceptadas: 0,
  ...o,
})

describe('describirConsulta separa los tres ceros', () => {
  it('«consulté y no hay» NO se describe como «no pude consultar»', () => {
    // El caso real del 2026-08-23: la API respondió, devolvió una revisión, y
    // era sobre otro Riba-roja.
    const d = describirConsulta([api(), rss()])
    expect(d).toMatch(/Consultadas 2 de 2/)
    expect(d).toMatch(/ninguna nombra Riba-roja de Túria/)
    expect(d, 'sigue acusando a la clave de estar ausente').not.toMatch(
      /key missing|sin-credencial/i,
    )
  })

  it('«no pude consultar» SÍ lo dice, y con su motivo', () => {
    const d = describirConsulta([
      api({
        estado: 'sin-credencial',
        examinadas: 0,
        motivo: 'GOOGLE_FACT_CHECK_API_KEY no está en el entorno',
      }),
      rss(),
    ])
    expect(d).toMatch(/NO consultada/)
    expect(d).toMatch(/GOOGLE_FACT_CHECK_API_KEY/)
  })

  it('un error de red no se confunde con una credencial ausente', () => {
    const d = describirConsulta([
      api({ estado: 'error', examinadas: 0, motivo: 'HTTP 503' }),
      rss(),
    ])
    expect(d).toMatch(/NO consultada — HTTP 503/)
    expect(d).not.toMatch(/credencial|key missing/i)
  })

  it('y cuando SÍ hay material, lo cuenta', () => {
    const d = describirConsulta([api({ examinadas: 4, aceptadas: 2 })])
    expect(d).toMatch(/4 revisión\(es\) examinada\(s\), 2 sobre Riba-roja de Túria/)
  })

  it('una fuente que devuelve cero sin examinar nada se distingue', () => {
    expect(describirConsulta([rss()])).toMatch(/ninguna revisión devuelta/)
  })

  it('sin intentos registrados, lo dice en vez de inventarse un all-clear', () => {
    expect(describirConsulta([])).toMatch(/Ninguna fuente declarada/)
  })
})

describe('seConsultoAlgo', () => {
  it('todas las fuentes caídas NO es una consulta', () => {
    const caidas = [
      api({ estado: 'sin-credencial', examinadas: 0, motivo: 'sin clave' }),
      rss({ estado: 'error', motivo: 'HTTP 500' }),
    ]
    expect(caidas.every((i) => i.aceptadas === 0)).toBe(true) // cero filas…
    expect(seConsultoAlgo(caidas)).toBe(false) // …pero nadie miró
  })

  it('con una sola fuente en pie, la pasada vale', () => {
    expect(seConsultoAlgo([api({ estado: 'error', motivo: 'x' }), rss()])).toBe(true)
  })
})

// ─── Y que el CLI lo use, no sólo que exista ────────────────────────────────
//
// El describidor puede estar perfecto y el script seguir derivando la frase de
// `apiRows.length`. Se comprueba sobre el fuente, que es donde vivía el fallo.

describe('scrape-factcheck.ts describe la consulta, no el recuento', () => {
  const src = readFileSync(resolve('scripts/scrape-factcheck.ts'), 'utf8')

  it('mide algo: el fichero se lee y construye el snapshot', () => {
    expect(src.length).toBeGreaterThan(1000)
    expect(src).toContain('FactCheckSnapshot')
  })

  it('usa describirConsulta y registra los intentos', () => {
    expect(src).toContain('describirConsulta')
    expect(src).toMatch(/intentos/)
  })

  it('ya NO deriva la descripción de si hubo filas', () => {
    // La línea exacta del defecto.
    expect(src).not.toMatch(/apiRows\.length > 0 \?/)
    expect(src).not.toMatch(/No sources active \(API key missing/)
  })
})

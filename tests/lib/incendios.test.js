import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  porAnyo,
  repartoDeCausas,
  contratosDeIncendio,
  tonoPorRecencia,
  TONOS_RECENCIA,
} from '../../src/lib/incendios'

const RAIZ = join(__dirname, '..', '..')
const snapshot = JSON.parse(readFileSync(join(RAIZ, 'public/data/incendios.json'), 'utf8'))
const tenders = JSON.parse(readFileSync(join(RAIZ, 'public/data/tenders.json'), 'utf8'))
const geo = JSON.parse(readFileSync(join(RAIZ, 'public/data/tender-geo.json'), 'utf8'))

describe('lib/incendios', () => {
  it('porAnyo cubre todo el rango, con ceros explícitos', () => {
    // El deslizador recorre años, no filas: un año sin incendios tiene que
    // existir con cero, o el control se salta huecos y miente sobre la serie.
    const serie = porAnyo(snapshot.incendios, 1993, 2024)
    expect(serie).toHaveLength(32)
    expect(serie[0].anyo).toBe(1993)
    expect(serie[serie.length - 1].anyo).toBe(2024)
    expect(serie.every((x) => Number.isInteger(x.total))).toBe(true)
  })

  it('porAnyo sólo cuenta lo que se dibuja', () => {
    // 1994VL0267 está en el snapshot con intersecta:false. Contarlo aquí
    // pondría un 1 en el deslizador donde no se pinta nada.
    const serie = porAnyo(snapshot.incendios, 1993, 2024)
    const del94 = serie.find((x) => x.anyo === 1994)
    const dibujados94 = snapshot.incendios.filter((i) => i.anyo === 1994 && i.intersecta).length
    expect(del94.total).toBe(dibujados94)
  })

  it('el reparto de causas deja el centinela FUERA del numerador', () => {
    const r = repartoDeCausas(snapshot.incendios)
    // El denominador es el de las causas conocidas, y se publica: un
    // porcentaje sobre un total que incluye «no se sabe» dice otra cosa.
    expect(r.conCausa + r.sinClasificar).toBe(r.total)
    expect(r.grupos.every((g) => g.causa !== 'sinClasificar')).toBe(true)
    const suma = r.grupos.reduce((t, g) => t + g.total, 0)
    expect(suma).toBe(r.conCausa)
  })

  it('el reparto no inventa una causa mayoritaria cuando no hay filas', () => {
    const r = repartoDeCausas([])
    expect(r.total).toBe(0)
    expect(r.grupos).toEqual([])
  })

  it('cuenta los contratos de incendio SIN tragarse los de la DANA', () => {
    // 72 contratos casan con un regex ancho por la palabra «emergencia», y
    // ~63 son limpieza tras la DANA. Pintarlos como prevención de incendios
    // sería una afirmación falsa sobre el ayuntamiento.
    const r = contratosDeIncendio(tenders.contracts, geo.assignments)
    expect(r.total).toBeGreaterThan(0)
    expect(r.total).toBeLessThan(20)
    for (const c of r.contratos) {
      expect(c.title).not.toMatch(/temporal de lluvias|\bDANA\b/i)
    }
  })

  it('ninguno de esos contratos está situado en el mapa, y por eso hay hueco', () => {
    // Es el hallazgo que sostiene la frase de cobertura: la prevención se
    // contrata a nivel de municipio y no nombra ningún sitio, así que el
    // resolutor de lugares —con razón— no la sitúa.
    const r = contratosDeIncendio(tenders.contracts, geo.assignments)
    expect(r.situados).toBe(0)
  })

  it('el tono de recencia usa la escala declarada y nunca sale de ella', () => {
    for (const anyo of [1993, 2005, 2016, 2024]) {
      expect(TONOS_RECENCIA.map((t) => t.color)).toContain(tonoPorRecencia(anyo, 1993, 2024))
    }
    // Lo reciente y lo antiguo no pueden acabar en el mismo tono, o la capa
    // dice «esto es una serie» y enseña una mancha uniforme.
    expect(tonoPorRecencia(2024, 1993, 2024)).not.toBe(tonoPorRecencia(1993, 1993, 2024))
  })

  it('un rango de un solo año no divide por cero', () => {
    expect(TONOS_RECENCIA.map((t) => t.color)).toContain(tonoPorRecencia(2024, 2024, 2024))
  })
})

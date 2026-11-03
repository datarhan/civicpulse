import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { hoyEnRibarroja, ultimoPleno } from '../src/scraper/en-breve-portada'
import { summarizeSessions } from '../src/lib/pleno-summary.js'

/**
 * La última sesión celebrada, que la tira de indicadores de la portada y /plenos
 * leen de aquí, contra los snapshots publicados. Lo que no se sabe es null,
 * nunca un cero.
 */
const leer = (f: string) => JSON.parse(readFileSync(resolve('public/data', f), 'utf8'))
const PLENOS = leer('plenos.json')
const AGENDAS = leer('plenos-agendas.json')
const VOTOS = leer('pleno-votes.json')

const FILAS = summarizeSessions({
  plenos: PLENOS.items,
  agendas: AGENDAS.plenos,
  votesByPleno: VOTOS.stats?.byPleno ?? {},
})
const HOY = hoyEnRibarroja()

describe('ultimoPleno — la última sesión celebrada, como en /plenos', () => {
  it('es la de fecha más alta anterior a hoy, con sus mismas cifras', () => {
    const pasadas = FILAS.filter((f) => f.date < HOY)
    const ultima = pasadas.reduce((a, b) => (b.date > a.date ? b : a))
    expect(ultimoPleno(FILAS, HOY)).toEqual({
      id: ultima.id,
      fecha: ultima.date,
      puntos: ultima.puntos,
      votos: ultima.votos,
    })
  })

  it('una sesión convocada para mañana no es «el último pleno»', () => {
    const filas = [
      { id: 'a', date: '2026-10-05', puntos: 8, votos: null },
      { id: 'b', date: '2026-11-02', puntos: null, votos: null },
    ]
    expect(ultimoPleno(filas, '2026-10-26')!.id).toBe('a')
    expect(ultimoPleno(filas, '2026-11-03')!.id).toBe('b')
    expect(ultimoPleno([], '2026-10-26')).toBeNull()
  })

  it('la de hoy tampoco, todavía: puede no haberse celebrado', () => {
    const filas = [
      { id: 'a', date: '2026-10-05', puntos: 8, votos: null },
      { id: 'b', date: '2026-11-02', puntos: 9, votos: null },
    ]
    expect(ultimoPleno(filas, '2026-11-02')!.id).toBe('a')
  })

  it('«hoy» es el día de Riba-roja, no el de UTC, en invierno y en verano', () => {
    // 23:30 UTC: ya es mañana en Madrid, a +1 en octubre (tras el cambio del
    // 25-10-2026) y a +2 en julio.
    expect(hoyEnRibarroja(new Date('2026-10-26T23:30:00Z'))).toBe('2026-10-27')
    expect(hoyEnRibarroja(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02')
    // Y a las 22:30 UTC de octubre todavía es el mismo día.
    expect(hoyEnRibarroja(new Date('2026-10-26T22:30:00Z'))).toBe('2026-10-26')
  })

  it('sin votaciones transcritas, null y no cero', () => {
    const p = ultimoPleno([{ id: 'a', date: '2026-10-05', puntos: 8, votos: null }], '2026-10-26')
    expect(p!.votos).toBeNull()
    // Medido sobre lo publicado: hay sesiones sin votaciones transcritas, y
    // ninguna fila de summarizeSessions las cuenta como 0.
    expect(FILAS.some((f) => f.votos === null)).toBe(true)
    expect(FILAS.some((f) => f.votos === 0)).toBe(false)
  })
})

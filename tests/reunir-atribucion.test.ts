import { describe, expect, it } from 'vitest'
import {
  DESENLACES,
  corregidasEnFichas,
  reunirAtribucion,
  type Declaracion,
} from '../src/scraper/reunir-atribucion'
import { retencionDeGrupo } from '../src/scraper/retencion-de-grupo'
import { singleSeatBlocs } from '../src/scraper/corporation-seats'

// Una composición con grupos de un escaño y de varios, sin escribir cuáles son
// cuáles: la regla los deriva de los escaños, como en producción.
const seats = [
  { bloc: 'PP', seats: 9 },
  { bloc: 'PSOE', seats: 6 },
  { bloc: 'VOX', seats: 1 },
  { bloc: 'Compromís', seats: 1 },
]
const unEscano = singleSeatBlocs(seats)
const varios = seats.map((s) => s.bloc).filter((b) => !unEscano.includes(b))

// El "mapa" de la prueba: el literal dice qué grupo daría el mapa de voces.
const mapa: Record<string, string> = {
  'dice el pp': varios[0],
  'dice el psoe': varios[1],
  'dice uno solo': unEscano[0],
  'dice podemos': 'Podemos',
}
const resolver = (v: string) => mapa[v] ?? null

const d = (id: string, verbatim: string, speakerGroup: string | null = null): Declaracion => ({
  id,
  plenoId: id.split('-')[0],
  speakerGroup,
  verbatim,
})

const items = [
  d('a-001-acu-1', 'dice el pp'),
  d('a-002-acu-2', 'dice el psoe'),
  d('a-003-acu-3', 'dice uno solo'),
  d('a-004-acu-4', 'nadie sabe'),
  d('a-005-acu-5', 'dice el pp', varios[1]),
  d('a-006-acu-6', 'dice el psoe'),
  d('a-007-acu-7', 'dice podemos'),
  d('a-008-acu-8', 'dice el pp'),
  d('b-001-acu-1', 'dice el pp'),
]

const correr = (sesiones = ['a']) =>
  reunirAtribucion(items, {
    sesiones: new Set(sesiones),
    resolverDe: (p) => (p === 'a' || p === 'b' ? resolver : null),
    retener: retencionDeGrupo(seats),
    firmadas: new Set(['a-006-acu-6']),
    corregidas: new Set(['a-008-acu-8']),
  })

describe('reunirAtribucion', () => {
  it('la composición de la prueba tiene grupos de los dos tipos (si no, no prueba nada)', () => {
    expect(unEscano.length).toBeGreaterThan(0)
    expect(varios.length).toBeGreaterThan(1)
  })

  it('escribe sólo grupos de varios concejales, y sólo donde no había ninguno', () => {
    const r = correr()
    const porId = new Map(r.items.map((i) => [i.id, i.speakerGroup]))
    expect(porId.get('a-001-acu-1')).toBe(varios[0])
    expect(porId.get('a-002-acu-2')).toBe(varios[1])
    expect(porId.get('a-003-acu-3')).toBeNull() // un escaño: nunca
    expect(porId.get('a-004-acu-4')).toBeNull() // el mapa calla
    expect(porId.get('a-005-acu-5')).toBe(varios[1]) // no se pisa, aunque el mapa diga otro
    expect(porId.get('a-006-acu-6')).toBeNull() // firmada: la base no se toca
    expect(porId.get('a-007-acu-7')).toBeNull() // fuera de la composición
    expect(porId.get('a-008-acu-8')).toBeNull() // su cita, corregida con firma en /hallazgos
    expect(porId.get('b-001-acu-1')).toBeNull() // sesión no pedida
  })

  it('cuenta cada declaración en exactamente un desenlace (regla 2)', () => {
    const s = correr().porSesion.a
    const suma = DESENLACES.reduce((n, k) => n + s.desenlaces[k], 0)
    expect(suma).toBe(s.declaraciones)
    expect(s.declaraciones).toBe(8)
    expect(s.desenlaces).toEqual({
      unida: 2,
      'ya-atribuida': 1,
      firmada: 1,
      'corregida-en-ficha': 1,
      'mapa-no-acredita': 1,
      'grupo-de-un-escano': 1,
      'fuera-de-la-composicion': 1,
      'fuera-del-enum': 0,
    })
    expect(s.conGrupoAntes).toBe(1)
    expect(s.conGrupoDespues).toBe(3)
  })

  it('una sesión cuyo mapa no se puede leer no se intenta, y se dice', () => {
    const r = reunirAtribucion(items, {
      sesiones: new Set(['a']),
      resolverDe: () => null,
      retener: retencionDeGrupo(seats),
      firmadas: new Set(),
      corregidas: new Set(),
    })
    expect(r.sinMapaLegible).toEqual(['a'])
    expect(r.porSesion.a).toBeUndefined()
    expect(r.items).toEqual(items)
  })

  it('no cambia nada más que speakerGroup', () => {
    const r = correr()
    r.items.forEach((it, i) => {
      const { speakerGroup: _a, ...resto } = it
      const { speakerGroup: _b, ...antes } = items[i]
      expect(resto).toEqual(antes)
    })
  })
})

describe('corregidasEnFichas', () => {
  it('sigue la cita por las retiradas posteriores, como la bitácora', () => {
    const ficha = {
      quotes: [{ sourceClaimId: 'c0' }, { sourceClaimId: 'c2' }],
      corrections: [
        // El día de la fila, la cita 2 era c2; después se retiró la 1 y c2 pasó a la 1.
        { field: 'quote.2.speakerGroup' },
        { field: 'quote.1' },
        { field: 'quote.0.text' },
      ],
    }
    expect([...corregidasEnFichas([ficha])]).toEqual(['c2'])
  })

  it('una cita retirada después ya no tiene declaración que proteger', () => {
    const ficha = {
      quotes: [{ sourceClaimId: 'c0' }],
      corrections: [{ field: 'quote.1.speakerGroup' }, { field: 'quote.1' }],
    }
    expect(corregidasEnFichas([ficha]).size).toBe(0)
  })
})

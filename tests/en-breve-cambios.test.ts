/**
 * «En una frase» de /cambios (auditoría de las dos lecturas, §2).
 *
 * La página tenía una tarjeta por cada clase con algo y nada para las que no:
 * sin pleno, sin queja nueva y sin subvención, el vecino no distinguía «no pasó
 * nada» de «no lo miramos». La frase dice lo que hizo el Ayuntamiento, lo que
 * no consta y, si una fuente está atrasada, «sin datos desde», nunca un cero
 * (la lección del índice de /plenos: ausencia no es cero).
 */
import { describe, expect, it } from 'vitest'

import {
  CLASES_DEL_AYUNTAMIENTO,
  fraseDeLaSemana,
  type FuenteDeCambios,
} from '../src/scraper/en-breve-cambios'
import { expectationFor } from '../src/scraper/snapshot-cadence'

const HOY = Date.parse('2026-10-28T12:00:00Z')
const DIAS = 7
const AYER = '2026-10-27T10:00:00Z'

const FICHEROS = {
  pleno: 'plenos.json',
  licitacion: 'tenders.json',
  subvencion: 'bdns.json',
  participa: 'participa.json',
  queja: 'quejas.json',
  prensa: 'press.json',
} as const

/** Todas las fuentes leídas ayer: frescas. */
const frescas = (): Record<keyof typeof FICHEROS, FuenteDeCambios> =>
  Object.fromEntries(
    Object.entries(FICHEROS).map(([k, fichero]) => [
      k,
      { fichero, generatedAt: AYER, leida: true },
    ]),
  ) as Record<keyof typeof FICHEROS, FuenteDeCambios>

const ev = (kind: string, extra: Record<string, unknown> = {}) => ({
  kind,
  date: '2026-10-25',
  ...extra,
})

describe('las fuentes son las del registro de cadencias', () => {
  it('mide algo: cada fichero de /cambios tiene su plazo registrado', () => {
    for (const f of Object.values(FICHEROS)) expect(expectationFor(f), f).not.toBeNull()
  })
})

describe('lo que hizo el Ayuntamiento', () => {
  it('en orden fijo —pleno, contratos, subvenciones, participación— y sólo lo que hay', () => {
    const r = fraseDeLaSemana({
      byKind: {
        licitacion: [ev('licitacion'), ev('licitacion')],
        pleno: [ev('pleno')],
        participa: [ev('participa')],
      },
      fuentes: frescas(),
      dias: DIAS,
      hoy: HOY,
    })
    expect(r.hechos).toEqual([
      { kind: 'pleno', n: 1 },
      { kind: 'licitacion', n: 2 },
      { kind: 'participa', n: 1 },
    ])
    expect(CLASES_DEL_AYUNTAMIENTO).toEqual(['pleno', 'licitacion', 'subvencion', 'participa'])
  })

  it('subvenciones: sólo las que convoca el Ayuntamiento, no las de otras administraciones', () => {
    const r = fraseDeLaSemana({
      byKind: {
        subvencion: [
          ev('subvencion', { direction: 'granted' }),
          ev('subvencion', { direction: 'received' }),
        ],
      },
      fuentes: frescas(),
      dias: DIAS,
      hoy: HOY,
    })
    expect(r.hechos).toEqual([{ kind: 'subvencion', n: 1 }])
  })

  it('una convocatoria ajena sola no es una del Ayuntamiento: no consta', () => {
    const r = fraseDeLaSemana({
      byKind: { subvencion: [ev('subvencion', { direction: 'received' })] },
      fuentes: frescas(),
      dias: DIAS,
      hoy: HOY,
    })
    expect(r.hechos).toEqual([])
    expect(r.noConsta).toContain('subvencion')
  })
})

describe('lo que no consta, y lo que no se sabe', () => {
  it('cero con la fuente al día: «no consta»', () => {
    const r = fraseDeLaSemana({ byKind: {}, fuentes: frescas(), dias: DIAS, hoy: HOY })
    expect(r.noConsta).toEqual(['pleno', 'licitacion', 'subvencion', 'participa'])
    expect(r.sinDatos).toEqual([])
    expect(r.quejas).toBe(0)
    expect(r.prensa).toEqual({ n: 0, municipales: 0 })
  })

  it('cero con la fuente fuera de su plazo: «sin datos desde», nunca «no consta»', () => {
    const fuentes = frescas()
    const plazo = expectationFor('plenos.json')!.maxAgeDays
    const vieja = new Date(HOY - (plazo + 1) * 864e5).toISOString()
    fuentes.pleno = { ...fuentes.pleno, generatedAt: vieja }
    const r = fraseDeLaSemana({ byKind: {}, fuentes, dias: DIAS, hoy: HOY })
    expect(r.noConsta).not.toContain('pleno')
    expect(r.sinDatos).toEqual([{ kind: 'pleno', desde: vieja }])
  })

  it('una copia anterior al principio de la ventana tampoco la cubre', () => {
    // participa.json tiene 45 días de plazo: dentro de él, pero de antes de la
    // ventana de 7, no ha leído ni un día de lo que la frase cuenta.
    const fuentes = frescas()
    const antes = '2026-10-15T10:00:00Z'
    fuentes.participa = { ...fuentes.participa, generatedAt: antes }
    const r = fraseDeLaSemana({ byKind: {}, fuentes, dias: DIAS, hoy: HOY })
    expect(r.sinDatos).toEqual([{ kind: 'participa', desde: antes }])
  })

  it('una fuente que no se pudo leer: sin datos y sin fecha', () => {
    const fuentes = frescas()
    fuentes.licitacion = { fichero: 'tenders.json', generatedAt: null, leida: false }
    const r = fraseDeLaSemana({ byKind: {}, fuentes, dias: DIAS, hoy: HOY })
    expect(r.sinDatos).toEqual([{ kind: 'licitacion', desde: null }])
  })

  it('con hechos, una fuente atrasada no esconde lo que sí trae', () => {
    const fuentes = frescas()
    fuentes.pleno = { ...fuentes.pleno, generatedAt: '2026-09-01T10:00:00Z' }
    const r = fraseDeLaSemana({ byKind: { pleno: [ev('pleno')] }, fuentes, dias: DIAS, hoy: HOY })
    expect(r.hechos).toEqual([{ kind: 'pleno', n: 1 }])
    expect(r.sinDatos).toEqual([])
  })

  it('quejas y prensa sin datos son null, y van a «sin datos»', () => {
    const fuentes = frescas()
    fuentes.queja = { fichero: 'quejas.json', generatedAt: null, leida: false }
    fuentes.prensa = { fichero: 'press.json', generatedAt: '2026-09-01T10:00:00Z', leida: true }
    const r = fraseDeLaSemana({ byKind: {}, fuentes, dias: DIAS, hoy: HOY })
    expect(r.quejas).toBeNull()
    expect(r.prensa).toBeNull()
    expect(r.sinDatos).toEqual([
      { kind: 'queja', desde: null },
      { kind: 'prensa', desde: '2026-09-01T10:00:00Z' },
    ])
  })
})

describe('quejas y prensa', () => {
  it('cuenta las quejas del canal y las noticias, y aparte las de la web municipal', () => {
    const r = fraseDeLaSemana({
      byKind: {
        queja: [ev('queja')],
        prensa: [
          ev('prensa', { origen: 'ribarroja.es' }),
          ev('prensa', { origen: 'www.ribarroja.es' }),
          ev('prensa', { origen: 'levante-emv.com' }),
          // El portal de participación es del Ayuntamiento, pero no es su web de noticias.
          ev('prensa', { origen: 'participa.ribarroja.es' }),
        ],
      },
      fuentes: frescas(),
      dias: DIAS,
      hoy: HOY,
    })
    expect(r.quejas).toBe(1)
    expect(r.prensa).toEqual({ n: 4, municipales: 2 })
  })
})

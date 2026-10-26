import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { enBrevePortada, quienManda, ultimoPleno } from '../src/scraper/en-breve-portada'
import { enBrevePresupuesto } from '../src/scraper/en-breve-presupuesto'
import { partyOfAlcaldia } from '../src/scraper/corporation-seats'
import { summarizeSessions } from '../src/lib/pleno-summary.js'

/**
 * «Tu ayuntamiento en 30 segundos», contra los snapshots publicados. La regla
 * que se prueba es la del diseño: cada respuesta sale de la MISMA función que
 * la página a la que enlaza, y lo que no se sabe es null, nunca un cero.
 */
const leer = (f: string) => JSON.parse(readFileSync(resolve('public/data', f), 'utf8'))
const OFFICIALS = leer('officials.json')
const BUDGET = leer('budget.json')
const EJECUCION = leer('budget-execution.json')
const TENDER_GEO = leer('tender-geo.json')
const PLENOS = leer('plenos.json')
const AGENDAS = leer('plenos-agendas.json')
const VOTOS = leer('pleno-votes.json')

const PRESUPUESTO = enBrevePresupuesto({
  budget: BUDGET,
  ejecucion: EJECUCION,
  deuda: null,
  tenderGeo: TENDER_GEO,
})
const FILAS = summarizeSessions({
  plenos: PLENOS.items,
  agendas: AGENDAS.plenos,
  votesByPleno: VOTOS.stats?.byPleno ?? {},
})
const HOY = new Date().toISOString().slice(0, 10)
const R = enBrevePortada({
  officials: OFFICIALS,
  presupuesto: PRESUPUESTO,
  sesiones: FILAS,
  hoy: HOY,
})

describe('¿Quién manda? — del padrón de cargos, nunca escrito', () => {
  it('el alcalde es el único cargo con ese rol, y su partido el de la alcaldía', () => {
    const alcaldes = OFFICIALS.officials.filter((o: { role?: string }) => o.role === 'alcalde')
    expect(alcaldes).toHaveLength(1)
    expect(R.manda).not.toBeNull()
    expect(R.manda!.alcalde).toBe(alcaldes[0].name)
    expect(R.manda!.slug).toBe(alcaldes[0].slug)
    expect(R.manda!.partido).toBe(partyOfAlcaldia(OFFICIALS))
  })

  it('los escaños son los de la composición publicada, y el total su suma', () => {
    const comp = OFFICIALS.composition as Record<string, number>
    expect(R.manda!.escanos).toBe(comp[R.manda!.partido])
    expect(R.manda!.total).toBe(Object.values(comp).reduce((a, b) => a + b, 0))
  })

  it('sin un único alcalde con partido no contesta: null, no un nombre cualquiera', () => {
    const fila = (role: string, party = 'PSOE') => ({ slug: 'x', name: 'X', party, role })
    expect(quienManda({ officials: [fila('concejal')] })).toBeNull()
    expect(quienManda({ officials: [fila('alcalde'), fila('alcalde')] })).toBeNull()
    expect(quienManda({ officials: [fila('alcalde', '')] })).toBeNull()
    expect(quienManda(null)).toBeNull()
  })
})

describe('¿Cuánto dinero? — la misma cifra que /presupuesto', () => {
  it('el tope y lo gastado son los objetos de enBrevePresupuesto, sin rehacer cuentas', () => {
    expect(R.dinero).not.toBeNull()
    expect(R.dinero!.limite).toBe(PRESUPUESTO.limite)
    expect(R.dinero!.gastado).toBe(PRESUPUESTO.gastado)
    expect(R.barrio).toBe(PRESUPUESTO.barrio)
  })

  it('un gasto de otro ejercicio que el tope no se pinta junto a él', () => {
    const otro = { ...PRESUPUESTO, gastado: { ...PRESUPUESTO.gastado!, year: 1999 } }
    const r = enBrevePortada({ officials: OFFICIALS, presupuesto: otro, sesiones: FILAS, hoy: HOY })
    expect(r.dinero!.gastado).toBeNull()
  })

  it('sin tope no hay tarjeta de dinero, y queda el aprobado, como en /presupuesto', () => {
    const aprobado = { year: 2026, total: 43_516_817 }
    const r = enBrevePortada({
      officials: OFFICIALS,
      presupuesto: { ...PRESUPUESTO, limite: null, aprobado },
      sesiones: FILAS,
      hoy: HOY,
    })
    expect(r.dinero).toBeNull()
    expect(r.aprobado).toBe(aprobado)
    // Con tope, el aprobado no sale: las dos tarjetas no van juntas.
    expect(R.aprobado).toBeNull()
  })
})

describe('¿Qué se decidió? — la última sesión celebrada, como en /plenos', () => {
  it('es la de fecha más alta que no pasa de hoy, con sus mismas cifras', () => {
    const pasadas = FILAS.filter((f) => f.date <= HOY)
    const ultima = pasadas.reduce((a, b) => (b.date > a.date ? b : a))
    expect(R.pleno).toEqual({
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
    expect(ultimoPleno(filas, '2026-11-02')!.id).toBe('b')
    expect(ultimoPleno([], '2026-10-26')).toBeNull()
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

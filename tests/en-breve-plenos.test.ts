import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ordenDelDiaEnBreve,
  ultimoPlenoEnBreve,
  votosEnBreve,
  type VotoPublicado,
} from '../src/scraper/en-breve-plenos'
import { etiquetaDelPunto } from '../src/scraper/etiqueta-llana'
import { summarizeSessions } from '../src/lib/pleno-summary.js'
import type { EnrichedPleno } from '../src/scraper/pleno-agenda'

/**
 * «El último pleno» dice lo mismo que la página de la sesión y que la portada.
 * Se comprueba sobre lo que se publica (public/data), con las mismas funciones
 * que las dos capas: si una cifra de la tarjeta no sale de ahí, la prueba lo
 * dice. Ninguna cifra del snapshot está escrita aquí.
 */
const leer = (f: string) =>
  JSON.parse(readFileSync(join(__dirname, '..', 'public', 'data', f), 'utf8'))
const plenos = leer('plenos.json')
const agendas: { plenos: EnrichedPleno[] } = leer('plenos-agendas.json')
const votos: { items: VotoPublicado[]; stats: { byPleno: Record<string, number> } } =
  leer('pleno-votes.json')

const filas = summarizeSessions({
  plenos: plenos.items ?? [],
  agendas: agendas.plenos,
  votesByPleno: votos.stats.byPleno,
})

describe('ordenDelDiaEnBreve — cada punto en una sola parte', () => {
  it('lee sesiones de verdad', () => {
    expect(agendas.plenos.length).toBeGreaterThan(10)
  })

  it('para decidir + informes + otros + ruegos = los puntos del orden del día, en cada sesión', () => {
    for (const p of agendas.plenos) {
      const o = ordenDelDiaEnBreve(p.agenda)
      const ruegos = p.agenda.filter((a) => a.section === 'ruegos').length
      expect(o.decidir.length + o.informes.length + o.otros.length + ruegos, p.id).toBe(o.total)
      expect(o.total, p.id).toBe(p.agendaCount)
      expect(o.ruegos, p.id).toBe(p.hasRuegos)
    }
  })

  it('«para decidir» es la parte resolutiva y nada más', () => {
    for (const p of agendas.plenos) {
      const o = ordenDelDiaEnBreve(p.agenda)
      expect(
        o.decidir.map((d) => d.numero),
        p.id,
      ).toEqual(p.agenda.filter((a) => a.section === 'resolutiva').map((a) => a.number))
    }
  })

  it('cada punto lleva su etiqueta llana y su título entero', () => {
    const p = agendas.plenos[0]
    const o = ordenDelDiaEnBreve(p.agenda)
    for (const d of [...o.decidir, ...o.informes]) {
      const item = p.agenda.find((a) => a.number === d.numero)!
      expect(d.titulo).toBe(item.title)
      expect(d.texto).toBe(etiquetaDelPunto(item.title).texto)
    }
  })
})

describe('votosEnBreve — lo transcrito, nunca un cero', () => {
  it('sin votaciones transcritas no hay recuento: null', () => {
    expect(votosEnBreve([])).toBeNull()
  })

  it('en cada sesión, las transcritas son las del recuento que pinta la tabla', () => {
    const ids = Object.keys(votos.stats.byPleno)
    expect(ids.length).toBeGreaterThan(0)
    for (const id of ids) {
      const v = votosEnBreve(votos.items.filter((x) => x.plenoId === id))!
      expect(v.transcritas, id).toBe(votos.stats.byPleno[id])
      expect(v.aprobadas + v.rechazadas + v.otras, id).toBe(v.transcritas)
    }
  })
})

describe('ultimoPlenoEnBreve — la sesión de la portada', () => {
  const fechas = filas.map((f) => String(f.date).slice(0, 10)).sort()

  it('elige la última celebrada antes de hoy, no la convocada para hoy', () => {
    const ultima = fechas[fechas.length - 1]
    const r = ultimoPlenoEnBreve({
      sesiones: filas,
      agendas: agendas.plenos,
      votos: votos.items,
      hoy: ultima,
    })!
    expect(r.fecha < ultima).toBe(true)
    expect(r.fecha).toBe(fechas.filter((f) => f < ultima).pop())
  })

  it('sus puntos son los de la fila de la tabla, y sus votaciones también', () => {
    const r = ultimoPlenoEnBreve({
      sesiones: filas,
      agendas: agendas.plenos,
      votos: votos.items,
      hoy: '2999-01-01',
    })!
    const fila = filas.find((f) => f.id === r.id)!
    expect(r.ordenDelDia?.total ?? null).toBe(fila.puntos)
    expect(r.votos?.transcritas ?? null).toBe(fila.votos)
    expect(r.tipo).toBe(fila.kind)
  })

  it('una sesión sin orden del día recogido da null, no una lista vacía', () => {
    const r = ultimoPlenoEnBreve({ sesiones: filas, agendas: [], votos: [], hoy: '2999-01-01' })!
    expect(r.ordenDelDia).toBeNull()
    expect(r.votos).toBeNull()
  })

  it('sin ninguna sesión celebrada, no hay tarjeta', () => {
    expect(
      ultimoPlenoEnBreve({
        sesiones: filas,
        agendas: agendas.plenos,
        votos: [],
        hoy: '1900-01-01',
      }),
    ).toBeNull()
  })
})

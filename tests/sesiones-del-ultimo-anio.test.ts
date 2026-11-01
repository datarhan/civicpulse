import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  esAprobacionDeActa,
  ordenDelDiaEnBreve,
  sesionesDelUltimoAnio,
} from '../src/scraper/en-breve-plenos'
import { ultimoPleno } from '../src/scraper/en-breve-portada'
import type { EnrichedPleno } from '../src/scraper/pleno-agenda'

/**
 * Las sesiones del último año en palabras llanas (auditoría de las dos
 * lecturas, §9): la fecha, el tipo y lo primero que se llevó a votar, en vez
 * de una fila de recuentos de lo que hemos procesado. La última sesión ya tiene
 * su tarjeta, «El último pleno», y no se repite.
 *
 * La aprobación del acta anterior abre casi todos los ordinarios: listarla
 * pondría la misma línea en cada sesión. No se enseña entre las dos primeras,
 * pero cuenta en «y N más»: es un punto que se vota.
 *
 * Todo sobre lo publicado; ningún título ni cifra está escrito aquí salvo los
 * casos literales de la regla del acta.
 */
const leer = (f: string) =>
  JSON.parse(readFileSync(join(__dirname, '..', 'public', 'data', f), 'utf8'))
const sesiones: { id: string; date: string; kind: string }[] = leer('plenos.json').items
const agendas: { plenos: EnrichedPleno[] } = leer('plenos-agendas.json')

const ultimaFecha = sesiones
  .map((s) => s.date.slice(0, 10))
  .sort()
  .at(-1)!
const manana = new Date(`${ultimaFecha}T00:00:00Z`)
manana.setUTCDate(manana.getUTCDate() + 1)
const hoy = manana.toISOString().slice(0, 10)
const haceUnAnio = `${Number(hoy.slice(0, 4)) - 1}${hoy.slice(4)}`

describe('esAprobacionDeActa', () => {
  it.each([
    'Aprobación Acta anterior de fecha 20 de abril de 2026',
    'Aprobación Acta Ordinaria anterior de fecha 7 de septiembre de 2026',
    'Aprovació Acta anterior de data 03 de novembre de 2025',
    "Aprovació Acta anterior de data 06 d'octubre de 2025",
    'Aprobación Actas anteriores de fecha 3 de julio de 2026 (Extraordinaria) y 6 de julio de 2026 (Ordinaria)',
  ])('«%s» sí', (t) => expect(esAprobacionDeActa(t)).toBe(true))

  it.each([
    'Aprobación de la Cuenta General correspondiente al ejercicio 2025',
    'Aprobación expediente Reconocimiento Extrajudicial nº 13/2026. Lista de facturas',
    'Moción del Grupo Municipal Popular sobre el acta de la Junta',
  ])('«%s» no', (t) => expect(esAprobacionDeActa(t)).toBe(false))

  it('sobre lo publicado: todo título con «acta» y «anterior» que abre con «Aprobación» es un trámite de la parte resolutiva', () => {
    const items = agendas.plenos.flatMap((p) => p.agenda)
    const actas = items.filter((a) => esAprobacionDeActa(a.title))
    expect(actas.length, 'mide algo').toBeGreaterThan(10)
    for (const a of actas) expect(a.section, a.title).toBe('resolutiva')
  })
})

describe('sesionesDelUltimoAnio', () => {
  const filas = sesionesDelUltimoAnio({ sesiones, agendas: agendas.plenos, hoy })

  it('las del último año antes de hoy, sin la última, de la más nueva a la más vieja', () => {
    const ultima = ultimoPleno(
      sesiones.map((s) => ({ ...s, puntos: null, votos: null })),
      hoy,
    )!.id
    const esperadas = sesiones
      .filter((s) => s.date.slice(0, 10) < hoy && s.date.slice(0, 10) >= haceUnAnio)
      .filter((s) => s.id !== ultima)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((s) => s.id)
    expect(esperadas.length, 'mide algo').toBeGreaterThan(3)
    expect(filas.map((f) => f.id)).toEqual(esperadas)
  })

  it('de cada una, los dos primeros puntos para decidir que no son el acta, y cuántos más', () => {
    for (const f of filas) {
      const agenda = agendas.plenos.find((p) => p.id === f.id)?.agenda ?? []
      if (agenda.length === 0) {
        expect(f.ordenDelDia, f.id).toBeNull()
        continue
      }
      const o = ordenDelDiaEnBreve(agenda)
      const sinActa = o.decidir.filter((p) => !esAprobacionDeActa(p.titulo))
      expect(f.ordenDelDia!.destacados, f.id).toEqual(sinActa.slice(0, 2))
      expect(f.ordenDelDia!.masDecidir, f.id).toBe(
        o.decidir.length - f.ordenDelDia!.destacados.length,
      )
      expect(f.ordenDelDia!.informes, f.id).toBe(o.informes.length)
      expect(f.tipo, f.id).toBe(sesiones.find((s) => s.id === f.id)!.kind)
    }
  })

  it('ninguna fila enseña la aprobación del acta, y alguna la cuenta en «más»', () => {
    const destacados = filas.flatMap((f) => f.ordenDelDia?.destacados ?? [])
    expect(destacados.some((p) => esAprobacionDeActa(p.titulo))).toBe(false)
    expect(filas.some((f) => (f.ordenDelDia?.masDecidir ?? 0) > 0)).toBe(true)
  })

  it('una sesión sin orden del día recogido sale con null, no con cero puntos', () => {
    const sinOrden = { id: 'sin-orden', date: `${hoy.slice(0, 4)}-01-02`, kind: 'urgente' }
    const r = sesionesDelUltimoAnio({
      sesiones: [...sesiones, sinOrden],
      agendas: agendas.plenos,
      hoy,
    })
    const fila = r.find((f) => f.id === 'sin-orden')
    if (sinOrden.date >= haceUnAnio) expect(fila?.ordenDelDia).toBeNull()
  })

  it('sin sesiones, ninguna fila', () => {
    expect(sesionesDelUltimoAnio({ sesiones: [], agendas: agendas.plenos, hoy })).toEqual([])
  })
})

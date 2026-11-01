import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { aliasDeSesion, rutaDeSesion, sesionDeParametro } from '../src/scraper/ruta-de-sesion'

/**
 * Enlaces legibles a una sesión (auditoría de las dos lecturas, §9): un enlace
 * a `/plenos/zrbgic` no dice nada; `/plenos/2026-10-05-ordinario`, sí. El id
 * sigue siendo el canónico —el mapa del sitio, los hallazgos, las
 * declaraciones lo usan— y el alias es otra forma de llegar.
 *
 * Todo se comprueba sobre plenos.json tal cual se publica.
 */
const sesiones: { id: string; date: string; kind: string }[] = JSON.parse(
  readFileSync(join(__dirname, '..', 'public', 'data', 'plenos.json'), 'utf8'),
).items

describe('aliasDeSesion', () => {
  it('fecha y tipo', () => {
    expect(aliasDeSesion({ date: '2026-10-05', kind: 'ordinario' })).toBe('2026-10-05-ordinario')
    expect(aliasDeSesion({ date: '2026-07-03T00:00:00', kind: 'extraordinario' })).toBe(
      '2026-07-03-extraordinario',
    )
  })

  it('sin un tipo que quepa en una dirección, sólo la fecha', () => {
    expect(aliasDeSesion({ date: '2026-10-05', kind: null })).toBe('2026-10-05')
    expect(aliasDeSesion({ date: '2026-10-05', kind: 'Ordinari a/b' })).toBe('2026-10-05')
  })
})

describe('sobre lo publicado', () => {
  it('lee sesiones de verdad', () => {
    expect(sesiones.length).toBeGreaterThan(10)
  })

  it('ningún id parece una fecha: un parámetro es una cosa o la otra', () => {
    for (const s of sesiones) expect(s.id, s.id).not.toMatch(/^\d{4}-\d{2}-\d{2}/)
  })

  it('cada sesión se enlaza por su alias, y el alias y el id llevan a ella', () => {
    for (const s of sesiones) {
      expect(rutaDeSesion(s, sesiones), s.id).toBe(`/plenos/${aliasDeSesion(s)}`)
      expect(sesionDeParametro(aliasDeSesion(s), sesiones), s.id).toBe(s)
      expect(sesionDeParametro(s.id, sesiones), s.id).toBe(s)
    }
  })

  it('un alias con otro tipo, o sólo la fecha, sigue llegando si esa fecha es de una sola sesión', () => {
    const s = sesiones.find((x) => x.kind === 'ordinario')!
    const dia = s.date.slice(0, 10)
    expect(sesionDeParametro(`${dia}-extraordinario`, sesiones)).toBe(s)
    expect(sesionDeParametro(dia, sesiones)).toBe(s)
  })

  it('lo que no es ni id ni fecha de una sesión no lleva a ninguna', () => {
    expect(sesionDeParametro('1999-01-01-ordinario', sesiones)).toBeUndefined()
    expect(sesionDeParametro('no-existe', sesiones)).toBeUndefined()
    expect(sesionDeParametro('', sesiones)).toBeUndefined()
  })
})

describe('una sesión sin fecha', () => {
  it('se enlaza por su id, y no rompe la resolución de las demás', () => {
    const sinFecha = { id: 'sin-fecha', date: null, kind: 'ordinario' }
    const lista = [...sesiones, sinFecha]
    expect(rutaDeSesion(sinFecha, lista)).toBe('/plenos/sin-fecha')
    expect(sesionDeParametro('sin-fecha', lista)).toBe(sinFecha)
    const s = sesiones[0]
    expect(sesionDeParametro(aliasDeSesion(s), lista)).toBe(s)
  })
})

describe('dos sesiones el mismo día', () => {
  const s = sesiones.find((x) => x.kind === 'ordinario')!
  const otra = { ...s, id: 'otra-del-dia', kind: 'extraordinario' }
  const gemela = { ...s, id: 'gemela' }

  it('cada una por su alias; la fecha sola no elige', () => {
    const lista = [...sesiones, otra]
    expect(sesionDeParametro(aliasDeSesion(s), lista)).toBe(s)
    expect(sesionDeParametro(aliasDeSesion(otra), lista)).toBe(otra)
    expect(sesionDeParametro(s.date.slice(0, 10), lista)).toBeUndefined()
  })

  it('con el mismo tipo, el alias no distingue y el enlace va por el id', () => {
    const lista = [...sesiones, gemela]
    expect(sesionDeParametro(aliasDeSesion(s), lista)).toBeUndefined()
    expect(rutaDeSesion(s, lista)).toBe(`/plenos/${s.id}`)
    expect(rutaDeSesion(gemela, lista)).toBe('/plenos/gemela')
  })
})

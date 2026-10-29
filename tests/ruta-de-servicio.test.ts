/**
 * Las direcciones legibles de las fichas de /eficiencia (`scraper/ruta-de-servicio`).
 *
 * Contra el registro y contra el `indicadores.json` publicado, no contra una
 * lista copiada aquí: la regla 1 de docs/DATA_INTEGRITY.md.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { SERVICIOS, idDeServicio } from '../src/scraper/indicador-registry'
import { idDeParametro, rutaDeServicio } from '../src/scraper/ruta-de-servicio'
import { slugify } from '../src/scraper/normalize'

const publicado = JSON.parse(readFileSync(resolve('public/data/indicadores.json'), 'utf8'))
const fichas: { id: string; servicio: string }[] = publicado.indicadores
const POLICIA = 'b132-130p-coste-unitario'

describe('el alias de cada servicio', () => {
  const alias = Object.values(SERVICIOS).map((s) => s.alias)

  it('cada servicio del registro tiene uno, ya en forma de dirección', () => {
    expect(alias.length).toBe(Object.keys(SERVICIOS).length)
    for (const a of alias) {
      expect(a, `«${a}» no es una dirección: sin tildes, en minúsculas y con guiones`).toBe(
        slugify(a),
      )
      expect(a.length).toBeGreaterThan(0)
    }
  })

  it('no hay dos servicios con el mismo', () => {
    expect(new Set(alias).size).toBe(alias.length)
  })

  it('ninguno puede confundirse con un id: un parámetro es una cosa o la otra', () => {
    const ids = new Set([
      ...fichas.map((i) => i.id),
      ...(publicado.municipales ?? []).map((i: { id: string }) => i.id),
    ])
    expect(ids.size).toBeGreaterThan(0)
    for (const a of alias) {
      expect(a.endsWith('-coste-unitario'), `«${a}» tiene forma de id`).toBe(false)
      expect(ids.has(a), `«${a}» es el id de una ficha publicada`).toBe(false)
    }
  })
})

describe('las fichas publicadas', () => {
  it('premisa: hay fichas que enlazar', () => {
    expect(fichas.length).toBeGreaterThan(0)
  })

  it('su id es el que el registro deriva del programa: el motor y los enlaces usan la misma cuenta', () => {
    for (const i of fichas) expect(idDeServicio(i.servicio)).toBe(i.id)
  })

  it('cada una se enlaza por su alias, y el alias lleva de vuelta a ella', () => {
    for (const i of fichas) {
      const { alias } = SERVICIOS[i.servicio]
      expect(rutaDeServicio(i.id)).toBe(`/eficiencia/${alias}`)
      expect(idDeParametro(alias)).toBe(i.id)
    }
  })

  it('el id sigue llevando a su ficha', () => {
    for (const i of fichas) expect(idDeParametro(i.id)).toBe(i.id)
  })
})

describe('un parámetro escrito a mano', () => {
  it('con tildes o mayúsculas llega a la misma ficha', () => {
    expect(rutaDeServicio(POLICIA)).toBe('/eficiencia/policia-local')
    expect(idDeParametro('policía-local')).toBe(POLICIA)
    expect(idDeParametro('Policia-Local')).toBe(POLICIA)
  })

  it('que no es ni id ni alias vuelve tal cual, para que la ficha diga que no existe', () => {
    expect(idDeParametro('no-existe')).toBe('no-existe')
  })

  it('un id que el registro no conoce se enlaza por el id', () => {
    expect(rutaDeServicio('licitador-unico')).toBe('/eficiencia/licitador-unico')
  })
})

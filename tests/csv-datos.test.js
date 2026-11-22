/**
 * El CSV del catálogo de /datos (auditoría de las dos lecturas, §22): una fila
 * por elemento de la lista que la tabla llama «fila», generado en el build a
 * partir de la copia SERVIDA del JSON, después de la guarda de publicación.
 *
 * Por qué después y no antes: la guarda retira ficheros y reescribe
 * `pleno-findings.json` sin los literales retenidos (publication-denylist.js).
 * Un CSV hecho de `public/` llevaría lo que el JSON servido ya no lleva. Y por
 * qué se niega ante una fila sin firmar: la guarda reconoce un borrador por
 * `"requiresHumanApproval": true` en los bytes, y en un CSV esa marca es un
 * `true` suelto en una columna que la guarda ya no ve.
 *
 * Un texto que empieza por = + - @ lleva un apóstrofo delante: una hoja de
 * cálculo lo tomaría por una fórmula, y el texto de una queja lo escribe
 * cualquiera.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { aCsv, filasDe, leerCsv } from '../src/lib/csv-datos'
import { FICHAS } from '../src/lib/catalogo-datos'
import { escribirCsvEnDist } from '../publication-denylist.js'

const BOM = '﻿'

describe('aCsv', () => {
  it('empieza con la marca UTF-8 y separa las filas con CRLF', () => {
    const csv = aCsv([{ a: 1 }, { a: 2 }])
    expect(csv.startsWith(BOM)).toBe(true)
    expect(csv).toBe(`${BOM}a\r\n1\r\n2\r\n`)
  })

  it('la cabecera son todas las claves, en el orden en que aparecen', () => {
    expect(
      aCsv([
        { a: 1, b: 2 },
        { c: 3, a: 4 },
      ]),
    ).toBe(`${BOM}a,b,c\r\n1,2,\r\n4,,3\r\n`)
  })

  it('entrecomilla lo que lleva coma, comilla o salto de línea, y dobla la comilla', () => {
    expect(aCsv([{ t: 'a, b' }, { t: 'dice "no"' }, { t: 'una\nlínea' }])).toBe(
      `${BOM}t\r\n"a, b"\r\n"dice ""no"""\r\n"una\nlínea"\r\n`,
    )
  })

  it('null y lo que falta van vacíos; una lista o un objeto, como JSON', () => {
    expect(aCsv([{ a: null, b: [1, 2], c: { d: 'x' } }])).toBe(
      `${BOM}a,b,c\r\n,"[1,2]","{""d"":""x""}"\r\n`,
    )
  })

  it('un texto que empieza por = + - @ lleva un apóstrofo; un número negativo no', () => {
    const csv = aCsv([{ t: '=HYPERLINK("x")' }, { t: '+1' }, { t: '-a' }, { t: '@b' }, { t: -41 }])
    const filas = leerCsv(csv)
    expect(filas.map((f) => f.t)).toEqual(['\'=HYPERLINK("x")', "'+1", "'-a", "'@b", '-41'])
  })

  it('una lista vacía da un fichero vacío', () => {
    expect(aCsv([])).toBe('')
  })

  it('leerCsv deshace aCsv', () => {
    const filas = [
      { id: 1, texto: 'a, "b"\ny', vacio: null, lista: [1, { x: 2 }] },
      { id: 2, otro: 'z' },
    ]
    expect(leerCsv(aCsv(filas))).toEqual([
      { id: '1', texto: 'a, "b"\ny', vacio: '', lista: '[1,{"x":2}]', otro: '' },
      { id: '2', texto: '', vacio: '', lista: '', otro: 'z' },
    ])
  })
})

describe('filasDe', () => {
  it('sigue una ruta con puntos, y no da nada si lo que hay no es una lista', () => {
    const j = { series: { total: [{ year: 2020 }] }, items: [], snapshot: { a: 1 } }
    expect(filasDe(j, 'series.total')).toEqual([{ year: 2020 }])
    expect(filasDe(j, 'items')).toEqual([])
    expect(filasDe(j, 'snapshot')).toBeNull()
    expect(filasDe(j, 'no.existe')).toBeNull()
  })
})

describe('qué ficheros del catálogo llevan CSV', () => {
  const conCsv = Object.entries(FICHAS).filter(([, f]) => f.tabla)

  it('mide algo: la mayoría', () => {
    expect(conCsv.length).toBeGreaterThan(30)
  })

  it('cada uno apunta a una lista de filas de lo publicado', () => {
    for (const [ruta, f] of conCsv) {
      const json = JSON.parse(readFileSync(resolve(`public${ruta}`), 'utf8'))
      const filas = filasDe(json, f.tabla)
      expect(Array.isArray(filas), `${ruta}: ${f.tabla}`).toBe(true)
      for (const fila of filas.slice(0, 50))
        expect(fila && typeof fila === 'object' && !Array.isArray(fila), ruta).toBe(true)
    }
  })
})

describe('escribirCsvEnDist, el paso del build', () => {
  let dir
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))
  const monta = (ficheros) => {
    dir = mkdtempSync(join(tmpdir(), 'csv-datos-'))
    const datos = join(dir, 'data')
    mkdirSync(datos)
    for (const [nombre, json] of Object.entries(ficheros))
      writeFileSync(join(datos, nombre), typeof json === 'string' ? json : JSON.stringify(json))
    return datos
  }

  it('escribe el CSV de lo servido, una fila por elemento', async () => {
    const datos = monta({ 'quejas.json': { items: [{ id: 'a' }, { id: 'b' }] } })
    const r = await escribirCsvEnDist(datos, {
      '/data/quejas.json': { tabla: 'items' },
    })
    expect(r.escritos).toEqual(['quejas.csv'])
    expect(leerCsv(readFileSync(join(datos, 'quejas.csv'), 'utf8'))).toEqual([
      { id: 'a' },
      { id: 'b' },
    ])
  })

  it('lo que la guarda retiró no tiene CSV, y lo dice', async () => {
    const datos = monta({})
    const r = await escribirCsvEnDist(datos, { '/data/quejas.json': { tabla: 'items' } })
    expect(r.escritos).toEqual([])
    expect(r.sinJson).toEqual(['quejas.json'])
    expect(existsSync(join(datos, 'quejas.csv'))).toBe(false)
  })

  it('se niega ante una fila sin firmar: el CSV escondería la marca a la guarda', async () => {
    const datos = monta({
      'quejas.json': '{"items":[{"id":"a","requiresHumanApproval": true}]}',
    })
    await expect(
      escribirCsvEnDist(datos, { '/data/quejas.json': { tabla: 'items' } }),
    ).rejects.toThrow(/sin firmar/)
    expect(existsSync(join(datos, 'quejas.csv'))).toBe(false)
  })

  it('se cae si la lista prometida ya no es una lista', async () => {
    const datos = monta({ 'quejas.json': { items: { a: 1 } } })
    await expect(
      escribirCsvEnDist(datos, { '/data/quejas.json': { tabla: 'items' } }),
    ).rejects.toThrow(/no es una lista/)
  })
})

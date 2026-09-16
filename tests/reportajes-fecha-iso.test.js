import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { fmtDateHuman } from '../src/lib/formatters'

/**
 * La fecha de publicación de un reportaje es una FECHA, no una frase.
 *
 * Cuatro piezas la guardaban escrita a mano en castellano —«9 de septiembre de
 * 2026»— y `fmtDateHuman` pasa verbatim lo que no es ISO, a propósito: no
 * adivina. Así que la portada en valencià fechaba sus reportajes en castellano,
 * y lo señaló la guarda de #43 como «dato sin traducir». No era un fallo de la
 * traducción: era el dato, que no es una fecha.
 *
 * Con el valor en ISO, el mismo `fmtDateHuman` lo escribe en los dos idiomas y
 * nadie tiene que tocar la traducción.
 */
const ROOT = join(__dirname, '..')
const DIR = join(ROOT, 'public/data/reportajes')

const piezas = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ f, meta: JSON.parse(readFileSync(join(DIR, f), 'utf8')).meta ?? {} }))
  .filter(({ meta }) => meta.estado === 'publicado')

describe('la fecha de publicación de un reportaje es una fecha', () => {
  const conFecha = piezas.filter(({ meta }) => meta.publicadoEl)

  it('mide algo: hay varias piezas publicadas que declaran su fecha', () => {
    expect(piezas.length, 'no hay reportajes publicados que mirar').toBeGreaterThan(0)
    expect(conFecha.length, 'ninguna pieza declara publicadoEl').toBeGreaterThanOrEqual(4)
    // `reconstruccion-dana` no la declara y cae al `fechaDatos` por el `||` de
    // sus dos lectores, así que enseña el corte de datos como si fuera la fecha
    // de publicación. No se inventa aquí una fecha para una pieza firmada: queda
    // anotado para quien la publicó.
    expect(piezas.length - conFecha.length).toBeLessThanOrEqual(1)
  })

  it('todas la guardan en ISO, que es lo que se puede traducir', () => {
    const enProsa = conFecha
      .filter(({ meta }) => !/^\d{4}-\d{2}-\d{2}$/.test(String(meta.publicadoEl)))
      .map(({ f, meta }) => `${f}: ${meta.publicadoEl}`)
    expect(enProsa).toEqual([])
  })

  it('y en ISO el formateador sí las escribe en valencià (el porqué del cambio)', () => {
    const { meta } = conFecha[0]
    const es = fmtDateHuman(meta.publicadoEl, 'es')
    const ca = fmtDateHuman(meta.publicadoEl, 'ca')
    expect(es).not.toBe('')
    // No se fija la forma exacta —el CLDR de la CI escribe distinto— sino que
    // los dos idiomas den algo y no sean la misma cadena por casualidad de mes.
    expect(ca).not.toBe('')
    expect(`${es}|${ca}`).toMatch(/\d{4}/)
  })

  it('ninguna pieza la pinta cruda: eso publicaría un ISO en la página', () => {
    const dir = join(ROOT, 'src/pages/reportajes')
    const crudas = readdirSync(dir)
      .filter((f) => f.endsWith('.jsx'))
      .filter((f) => /\{\s*m\.publicadoEl\s*\}/.test(readFileSync(join(dir, f), 'utf8')))
    expect(crudas).toEqual([])
  })
})

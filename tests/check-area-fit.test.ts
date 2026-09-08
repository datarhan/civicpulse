import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  cotejarCoberturaEncaje,
  ENCAJE_DESENLACES,
  ENCAJE_DESENLACES_ROJOS,
  type OficialConAreas,
  type FilaFirmada,
} from '../src/scraper/area-fit'

/**
 * La guarda de cobertura del encaje declarado.
 *
 * Lo que se comprueba aquí NO es que hoy salga verde —eso lo dice el fichero—
 * sino que **puede ponerse roja**. Este repositorio ya ha pagado dos veces por
 * puertas verdes que no medían nada: la de contraste que informaba de cero
 * infracciones desde una regla que nunca corría, y la responsive cuya
 * condición de aprobado la cumplía el propio defecto que debía cazar.
 *
 * Los desenlaces se IMPORTAN del módulo, no se copian. Seis pruebas de este
 * repositorio copiaron a mano una forma y siguieron verdes mientras producción
 * no casaba con nada.
 */

const OFICIALES: OficialConAreas[] = [
  { slug: 'ana-perez', name: 'Ana Pérez', portfolios: ['Hacienda', 'Personal'] },
  { slug: 'luis-gomez', name: 'Luis Gómez', portfolios: ['Urbanismo'] },
  { slug: 'sin-delegacion', name: 'Sin Delegación', portfolios: [] },
]

const FIRMADAS: FilaFirmada[] = [
  { officialSlug: 'ana-perez', portfolio: 'Hacienda' },
  { officialSlug: 'ana-perez', portfolio: 'Personal' },
  { officialSlug: 'luis-gomez', portfolio: 'Urbanismo' },
]

describe('cotejarCoberturaEncaje', () => {
  it('con cobertura completa, todo coincide y nada es rojo', () => {
    const cotejos = cotejarCoberturaEncaje(OFICIALES, FIRMADAS)
    expect(cotejos).toHaveLength(3)
    expect(cotejos.every((c) => c.desenlace === 'coincide')).toBe(true)
    expect(cotejos.some((c) => ENCAJE_DESENLACES_ROJOS.includes(c.desenlace))).toBe(false)
  })

  it('un concejal sin delegación no genera fila: no es un hueco, es que no lleva nada', () => {
    const cotejos = cotejarCoberturaEncaje(OFICIALES, FIRMADAS)
    expect(cotejos.some((c) => c.oficial === 'sin-delegacion')).toBe(false)
  })

  // ── INYECCIÓN DE FALLOS: cada rojo, provocado a propósito ──────────────

  it('sin-firmar: un área nueva sin firma se señala (es el caso de la remodelación)', () => {
    const conAreaNueva: OficialConAreas[] = [
      ...OFICIALES,
      { slug: 'nueva-concejala', name: 'Nueva Concejala', portfolios: ['Movilidad'] },
    ]
    const cotejos = cotejarCoberturaEncaje(conAreaNueva, FIRMADAS)
    const roto = cotejos.filter((c) => c.desenlace === 'sin-firmar')
    expect(roto).toHaveLength(1)
    expect(roto[0].oficial).toBe('nueva-concejala')
    expect(roto[0].area).toBe('Movilidad')
    expect(ENCAJE_DESENLACES_ROJOS).toContain(roto[0].desenlace)
  })

  it('cargo-cambiado: una firma sobrevive al área que describe', () => {
    const reasignada: OficialConAreas[] = [
      { slug: 'ana-perez', name: 'Ana Pérez', portfolios: ['Hacienda'] }, // pierde Personal
      { slug: 'luis-gomez', name: 'Luis Gómez', portfolios: ['Urbanismo'] },
    ]
    const cotejos = cotejarCoberturaEncaje(reasignada, FIRMADAS)
    const roto = cotejos.filter((c) => c.desenlace === 'cargo-cambiado')
    expect(roto).toHaveLength(1)
    expect(roto[0].area).toBe('Personal')
    expect(roto[0].detalle).toContain('ya no lleva')
  })

  it('oficial-inexistente: el slug desaparece del padrón y la fila sigue publicada', () => {
    const sinAna: OficialConAreas[] = OFICIALES.filter((o) => o.slug !== 'ana-perez')
    const cotejos = cotejarCoberturaEncaje(sinAna, FIRMADAS)
    const roto = cotejos.filter((c) => c.desenlace === 'oficial-inexistente')
    expect(roto).toHaveLength(2) // Hacienda y Personal
    expect(roto.every((c) => c.oficial === 'ana-perez')).toBe(true)
  })

  it('el cotejo del área es LITERAL: un cambio de redacción no se traga en silencio', () => {
    const reformulada: OficialConAreas[] = [
      { slug: 'ana-perez', name: 'Ana Pérez', portfolios: ['Hacienda', 'Personal y RRHH'] },
      { slug: 'luis-gomez', name: 'Luis Gómez', portfolios: ['Urbanismo'] },
    ]
    const cotejos = cotejarCoberturaEncaje(reformulada, FIRMADAS)
    // Se ve por los DOS ejes, y las dos lecturas son correctas: hay un área
    // viva sin firmar, y una firma que ya no corresponde a ningún área.
    expect(cotejos.some((c) => c.desenlace === 'sin-firmar' && c.area === 'Personal y RRHH')).toBe(
      true,
    )
    expect(cotejos.some((c) => c.desenlace === 'cargo-cambiado' && c.area === 'Personal')).toBe(
      true,
    )
  })

  it('cero oficiales devuelve cero cotejos — el guion es quien sale 1 ahí', () => {
    expect(cotejarCoberturaEncaje([], [])).toHaveLength(0)
  })

  it('los desenlaces rojos son un subconjunto de los declarados', () => {
    for (const d of ENCAJE_DESENLACES_ROJOS) expect(ENCAJE_DESENLACES).toContain(d)
    expect(ENCAJE_DESENLACES_ROJOS).not.toContain('coincide')
  })
})

describe('los datos publicados hoy', () => {
  it('tienen una firma por cada área delegada', () => {
    const oficiales = JSON.parse(readFileSync('public/data/officials.json', 'utf8'))
    const encaje = JSON.parse(readFileSync('public/data/area-fit.json', 'utf8'))
    const cotejos = cotejarCoberturaEncaje(oficiales.officials ?? [], encaje.rows ?? [])

    // Anti-hueco: si esto recorriera cero áreas, la afirmación de abajo sería
    // vacuamente cierta. Es la comprobación de que la comprobación mide algo.
    expect(cotejos.length).toBeGreaterThan(0)

    const rojos = cotejos.filter((c) => ENCAJE_DESENLACES_ROJOS.includes(c.desenlace))
    expect(rojos.map((c) => `${c.desenlace}: ${c.oficial} · ${c.area}`)).toEqual([])
  })
})

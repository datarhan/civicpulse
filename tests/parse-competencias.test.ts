import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validarCompetencias, nombresVisibles, vigenteEn } from '../src/scraper/competencias'

const RAIZ = join(__dirname, '..')
const leer = (rel: string) => JSON.parse(readFileSync(join(RAIZ, rel), 'utf8'))

/**
 * El fichero publicado se valida en su propio bloque (se añade cuando existe).
 * Aquí van las inyecciones de fallo sobre objetos mínimos: lo que este módulo
 * tiene que NEGARSE a publicar.
 */
const base = () => ({
  generatedAt: '2026-08-23T00:00:00.000Z',
  mandato: { id: '2023-2027', desde: '2023-06-17', hasta: null },
  fuente: {
    titulo: 'Corporación municipal · Ayuntamiento de Riba-roja de Túria',
    url: 'https://www.ribarroja.es/es/ayuntamiento/corporacion_municipal',
    consultadaEl: '2026-08-23',
  },
  asignaciones: [
    {
      clave: 'a164-coste-unitario',
      cargo: 'Áreas Industriales y Cementerio',
      oficial: 'teresa-pozuelo-martin',
      nombre: 'Teresa Pozuelo Martín',
      partido: 'PSOE',
      confianza: 'literal',
      firmadoEl: '2026-08-23',
    },
  ],
  sinAsignar: [] as Array<{ clave: string; motivo: string }>,
  replicas: [] as Array<{ oficial: string; recibidaEl: string; texto: string; url?: string }>,
})

describe('competencias — el esquema válido pasa', () => {
  it('mide algo: valida un snapshot con al menos una asignación', () => {
    const v = validarCompetencias(base())
    expect(v.asignaciones.length).toBe(1)
    expect(v.asignaciones[0].confianza).toBe('literal')
  })
})

describe('competencias — inyecciones de fallo', () => {
  it('una asignación editorial sin razón no publica', () => {
    const c = base()
    c.asignaciones[0].confianza = 'editorial'
    expect(() => validarCompetencias(c)).toThrow(/razon/)
  })

  it('una razón de dos palabras no publica: tiene que explicar el salto', () => {
    const c = base() as ReturnType<typeof base> & {
      asignaciones: Array<Record<string, unknown>>
    }
    c.asignaciones[0].confianza = 'editorial'
    c.asignaciones[0].razon = 'es suyo'
    expect(() => validarCompetencias(c)).toThrow(/razon/)
  })

  it('una clave repetida entre asignaciones y sinAsignar no publica', () => {
    const c = base()
    c.sinAsignar.push({ clave: 'a164-coste-unitario', motivo: 'ninguna área lo nombra' })
    expect(() => validarCompetencias(c)).toThrow(/duplicada/)
  })

  it('un campo del esquema de pleno no publica: alguien copió una fila', () => {
    const c = base() as unknown as { asignaciones: Array<Record<string, unknown>> }
    c.asignaciones[0].severity = 'critical'
    expect(() => validarCompetencias(c)).toThrow(/campo prohibido/)
  })

  it('un campo de juicio no publica: aquí no se valora a nadie', () => {
    const c = base() as unknown as { asignaciones: Array<Record<string, unknown>> }
    c.asignaciones[0].responsable = true
    expect(() => validarCompetencias(c)).toThrow(/campo prohibido/)
  })

  it('un motivo vacío en sinAsignar no publica: un hueco se explica', () => {
    const c = base()
    c.sinAsignar.push({ clave: 'a4411-440p-coste-unitario', motivo: '' })
    expect(() => validarCompetencias(c)).toThrow(/motivo/)
  })
})

describe('competencias — congelación LOREG', () => {
  it('sin congelación, los nombres se ven', () => {
    expect(nombresVisibles(null, '2026-08-23')).toBe(true)
  })

  it('dentro de la ventana, los nombres se ocultan', () => {
    expect(nombresVisibles('2026-09-30', '2026-08-23')).toBe(false)
  })

  // frozenUntil es EXCLUSIVO, como las otras dos lecturas del mismo campo
  // (isPromiseFrozen y set-promises-freeze). La agregación de las tres la
  // vigila competencias-freeze-agreement.test.ts.
  it('el día del límite ya está descongelado: la ventana no lo incluye', () => {
    expect(nombresVisibles('2026-08-23', '2026-08-23')).toBe(true)
  })

  it('la víspera sigue congelada', () => {
    expect(nombresVisibles('2026-08-23', '2026-08-22')).toBe(false)
  })

  it('pasada la fecha, vuelven', () => {
    expect(nombresVisibles('2026-08-22', '2026-08-23')).toBe(true)
  })
})

describe('competencias — vigencia del mandato', () => {
  const m = { desde: '2023-06-17', hasta: null as string | null }

  it('un hecho posterior al inicio queda dentro', () => {
    expect(vigenteEn(m, '2024-12-31')).toBe(true)
  })

  it('la entrega de 2020 queda fuera: era otra corporación', () => {
    expect(vigenteEn(m, '2020-11-01')).toBe(false)
  })

  it('con el mandato ya cerrado, lo posterior queda fuera', () => {
    expect(vigenteEn({ desde: '2019-06-15', hasta: '2023-06-16' }, '2024-01-01')).toBe(false)
  })
})

describe('competencias — el fichero publicado', () => {
  const publicado = leer('public/data/competencias.json')

  it('mide algo: valida y trae asignaciones de verdad', () => {
    const v = validarCompetencias(publicado)
    expect(v.asignaciones.length).toBeGreaterThan(10)
  })

  it('cada oficial existe en officials.json y el cargo es literal suyo', () => {
    const of = leer('public/data/officials.json') as {
      officials: Array<{ slug: string; name: string; portfolios?: string[] }>
    }
    const porSlug = new Map(of.officials.map((o) => [o.slug, o]))
    for (const a of validarCompetencias(publicado).asignaciones) {
      const o = porSlug.get(a.oficial)
      expect(o, `oficial desconocido: ${a.oficial}`).toBeTruthy()
      expect(o!.name).toBe(a.nombre)
      expect(o!.portfolios ?? [], `cargo no literal: ${a.cargo}`).toContain(a.cargo)
    }
  })

  it('cada clave existe en el panel: una clave con errata no se pintaría nunca', () => {
    const ind = leer('public/data/indicadores.json') as {
      indicadores: Array<{ id: string }>
      municipales: Array<{ id: string }>
    }
    const ids = new Set([...ind.indicadores.map((i) => i.id), ...ind.municipales.map((m) => m.id)])
    const v = validarCompetencias(publicado)
    for (const a of v.asignaciones)
      expect(ids.has(a.clave), `clave fuera del panel: ${a.clave}`).toBe(true)
    for (const s of v.sinAsignar)
      expect(ids.has(s.clave), `clave fuera del panel: ${s.clave}`).toBe(true)
  })

  it('todo indicador del panel está o asignado o explicado: no hay silencios', () => {
    const ind = leer('public/data/indicadores.json') as {
      indicadores: Array<{ id: string }>
      municipales: Array<{ id: string }>
    }
    const v = validarCompetencias(publicado)
    const cubiertas = new Set([
      ...v.asignaciones.map((a) => a.clave),
      ...v.sinAsignar.map((s) => s.clave),
    ])
    const todas = [...ind.indicadores.map((i) => i.id), ...ind.municipales.map((m) => m.id)]
    const faltan = todas.filter((id) => !cubiertas.has(id))
    expect(faltan, `sin competencia ni explicación: ${faltan.join(', ')}`).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import { ejecutarSondeo, barridoNominal, lectoresReales } from '../scripts/journalist-sondeo'

/**
 * `journalist:sondeo` es la única puerta por la que la habilidad
 * investigar-cargo (y los subagentes que la ejecutan) consultan los lectores
 * que ya tiene el repositorio — BOE, DOGV, Dialnet, hemeroteca, prensa, plenos,
 * snapshots y el barrido nominal de contratación — sin inventarse descargas.
 * Lo que fija esto es la contabilidad: cada fuente termina en hallado / vacío /
 * fallo, un fallo no tumba a las demás, y una fuente que no se pidió no se
 * parece a una fuente que no encontró nada.
 */
const hit = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `hit ${i}` }))

function deps(over: Partial<Parameters<typeof ejecutarSondeo>[1]> = {}) {
  const calls: string[] = []
  const base: Parameters<typeof ejecutarSondeo>[1] = {
    boe: async (n) => (calls.push(`boe ${n}`), hit(2)),
    dogv: async (n) => (calls.push(`dogv ${n}`), []),
    dialnet: async (n) => (calls.push(`dialnet ${n}`), hit(1)),
    hemeroteca: async (n, y) => (calls.push(`hemeroteca ${n} ${y}`), y === 2023 ? hit(1) : []),
    prensa: (n) => (calls.push(`prensa ${n}`), hit(3)),
    plenoClaims: (n) => (calls.push(`plenoClaims ${n}`), []),
    snapshots: (n) => (calls.push(`snapshots ${n}`), hit(4)),
    semantico: async (n) => (calls.push(`semantico ${n}`), hit(1)),
    official: (slug) => (calls.push(`official ${slug}`), slug ? { slug } : null),
    tenders: [
      { id: 't1', title: 'Obra', assignee: 'CONSTRUCCIONES RAGA GADEA SL' },
      { id: 't2', title: 'Servicio', assignee: 'FRAGA SA' },
      { id: 't3', title: 'Sin adjudicatario', assignee: null },
    ],
    ...over,
  }
  return { d: base, calls }
}

describe('ejecutarSondeo', () => {
  it('cada fuente acaba en hallado o vacío con su n, y la semántica no pedida consta como no solicitada', async () => {
    const { d, calls } = deps()
    const r = await ejecutarSondeo(
      {
        nombre: 'Robert Raga Gadea',
        slug: 'robert-raga-gadea',
        anios: [2019, 2023],
        semantico: false,
      },
      d,
    )
    expect(r.nombre).toBe('Robert Raga Gadea')
    expect(r.slug).toBe('robert-raga-gadea')
    expect(r.generadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(r.fuentes.boe).toMatchObject({ estado: 'hallado', n: 2 })
    expect(r.fuentes.dogv).toMatchObject({ estado: 'vacio', n: 0 })
    expect(r.fuentes.prensa).toMatchObject({ estado: 'hallado', n: 3 })
    expect(r.fuentes['hemeroteca-2019']).toMatchObject({ estado: 'vacio', n: 0 })
    expect(r.fuentes['hemeroteca-2023']).toMatchObject({ estado: 'hallado', n: 1 })
    expect(r.fuentes['semantico-no-solicitado']).toMatchObject({ estado: 'vacio', n: 0 })
    expect(r.fuentes['semantico-no-solicitado'].motivo).toMatch(/--semantico/)
    expect(r.fuentes.semantico).toBeUndefined()
    expect(calls.some((c) => c.startsWith('semantico'))).toBe(false)
    expect(calls).toContain('hemeroteca Robert Raga Gadea 2019')
    expect(calls).toContain('hemeroteca Robert Raga Gadea 2023')
    expect(calls).toContain('official robert-raga-gadea')
    expect(() => JSON.stringify(r)).not.toThrow()
  })

  it('un lector que lanza queda como fallo con su motivo y los demás siguen', async () => {
    const { d } = deps({
      dogv: async () => {
        throw new Error('DOGV 503')
      },
    })
    const r = await ejecutarSondeo(
      { nombre: 'Robert Raga Gadea', anios: [2023], semantico: false },
      d,
    )
    expect(r.fuentes.dogv).toMatchObject({ estado: 'fallo', n: 0, motivo: 'DOGV 503' })
    expect(r.fuentes.boe).toMatchObject({ estado: 'hallado', n: 2 })
    expect(r.fuentes.prensa).toMatchObject({ estado: 'hallado', n: 3 })
  })

  it('con --semantico se llama y se contabiliza como cualquier otra fuente', async () => {
    const { d, calls } = deps()
    const r = await ejecutarSondeo({ nombre: 'Robert Raga Gadea', anios: [], semantico: true }, d)
    expect(calls).toContain('semantico Robert Raga Gadea')
    expect(r.fuentes.semantico).toMatchObject({ estado: 'hallado', n: 1 })
    expect(r.fuentes['semantico-no-solicitado']).toBeUndefined()
  })

  it('el barrido nominal de contratación entra como fuente, con palabra entera', async () => {
    const { d } = deps()
    const r = await ejecutarSondeo({ nombre: 'Robert Raga Gadea', anios: [], semantico: false }, d)
    expect(r.fuentes.contratacion).toMatchObject({ estado: 'hallado', n: 1 })
    expect(r.fuentes.contratacion.resultados).toEqual([
      { id: 't1', title: 'Obra', assignee: 'CONSTRUCCIONES RAGA GADEA SL' },
    ])
  })
})

describe('lectoresReales', () => {
  // Los lectores de boletín devolvían [] ante cualquier fallo, así que el
  // sondeo anotaba «vacío» sin haber llegado al servidor (06-09-2026). Los
  // lectores reales del CLI lanzan, y ejecutarSondeo lo contabiliza como fallo.
  const caida = (async () => {
    throw new TypeError('ECONNRESET')
  }) as unknown as typeof fetch

  it('un lector de boletín que no alcanza el servidor lanza en vez de devolver vacío', async () => {
    const d = lectoresReales({ fetchImpl: caida, tenders: [] })
    await expect(d.boe('Robert Raga Gadea')).rejects.toThrow(/ECONNRESET/)
    await expect(d.dogv('Robert Raga Gadea')).rejects.toThrow(/ECONNRESET/)
    await expect(d.dialnet('Robert Raga Gadea')).rejects.toThrow(/ECONNRESET/)
    await expect(d.hemeroteca('Robert Raga Gadea', 2023)).rejects.toThrow(/ECONNRESET/)
  })

  it('y el sondeo entero lo anota como fallo con motivo, no como vacío', async () => {
    const d = lectoresReales({ fetchImpl: caida, tenders: [] })
    const r = await ejecutarSondeo(
      { nombre: 'Robert Raga Gadea', anios: [2023], semantico: false },
      d,
    )
    for (const clave of ['boe', 'dogv', 'dialnet', 'hemeroteca-2023']) {
      expect(r.fuentes[clave].estado, clave).toBe('fallo')
      expect(r.fuentes[clave].motivo, clave).toMatch(/ECONNRESET/)
    }
  })
})

describe('barridoNominal', () => {
  const tenders = [
    { id: 't1', title: 'Obra', assignee: 'CONSTRUCCIONES RAGA GADEA SL' },
    { id: 't2', title: 'Servicio', assignee: 'FRAGA SA' },
    { id: 't3', title: 'Gómez', assignee: 'GÓMEZ SÁNCHEZ E HIJOS' },
    { id: 't4', title: 'Nulo', assignee: null },
  ]

  it('los dos apellidos como palabras enteras; RAGA no es FRAGA', () => {
    expect(barridoNominal(tenders, 'Robert Raga Gadea').map((t) => t.id)).toEqual(['t1'])
  })

  it('sin acentos ni caja por ninguno de los dos lados', () => {
    expect(barridoNominal(tenders, 'Rafael Gomez Sanchez').map((t) => t.id)).toEqual(['t3'])
  })

  it('un nombre de una sola palabra no barre nada — dos apellidos o nada', () => {
    expect(barridoNominal(tenders, 'Raga')).toEqual([])
  })
})

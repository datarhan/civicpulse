import { describe, it, expect } from 'vitest'
import { summarizeSessions, resumenPlenos } from '../src/lib/pleno-summary'

const input = {
  plenos: [
    { id: 'a', date: '2026-01-10', title: 'Sesión A', kind: 'ordinario', link: 'http://a' },
    { id: 'b', date: '2026-04-20', title: 'Sesión B', kind: 'urgente', link: 'http://b' },
    { id: 'c', date: '2025-03-02', title: 'Sesión C', kind: 'extraordinario', link: 'http://c' },
  ],
  manifestPlenos: [
    { plenoId: 'b', itemCount: 44, byVerdict: { verificado: 3, contradicho: 1, 'sin-datos': 9 } },
    { plenoId: 'c', itemCount: 12, byVerdict: { 'sin-datos': 12 } },
  ],
  findings: [{ plenoId: 'b' }, { plenoId: 'b' }, { plenoId: 'zz' }],
  agendas: [
    { id: 'b', agendaCount: 12 },
    { id: 'c', agendaCount: 0 },
  ],
  votesByPleno: { b: 4 },
}

describe('summarizeSessions', () => {
  it('joins counts and sorts newest-first', () => {
    const rows = summarizeSessions(input)
    expect(rows.map((r) => r.id)).toEqual(['b', 'a', 'c']) // newest first
    expect(rows[0]).toMatchObject({ puntos: 12, decl: 44, votos: 4, hall: 2 })
  })

  /**
   * EL defecto que este rediseño existe para arreglar.
   *
   * `summarizeSessions` devolvía `agendaCount: 0` para una sesión de la que no
   * hemos extraído el orden del día, y la fila la pintaba igual que una sesión
   * procesada sin nada que contar. «No lo hemos leído» y «lo leímos y no había»
   * compartían píxel, que en una página cuyo tema es cuánto nos falta es el
   * error que no se puede permitir.
   *
   * El sentinela es `null`, y nunca un cero: DATA_INTEGRITY regla 3.
   */
  it('distingue «no procesado» (null) de «procesado y a cero» (0)', () => {
    const rows = summarizeSessions(input)
    const a = rows.find((r) => r.id === 'a')
    const c = rows.find((r) => r.id === 'c')

    // 'a' no está en agendas, ni en el manifiesto, ni tiene votaciones.
    expect(a.puntos).toBeNull()
    expect(a.decl).toBeNull()
    expect(a.votos).toBeNull()

    // 'c' SÍ tiene orden del día extraído, y ese orden del día tiene 0 puntos.
    expect(c.puntos).toBe(0)
  })

  /**
   * Los hallazgos se derivan del texto procesado: sin declaraciones extraídas
   * no hemos mirado, así que tampoco podemos decir «cero».
   */
  it('sólo cuenta 0 hallazgos cuando la sesión tiene texto procesado', () => {
    const rows = summarizeSessions(input)
    expect(rows.find((r) => r.id === 'c').hall).toBe(0) // procesada, ninguno publicado
    expect(rows.find((r) => r.id === 'a').hall).toBeNull() // sin procesar
  })

  /**
   * Las votaciones NUNCA bajan a cero. Extraerlas y firmarlas es trabajo de
   * curador y ningún snapshot registra «miramos esta sesión y no se votó», así
   * que un 0 afirmaría algo que no sabemos.
   */
  it('nunca escribe 0 votaciones: o hay un número, o es null', () => {
    for (const r of summarizeSessions(input)) expect(r.votos).not.toBe(0)
  })

  it('tolerates missing inputs', () => {
    expect(summarizeSessions({ plenos: [] })).toEqual([])
    expect(summarizeSessions({})).toEqual([])
  })
})

describe('resumenPlenos', () => {
  const snapshots = {
    plenos: { items: input.plenos, stats: { total: 3, byYear: { 2026: 2, 2025: 1 } } },
    agendas: {
      plenos: input.agendas,
      stats: { agendaItemsTotal: 12, agendaItemsWithDepartment: 5, sessionsWithAgenda: 2 },
      topDepartments: [
        { department: 'hacienda', count: 7, departmentSlug: 'hacienda' },
        { department: 'obras raras', count: 2, departmentSlug: null },
      ],
    },
    manifest: {
      plenos: input.manifestPlenos,
      totals: {
        items: 56,
        byVerdict: { 'sin-datos': 52, parcial: 3, verificado: 1 },
        retenidas: { acusacion_publica: 20 },
        sinDatosPorque: { sinCorpus: 30, comprobadoSinHallar: 22 },
      },
    },
    votes: {
      items: [{ plenoId: 'b' }, { plenoId: 'b' }, { plenoId: 'b' }, { plenoId: 'b' }],
      stats: {
        total: 4,
        byOutcome: { aprobado: 3, rechazado: 1 },
        byPleno: { b: 4 },
        retracted: { record: 2, breakdown: 1 },
      },
    },
    findings: { items: input.findings },
  }

  it('la escalera son cuatro escalones anidados, cada uno subconjunto del anterior', () => {
    const { escalera } = resumenPlenos(snapshots)
    expect(escalera.map((e) => e.n)).toEqual([3, 2, 2, 1])
    for (const e of escalera) expect(e.de).toBe(3)
    // Anidados: ningún escalón puede superar al anterior, que es lo que la
    // propia tarjeta promete al lector.
    for (let i = 1; i < escalera.length; i++) {
      expect(escalera[i].n).toBeLessThanOrEqual(escalera[i - 1].n)
    }
  })

  /**
   * «desde junio de 2023» venía escrito a mano en la maqueta y es falso: la
   * sesión más antigua del snapshot es del 23 de enero de 2023, siete sesiones
   * antes de que se constituyera esta corporación. La frase sale de los datos.
   */
  it('la ventana sale de las fechas reales, no de una frase', () => {
    const { ventana } = resumenPlenos(snapshots)
    expect(ventana.desde).toBe('2025-03-02')
    expect(ventana.hasta).toBe('2026-04-20')
  })

  it('el embudo de declaraciones sale del manifiesto entero', () => {
    const { embudo } = resumenPlenos(snapshots)
    expect(embudo).toMatchObject({
      extraidas: 56,
      retenidas: 20,
      sinDatos: 52,
      parcial: 3,
      verificado: 1,
      sinCorpus: 30,
      comprobadoSinHallar: 22,
      sesiones: 2,
    })
  })

  it('las votaciones traen su desenlace y sus retiradas', () => {
    const { votos } = resumenPlenos(snapshots)
    expect(votos).toMatchObject({
      total: 4,
      aprobado: 3,
      rechazado: 1,
      sesiones: 1,
      retiradas: { record: 2, breakdown: 1 },
    })
  })

  /** Un slug sin etiqueta canónica se queda con su nombre crudo, no con «undefined». */
  it('los departamentos llevan etiqueta legible y su cuota del máximo', () => {
    const { departamentos } = resumenPlenos(snapshots)
    expect(departamentos[0]).toMatchObject({ nombre: 'Hacienda', n: 7, cuota: 1 })
    expect(departamentos[1].nombre).toBe('obras raras')
    expect(departamentos[1].cuota).toBeCloseTo(2 / 7)
  })

  /**
   * Cada filtro dice cuántas filas deja: un chip que promete «7» y enseña 4 es
   * peor que no tener filtro.
   */
  it('cada filtro cuenta exactamente las filas que deja pasar', () => {
    const { filtros, filas } = resumenPlenos(snapshots)
    for (const f of filtros) expect(filas.filter(f.pasa).length).toBe(f.n)
    expect(filtros.find((f) => f.id === 'todas').n).toBe(3)
    expect(filtros.find((f) => f.id === 'votos').n).toBe(1)
    expect(filtros.find((f) => f.id === 'sin-orden').n).toBe(1)
  })

  it('agrupa por año en orden descendente y cuenta cada grupo', () => {
    const { porAnio } = resumenPlenos(snapshots)
    expect(porAnio.map((g) => g.anio)).toEqual([2026, 2025])
    expect(porAnio.map((g) => g.n)).toEqual([2, 1])
  })

  it('aguanta snapshots ausentes sin inventar cifras', () => {
    const vacio = resumenPlenos({})
    expect(vacio.filas).toEqual([])
    expect(vacio.total).toBe(0)
    expect(vacio.votos.total).toBe(0)
    expect(vacio.embudo.extraidas).toBe(0)
    expect(vacio.ventana.desde).toBeNull()
  })
})

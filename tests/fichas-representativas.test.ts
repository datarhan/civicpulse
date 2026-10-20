import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { construirGrafoRutas } from '../scripts/lib/route-graph'
import {
  ELECTORES,
  fichaDe,
  fichasDe,
  leerDeDisco,
  type LeerSnapshot,
} from '../scripts/lib/fichas-representativas'
import { estadoDe, rutaBase } from '../src/scraper/reader-review'

/**
 * Una ficha por cada ruta con parámetro, elegida de los datos.
 *
 * Hasta el 29-09-2026 ninguna revisión lectora —ni el pre-push ni el barrido
 * de lunes y jueves— leía /plenos/:id, /departamentos/:slug, /hallazgos/:id,
 * /cargos/:slug, /eficiencia/:id, /empleo/:id, /quejas/:id ni
 * /laboratorio/agentes/:assignmentId: `rutasPublicas` tira toda ruta con `:`.
 * La PR #175 cambió ClaimLedger.jsx, que sólo pintan dos de ellas, y el gancho
 * leyó /declaraciones y dijo «nada que señalar».
 */

const grafo = construirGrafoRutas(resolve(__dirname, '..', 'src'))
const patrones = grafo.rutas.filter((r) => r.includes(':'))
const publicados = leerDeDisco(resolve(__dirname, '..', 'public', 'data'))

/** Un lector de snapshots hecho a mano: lo que no está, no existe. */
const datos =
  (mapa: Record<string, unknown>): LeerSnapshot =>
  (nombre) =>
    mapa[nombre] ?? null

describe('una ficha por cada ruta con parámetro', () => {
  it('mide algo: App.jsx monta rutas con parámetro', () => {
    // Si el grafo dejara de verlas, todo lo de abajo pasaría sin comprobar nada.
    expect(patrones.length).toBeGreaterThanOrEqual(8)
  })

  it('cada ruta con `:` de App.jsx tiene quien elija su ficha', () => {
    // Una ruta nueva con `:id` y sin elector volvería a quedarse sin leer, que
    // es exactamente cómo se quedaron estas ocho.
    const sinElector = patrones.filter((p) => !(p in ELECTORES))
    expect(sinElector).toEqual([])
  })

  it('con los datos publicados, toda ruta que tiene fichas elige una que se puede pedir', () => {
    for (const patron of patrones) {
      const f = fichaDe(patron, publicados)
      if (f.total === 0) continue
      expect(f.id, `${patron} tiene ${f.total} ficha(s) y no eligió ninguna`).not.toBeNull()
      // Una URL con `:` sería la plantilla, no una página.
      expect(rutaBase(f.clave), f.clave).not.toContain(':')
      const prefijo = patron.slice(0, patron.indexOf(':'))
      expect(rutaBase(f.clave).startsWith(prefijo), f.clave).toBe(true)
    }
  })

  it('el caso de la #175: las dos rutas que pintan ClaimLedger tienen ficha hoy', () => {
    expect(fichaDe('/plenos/:id', publicados).id).not.toBeNull()
    expect(fichaDe('/departamentos/:slug', publicados).id).not.toBeNull()
  })
})

describe('las reglas de elección, con datos a mano', () => {
  it('/plenos/:id: la sesión que llena las pestañas, no la más reciente vacía', () => {
    const f = fichaDe(
      '/plenos/:id',
      datos({
        'plenos.json': {
          items: [
            { id: 'vacia', date: '2026-06-01' },
            { id: 'llena', date: '2026-03-01' },
            { id: 'media', date: '2026-05-01' },
          ],
        },
        'plenos-agendas.json': { plenos: [{ id: 'vacia' }, { id: 'llena' }, { id: 'media' }] },
        'pleno-votes.json': { items: [{ plenoId: 'llena' }] },
        'pleno-findings.json': { items: [{ plenoId: 'llena' }, { plenoId: 'media' }] },
        'pleno-claims/index.json': {
          plenos: [
            { plenoId: 'llena', itemCount: 10, byVerdict: { 'sin-datos': 9, parcial: 1 } },
            { plenoId: 'media', itemCount: 5, byVerdict: { 'sin-datos': 5 } },
          ],
        },
      }),
    )
    expect(f.id).toBe('llena')
    expect(f.total).toBe(3)
    // Sus declaraciones van tras una pestaña que la carga no abre.
    expect(rutaBase(f.clave)).toBe('/plenos/llena')
    expect(estadoDe(f.clave)).toBe('pestanas')
  })

  it('/plenos/:id: nunca una sesión que plenos.json no conoce, porque su página no existe', () => {
    const f = fichaDe(
      '/plenos/:id',
      datos({
        'plenos.json': { items: [{ id: 'real', date: '2026-01-01' }] },
        'pleno-votes.json': { items: [{ plenoId: 'fantasma' }] },
        'pleno-findings.json': { items: [{ plenoId: 'fantasma' }] },
        'pleno-claims/index.json': {
          plenos: [{ plenoId: 'fantasma', itemCount: 3, byVerdict: { parcial: 3 } }],
        },
      }),
    )
    expect(f.id).toBe('real')
  })

  it('/hallazgos/:id: nunca uno retirado, y antes el más grave', () => {
    const f = fichaDe(
      '/hallazgos/:id',
      datos({
        'pleno-findings.json': {
          items: [
            { id: 'leve', severity: 'informational', publishedAt: '2026-09-01' },
            { id: 'notable', severity: 'notable', publishedAt: '2026-01-01' },
            { id: 'retirado', severity: 'critical', publishedAt: '2026-09-10' },
          ],
          retractions: [{ findingId: 'retirado' }],
        },
      }),
    )
    expect(f.id).toBe('notable')
    expect(f.total).toBe(2)
  })

  it('/cargos/:slug: un cargo en ejercicio con su bloque de encaje firmado', () => {
    // La ficha de quien dejó el cargo es OTRA plantilla (FormerDetalle), y el
    // bloque de encaje es lo que CLAUDE.md llama legalmente material.
    const f = fichaDe(
      '/cargos/:slug',
      datos({
        'officials.json': {
          officials: [{ slug: 'sin-encaje' }, { slug: 'con-encaje' }],
          formerOfficials: [{ slug: 'antiguo' }],
        },
        'area-fit.json': {
          rows: [
            { officialSlug: 'con-encaje' },
            { officialSlug: 'antiguo' },
            { officialSlug: 'antiguo' },
          ],
        },
      }),
    )
    expect(f.id).toBe('con-encaje')
    expect(f.clave).toBe('/cargos/con-encaje')
  })

  it('/eficiencia/:id: un servicio cuya competencia tiene titular, antes que uno sin él', () => {
    // Las dos fichas firmadas de `eficiencia-findings.json` son de indicadores
    // MUNICIPALES, que no tienen ficha propia: lo legalmente material de
    // /eficiencia/:id es el nombre de quien tiene delegada la competencia,
    // pintado en la misma tarjeta que la salvedad del tier.
    const f = fichaDe(
      '/eficiencia/:id',
      datos({
        'indicadores.json': { indicadores: [{ id: 'agua' }, { id: 'basuras' }] },
        'competencias.json': { asignaciones: [{ clave: 'basuras', oficial: 'alguien' }] },
      }),
    )
    expect(f.id).toBe('basuras')
  })

  it('/laboratorio/agentes/:assignmentId: el informe con su registro de correcciones', () => {
    const f = fichaDe(
      '/laboratorio/agentes/:assignmentId',
      datos({
        'journalist-reports.json': {
          items: [
            { assignmentId: 'reciente', promotedAt: '2026-09-20', corrections: [] },
            { assignmentId: 'corregido', promotedAt: '2026-07-31', corrections: [{}] },
          ],
        },
      }),
    )
    expect(f.id).toBe('corregido')
  })

  it('a igualdad de todo, el mismo resultado cada vez: el id menor', () => {
    const lee = datos({
      'empleo.json': {
        items: [
          { id: 'zeta', publishedAt: '2026-09-01' },
          { id: 'alfa', publishedAt: '2026-09-01' },
        ],
      },
    })
    expect(fichaDe('/empleo/:id', lee).id).toBe('alfa')
  })

  it('sin datos no se inventa una ficha: la clave es la plantilla, y se dirá SIN FICHA', () => {
    const f = fichaDe('/quejas/:id', datos({}))
    expect(f).toEqual({ patron: '/quejas/:id', clave: '/quejas/:id', id: null, total: 0 })
  })
})

/**
 * Todas las fichas de una plantilla, en el orden en que se elegirían.
 *
 * Leer una sola ficha basta para lo que falla en la plantilla, pero no para
 * saber QUÉ fichas cambian: un cambio que sólo toca la de un cargo concreto
 * pasa por delante de la elegida sin que nadie lo compare. Para poder comparar
 * todas las fichas de una plantilla, no sólo la elegida, la lista sale del
 * mismo elector: así no puede derivar de la elección.
 */
describe('fichasDe: todas las fichas de una plantilla', () => {
  it('mide algo: con los datos publicados, varias plantillas tienen más de una ficha', () => {
    const conVarias = patrones.filter((p) => fichasDe(p, publicados).length > 1)
    expect(conVarias.length).toBeGreaterThanOrEqual(4)
  })

  it('la primera es siempre la que elige fichaDe, con la misma clave y el mismo total', () => {
    for (const patron of patrones) {
      const una = fichaDe(patron, publicados)
      const todas = fichasDe(patron, publicados)
      if (una.id === null) {
        expect(todas, patron).toEqual([])
        continue
      }
      expect(todas[0], patron).toEqual(una)
      for (const f of todas) expect(f.total, f.clave).toBe(una.total)
    }
  })

  it('cada ficha es una URL que se puede pedir, sin repetir ninguna', () => {
    for (const patron of patrones) {
      const todas = fichasDe(patron, publicados)
      const prefijo = patron.slice(0, patron.indexOf(':'))
      for (const f of todas) {
        expect(rutaBase(f.clave), f.clave).not.toContain(':')
        expect(rutaBase(f.clave).startsWith(prefijo), f.clave).toBe(true)
        expect(f.patron).toBe(patron)
      }
      expect(new Set(todas.map((f) => f.clave)).size, patron).toBe(todas.length)
    }
  })

  it('/hallazgos/:id: todas menos las retiradas, en el orden de la elección', () => {
    const todas = fichasDe(
      '/hallazgos/:id',
      datos({
        'pleno-findings.json': {
          items: [
            { id: 'leve', severity: 'informational', publishedAt: '2026-09-01' },
            { id: 'notable', severity: 'notable', publishedAt: '2026-01-01' },
            { id: 'retirado', severity: 'critical', publishedAt: '2026-09-10' },
          ],
          retractions: [{ findingId: 'retirado' }],
        },
      }),
    )
    expect(todas.map((f) => f.clave)).toEqual(['/hallazgos/notable', '/hallazgos/leve'])
    expect(todas.map((f) => f.total)).toEqual([2, 2])
  })

  it('/plenos/:id: cada sesión lleva el estado de pestañas, como la elegida', () => {
    const todas = fichasDe(
      '/plenos/:id',
      datos({
        'plenos.json': {
          items: [
            { id: 'a', date: '2026-01-01' },
            { id: 'b', date: '2026-02-01' },
          ],
        },
      }),
    )
    expect(todas.map((f) => rutaBase(f.clave))).toEqual(['/plenos/b', '/plenos/a'])
    for (const f of todas) expect(estadoDe(f.clave)).toBe('pestanas')
  })

  it('el id va codificado en la URL, como en la elegida', () => {
    const todas = fichasDe(
      '/empleo/:id',
      datos({ 'empleo.json': { items: [{ id: 'oferta 1/2', publishedAt: '2026-09-01' }] } }),
    )
    expect(todas.map((f) => f.clave)).toEqual(['/empleo/oferta%201%2F2'])
  })

  it('un id repetido en los datos es UNA página: sale una vez, en su mejor puesto', () => {
    const todas = fichasDe(
      '/empleo/:id',
      datos({
        'empleo.json': {
          items: [
            { id: 'x', publishedAt: '2026-09-02' },
            { id: 'y', publishedAt: '2026-09-01' },
            { id: 'x', publishedAt: '2026-08-01' },
          ],
        },
      }),
    )
    expect(todas.map((f) => f.id)).toEqual(['x', 'y'])
  })

  it('sin datos, ninguna ficha (no la plantilla: «SIN FICHA» lo sigue diciendo fichaDe)', () => {
    expect(fichasDe('/quejas/:id', datos({}))).toEqual([])
  })

  it('una plantilla sin elector no tiene fichas', () => {
    expect(fichasDe('/no-existe/:id', datos({}))).toEqual([])
  })
})

import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { construirGrafoRutas } from '../scripts/lib/route-graph'
import {
  ELECTORES,
  fichaDe,
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

  it('/eficiencia/:id: un servicio con ficha firmada antes que uno sin ella', () => {
    const f = fichaDe(
      '/eficiencia/:id',
      datos({
        'indicadores.json': { indicadores: [{ id: 'agua' }, { id: 'basuras' }] },
        'eficiencia-findings.json': { items: [{ indicadorId: 'basuras' }] },
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

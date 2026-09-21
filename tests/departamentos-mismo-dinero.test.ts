/**
 * /departamentos contaba el dinero de contratación con OTRA regla.
 *
 * `docs/DATA_INTEGRITY.md` y el docstring de `isCommittedContract` cuentan la
 * misma cicatriz: «un predicado, importado en todas partes, para que la
 * definición de “gastado” no pueda derivar entre la tira de KPIs, el mapa, el
 * ranking y las páginas de departamento otra vez — que ya había pasado:
 * /departamentos decía 79 M€ donde /presupuesto decía 14,7 M€ del mismo
 * fichero». La página que da nombre a esa cicatriz seguía sin usar el
 * predicado.
 *
 * `department-stats.js` traía dos reglas propias:
 *
 *   filtro    `!c.assignee || c.status === 'revoked'`
 *   importe   `finalAmount || initialAmount`   ← CON IVA, y cae a lo licitado
 *
 * Medido el 2026-09-21 sobre los snapshots publicados, y las dos cosas que se
 * miden son distintas:
 *
 * **El filtro no mueve ni una fila hoy.** Los dos predicados seleccionan
 * exactamente los mismos 711 contratos. La divergencia es latente, no viva:
 * el suyo cuenta como gasto una licitación ABIERTA que ya nombre adjudicatario
 * —`open`, `provisionally_awarded`, `in_progress`— y cuenta una adjudicación
 * deshecha que no sea `revoked` (`void`, `abandoned`, `withdrawn`). Nada de eso
 * está hoy en el fichero, así que esto no arregla una cifra: tapa un agujero
 * antes de que lo cruce algo.
 *
 * **El importe sí mueve, y mucho.** Con IVA contra sin IVA son 11.431.296,04 €
 * sobre las mismas 711 filas (8,4 %), y sobre lo que de verdad llega a las
 * fichas —los contratos con área inequívoca— el total atribuido baja de
 * 72.056.226 € a 61.706.105 €: **−14,4 %**, con todas las áreas entre el −3,6 %
 * de hacienda y el −24,5 % de educación. O sea que cada ficha publicaba la
 * contratación de su área inflada entre un 4 % y un 25 % frente a la misma
 * contratación en /presupuesto, en la portada y en el mapa, que van sin IVA
 * como el titular «Importe de adjudicación» de PLACSP.
 *
 * Ninguna guarda lo veía porque todas comprueban el reparto —qué contrato cae
 * en qué área— y ninguna comparaba la MAGNITUD con la del resto del sitio.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { computeDepartmentStats } from '../src/lib/department-stats'
import { isCommittedContract, importeAdjudicado } from '../src/lib/contract-status'
import { departmentForTender, ALLOWED_DEPARTMENT_SLUGS } from '../src/scraper/departments'

const tenders = JSON.parse(readFileSync('public/data/tenders.json', 'utf8'))
const officials = JSON.parse(readFileSync('public/data/officials.json', 'utf8'))

describe('/departamentos mide el dinero con la regla del resto del sitio', () => {
  it('premisa: hay filas donde el con IVA y el sin IVA NO coinciden', () => {
    // Sin esto, la afirmación de abajo pasaría igual de verde en un fichero
    // donde las dos magnitudes fueran la misma, sin haber comprobado nada.
    const comprometidos = tenders.contracts.filter((c: object) => isCommittedContract(c))
    const conIva = comprometidos.reduce(
      (a: number, c: { finalAmount?: number; initialAmount?: number }) =>
        a + Number(c.finalAmount || c.initialAmount || 0),
      0,
    )
    const sinIva = comprometidos.reduce(
      (a: number, c: object) => a + (importeAdjudicado(c) ?? 0),
      0,
    )
    expect(comprometidos.length).toBeGreaterThan(0)
    expect(
      conIva - sinIva,
      'con IVA y sin IVA dan lo mismo: no hay nada que medir',
    ).toBeGreaterThan(1000)
  })

  it('lo que publica cada ficha es la suma de importeAdjudicado de SUS contratos', () => {
    const { bySlug } = computeDepartmentStats({ officials, tenders })

    const esperado = new Map<string, { contratos: number; eur: number }>()
    for (const c of tenders.contracts) {
      if (!isCommittedContract(c)) continue
      const slug = departmentForTender(c)
      if (!slug || !ALLOWED_DEPARTMENT_SLUGS.includes(slug)) continue
      const cur = esperado.get(slug) ?? { contratos: 0, eur: 0 }
      cur.contratos += 1
      cur.eur += importeAdjudicado(c) ?? 0
      esperado.set(slug, cur)
    }
    expect(esperado.size, 'ningún contrato cae en un área: esto no mide nada').toBeGreaterThan(3)

    for (const [slug, e] of esperado) {
      expect(bySlug[slug].contratacion.contratos, `${slug} · recuento`).toBe(e.contratos)
      expect(bySlug[slug].contratacion.importeEur, `${slug} · importe`).toBeCloseTo(e.eur, 2)
    }
  })

  it('y no es la suma con IVA, que es lo que publicaba', () => {
    // El otro lado de la puerta: sin esto, una implementación que siguiera
    // sumando con IVA pasaría la afirmación de arriba si alguien la escribiera
    // con la misma regla vieja.
    const { bySlug } = computeDepartmentStats({ officials, tenders })
    const publicado = ALLOWED_DEPARTMENT_SLUGS.reduce(
      (a: number, s: string) => a + bySlug[s].contratacion.importeEur,
      0,
    )
    const conIva = tenders.contracts.reduce((a: number, c: Record<string, unknown>) => {
      if (!isCommittedContract(c)) return a
      const slug = departmentForTender(c)
      if (!slug || !ALLOWED_DEPARTMENT_SLUGS.includes(slug)) return a
      return a + Number(c.finalAmount || c.initialAmount || 0)
    }, 0)
    expect(publicado).toBeLessThan(conIva)
  })

  it('el módulo importa las dos reglas en vez de repetirlas', () => {
    const fuente = readFileSync('src/lib/department-stats.js', 'utf8')
    expect(fuente, 'no importa el predicado').toMatch(/isCommittedContract/)
    expect(fuente, 'no importa la regla del importe').toMatch(/importeAdjudicado/)
    expect(fuente, 'sigue con su propio filtro de estado').not.toMatch(/status\s*===\s*'revoked'/)
    expect(fuente, 'sigue sumando con IVA').not.toMatch(/finalAmount\s*\|\|\s*c?\.?initialAmount/)
  })
})

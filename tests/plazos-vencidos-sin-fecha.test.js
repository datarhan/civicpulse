/**
 * «PLAZOS VENCIDOS 0» junto a una promesa que ya debía estar hecha.
 *
 * El 2026-10-12 la relectura de /departamentos/urbanismo lo señaló: la ficha
 * decía «Plazos vencidos 0» y, en la misma página, seguía «En progreso» un
 * anuncio del 25 de agosto que prometía la convocatoria «el próximo mes de
 * septiembre». El cero era fiel a la regla —sólo cuenta lo que lleva un `dueBy`
 * curado, y en esa área no lo llevaba nada: ni las promesas ni los votos de la
 * instantánea traían uno—, pero se leía «aquí no ha vencido nada». No se sabía:
 * lo único que se sabía es que nada tenía fecha.
 *
 * La salida no es deducir la fecha del texto —un plazo inferido por máquina es
 * justo lo que el validador impide—, sino no imprimir un cero que no mide nada:
 * «—» y «sin plazo fechado» cuando el área no tiene ningún compromiso con fecha,
 * y el denominador al lado cuando sí lo tiene.
 */
import { describe, expect, it } from 'vitest'

import { computeDepartmentStats } from '../src/lib/department-stats'
import { celdaPlazosVencidos } from '../src/lib/plazos-vencidos'
import { CATALOGUE, LOCALES } from '../src/i18n'

const HOY = new Date('2026-10-12T09:00:00Z')

// La forma del caso real (ac-psoe-1ryndd8), recortada: el plazo está en la cita
// y en ningún campo.
const promesaSinFecha = {
  id: 'ac-psoe-1ryndd8',
  party: 'PSOE',
  title: 'Ayudas de 140.000 euros para rehabilitación de fachadas',
  quote: 'El consistorio lanzará la convocatoria el próximo mes de septiembre.',
  source: { url: 'https://www.ribarroja.es/es/noticia/x', publisher: 'Ayuntamiento' },
  madeAt: '2026-08-25',
  topic: 'urbanismo',
  kind: 'anuncio-gobierno',
  status: 'en-progreso',
  evidence: [],
  createdAt: '2026-09-28',
}

const voto = (over) => ({
  id: 'v',
  plenoId: 'p1',
  plenoDate: '2026-03-01',
  itemNumber: 1,
  title: 'Acuerdo',
  outcome: 'aprobado',
  votes: [],
  department: 'Urbanismo',
  sourceUrl: 'https://x.test/acta',
  sourcePublisher: 'Ayto',
  retrievedAt: '2026-03-02',
  ...over,
})

const es = (k) => CATALOGUE.es[k] ?? k

describe('cuántos compromisos de un área llevan fecha', () => {
  it('una promesa con el plazo sólo en la cita no lleva fecha, y no se le deduce', () => {
    const r = computeDepartmentStats({ promises: { items: [promesaSinFecha] }, now: HOY })
    const b = r.bySlug.urbanismo
    expect(b.promesas.total).toBe(1)
    expect(b.promesas.conPlazo).toBe(0)
    expect(b.promesas.plazosVencidos).toBe(0)
    expect(b.plenoVotes.conPlazo).toBe(0)
  })

  it('cuenta las promesas con `dueBy` y los votos aprobados con `dueBy`', () => {
    const r = computeDepartmentStats({
      promises: { items: [promesaSinFecha, { ...promesaSinFecha, id: 'b', dueBy: '2026-09-30' }] },
      votes: {
        items: [
          voto({ id: 'v1', itemNumber: 1, dueBy: '2027-01-01', dueBySource: 'x'.repeat(20) }),
          // Un rechazo no compromete a nada: su fecha no es un plazo que vencer.
          voto({
            id: 'v2',
            itemNumber: 2,
            outcome: 'rechazado',
            dueBy: '2026-01-01',
            dueBySource: 'x'.repeat(20),
          }),
          voto({ id: 'v3', itemNumber: 3 }),
        ],
      },
      now: HOY,
    })
    const b = r.bySlug.urbanismo
    expect(b.promesas.conPlazo).toBe(1)
    expect(b.promesas.plazosVencidos).toBe(1)
    expect(b.plenoVotes.conPlazo).toBe(1)
    expect(b.plenoVotes.plazosVencidos).toBe(0)
  })
})

describe('celdaPlazosVencidos', () => {
  it('sin ningún compromiso fechado no hay cero: «—» y el motivo', () => {
    const r = computeDepartmentStats({ promises: { items: [promesaSinFecha] }, now: HOY })
    const celda = celdaPlazosVencidos(r.bySlug.urbanismo, es)
    expect(celda.value).toBe('—')
    expect(celda.value).not.toBe(0)
    expect(celda.sub).toBe(CATALOGUE.es['departamentos.card.sinPlazoFechado'])
    expect(celda.tone).toBeUndefined()
  })

  it('con fechas y nada vencido, el cero lleva su denominador', () => {
    const r = computeDepartmentStats({
      votes: { items: [voto({ dueBy: '2027-01-01', dueBySource: 'x'.repeat(20) })] },
      now: HOY,
    })
    const celda = celdaPlazosVencidos(r.bySlug.urbanismo, es)
    expect(celda.value).toBe(0)
    expect(celda.sub).toBe(CATALOGUE.es['departamentos.card.deConPlazo'].replace('{n}', '1'))
    expect(celda.tone).toBeUndefined()
  })

  it('lo vencido se cuenta sobre lo fechado y se marca', () => {
    const r = computeDepartmentStats({
      promises: {
        items: [
          { ...promesaSinFecha, id: 'a', dueBy: '2026-09-30' },
          { ...promesaSinFecha, id: 'b', dueBy: '2027-06-30' },
        ],
      },
      now: HOY,
    })
    const celda = celdaPlazosVencidos(r.bySlug.urbanismo, es)
    expect(celda.value).toBe(1)
    expect(celda.sub).toBe(CATALOGUE.es['departamentos.card.deConPlazo'].replace('{n}', '2'))
    expect(celda.tone).toBe('warn')
  })

  it('durante la veda electoral no se da cifra ni motivo', () => {
    const r = computeDepartmentStats({
      promises: { items: [{ ...promesaSinFecha, dueBy: '2026-09-30' }] },
      now: HOY,
    })
    const celda = celdaPlazosVencidos(r.bySlug.urbanismo, es, { frozen: true })
    expect(celda.value).toBe('—')
    expect(celda.tone).toBeUndefined()
    expect(celda.sub).toBeUndefined()
  })

  for (const loc of LOCALES) {
    it(`${loc}: las dos claves existen, son distintas y el hueco se rellena`, () => {
      const t = (k) => CATALOGUE[loc][k] ?? k
      const sin = CATALOGUE[loc]['departamentos.card.sinPlazoFechado']
      const de = CATALOGUE[loc]['departamentos.card.deConPlazo']
      expect(sin).toBeTruthy()
      expect(de).toBeTruthy()
      expect(de).toContain('{n}')
      expect(sin).not.toBe(de)
      const r = computeDepartmentStats({
        promises: { items: [{ ...promesaSinFecha, dueBy: '2027-06-30' }] },
        now: HOY,
      })
      const celda = celdaPlazosVencidos(r.bySlug.urbanismo, t)
      expect(celda.sub).not.toContain('{n}')
      expect(celda.sub).toContain('1')
    })
  }
})

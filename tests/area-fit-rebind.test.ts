/**
 * Una v2 promovida archiva la v1: el id del informe desaparece del índice y las
 * filas firmadas de «encaje declarado» —y los avisos espejados— que lo citan
 * quedan colgando. El validador las rechaza (bien) y no había ningún camino que
 * no fuera editar a mano el fichero que la guarda protege (mal). Reanclar es
 * cambiar SÓLO el reportId; el juicio, la firma y las pruebas no se tocan, y el
 * snapshot entero se revalida contra el informe nuevo al escribir.
 */
import { describe, expect, it } from 'vitest'
import { rebindAreaFitReport, type AreaFitSnapshot } from '../src/scraper/area-fit'

function snapshot(): AreaFitSnapshot {
  return {
    generatedAt: '2026-08-04T00:00:00.000Z',
    mandate: '2023-2027',
    rows: [
      {
        officialSlug: 'raquel-pamblanco-paredes',
        portfolio: 'Igualdad',
        departmentSlug: 'igualdad',
        reportId: 'r-old',
        formacion: { value: 'sin-relacion-declarada', evidence: [], reason: 'x' },
        experiencia: { value: 'sin-relacion-declarada', evidence: [], reason: 'y' },
        curatedBy: 'Sergei Lutchenko',
        curatedAt: '2026-08-04',
      },
      {
        officialSlug: 'eva-lara-catala',
        portfolio: 'Educación',
        departmentSlug: 'educacion',
        reportId: 'r-other',
        formacion: { value: 'sin-relacion-declarada', evidence: [], reason: 'x' },
        experiencia: { value: 'sin-relacion-declarada', evidence: [], reason: 'y' },
        curatedBy: 'Sergei Lutchenko',
        curatedAt: '2026-08-04',
      },
    ],
    avisos: [
      {
        officialSlug: 'raquel-pamblanco-paredes',
        reportId: 'r-old',
        avisoIndex: 1,
        eje: 'experiencia',
        direccion: 'matiza',
        verbatim: 'Las delegaciones han variado durante el mandato.',
        decoratesChip: true,
        curatedBy: 'Sergei Lutchenko',
        curatedAt: '2026-08-04',
      },
    ],
  } as AreaFitSnapshot
}

describe('rebindAreaFitReport', () => {
  it('cambia el reportId de las filas y avisos del informe viejo y nada más', () => {
    const before = snapshot()
    const { snapshot: after, rows, avisos } = rebindAreaFitReport(before, 'r-old', 'r-new')
    expect(rows).toBe(1)
    expect(avisos).toBe(1)
    expect(after.rows[0].reportId).toBe('r-new')
    expect(after.rows[1].reportId).toBe('r-other')
    expect(after.avisos?.[0].reportId).toBe('r-new')
    // el juicio, la firma y el índice no se tocan
    expect(after.rows[0].curatedBy).toBe('Sergei Lutchenko')
    expect(after.rows[0].formacion).toEqual(before.rows[0].formacion)
    expect(after.avisos?.[0].avisoIndex).toBe(1)
    expect(after.avisos?.[0].verbatim).toBe(before.avisos?.[0].verbatim)
    // no muta la entrada
    expect(before.rows[0].reportId).toBe('r-old')
  })

  it('se niega cuando ningún elemento cita el informe viejo: un cero no es un reanclaje', () => {
    expect(() => rebindAreaFitReport(snapshot(), 'r-nadie', 'r-new')).toThrow(/r-nadie/)
  })

  it('se niega a reanclar un informe sobre sí mismo o a un id vacío', () => {
    expect(() => rebindAreaFitReport(snapshot(), 'r-old', 'r-old')).toThrow()
    expect(() => rebindAreaFitReport(snapshot(), 'r-old', '')).toThrow()
  })
})

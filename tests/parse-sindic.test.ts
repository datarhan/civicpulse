import { describe, expect, it } from 'vitest'
import {
  stats,
  validateResolucion,
  validateSnapshot,
  type SindicResolucion,
} from '../src/scraper/sindic'

function mkRes(overrides: Partial<SindicResolucion> = {}): SindicResolucion {
  return {
    id: 'sindic-202400427',
    expediente: '202400427',
    fecha: '2024-06-12',
    materia: 'transparencia',
    sentido: 'recomendacion',
    titulo: 'Falta de respuesta a solicitud de acceso a contratos de limpieza',
    resumen:
      'El Síndic recomienda al Ayuntamiento de Riba-roja de Túria que resuelva expresamente la solicitud de acceso a la información pública relativa a los contratos de limpieza viaria 2024, en cumplimiento del artículo 20 de la Ley 19/2013.',
    urlPdf: 'https://www.elsindic.com/resolucions/2024/202400427.pdf',
    quejaIdRelacionada: null,
    ...overrides,
  }
}

describe('sindic — validateResolucion', () => {
  it('accepts a canonical record', () => {
    expect(() => validateResolucion(mkRes())).not.toThrow()
  })

  it('rejects id not starting with sindic-', () => {
    expect(() => validateResolucion(mkRes({ id: '202400427' }))).toThrow(/sindic-/)
  })

  it('rejects malformed expediente', () => {
    expect(() => validateResolucion(mkRes({ expediente: '4' }))).toThrow(/digits/)
    expect(() => validateResolucion(mkRes({ expediente: '20/2024' }))).toThrow(/digits/)
  })

  it('rejects non-ISO fecha', () => {
    expect(() => validateResolucion(mkRes({ fecha: '12/06/2024' }))).toThrow(/ISO/)
  })

  it('rejects unknown materia and sentido', () => {
    expect(() => validateResolucion(mkRes({ materia: 'politica' as never }))).toThrow(/materia/)
    expect(() => validateResolucion(mkRes({ sentido: 'despotriquería' as never }))).toThrow(
      /sentido/,
    )
  })

  it('rejects short / long titulo + resumen', () => {
    expect(() => validateResolucion(mkRes({ titulo: 'corto' }))).toThrow(/titulo/)
    expect(() => validateResolucion(mkRes({ resumen: 'muy corto' }))).toThrow(/resumen/)
  })

  it('enforces urlPdf on elsindic.com', () => {
    expect(() => validateResolucion(mkRes({ urlPdf: 'https://example.com/x.pdf' }))).toThrow(
      /elsindic\.com/,
    )
    // http (non-https) also rejected
    expect(() => validateResolucion(mkRes({ urlPdf: 'http://www.elsindic.com/x.pdf' }))).toThrow(
      /elsindic\.com/,
    )
  })

  it('accepts queja linkage when well-formed', () => {
    const r = validateResolucion(mkRes({ quejaIdRelacionada: 'Q-ABC12301' }))
    expect(r.quejaIdRelacionada).toBe('Q-ABC12301')
  })

  it('rejects malformed quejaIdRelacionada', () => {
    expect(() => validateResolucion(mkRes({ quejaIdRelacionada: 'abc' as never }))).toThrow(
      /quejaId/,
    )
  })
})

describe('sindic — validateSnapshot', () => {
  it('rejects duplicate ids', () => {
    const raw = {
      generatedAt: '2026-04-20T00:00:00Z',
      items: [mkRes(), mkRes()],
    }
    expect(() => validateSnapshot(raw)).toThrow(/duplicate/)
  })

  it('rejects out-of-order items (must be newest first)', () => {
    const older = mkRes({ id: 'sindic-202300001', expediente: '202300001', fecha: '2023-01-01' })
    const newer = mkRes({ id: 'sindic-202400427', expediente: '202400427', fecha: '2024-06-12' })
    expect(() => validateSnapshot({ items: [older, newer] })).toThrow(/newest first/)
    expect(() => validateSnapshot({ items: [newer, older] })).not.toThrow()
  })

  it('normalises source metadata', () => {
    const s = validateSnapshot({ items: [] })
    expect(s.source.platform).toMatch(/Síndic de Greuges/)
    expect(s.source.portal).toBe('https://www.elsindic.com')
  })
})

describe('sindic — stats', () => {
  it('aggregates by materia/sentido and counts queja linkage', () => {
    const snap = validateSnapshot({
      items: [
        mkRes({
          id: 'sindic-a',
          expediente: '202400427',
          fecha: '2024-06-12',
          sentido: 'recomendacion',
          materia: 'transparencia',
          quejaIdRelacionada: 'Q-ABC12301',
        }),
        mkRes({
          id: 'sindic-b',
          expediente: '202300001',
          fecha: '2023-12-01',
          sentido: 'archivada',
          materia: 'urbanismo',
        }),
      ],
    })
    const s = stats(snap)
    expect(s.total).toBe(2)
    expect(s.bySentido.recomendacion).toBe(1)
    expect(s.byMateria.transparencia).toBe(1)
    expect(s.byMateria.urbanismo).toBe(1)
    expect(s.withQuejaRelacionada).toBe(1)
  })
})

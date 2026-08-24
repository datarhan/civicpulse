import { describe, expect, it } from 'vitest'
import {
  ALLOWED_MATERIAS,
  ALLOWED_SENTIDOS,
  idResolucion,
  stats,
  validateResolucion,
  validateSnapshot,
  type SindicResolucion,
} from '../src/scraper/sindic'
import {
  SINDIC_MATERIA_LABEL,
  SINDIC_SENTIDO_LABEL,
  SINDIC_SENTIDO_TONE,
} from '../src/hooks/useSindic'

const OTRO_PDF = 'https://www.elsindic.com/resoluciones/expedientes/2023/202300001/11000001.pdf'
const URL_PDF = 'https://www.elsindic.com/resoluciones/expedientes/2024/202400427/12337532.pdf'

/**
 * El id ya no se escribe: se DERIVA con la misma función que usa el CLI.
 *
 * Escribirlo a mano aquí es justo lo que la regla 1 de DATA_INTEGRITY prohíbe —
 * seis pruebas de este repo copiaron una forma y siguieron verdes mientras
 * producción no casaba con nada. Y hay un motivo concreto: `sindic-<expediente>`
 * colisionaba entre las dos resoluciones de un mismo expediente.
 */
function mkRes(overrides: Partial<SindicResolucion> = {}): SindicResolucion {
  const expediente = overrides.expediente ?? '202400427'
  const urlPdf = overrides.urlPdf ?? URL_PDF
  return {
    id: idResolucion(expediente, urlPdf),
    expediente: '202400427',
    fecha: '2024-06-12',
    materia: 'transparencia',
    sentido: 'recomendacion',
    titulo: 'Falta de respuesta a solicitud de acceso a contratos de limpieza',
    resumen:
      'El Síndic recomienda al Ayuntamiento de Riba-roja de Túria que resuelva expresamente la solicitud de acceso a la información pública relativa a los contratos de limpieza viaria 2024, en cumplimiento del artículo 20 de la Ley 19/2013.',
    urlPdf: URL_PDF,
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
    const older = mkRes({ expediente: '202300001', fecha: '2023-01-01', urlPdf: OTRO_PDF })
    const newer = mkRes({ expediente: '202400427', fecha: '2024-06-12' })
    expect(() => validateSnapshot({ items: [older, newer] })).toThrow(/newest first/)
    expect(() => validateSnapshot({ items: [newer, older] })).not.toThrow()
  })

  it('DOS resoluciones del mismo expediente conviven — la colisión que había', () => {
    // 202502231 lleva «consideraciones» el 22/07/2025 y «cierre» el 10/09/2025.
    // Con el id viejo (`sindic-<expediente>`) la segunda ficha habría chocado
    // con la primera y el CLI la habría rechazado como duplicada.
    const base = { expediente: '202502231', fecha: '2025-09-10' } as const
    const consideraciones = mkRes({
      ...base,
      fecha: '2025-07-22',
      urlPdf: 'https://www.elsindic.com/resoluciones/expedientes/2025/202502231/12337532.pdf',
    })
    const cierre = mkRes({
      ...base,
      urlPdf: 'https://www.elsindic.com/resoluciones/expedientes/2025/202502231/12361228.pdf',
    })
    expect(consideraciones.id).not.toBe(cierre.id)
    expect(() => validateSnapshot({ items: [cierre, consideraciones] })).not.toThrow()
  })

  it('rechaza un id que no salga de su propio expediente + PDF', () => {
    // La derivación se COMPRUEBA, no sólo se aplica en el CLI: un fichero
    // editado a mano no puede reintroducir la colisión por la puerta de atrás.
    expect(() => validateResolucion(mkRes({ id: 'sindic-202400427' }))).toThrow(/derived/)
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
          expediente: '202400427',
          fecha: '2024-06-12',
          sentido: 'recomendacion',
          materia: 'transparencia',
          quejaIdRelacionada: 'Q-ABC12301',
        }),
        mkRes({
          expediente: '202300001',
          urlPdf: OTRO_PDF,
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

// ─── El enum y su etiqueta, que se separan solos ────────────────────────────
//
// `ALLOWED_MATERIAS` vive en el esquema y `SINDIC_MATERIA_LABEL` en el hook, a
// dos ficheros de distancia. Al añadir `procedimiento-administrativo` y
// `empleo-publico` el 24-08-2026 hubo que tocar los dos, y nada obligaba a
// ello: una materia sin etiqueta se pinta con su slug crudo en la pastilla —
// «procedimiento-administrativo» en la cara del lector— y ninguna prueba de
// datos lo vería, porque el dato estaría perfecto.

describe('cada materia permitida tiene su etiqueta legible', () => {
  it('mide algo: hay materias y hay etiquetas', () => {
    expect(ALLOWED_MATERIAS.length).toBeGreaterThan(10)
    expect(Object.keys(SINDIC_MATERIA_LABEL).length).toBeGreaterThan(10)
  })

  it('ninguna materia se pintaría con su slug', () => {
    const sinEtiqueta = ALLOWED_MATERIAS.filter((m) => !SINDIC_MATERIA_LABEL[m])
    expect(sinEtiqueta, `sin etiqueta en useSindic.js: ${sinEtiqueta.join(', ')}`).toEqual([])
  })

  it('y no hay etiquetas huérfanas de una materia que ya no existe', () => {
    const huerfanas = Object.keys(SINDIC_MATERIA_LABEL).filter(
      (k) => !(ALLOWED_MATERIAS as readonly string[]).includes(k),
    )
    expect(huerfanas).toEqual([])
  })

  it('lo mismo para el sentido: etiqueta y tono', () => {
    for (const s of ALLOWED_SENTIDOS) {
      expect(SINDIC_SENTIDO_LABEL[s], `sentido sin etiqueta: ${s}`).toBeTruthy()
      expect(SINDIC_SENTIDO_TONE[s], `sentido sin tono: ${s}`).toBeTruthy()
    }
  })
})

import { describe, it, expect } from 'vitest'
import { verifyClaim } from '../src/scraper/claim-verifier'

/**
 * El nombre del FONDO no es el objeto del contrato.
 *
 * `1lk4zls-1-num` (nota municipal del 25-09-2026 sobre la sensorización de
 * contenedores) cita 135.000 € «con cargo al PSTD (fondos Next Generation
 * EU)», y el extractor dejó como entidad la financiación: «PSTD 2022 / Next
 * Generation EU». Todo contrato del Plan de Recuperación lleva «Next
 * Generation» en el título, así que el solapamiento mutuo encontró dos tokens
 * compartidos con el de las pérgolas (131.336 €, amountSim ≈ 0,97) y se
 * publicó `parcial` con ese contrato de evidencia. La revisión lectora del
 * 11-10-2026 lo señaló en /laboratorio.
 *
 * Medido ese día sobre las 57 evidencias de tipo tender publicadas: ésta era
 * la única que se sostenía sólo en palabras del fondo, y ninguna de las demás
 * compartía una. Con el control de abajo, el arreglo no puede pasar matando
 * la corroboración de un contrato que sí nombra su objeto.
 */
const claim = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'c1',
    plenoId: 'p1',
    type: 'afirmacion_numerica',
    topic: 'fiscal',
    speakerGroup: null,
    verbatim: 'x'.repeat(30),
    context: '',
    entities: {},
    confidence: 0.9,
    ...overrides,
  }) as never

const tenders = (rows: Array<{ title: string; finalAmount: number }>) => ({ contracts: rows })

const PERGOLAS =
  'Contrato administrativo de obras para la ejecución del proyecto de “Obras de Instalación de ' +
  'pérgolas con vegetación autóctona para fomento de la resiliencia frente al cambio climático, ' +
  'en el marco del Plan de Recuperación, Transformación y Resiliencia financiado por la Unión ' +
  'Europea- Next Generation'

describe('las palabras del fondo no anclan una cifra a un contrato', () => {
  it('«PSTD 2022 / Next Generation EU» NO se corrobora con las pérgolas de 131.336 €', () => {
    const v = verifyClaim({
      claim: claim({
        entities: { amountEuros: 135_000, referencedEntity: 'PSTD 2022 / Next Generation EU' },
      }),
      tenders: tenders([{ title: PERGOLAS, finalAmount: 131_336 }]),
    })
    expect(v.evidence.filter((e) => e.kind === 'tender')).toEqual([])
    expect(v.verdict).not.toBe('parcial')
  })

  it('tampoco con la fórmula larga del Plan de Recuperación como entidad', () => {
    const v = verifyClaim({
      claim: claim({
        entities: {
          amountEuros: 135_000,
          referencedEntity: 'Plan de Recuperación, Transformación y Resiliencia',
        },
      }),
      tenders: tenders([{ title: PERGOLAS, finalAmount: 131_336 }]),
    })
    expect(v.evidence.filter((e) => e.kind === 'tender')).toEqual([])
  })

  it('con el objeto nombrado, el contrato del mismo fondo sí corrobora (control)', () => {
    const v = verifyClaim({
      claim: claim({
        entities: {
          amountEuros: 165_289.25,
          referencedEntity: 'sensorización de contenedores Next Generation',
        },
      }),
      tenders: tenders([
        {
          title:
            'Contrato administrativo para la contratación de la plataforma para la gestión de la ' +
            'sensorización de contenedores e información del servicio de recogida de RSU, ' +
            'financiado por la Unión Europea, Next Generation UE',
          finalAmount: 165_289.25,
        },
      ]),
    })
    expect(v.evidence.some((e) => e.kind === 'tender')).toBe(true)
  })
})

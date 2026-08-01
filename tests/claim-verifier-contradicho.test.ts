import { describe, it, expect } from 'vitest'
import { verifyClaim } from '../src/scraper/claim-verifier'

/**
 * `contradicho` says "a councillor stated something the municipal record
 * refutes". It is the most accusatory verdict the machine can assign, and on
 * the real corpus the deterministic matcher produced 49 of them and got all 49
 * wrong. Each case below is one of those, reproduced from the published data.
 */
const claim = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'c1',
    plenoId: 'p1',
    type: 'afirmacion_numerica',
    topic: 'hacienda',
    speakerGroup: 'PSOE',
    verbatim: 'x'.repeat(30),
    context: '',
    entities: {},
    confidence: 0.9,
    ...overrides,
  }) as never

const tenders = (rows: Array<{ title: string; finalAmount: number }>) => ({ contracts: rows })

describe('claim-verifier — contradicho requires a real match', () => {
  it('does not refute residential rents with a contract that rents a refuse truck', () => {
    // Both contain "alquiler"; overlapScore divided by min(1, N) = 1.0.
    const v = verifyClaim({
      claim: claim({ entities: { amountEuros: 640, referencedEntity: 'alquiler' } }),
      tenders: tenders([
        {
          title:
            'Contrato de suministro de compra de 75 contenedores RSU y de alquiler de un camión recolector de RSU',
          finalAmount: 486000,
        },
      ]),
    })
    expect(v.verdict).not.toBe('contradicho')
  })

  it('does not refute a €63bn regional debt figure with a €32k park extension', () => {
    // The park is literally named "parque Generalitat".
    const v = verifyClaim({
      claim: claim({
        entities: { amountEuros: 63_000_000_000, referencedEntity: 'generalitat' },
      }),
      tenders: tenders([{ title: 'Amplicación parque Generalitat', finalAmount: 32591 }]),
    })
    expect(v.verdict).not.toBe('contradicho')
  })

  it('does not refute regional DANA funding with a rubble-clearing job', () => {
    const v = verifyClaim({
      claim: claim({ entities: { amountEuros: 2_364_000_000, referencedEntity: 'dana' } }),
      tenders: tenders([
        {
          title:
            'Contrato verbal de servicio de oficiales con maquinaria para limpiar y recoger escombro en la vía pública',
          finalAmount: 180000,
        },
      ]),
    })
    expect(v.verdict).not.toBe('contradicho')
  })

  it('does not refute a regional programme total with one school contract', () => {
    // "plan" + "edificant" DO overlap mutually — this is the case the overlap
    // test cannot catch, and why the scale guard exists. The Plan Edificant is
    // a Generalitat programme; one €486k job does not refute its total.
    const v = verifyClaim({
      claim: claim({
        entities: { amountEuros: 1_700_000_000, referencedEntity: 'plan edificant' },
      }),
      tenders: tenders([
        { title: 'obras del plan edificant: eficiencia energética CEIP Eres Altes', finalAmount: 486000 },
        { title: 'contrato mayor de referencia', finalAmount: 55_685_179 },
      ]),
    })
    expect(v.verdict).not.toBe('contradicho')
  })

  it('still refutes when the claim names the contract and the figure is municipal', () => {
    // Multi-token entity, mutual overlap, municipal scale, 5× amount gap.
    const v = verifyClaim({
      claim: claim({
        type: 'cita_obra',
        entities: {
          amountEuros: 1_000_000,
          referencedEntity: 'reasfaltado casco urbano',
        },
      }),
      tenders: tenders([
        { title: 'Obras de reasfaltado del casco urbano', finalAmount: 200000 },
      ]),
    })
    expect(v.verdict).toBe('contradicho')
  })
})

import { describe, it, expect } from 'vitest'
import { verifyClaim } from '../src/scraper/claim-verifier'
import type { PlenoClaim } from '../src/scraper/pleno-claim'

function baseClaim(partial: Partial<PlenoClaim> = {}): PlenoClaim {
  return {
    id: 'test-001-pro-abc123',
    plenoId: 'test',
    plenoDate: '2026-03-09',
    segmentIndex: 0,
    type: 'afirmacion_numerica',
    speakerGroup: 'PSOE',
    verbatim: 'hemos asignado 46 millones al presupuesto',
    context: 'contexto contexto contexto contexto contexto',
    topic: 'fiscal',
    entities: { amountEuros: 46_000_000 },
    confidence: 0.8,
    reasoning: 'cita numérica',
    requiresHumanApproval: true,
    ...partial,
  }
}

describe('verifyClaim — sin-datos when no datasets provided', () => {
  it('emits sin-datos with checkedAgainst=[]', () => {
    const v = verifyClaim({ claim: baseClaim() })
    expect(v.verdict).toBe('sin-datos')
    expect(v.evidence).toHaveLength(0)
    expect(v.checkedAgainst).toEqual([])
  })
})

describe('verifyClaim — verificado on tender exact match', () => {
  it('finds a tender with matching amount and returns verificado', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'cita_obra',
        entities: {
          amountEuros: 9_500_000,
          referencedEntity: 'reconstruccion dana',
        },
      }),
      tenders: {
        contracts: [
          {
            permalink: 'https://contrataciones.example/r01',
            title: 'Reconstrucción post-DANA fase 1',
            award_amount_eur: 9_500_000,
          },
        ],
      },
    })
    expect(v.verdict).toBe('verificado')
    expect(v.evidence.some((e) => e.kind === 'tender')).toBe(true)
    expect(v.checkedAgainst).toContain('tenders')
  })
})

describe('verifyClaim — parcial on near-match', () => {
  it('returns parcial when tender is same entity but different amount', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'cita_obra',
        entities: {
          amountEuros: 9_500_000,
          referencedEntity: 'reconstruccion dana',
        },
      }),
      tenders: {
        contracts: [
          {
            permalink: 'https://contrataciones.example/r02',
            title: 'Reconstrucción post-DANA fase preliminar',
            award_amount_eur: 7_800_000, // similarAmount(9.5M, 7.8M) ≈ 0.68
          },
        ],
      },
    })
    expect(v.verdict).toBe('parcial')
    expect(v.evidence).toHaveLength(1)
  })
})

describe('verifyClaim — promesa-repetida on quote overlap', () => {
  it('flags a promise whose quote overlaps ≥0.55 with verbatim', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'promesa',
        speakerGroup: 'PSOE',
        topic: 'vivienda',
        verbatim: 'construiremos quinientas viviendas sociales antes de dos mil veintisiete',
        entities: {},
      }),
      promises: {
        items: [
          {
            id: 'psoe-vivienda-2024',
            party: 'PSOE',
            title: 'Plan municipal de vivienda',
            quote: 'Construiremos 500 viviendas sociales antes de 2027',
            topic: 'vivienda',
            madeAt: '2024-06-01',
            source: { url: 'https://prensa.example/v', publisher: 'Test' },
          },
        ],
      },
    })
    expect(v.verdict).toBe('promesa-repetida')
    expect(v.evidence[0].kind).toBe('promise')
  })
})

describe('verifyClaim — acusacion_publica always sin-datos', () => {
  it('does not try to verify political accusations', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'acusacion_publica',
        verbatim: 'el partido de la oposición incumplió su programa',
      }),
      tenders: { contracts: [{ title: 'cualquier cosa', award_amount_eur: 46_000_000 }] },
    })
    expect(v.verdict).toBe('sin-datos')
    expect(v.summary).toContain('acusaciones')
  })
})

describe('verifyClaim — BDNS match', () => {
  it('finds a matching grant in BDNS and returns verificado', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'cita_convenio',
        topic: 'social',
        verbatim: 'recibimos un convenio de 120.000 euros para servicios sociales',
        entities: {
          amountEuros: 120_000,
          referencedEntity: 'servicios sociales convenio generalitat',
        },
      }),
      bdns: {
        items: [
          {
            url: 'https://bdns.example/g',
            titulo: 'Convenio Generalitat — servicios sociales municipal',
            importe: 120_000,
          },
        ],
      },
    })
    expect(v.verdict).toBe('verificado')
    expect(v.evidence[0].kind).toBe('bdns')
  })
})

describe('verifyClaim — empty promises list does not trigger repetida', () => {
  it('returns sin-datos for a promesa with no match', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'promesa',
        verbatim: 'nunca dicho antes quinientas cosas inexistentes',
      }),
      promises: { items: [] },
    })
    expect(v.verdict).toBe('sin-datos')
  })
})

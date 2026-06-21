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
  it('returns parcial when tender is same entity but amount only partially agrees', () => {
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
            // similarAmount(9.5M, 7M) ≈ 0.54. Passes the 0.5 amount gate
            // so the tender registers as evidence, but combined with a 1.0
            // entity text-sim yields 0.72 — above the 0.6 weak threshold
            // (parcial) yet below the 0.8 strong threshold (verificado).
            award_amount_eur: 7_000_000,
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

describe('verifyClaim — acusacion_publica opinativa stays sin-datos', () => {
  it('returns sin-datos for opinativa subtype even with strong evidence nearby', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'acusacion_publica',
        accusationSubtype: 'opinativa',
        verbatim: 'el equipo de gobierno nunca escucha a los vecinos',
      }),
      tenders: { contracts: [{ title: 'cualquier cosa', award_amount_eur: 46_000_000 }] },
    })
    expect(v.verdict).toBe('sin-datos')
    expect(v.summary).toContain('carácter')
  })

  it('defaults to opinativa when subtype is missing (safe default)', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'acusacion_publica',
        verbatim: 'algo controvertido sin cifras ni entidades',
      }),
    })
    expect(v.verdict).toBe('sin-datos')
  })
})

describe('verifyClaim — acusacion_publica factual is verified against data', () => {
  it('returns verificado when a factual accusation matches a tender', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'acusacion_publica',
        accusationSubtype: 'factual',
        topic: 'fiscal',
        verbatim: 'gastaron 9,5 millones en la reconstrucción sin licitar',
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
  })
})

describe('verifyClaim — contradicho on amount mismatch with same entity', () => {
  it('emits contradicho when a claim cites an amount that disagrees with the matching tender', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'afirmacion_numerica',
        topic: 'urbanismo',
        verbatim: 'hemos invertido 20 millones en la reconstrucción',
        entities: {
          amountEuros: 20_000_000,
          referencedEntity: 'reconstruccion dana',
        },
      }),
      tenders: {
        contracts: [
          {
            permalink: 'https://contrataciones.example/r02',
            title: 'Reconstrucción post-DANA fase 1',
            award_amount_eur: 9_500_000,
          },
        ],
      },
    })
    expect(v.verdict).toBe('contradicho')
    expect(v.summary).toContain('Discrepancia material')
  })
})

describe('verifyClaim — contradicho on completion vs tender status', () => {
  it('emits contradicho when the speaker says "terminada" but tender is open', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'cita_obra',
        topic: 'urbanismo',
        verbatim: 'la reconstrucción post-DANA está terminada y entregada',
        entities: {
          referencedEntity: 'reconstruccion dana',
        },
      }),
      tenders: {
        contracts: [
          {
            permalink: 'https://contrataciones.example/r03',
            title: 'Reconstrucción post-DANA fase 1',
            status: 'open',
          },
        ],
      },
    })
    expect(v.verdict).toBe('contradicho')
    expect(v.summary).toContain('terminada')
  })
})

describe('verifyClaim — completion detection is negation-aware (libel-safe)', () => {
  const openTender = {
    contracts: [
      {
        permalink: 'https://contrataciones.example/r04',
        title: 'Reconstrucción post-DANA fase 1',
        status: 'open',
      },
    ],
  }

  it('does NOT emit contradicho when the speaker says the work is NOT finished', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'cita_obra',
        topic: 'urbanismo',
        verbatim: 'la reconstrucción post-DANA no está terminada todavía',
        entities: { referencedEntity: 'reconstruccion dana' },
      }),
      tenders: openTender,
    })
    // Speaker AGREES it is not done — flagging this as "contradicho" would
    // falsely claim their statement is contradicted by the data.
    expect(v.verdict).not.toBe('contradicho')
  })

  it('does NOT emit contradicho for "aún no se ha finalizado"', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'cita_obra',
        topic: 'urbanismo',
        verbatim: 'aún no se ha finalizado la reconstrucción post-DANA',
        entities: { referencedEntity: 'reconstruccion dana' },
      }),
      tenders: openTender,
    })
    expect(v.verdict).not.toBe('contradicho')
  })

  it('still emits contradicho when "no" appears AFTER the completion verb (unrelated)', () => {
    const v = verifyClaim({
      claim: baseClaim({
        type: 'cita_obra',
        topic: 'urbanismo',
        verbatim: 'la reconstrucción post-DANA está terminada, no como dicen otros',
        entities: { referencedEntity: 'reconstruccion dana' },
      }),
      tenders: openTender,
    })
    expect(v.verdict).toBe('contradicho')
  })
})

describe('verifyClaim — completion synonyms (recall)', () => {
  const openTender = {
    contracts: [
      {
        permalink: 'https://contrataciones.example/r05',
        title: 'Urbanización del polígono norte',
        status: 'pendiente',
      },
    ],
  }
  for (const phrase of [
    'el polígono norte ya está operativo',
    'el polígono norte se ha puesto en servicio',
    'el polígono norte está en funcionamiento',
    'la urbanización del polígono norte se ha puesto en marcha',
    'la urbanización del polígono norte está concluida',
  ]) {
    it(`flags contradicho for "${phrase}" vs a still-pending tender`, () => {
      const v = verifyClaim({
        claim: baseClaim({
          type: 'cita_obra',
          topic: 'urbanismo',
          verbatim: phrase,
          entities: { referencedEntity: 'urbanización del polígono norte' },
        }),
        tenders: openTender,
      })
      expect(v.verdict).toBe('contradicho')
    })
  }
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

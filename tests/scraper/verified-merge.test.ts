import { describe, it, expect } from 'vitest'
import {
  mergeVerified,
  isDowngrade,
  validateOverlay,
  applyOverlayEntries,
  validateReclassifications,
  applyReclassificationEntries,
  reclassificationOutcomes,
  type VerifiedItem,
  type Overlay,
  type Reclassifications,
} from '../../src/scraper/verified-merge'
import { ALLOWED_CLAIM_TYPES, type ClaimType } from '../../src/scraper/pleno-claim'
import type { ClaimVerdict, ClaimVerification } from '../../src/scraper/claim-verifier'

function item(id: string, verdict: ClaimVerification['verdict']): VerifiedItem {
  return {
    claim: { id } as VerifiedItem['claim'],
    verification: { claimId: id, verdict, summary: '', evidence: [], checkedAgainst: [] },
  }
}

function overlay(entries: Record<string, ClaimVerification['verdict']>): Overlay {
  return {
    version: 1,
    generatedAt: '2026-06-23T00:00:00.000Z',
    entries: Object.fromEntries(
      Object.entries(entries).map(([id, verdict]) => [
        id,
        {
          verification: {
            claimId: id,
            verdict,
            summary: 's',
            evidence: [],
            checkedAgainst: ['nli-grounding'],
          },
          source: 'nli',
          appliedAt: '2026-06-23T00:00:00.000Z',
        },
      ]),
    ),
  }
}

describe('mergeVerified', () => {
  it('lets an overlay entry win per claimId, preserving base order', () => {
    const base = [item('a', 'sin-datos'), item('b', 'parcial'), item('c', 'sin-datos')]
    const merged = mergeVerified(base, overlay({ b: 'verificado', c: 'parcial' }))
    expect(merged.map((m) => m.claim.id)).toEqual(['a', 'b', 'c']) // order preserved
    expect(merged.find((m) => m.claim.id === 'a')!.verification.verdict).toBe('sin-datos') // untouched
    expect(merged.find((m) => m.claim.id === 'b')!.verification.verdict).toBe('verificado') // overlay wins
    expect(merged.find((m) => m.claim.id === 'c')!.verification.verdict).toBe('parcial')
  })

  it('drops overlay entries whose claimId is absent from base', () => {
    const base = [item('a', 'sin-datos')]
    const merged = mergeVerified(base, overlay({ ghost: 'verificado' }))
    expect(merged).toHaveLength(1)
    expect(merged[0].claim.id).toBe('a')
  })
})

describe('isDowngrade', () => {
  it('treats less-certain moves as downgrades and rejects upgrades / sideways', () => {
    expect(isDowngrade('verificado', 'sin-datos')).toBe(true)
    expect(isDowngrade('verificado', 'parcial')).toBe(true)
    expect(isDowngrade('parcial', 'sin-datos')).toBe(true)
    expect(isDowngrade('contradicho', 'parcial')).toBe(true)
    expect(isDowngrade('contradicho', 'sin-datos')).toBe(true)
    expect(isDowngrade('sin-datos', 'verificado')).toBe(false)
    expect(isDowngrade('parcial', 'verificado')).toBe(false)
    expect(isDowngrade('parcial', 'parcial')).toBe(false)
    expect(isDowngrade('parcial', 'contradicho')).toBe(false) // never "downgrade" INTO contradicho
  })
})

function vrf(id: string, verdict: ClaimVerdict): ClaimVerification {
  return { claimId: id, verdict, summary: 's', evidence: [], checkedAgainst: [] }
}

describe('validateOverlay', () => {
  it('accepts a well-formed overlay and rejects malformed entries', () => {
    const ok: Overlay = {
      version: 1,
      generatedAt: 'x',
      entries: { a: { verification: vrf('a', 'parcial'), source: 'nli', appliedAt: 'x' } },
    }
    expect(() => validateOverlay(ok)).not.toThrow()
    // missing verification
    expect(() =>
      validateOverlay({
        version: 1,
        generatedAt: 'x',
        entries: { a: { source: 'nli', appliedAt: 'x' } },
      } as unknown as Overlay),
    ).toThrow()
    // curator-downgrade with reason < 20 chars
    expect(() =>
      validateOverlay({
        version: 1,
        generatedAt: 'x',
        entries: {
          a: {
            verification: vrf('a', 'sin-datos'),
            source: 'curator-downgrade',
            appliedAt: 'x',
            reason: 'too short',
          },
        },
      } as Overlay),
    ).toThrow()
  })
})

describe('applyOverlayEntries', () => {
  const empty: Overlay = { version: 1, generatedAt: 'x', entries: {} }

  it('adds an nli entry and stamps appliedAt + generatedAt', () => {
    const out = applyOverlayEntries(
      empty,
      [{ claimId: 'a', verification: vrf('a', 'verificado'), source: 'nli' }],
      'TS',
    )
    expect(out.entries.a.source).toBe('nli')
    expect(out.entries.a.appliedAt).toBe('TS')
    expect(out.generatedAt).toBe('TS')
    expect(empty.entries.a).toBeUndefined() // input not mutated
  })

  it('rejects a curator-downgrade with a short reason', () => {
    const base = new Map<string, ClaimVerdict>([['a', 'verificado']])
    expect(() =>
      applyOverlayEntries(
        empty,
        [
          {
            claimId: 'a',
            verification: vrf('a', 'sin-datos'),
            source: 'curator-downgrade',
            reason: 'short',
          },
        ],
        'TS',
        base,
      ),
    ).toThrow()
  })

  it('rejects a curator-downgrade that is not actually a downgrade', () => {
    const base = new Map<string, ClaimVerdict>([['a', 'sin-datos']])
    expect(() =>
      applyOverlayEntries(
        empty,
        [
          {
            claimId: 'a',
            verification: vrf('a', 'verificado'),
            source: 'curator-downgrade',
            reason: 'this is a sufficiently long reason to pass the gate',
          },
        ],
        'TS',
        base,
      ),
    ).toThrow()
  })

  it('accepts a valid curator downgrade (contradicho → sin-datos)', () => {
    const base = new Map<string, ClaimVerdict>([['a', 'contradicho']])
    const out = applyOverlayEntries(
      empty,
      [
        {
          claimId: 'a',
          verification: vrf('a', 'sin-datos'),
          source: 'curator-downgrade',
          reason: 'the cited evidence does not actually contradict the claim',
          editor: 'sergei',
        },
      ],
      'TS',
      base,
    )
    expect(out.entries.a.verification.verdict).toBe('sin-datos')
    expect(out.entries.a.reason).toContain('does not actually contradict')
  })

  it('accepts a verdict-engine entry (re-derivation) with a grounded reason', () => {
    const out = applyOverlayEntries(
      empty,
      [
        {
          claimId: 'a',
          verification: vrf('a', 'sin-datos'),
          source: 'verdict-engine',
          reason: 'ningun candidato respalda el importe ni el sujeto de la afirmacion',
          editor: 'verdict-engine:gpt-5.4-mini',
        },
      ],
      'TS',
    )
    expect(out.entries.a.source).toBe('verdict-engine')
    expect(out.entries.a.verification.verdict).toBe('sin-datos')
  })

  it('rejects a verdict-engine entry with a short reason', () => {
    expect(() =>
      applyOverlayEntries(
        empty,
        [
          {
            claimId: 'a',
            verification: vrf('a', 'sin-datos'),
            source: 'verdict-engine',
            reason: 'x',
          },
        ],
        'TS',
      ),
    ).toThrow()
  })

  it('rejects a verdict-engine entry that emits contradicho', () => {
    expect(() =>
      applyOverlayEntries(
        empty,
        [
          {
            claimId: 'a',
            verification: vrf('a', 'contradicho'),
            source: 'verdict-engine',
            reason: 'the engine must never be allowed to emit a contradicho verdict',
          },
        ],
        'TS',
      ),
    ).toThrow()
  })
})

// ---------------------------------------------------------------------------
// Reclasificación curada de tipo (el sidecar hermano del overlay de veredictos).
//
// El caso que la exige: el claim 10yl550-220-acu-0101aa — «La norma, la ley del
// vivienda estatal no es inconstitucional …» — salió del extractor como
// `acusacion_publica`/`factual` sin que nadie resulte acusado, y el chip
// «acusación no contrastada» de /plenos/10yl550 le atribuye al PSOE una
// acusación que no hizo. Ningún movimiento de veredicto cambia ese chip (la
// puerta oculta toda acusación sin fundar), así que el campo corregible es el
// TIPO — sólo ALEJÁNDOSE de acusación, nunca hacia ella: el espejo exacto de
// «downgrade-only».

function claimItem(
  id: string,
  type: string,
  accusationSubtype?: string,
  verdict: ClaimVerdict = 'sin-datos',
): VerifiedItem {
  return {
    claim: { id, type, accusationSubtype } as unknown as VerifiedItem['claim'],
    verification: {
      claimId: id,
      verdict,
      summary: '',
      evidence: [],
      checkedAgainst: ['verdict-engine'],
    },
  }
}

const RAZON = 'defensa de la constitucionalidad de una ley estatal; nadie resulta acusado'

function reclas(entries: Record<string, Partial<Reclassifications['entries'][string]>>) {
  return {
    version: 1,
    generatedAt: 'x',
    entries: Object.fromEntries(
      Object.entries(entries).map(([id, e]) => [
        id,
        {
          type: 'valoracion_politica' as ClaimType,
          from: 'acusacion_publica' as ClaimType,
          reason: RAZON,
          editor: 'curator',
          appliedAt: 'x',
          ...e,
        },
      ]),
    ),
  } as Reclassifications
}

describe('reclasificaciones — el sexto tipo existe', () => {
  it('valoracion_politica está en el enum (importado, no restatado)', () => {
    expect(ALLOWED_CLAIM_TYPES).toContain('valoracion_politica')
  })
})

describe('validateReclassifications', () => {
  it('accepts a well-formed sidecar', () => {
    expect(() => validateReclassifications(reclas({ a: {} }))).not.toThrow()
  })
  it('rejects a type outside the enum', () => {
    expect(() =>
      validateReclassifications(reclas({ a: { type: 'tipo-inventado' as ClaimType } })),
    ).toThrow(/\[reclas\]/)
  })
  it('rejects a reclassification TOWARD acusacion_publica — never libel-increasing', () => {
    expect(() =>
      validateReclassifications(
        reclas({ a: { type: 'acusacion_publica' as ClaimType, from: 'promesa' as ClaimType } }),
      ),
    ).toThrow(/\[reclas\]/)
  })
  it('rejects a reason under 20 chars', () => {
    expect(() => validateReclassifications(reclas({ a: { reason: 'corta' } }))).toThrow(
      /\[reclas\]/,
    )
  })
  it('rejects a missing appliedAt', () => {
    expect(() =>
      validateReclassifications(reclas({ a: { appliedAt: undefined as unknown as string } })),
    ).toThrow(/\[reclas\]/)
  })
  it('rejects a from other than acusacion_publica — v1 mirrored at READ time', () => {
    // Un sidecar editado a mano no puede mover lo que el CLI no movería.
    expect(() =>
      validateReclassifications(
        reclas({ a: { from: 'promesa' as ClaimType, type: 'cita_obra' as ClaimType } }),
      ),
    ).toThrow(/\[reclas\]/)
  })
})

describe('applyReclassificationEntries', () => {
  const empty: Reclassifications = { version: 1, generatedAt: 'x', entries: {} }
  const baseTypes = new Map<string, ClaimType>([['a', 'acusacion_publica']])

  it('adds the entry, stamps appliedAt + generatedAt, records from, does not mutate input', () => {
    const out = applyReclassificationEntries(
      empty,
      [{ claimId: 'a', type: 'valoracion_politica' as ClaimType, reason: RAZON, editor: 'e' }],
      'TS',
      baseTypes,
    )
    expect(out.entries.a.type).toBe('valoracion_politica')
    expect(out.entries.a.from).toBe('acusacion_publica')
    expect(out.entries.a.appliedAt).toBe('TS')
    expect(out.generatedAt).toBe('TS')
    expect(empty.entries.a).toBeUndefined()
  })
  it('rejects a claim absent from the published corpus', () => {
    expect(() =>
      applyReclassificationEntries(
        empty,
        [{ claimId: 'ghost', type: 'valoracion_politica' as ClaimType, reason: RAZON }],
        'TS',
        baseTypes,
      ),
    ).toThrow(/\[reclas\]/)
  })
  it('rejects when the published type is not acusacion_publica (v1 only moves AWAY)', () => {
    const nonAcu = new Map<string, ClaimType>([['a', 'promesa']])
    expect(() =>
      applyReclassificationEntries(
        empty,
        [{ claimId: 'a', type: 'valoracion_politica' as ClaimType, reason: RAZON }],
        'TS',
        nonAcu,
      ),
    ).toThrow(/\[reclas\]/)
  })
  it('rejects acusacion_publica as target', () => {
    expect(() =>
      applyReclassificationEntries(
        empty,
        [{ claimId: 'a', type: 'acusacion_publica' as ClaimType, reason: RAZON }],
        'TS',
        baseTypes,
      ),
    ).toThrow(/\[reclas\]/)
  })
  it('rejects a short reason', () => {
    expect(() =>
      applyReclassificationEntries(
        empty,
        [{ claimId: 'a', type: 'valoracion_politica' as ClaimType, reason: 'corta' }],
        'TS',
        baseTypes,
      ),
    ).toThrow(/\[reclas\]/)
  })
})

describe('mergeVerified con reclasificaciones', () => {
  it('replaces claim.type, drops accusationSubtype, leaves verification and id intact', () => {
    const base = [
      claimItem('a', 'acusacion_publica', 'factual'),
      claimItem('b', 'promesa', undefined, 'verificado'),
    ]
    const merged = mergeVerified(
      base,
      { version: 1, generatedAt: 'x', entries: {} },
      reclas({ a: {} }),
    )
    const a = merged.find((m) => m.claim.id === 'a')!
    expect((a.claim as { type?: string }).type).toBe('valoracion_politica')
    expect('accusationSubtype' in a.claim).toBe(false)
    expect(a.claim.id).toBe('a')
    expect(a.verification.verdict).toBe('sin-datos') // untouched
    const b = merged.find((m) => m.claim.id === 'b')!
    expect((b.claim as { type?: string }).type).toBe('promesa') // untouched row
    expect((base[0].claim as { type?: string }).type).toBe('acusacion_publica') // input not mutated
  })

  it('composes with the overlay: verdict from overlay, type from reclassification', () => {
    const base = [claimItem('a', 'acusacion_publica', 'factual', 'verificado')]
    const merged = mergeVerified(base, overlay({ a: 'parcial' }), reclas({ a: {} }))
    expect(merged[0].verification.verdict).toBe('parcial')
    expect((merged[0].claim as { type?: string }).type).toBe('valoracion_politica')
  })

  it('skips (without throwing) an entry whose claim is gone upstream', () => {
    const base = [claimItem('a', 'acusacion_publica', 'factual')]
    const merged = mergeVerified(
      base,
      { version: 1, generatedAt: 'x', entries: {} },
      reclas({ ghost: {} }),
    )
    expect(merged).toHaveLength(1)
    expect((merged[0].claim as { type?: string }).type).toBe('acusacion_publica')
  })

  it('skips a stale entry (base type moved) and keeps the base type', () => {
    const base = [claimItem('a', 'cita_obra')]
    const merged = mergeVerified(
      base,
      { version: 1, generatedAt: 'x', entries: {} },
      reclas({ a: {} }),
    )
    expect((merged[0].claim as { type?: string }).type).toBe('cita_obra')
  })
})

describe('reclassificationOutcomes', () => {
  it('counts aplicadas / sinClaim / obsoletas separately — three outcomes, none folded', () => {
    const base = [claimItem('a', 'acusacion_publica', 'factual'), claimItem('b', 'cita_obra')]
    const out = reclassificationOutcomes(base, reclas({ a: {}, b: {}, ghost: {} }))
    expect(out.aplicadas).toEqual(['a'])
    expect(out.obsoletas).toEqual(['b'])
    expect(out.sinClaim).toEqual(['ghost'])
  })
})

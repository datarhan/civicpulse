import { describe, it, expect } from 'vitest'
import {
  mergeVerified,
  isDowngrade,
  esSubida,
  validateOverlay,
  applyOverlayEntries,
  validateReclassifications,
  applyReclassificationEntries,
  reclassificationOutcomes,
  overlayOutcomes,
  verificacionDeBajada,
  type VerifiedItem,
  type Overlay,
  type OverlaySource,
  type Reclassifications,
} from '../../src/scraper/verified-merge'
import { ALLOWED_CLAIM_TYPES, type ClaimType } from '../../src/scraper/pleno-claim'
import type { ClaimVerdict, ClaimVerification } from '../../src/scraper/claim-verifier'
import { CLAIM_VERDICTS } from '../../src/scraper/claim-verdicts'

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

/**
 * Una verificación REALISTA para el veredicto que se le pida.
 *
 * Antes devolvía siempre `evidence: []` y `checkedAgainst: []`, o sea un
 * `verificado` sin nada detrás — un objeto que no puede existir y que desde el
 * suelo de evidencia (2026-08-27) el overlay rechaza al escribirlo. El fixture
 * estaba modelando justo la forma que el sistema no debe producir, que es cómo
 * una suite se queda verde midiendo lo imposible.
 */
function vrf(id: string, verdict: ClaimVerdict): ClaimVerification {
  const fuerte = verdict === 'verificado' || verdict === 'parcial'
  return {
    claimId: id,
    verdict,
    summary: 's',
    evidence: fuerte ? [{ kind: 'tender', ref: 'r', snippet: 'sn' }] : [],
    checkedAgainst: fuerte ? ['tenders'] : [],
  }
}

describe('verificacionDeBajada — lo que escriben las dos CLI de bajada', () => {
  // `downgrade-verdict` y `apply-gold-downgrades` recitaban esta forma cada una
  // por su cuenta. Vive en un sitio para que quien la necesite —la prueba de la
  // puerta, la primera— pase por el camino real en vez de recitarla otra vez.
  const actual: ClaimVerification = {
    claimId: 'a',
    verdict: 'verificado',
    summary: 'lo que dijo la máquina',
    evidence: [{ kind: 'tender', ref: 'r', snippet: 'sn' }],
    checkedAgainst: ['tenders'],
  }

  it('bajar a parcial conserva la evidencia y deja la marca del curador', () => {
    expect(
      verificacionDeBajada('a', actual, 'parcial', 'la evidencia sólo acredita el contrato'),
    ).toEqual({
      claimId: 'a',
      verdict: 'parcial',
      summary: 'la evidencia sólo acredita el contrato',
      evidence: [{ kind: 'tender', ref: 'r', snippet: 'sn' }],
      checkedAgainst: ['curator-downgrade'],
    })
  })

  it('bajar a sin-datos vacía la evidencia: «no hay datos» no enseña datos', () => {
    const v = verificacionDeBajada('a', actual, 'sin-datos', 'ningún dato respalda la afirmación')
    expect(v.verdict).toBe('sin-datos')
    expect(v.evidence).toEqual([])
  })
})

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

  it('adds an entry and stamps appliedAt + generatedAt', () => {
    // Con el motor y no con NLI: desde el 29-09-2026 el anclaje sólo propone y
    // el overlay no le acepta nada (tests/entrada-de-pasada.test.ts).
    const out = applyOverlayEntries(
      empty,
      [
        {
          claimId: 'a',
          verification: vrf('a', 'sin-datos'),
          source: 'verdict-engine',
          reason: 'ningun candidato respalda el importe ni el sujeto de la afirmacion',
        },
      ],
      'TS',
    )
    expect(out.entries.a.source).toBe('verdict-engine')
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

  it('rechaza escribir un resumen que habla de la tarea del modelo, venga de la pasada que venga', () => {
    // El caso que lo pide: 101 resúmenes servidos del motor eran el parte del
    // modelo sobre su encargo (src/lib/resumenes-retirados.js).
    const charla = 'Task completed: reasoned in Spanish about candidate support for the claim.'
    for (const source of ['verdict-engine', 'nli', 'llm'] as const) {
      expect(() =>
        applyOverlayEntries(
          empty,
          [
            {
              claimId: 'a',
              verification: { ...vrf('a', 'sin-datos'), summary: charla },
              source,
              reason: `verdict-engine re-judged verificado→sin-datos: ${charla}`,
            },
          ],
          'TS',
        ),
      ).toThrow(/tarea/)
    }
  })

  it('lo que ya está no estalla: una entrada vieja con charla no impide escribir otra', () => {
    // Como el suelo de evidencia: la guarda va en la ESCRITURA de lo nuevo. Si
    // mirara lo que ya está, la tubería entera se pararía por las filas viejas.
    const motor = (id: string) => ({
      claimId: id,
      verification: vrf(id, 'sin-datos'),
      source: 'verdict-engine' as const,
      reason: 'ningun candidato respalda el importe ni el sujeto de la afirmacion',
    })
    const previo = applyOverlayEntries(empty, [motor('b')], 'TS')
    previo.entries.b.verification.summary = 'Análisis completado en el texto de respuesta.'
    expect(() => applyOverlayEntries(previo, [motor('a')], 'TS2')).not.toThrow()
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

/**
 * Lo que el overlay publica, contra la base de HOY.
 *
 * Una entrada se juzga al escribirla contra la base de ese día (`isDowngrade`
 * en `applyOverlayEntries`), y `mergeVerified` la vuelve a aplicar sobre cada
 * base posterior sin mirar. Si la base se mueve por debajo, lo publicado queda
 * por encima de lo que encuentra el verificador y nada lo decía: el 04-10-2026,
 * 1sqj7is-053-pro-68944b publicaba `parcial` —una bajada de junio desde el
 * `verificado` de la pasada LLM retirada— sobre una base que dice `sin-datos`.
 */
describe('overlayOutcomes — lo que el overlay publica, contra la base de hoy', () => {
  const MOTIVO = 'el contrato muestra que el mecanismo se usa, no lo que se afirma de él'

  function overlayDe(entradas: Record<string, [ClaimVerdict, OverlaySource]>): Overlay {
    return {
      version: 1,
      generatedAt: '2026-10-04T00:00:00.000Z',
      entries: Object.fromEntries(
        Object.entries(entradas).map(([id, [verdict, source]]) => [
          id,
          { verification: vrf(id, verdict), source, reason: MOTIVO, appliedAt: 'TS' },
        ]),
      ),
    }
  }

  it('el caso que lo trajo: una bajada a parcial juzgada contra un verificado, sobre una base que hoy dice sin-datos', () => {
    // Junio: la base dice `verificado` y la bajada a `parcial` pasa la puerta.
    const junio = applyOverlayEntries(
      { version: 1, generatedAt: 'x', entries: {} },
      [
        {
          claimId: 'x',
          verification: verificacionDeBajada('x', vrf('x', 'verificado'), 'parcial', MOTIVO),
          source: 'curator-downgrade',
          reason: MOTIVO,
          editor: 'ai-gold-review',
        },
      ],
      '2026-06-24T07:18:12.464Z',
      new Map<string, ClaimVerdict>([['x', 'verificado']]),
    )
    // Hoy la base dice `sin-datos`, y la composición sigue publicando `parcial`.
    const hoy = [item('x', 'sin-datos')]
    expect(mergeVerified(hoy, junio)[0].verification.verdict).toBe('parcial')
    expect(overlayOutcomes(hoy, junio).porEncima).toEqual([
      { id: 'x', base: 'sin-datos', publica: 'parcial', source: 'curator-downgrade' },
    ])
  })

  it('cuatro desenlaces contados aparte: bajan, iguales, por encima y sin claim en la base', () => {
    const base = [
      item('baja', 'verificado'),
      item('igual', 'sin-datos'),
      item('encima', 'sin-datos'),
      item('fuera-del-overlay', 'parcial'),
    ]
    const out = overlayOutcomes(
      base,
      overlayDe({
        baja: ['parcial', 'curator-downgrade'],
        igual: ['sin-datos', 'verdict-engine'],
        encima: ['parcial', 'curator-downgrade'],
        fantasma: ['sin-datos', 'verdict-engine'],
      }),
    )
    expect(out.bajan).toEqual(['baja'])
    expect(out.iguales).toEqual(['igual'])
    expect(out.porEncima.map((p) => p.id)).toEqual(['encima'])
    // Sin claim en la base: ni se aplica ni se publica. No es «igual» ni «baja».
    expect(out.sinClaim).toEqual(['fantasma'])
  })

  it('la bajada firmada a sin-datos la saca de «por encima» sin tocar nada más', () => {
    const hoy = [item('x', 'sin-datos'), item('y', 'verificado')]
    const antes = overlayDe({
      x: ['parcial', 'curator-downgrade'],
      y: ['sin-datos', 'verdict-engine'],
    })
    // La vía del curador mide contra lo PUBLICADO, que es `parcial`.
    const firmada = applyOverlayEntries(
      antes,
      [
        {
          claimId: 'x',
          verification: verificacionDeBajada('x', vrf('x', 'parcial'), 'sin-datos', MOTIVO),
          source: 'curator-downgrade',
          reason: MOTIVO,
          editor: 'Nombre Apellido',
        },
      ],
      '2026-10-05T00:00:00.000Z',
      new Map<string, ClaimVerdict>([['x', 'parcial']]),
    )
    expect(overlayOutcomes(hoy, antes).porEncima.map((p) => p.id)).toEqual(['x'])
    const despues = overlayOutcomes(hoy, firmada)
    expect(despues.porEncima).toEqual([])
    expect(despues.iguales).toEqual(['x'])
    expect(despues.bajan).toEqual(['y'])
  })

  it('anclas a mano: contradicho → sin-datos baja; promesa-repetida → sin-datos y sin-datos → contradicho quedan por encima', () => {
    // La derivación es estricta a propósito (`esSubida`): lo que el curador no
    // podría firmar como bajada cuenta como subida.
    const caso = (de: ClaimVerdict, a: ClaimVerdict) => {
      const out = overlayOutcomes([item('x', de)], overlayDe({ x: [a, 'verdict-engine'] }))
      if (out.porEncima.length) return 'por-encima'
      if (out.iguales.length) return 'igual'
      if (out.bajan.length) return 'baja'
      return 'ninguno'
    }
    expect(caso('contradicho', 'sin-datos')).toBe('baja')
    expect(caso('verificado', 'parcial')).toBe('baja')
    expect(caso('parcial', 'parcial')).toBe('igual')
    expect(caso('sin-datos', 'parcial')).toBe('por-encima')
    expect(caso('promesa-repetida', 'sin-datos')).toBe('por-encima')
    expect(caso('sin-datos', 'contradicho')).toBe('por-encima')
  })

  it('la relación es la de esSubida e isDowngrade, no una escala recitada: para cada par del enum', () => {
    for (const de of CLAIM_VERDICTS) {
      for (const a of CLAIM_VERDICTS) {
        const out = overlayOutcomes([item('x', de)], overlayDe({ x: [a, 'verdict-engine'] }))
        const visto = {
          de,
          a,
          porEncima: out.porEncima.length === 1,
          igual: out.iguales.length === 1,
          baja: out.bajan.length === 1,
        }
        expect(visto).toEqual({
          de,
          a,
          porEncima: esSubida(de, a),
          igual: de === a,
          baja: isDowngrade(de, a),
        })
      }
    }
  })
})

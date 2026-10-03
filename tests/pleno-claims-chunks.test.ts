import { describe, it, expect } from 'vitest'
import {
  groupItemsByPleno,
  buildChunkAndDescriptor,
  buildManifest,
  type VerifiedClaimItem,
} from '../src/scraper/pleno-claims-chunks'
import { gateItemsForPublic } from '../src/scraper/claim-public-gate'

const baseClaim = {
  id: 'x',
  plenoId: 'pleno-A',
  plenoDate: '2026-03-09',
  segmentIndex: 0,
  type: 'afirmacion_numerica' as const,
  speakerGroup: 'PSOE' as const,
  verbatim: 'verbatim',
  context: 'context context context context',
  topic: 'fiscal' as const,
  entities: {},
  confidence: 0.8,
  reasoning: 'reasoning',
  requiresHumanApproval: true as const,
}

function mkItem(
  plenoId: string,
  plenoDate: string,
  segmentIndex: number,
  verdict = 'sin-datos',
): VerifiedClaimItem {
  return {
    claim: {
      ...baseClaim,
      id: `${plenoId}-${segmentIndex}`,
      plenoId,
      plenoDate,
      segmentIndex,
    },
    // `checkedAgainst` no es decorado: la puerta pública sólo tiene por fundado
    // un veredicto que dice quién lo comprobó, así que un fixture sin él estaría
    // ejercitando el caso raro creyendo ejercitar el normal.
    verification: { verdict, confidence: 0.5, checkedAgainst: ['tenders'] },
  }
}

describe('groupItemsByPleno', () => {
  it('groups items by claim.plenoId', () => {
    const items = [
      mkItem('A', '2026-03-09', 0),
      mkItem('B', '2026-04-01', 0),
      mkItem('A', '2026-03-09', 1),
    ]
    const grouped = groupItemsByPleno(items)
    expect(grouped.size).toBe(2)
    expect(grouped.get('A')).toHaveLength(2)
    expect(grouped.get('B')).toHaveLength(1)
  })

  it('orders pleno groups by plenoDate descending', () => {
    const items = [
      mkItem('OLD', '2024-01-01', 0),
      mkItem('NEW', '2026-12-31', 0),
      mkItem('MID', '2025-06-15', 0),
    ]
    const grouped = groupItemsByPleno(items)
    expect([...grouped.keys()]).toEqual(['NEW', 'MID', 'OLD'])
  })

  it('orders items within a pleno by segmentIndex ascending', () => {
    const items = [
      mkItem('A', '2026-03-09', 5),
      mkItem('A', '2026-03-09', 1),
      mkItem('A', '2026-03-09', 3),
    ]
    const grouped = groupItemsByPleno(items)
    expect(grouped.get('A')!.map((i) => i.claim.segmentIndex)).toEqual([1, 3, 5])
  })

  it('handles empty input', () => {
    expect(groupItemsByPleno([]).size).toBe(0)
  })
})

describe('buildChunkAndDescriptor', () => {
  it('summarises verdicts, types, and topics for the manifest descriptor', () => {
    const items = [
      mkItem('A', '2026-03-09', 0, 'verificado'),
      mkItem('A', '2026-03-09', 1, 'verificado'),
      mkItem('A', '2026-03-09', 2, 'sin-datos'),
    ]
    const { chunk, descriptor } = buildChunkAndDescriptor('A', items, '2026-04-29T10:00:00Z')
    expect(chunk.plenoId).toBe('A')
    expect(chunk.items).toHaveLength(3)
    expect(chunk.version).toBe('1')
    expect(descriptor.byVerdict).toEqual({ verificado: 2, 'sin-datos': 1 })
    expect(descriptor.itemCount).toBe(3)
    expect(descriptor.chunkPath).toBe('pleno-claims/A.json')
    expect(descriptor.bytes).toBeGreaterThan(100)
  })
})

describe('buildManifest', () => {
  it('produces totals across plenos', () => {
    const items = [
      mkItem('A', '2026-03-09', 0, 'verificado'),
      mkItem('A', '2026-03-09', 1, 'sin-datos'),
      mkItem('B', '2026-04-01', 0, 'parcial'),
    ]
    const grouped = groupItemsByPleno(items)
    const { manifest, chunks } = buildManifest(grouped, '2026-04-29T10:00:00Z')
    expect(manifest.plenos).toHaveLength(2)
    expect(manifest.totals.items).toBe(3)
    expect(manifest.totals.plenos).toBe(2)
    expect(manifest.totals.byVerdict).toEqual({ verificado: 1, 'sin-datos': 1, parcial: 1 })
    expect(chunks.size).toBe(2)
    expect(chunks.get('A')!.items).toHaveLength(2)
  })

  it('orders manifest plenos most-recent-first', () => {
    const items = [mkItem('OLD', '2024-01-01', 0), mkItem('NEW', '2026-12-31', 0)]
    const grouped = groupItemsByPleno(items)
    const { manifest } = buildManifest(grouped, '2026-04-29T10:00:00Z')
    expect(manifest.plenos.map((p) => p.plenoId)).toEqual(['NEW', 'OLD'])
  })

  it('handles empty grouping', () => {
    const { manifest, chunks } = buildManifest(new Map(), '2026-04-29T10:00:00Z')
    expect(manifest.plenos).toHaveLength(0)
    expect(manifest.totals.items).toBe(0)
    expect(chunks.size).toBe(0)
  })
})

describe('chunker applies the public gate', () => {
  const mk = (id: string, type: string, verdict: string, accusationSubtype?: string) => ({
    claim: {
      ...baseClaim,
      id,
      plenoId: 'p1',
      plenoDate: '2026-04-20',
      type,
      accusationSubtype,
    },
    verification: { verdict, confidence: 1, checkedAgainst: ['tenders'] },
  })

  it('excludes hidden items and keeps visibility on survivors', () => {
    const gated = gateItemsForPublic([
      mk('a', 'acusacion_publica', 'sin-datos', 'opinativa') as never, // hidden
      mk('b', 'afirmacion_numerica', 'verificado') as never, // shown
      mk('c', 'afirmacion_numerica', 'sin-datos') as never, // toggle
    ])
    const { manifest, chunks } = buildManifest(groupItemsByPleno(gated), '2026-06-21T00:00:00.000Z')
    const items = chunks.get('p1')!.items
    expect(items.map((i) => i.claim.id).sort()).toEqual(['b', 'c'])
    expect(items.every((i) => i.visibility)).toBe(true)
    expect(manifest.plenos[0].toggleCount).toBe(1)
    expect(manifest.totals.items).toBe(2)
  })
})

describe('manifest totals.byTopicVerdict', () => {
  it('cross-tabs topic × verdict over all chunked items', () => {
    const a = mkItem('p1', '2026-01-01', 0, 'verificado')
    a.claim.topic = 'urbanismo'
    const b = mkItem('p1', '2026-01-01', 1, 'sin-datos')
    b.claim.topic = 'urbanismo'
    const c = mkItem('p2', '2026-02-02', 0, 'contradicho')
    c.claim.topic = 'fiscal'
    const { manifest } = buildManifest(groupItemsByPleno([a, b, c]), '2026-07-29T00:00:00Z')
    expect(manifest.totals.byTopicVerdict).toEqual({
      urbanismo: { verificado: 1, 'sin-datos': 1 },
      fiscal: { contradicho: 1 },
    })
  })

  it('is empty (not absent) for an empty corpus', () => {
    const { manifest } = buildManifest(groupItemsByPleno([]), '2026-07-29T00:00:00Z')
    expect(manifest.totals.byTopicVerdict).toEqual({})
  })
})

/**
 * Por qué `sin-datos`, y la cobertura, en tres casillas y no en dos.
 *
 * Una pasada que rehace el veredicto sustituye la lista de lo consultado por su
 * marca, y la cuenta la metía en «sin corpus que consultar»: 875 de 2.901 el
 * 2026-09-30, de las que el motor había repasado candidatos y el curador leído
 * un contrato. Las formas son las de filas servidas ese día, no inventadas.
 */
describe('manifest · comprobado, sin corpus o no consta', () => {
  const fila = (
    segmentIndex: number,
    verification: VerifiedClaimItem['verification'],
    verbatim = 'verbatim',
  ) => ({
    claim: { ...baseClaim, id: `A-${segmentIndex}`, plenoId: 'A', segmentIndex, verbatim },
    verification,
  })
  const items: VerifiedClaimItem[] = [
    // El determinista, sin corpus para este tipo de afirmación.
    fila(
      0,
      { verdict: 'sin-datos', confidence: 0.5, checkedAgainst: [] },
      'según el informe técnico',
    ),
    // El determinista, que consultó y no halló.
    fila(1, { verdict: 'sin-datos', confidence: 0.5, checkedAgainst: ['tenders', 'tenders-ted'] }),
    // Retractación del motor: repasó candidatos y dejó sólo su marca.
    fila(
      2,
      {
        verdict: 'sin-datos',
        confidence: 0.2,
        evidence: [],
        checkedAgainst: ['verdict-engine'],
        source: 'verdict-engine',
      },
      'según el informe técnico',
    ),
    // Bajada de curador a sin-datos, y otra a parcial que conserva su contrato.
    fila(3, {
      verdict: 'sin-datos',
      confidence: 0.5,
      evidence: [],
      checkedAgainst: ['curator-downgrade'],
      source: 'curator-downgrade',
    }),
    fila(4, {
      verdict: 'parcial',
      confidence: 0.5,
      evidence: [{ kind: 'tender', ref: 'r', snippet: 'contrato' }],
      checkedAgainst: ['curator-downgrade'],
      source: 'curator-downgrade',
    }),
  ]
  const { manifest } = buildManifest(groupItemsByPleno(items), '2026-09-30T00:00:00.000Z')

  it('sinDatosPorque: una pasada que sustituyó la lista no es «sin corpus»', () => {
    expect(manifest.totals.sinDatosPorque).toEqual({
      sinCorpus: 1,
      comprobadoSinHallar: 1,
      noConsta: 2,
    })
  })

  it('la cobertura reparte las cinco en tres casillas que suman el total', () => {
    const celda = { total: 5, sinCorpus: 1, comprobadoSinHallar: 1, noConsta: 3 }
    expect(manifest.totals.cobertura.porTipo).toEqual({ afirmacion_numerica: celda })
    expect(manifest.totals.cobertura.porTema).toEqual({ fiscal: celda })
  })

  it('el documento que nombran se cuenta sólo en las que no tenían con qué', () => {
    // Las dos nombran un informe técnico, pero la del motor tenía candidatos
    // delante: que dependa de un documento que no se publica no consta.
    const clases = manifest.totals.cobertura.porClaseDocumental
    expect(clases.porClase['informe-tecnico']).toBe(1)
    expect(clases.total).toBe(1)
  })
})

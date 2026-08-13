import { describe, it, expect } from 'vitest'
import {
  detectDrift,
  DRIFT_THRESHOLD,
  type FrozenFigure,
  type LiveAnchor,
} from '../src/scraper/prose-drift'

const anchors: Record<string, LiveAnchor> = {
  awardedTotal: { label: 'tenders.stats.awardedTotalEuros', value: 67_996_704 },
  situatedAmount: { label: 'tender-geo · suma de places[].amount', value: 6_085_028 },
}

const figure = (value: number, anchor = 'awardedTotal'): FrozenFigure => ({
  where: 'reconstruccion-dana.totals.totalAwarded',
  value,
  anchor,
})

describe('prose-drift — the case it was built for', () => {
  // The real 2026-08-02 incident: one parser fix moved municipal contracting
  // from €14.7M to €68.0M and the published reportaje kept the old figure.
  it('flags the frozen DANA total against the live one', () => {
    const { rows } = detectDrift([figure(14_048_926.9)], anchors)
    expect(rows).toHaveLength(1)
    expect(rows[0].severity).toBe('drifted')
    expect(rows[0].ratio).toBeCloseTo(0.207, 2)
    expect(rows[0].live).toBe(67_996_704)
  })

  it('stays quiet when the figure still tracks its anchor', () => {
    const { rows } = detectDrift([figure(67_990_000)], anchors)
    expect(rows[0].severity).toBe('ok')
  })
})

describe('prose-drift — the threshold is the policy', () => {
  // Loose on purpose: a frozen figure is SUPPOSED to lag. Only an
  // order-of-magnitude gap means the published sentence misleads.
  const live = anchors.awardedTotal.value
  it('exactly at the threshold is not drift', () => {
    const { rows } = detectDrift([figure(live * (1 - DRIFT_THRESHOLD))], anchors)
    expect(rows[0].severity).toBe('ok')
  })

  it('just past the threshold is', () => {
    const { rows } = detectDrift([figure(live * (1 - DRIFT_THRESHOLD) - 1)], anchors)
    expect(rows[0].severity).toBe('drifted')
  })
})

describe('prose-drift — a figure it stopped watching must not vanish', () => {
  // The failure this pins: `check:drift` prints the number of figures it
  // PRODUCED a row for. A frozen figure whose anchor went missing — renamed
  // key, shape change upstream, snapshot absent — used to be dropped in
  // silence, so "2 tracked · 0 drifted" would quietly become "1 tracked ·
  // 0 drifted" and still read as healthy. Same shape as every silent-failure
  // incident in this repo: the check's silence gets read as approval.
  it('reports a figure whose anchor does not exist, with a reason', () => {
    const { rows, skipped } = detectDrift([figure(14_048_926.9, 'anchorThatWasRenamed')], anchors)
    expect(rows).toHaveLength(0)
    expect(skipped).toHaveLength(1)
    expect(skipped[0].where).toBe('reconstruccion-dana.totals.totalAwarded')
    expect(skipped[0].reason).toContain('anchorThatWasRenamed')
  })

  it('reports a live anchor that came back NaN — an upstream shape change', () => {
    const { skipped } = detectDrift([figure(14_048_926.9)], {
      awardedTotal: { label: 'tenders.stats.awardedTotalEuros', value: NaN },
    })
    expect(skipped).toHaveLength(1)
    expect(skipped[0].reason).toMatch(/no numérico|NaN|sin valor/i)
  })

  it('reports a live anchor of zero rather than dividing by it', () => {
    const { rows, skipped } = detectDrift([figure(14_048_926.9)], {
      awardedTotal: { label: 'tenders.stats.awardedTotalEuros', value: 0 },
    })
    expect(rows).toHaveLength(0)
    expect(skipped).toHaveLength(1)
  })

  it('reports a frozen value that is missing from the published piece', () => {
    const { skipped } = detectDrift([figure(NaN)], anchors)
    expect(skipped).toHaveLength(1)
  })

  it('every input figure comes back as either a row or a skip — none are lost', () => {
    const input = [
      figure(14_048_926.9),
      figure(2_036_285.4, 'situatedAmount'),
      figure(1, 'gone'),
      figure(NaN),
    ]
    const { rows, skipped } = detectDrift(input, anchors)
    expect(rows.length + skipped.length).toBe(input.length)
  })
})

describe('una cifra de alcance distinto no es una cifra que derivó', () => {
  const anchors = { awardedTotal: { label: 'tenders.stats.awardedTotalEuros', value: 123_681_883 } }

  it('no la llama divergente por mucho que se separe del ancla', () => {
    // El caso real: `reconstruccion-dana.totals.totalAwarded` excluye la
    // concesión del agua —17 años adjudicados de una vez— y el ancla la
    // incluye. 123,68 − 55,69 = 68,00 exacto, y 699 − 1 = 698 contratos. No ha
    // derivado nada: miden cosas distintas. El check decía «divergente ×1.8» y
    // pedía una nota de corrección que no habría arreglado nada — y una alarma
    // permanente es una alarma que se silencia.
    const [row] = detectDrift(
      [
        {
          where: 'reconstruccion-dana.totals.totalAwarded',
          value: 67_996_704,
          anchor: 'awardedTotal',
          scope: 'excluye la concesión del agua; el ancla la incluye',
        },
      ],
      anchors,
    ).rows
    expect(row.severity).toBe('scoped')
    expect(row.scope).toMatch(/concesión del agua/)
  })

  it('sin `scope`, la MISMA cifra sí es divergente', () => {
    // El control. Sin él, marcar todo como `scoped` silenciaría el check
    // entero y pasaría la prueba de arriba.
    const [row] = detectDrift(
      [{ where: 'x', value: 67_996_704, anchor: 'awardedTotal' }],
      anchors,
    ).rows
    expect(row.severity).toBe('drifted')
  })

  it('`scope` no convierte en válida una cifra que no se pudo comparar', () => {
    // Un ancla ausente sigue siendo «SIN comparar», no «de alcance distinto»:
    // son dos cosas diferentes y confundirlas devolvería el silencio.
    const r = detectDrift(
      [{ where: 'x', value: 10, anchor: 'no-existe', scope: 'lo que sea' }],
      anchors,
    )
    expect(r.rows).toHaveLength(0)
    expect(r.skipped).toHaveLength(1)
  })
})

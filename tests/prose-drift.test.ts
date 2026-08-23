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

describe('el alcance se arregla en el ancla, no eximiendo la cifra', () => {
  // Las cifras reales, al céntimo. `reconstruccion-dana.totals.totalAwarded`
  // excluye la concesión del agua —17 años adjudicados de una vez— y el total
  // adjudicado la incluye: 123.681.882,79 − 55.685.178,79 = 67.996.704,00.
  const TOTAL_CON_CONCESION = 123_681_882.79
  const CONCESION = 55_685_178.79
  const anchors = {
    awardedTotal: { label: 'tenders.stats.awardedTotalEuros', value: TOTAL_CON_CONCESION },
    awardedTotalSinConcesion: {
      label: 'tenders.stats.awardedTotalEuros − contrato 46717',
      value: TOTAL_CON_CONCESION - CONCESION,
    },
  }

  it('contra el ancla que mide LO MISMO, la cifra sale ok', () => {
    // Antes esto se resolvía con un campo `scope`: una nota en prosa que
    // marcaba la fila como «de alcance distinto» y la dejaba EXENTA de toda
    // comparación. Sobra: la nota decía una aritmética exacta, así que la
    // diferencia se resta en el ancla y la cifra vuelve a estar vigilada.
    const [row] = detectDrift(
      [
        {
          where: 'reconstruccion-dana.totals.totalAwarded',
          value: 67_996_704,
          anchor: 'awardedTotalSinConcesion',
        },
      ],
      anchors,
    ).rows
    expect(row.severity).toBe('ok')
  })

  it('y contra el ancla equivocada sigue saliendo divergente', () => {
    // El control de que la prueba de arriba mide algo: la MISMA cifra contra el
    // total CON concesión es ×1,8, que es la falsa alarma que motivó el `scope`.
    const [row] = detectDrift(
      [{ where: 'x', value: 67_996_704, anchor: 'awardedTotal' }],
      anchors,
    ).rows
    expect(row.severity).toBe('drifted')
  })

  it('REGRESIÓN: una cifra multiplicada por diez es SIEMPRE divergente', () => {
    // Esta es la que estuvo en rojo sin que nadie lo viera. `check:guards`
    // inyecta exactamente esto —multiplica por diez `totals.totalAwarded`— y la
    // guarda no gritaba, porque la fila llevaba `scope` y `scope` ganaba a
    // cualquier distancia. Salía «MUDA ANTE SU PROPIO FALLO» en cada pasada.
    //
    // Ya no hay ningún campo capaz de eximir a una fila de esta línea. Si
    // alguien vuelve a añadir uno, esta prueba se pone roja.
    const [row] = detectDrift(
      [
        {
          where: 'reconstruccion-dana.totals.totalAwarded',
          value: 67_996_704 * 10,
          anchor: 'awardedTotalSinConcesion',
        },
      ],
      anchors,
    ).rows
    expect(row.severity).toBe('drifted')
  })

  it('un ancla ausente sigue siendo «SIN comparar», no una cifra limpia', () => {
    // Una cifra que se cayó de la comparación no es una cifra que coincidió:
    // confundirlas es cómo empezó cada incidente de fallo silencioso aquí.
    const r = detectDrift([{ where: 'x', value: 10, anchor: 'no-existe' }], anchors)
    expect(r.rows).toHaveLength(0)
    expect(r.skipped).toHaveLength(1)
  })
})

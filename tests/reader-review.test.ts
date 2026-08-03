import { describe, it, expect, vi } from 'vitest'
import {
  groundFindings,
  partitionFindings,
  reviewSurface,
  reviewSurfaceDetailed,
  type SurfaceInput,
} from '../src/scraper/reader-review'
import { quoteAppearsIn } from '../src/scraper/quote-match'

const input: SurfaceInput = {
  route: '/',
  renderedText: 'Presup. 2025 €41,6M · Contratos adj. €68,0M · Gobierto/PLACSP · Población 24,6k',
  facts: { 'presupuesto anual': 41578252, 'contratos acumulado 2017-2026': 67996704 },
}

describe('reader-review — grounding', () => {
  it('keeps a finding that quotes the rendered page verbatim', () => {
    const kept = groundFindings(
      [
        {
          quote: 'Presup. 2025 €41,6M · Contratos adj. €68,0M',
          inference: 'que el pueblo adjudica más de lo que presupuesta en un año',
          contradictedBy: 'los contratos son acumulados 2017-2026, el presupuesto es anual',
          severity: 'misleading',
        },
      ],
      input,
    )
    expect(kept).toHaveLength(1)
  })

  it('drops a paraphrase — a model objecting to its own restatement', () => {
    const kept = groundFindings(
      [
        {
          quote: 'La página muestra el presupuesto junto a los contratos',
          inference: 'x'.repeat(12),
          contradictedBy: 'y'.repeat(6),
          severity: 'misleading',
        },
      ],
      input,
    )
    expect(kept).toEqual([])
  })

  it('drops a quote so long it swallows the whole page', () => {
    const kept = groundFindings(
      [
        {
          quote: 'z'.repeat(500),
          inference: 'x'.repeat(12),
          contradictedBy: 'y'.repeat(6),
          severity: 'unclear',
        },
      ],
      input,
    )
    expect(kept).toEqual([])
  })

  it('treats an empty finding list as the expected answer', async () => {
    expect(await reviewSurface(input, async () => [])).toEqual([])
  })

  it('never calls the model on an empty page', async () => {
    const call = vi.fn()
    expect(await reviewSurface({ ...input, renderedText: '  ' }, call)).toEqual([])
    expect(call).not.toHaveBeenCalled()
  })
})

describe('reader-review — the strictness is deliberate, do not loosen it', () => {
  // This block exists because the author of check:citations came within one
  // commit of "fixing" this filter by swapping the full-quote requirement for
  // quoteAppearsIn's 8-word sliding window, on the theory that layout noise was
  // dropping valid findings. It is not: normalise() already strips ALL
  // punctuation and collapses whitespace, so line wraps and orphaned list
  // bullets survive it fine (see the first test below). The 16% figure that
  // prompted the idea came from a throwaway matcher that did NOT strip
  // punctuation — a bug in the measurement, not in this code.
  //
  // The sliding window is right for check:citations, where a non-match raises a
  // false alarm a human then reads. It is wrong HERE, where the filter's whole
  // job is to make a model's false positive visible in one glance: any 8
  // consecutive shared words would let a confident paraphrase through.
  it('handles layout noise already — line wraps and orphaned bullets', () => {
    const wrapped: SurfaceInput = {
      route: '/',
      renderedText: 'Contratos adjudicados\n804\nen el periodo\n-\n  2019-2025',
      facts: {},
    }
    const kept = groundFindings(
      [
        {
          quote: 'Contratos adjudicados 804 en el periodo 2019-2025',
          inference: 'que 804 contratos se adjudicaron en ese periodo',
          contradictedBy: 'sólo 698 constan como adjudicados',
          severity: 'misleading',
        },
      ],
      wrapped,
    )
    expect(kept).toHaveLength(1)
  })

  it('requires the WHOLE quote — an 8-word overlap must not be enough', () => {
    const page: SurfaceInput = {
      route: '/',
      renderedText: 'el presupuesto municipal de 2025 asciende a 41,6 millones de euros',
      facts: {},
    }
    // Shares a long run with the page, then continues into something the page
    // never says. A sliding window would accept it; this filter must not.
    const paraphrase = 'el presupuesto municipal de 2025 asciende a 41,6 millones de euros robados'
    expect(quoteAppearsIn(paraphrase, page.renderedText)).toBe(true) // window: yes
    expect(
      groundFindings(
        [
          {
            quote: paraphrase,
            inference: 'x'.repeat(12),
            contradictedBy: 'y'.repeat(6),
            severity: 'misleading',
          },
        ],
        page,
      ),
    ).toEqual([]) // this filter: no
  })
})

describe('reader-review — a discarded finding must not look like a clean page', () => {
  it('counts what grounding threw away', () => {
    const { kept, dropped } = partitionFindings(
      [
        {
          quote: 'Presup. 2025 €41,6M',
          inference: 'x'.repeat(12),
          contradictedBy: 'y'.repeat(6),
          severity: 'unclear',
        },
        {
          quote: 'una frase que la página nunca dice',
          inference: 'x'.repeat(12),
          contradictedBy: 'y'.repeat(6),
          severity: 'unclear',
        },
      ],
      input,
    )
    expect(kept).toHaveLength(1)
    expect(dropped).toHaveLength(1)
  })

  it('reviewSurfaceDetailed hands back the dropped findings, not just a count', async () => {
    const r = await reviewSurfaceDetailed(input, async () => [
      {
        quote: 'una frase que la página nunca dice',
        inference: 'x'.repeat(12),
        contradictedBy: 'y'.repeat(6),
        severity: 'unclear',
      },
    ])
    expect(r.findings).toEqual([])
    expect(r.dropped).toHaveLength(1) // NOT the same as "nada que señalar"
    // A bare number says something is hidden without letting anyone judge
    // whether it mattered. The first real run had five of these across four
    // routes that were all printing "nothing to flag".
    expect(r.dropped[0].quote).toBe('una frase que la página nunca dice')
  })
})

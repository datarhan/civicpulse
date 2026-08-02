import { describe, it, expect, vi } from 'vitest'
import { groundFindings, reviewSurface, type SurfaceInput } from '../src/scraper/reader-review'

const input: SurfaceInput = {
  route: '/',
  renderedText:
    'Presup. 2025 €41,6M · Contratos adj. €68,0M · Gobierto/PLACSP · Población 24,6k',
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

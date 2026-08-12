import { describe, it, expect, vi } from 'vitest'
import {
  chunkRenderedText,
  groundFindings,
  partitionFindings,
  reviewSurface,
  reviewSurfaceDetailed,
  REVIEW_CHUNK_CHARS,
  parseReviewArgs,
  readCacheEntry,
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

describe('reader-review — a big page is split, never trimmed', () => {
  // The bug: `review-surfaces` sliced the rendered text to the first 12.000
  // characters and reviewed that, silently. /metodologia renders 34.909
  // characters, so 66% of the published editorial contract — including three
  // paragraphs added the same week, at offsets 13.819, 16.186 and 17.303 — was
  // never seen by the check that exists to read it. The change-detection hash
  // was computed over the same prefix, so those edits could not even mark the
  // route as changed. Green while measuring nothing, again.
  const strip = (s: string) => s.replace(/\s+/g, '')

  it('LOSES NOTHING — every character of the page ends up in some fragment', () => {
    const page = Array.from({ length: 900 }, (_, i) => `Línea ${i} con texto suficiente.`).join(
      '\n',
    )
    expect(page.length).toBeGreaterThan(REVIEW_CHUNK_CHARS)
    const chunks = chunkRenderedText(page)
    expect(chunks.length).toBeGreaterThan(1)
    expect(strip(chunks.join(''))).toBe(strip(page))
  })

  it('keeps every fragment inside the call budget', () => {
    const page = 'x'.repeat(50_000)
    for (const c of chunkRenderedText(page))
      expect(c.length).toBeLessThanOrEqual(REVIEW_CHUNK_CHARS)
  })

  it('reaches text that the old 12k slice cut off', () => {
    // Anchored to the real shape of the defect: a sentence past the old cut.
    const filler = 'relleno '.repeat(2_000) // ~16k characters
    const page = `${filler}\nEl bloque lo dice siempre, con el texto literal.`
    const chunks = chunkRenderedText(page)
    expect(page.slice(0, REVIEW_CHUNK_CHARS)).not.toMatch(/texto literal/)
    expect(chunks.some((c) => c.includes('El bloque lo dice siempre'))).toBe(true)
  })

  it('splits on line boundaries so a claim is not cut in half', () => {
    const line = 'a'.repeat(4_000)
    const chunks = chunkRenderedText([line, line, line, line].join('\n'), 9_000)
    // 4 lines of 4k in 9k fragments: 2 + 2, never 2¼.
    expect(chunks).toHaveLength(2)
    for (const c of chunks) expect(c.split('\n').every((l) => l.length === 4_000)).toBe(true)
  })

  it('hard-splits a single line too long to fit, rather than dropping it', () => {
    const chunks = chunkRenderedText('z'.repeat(25_000))
    expect(chunks).toHaveLength(3)
    expect(chunks.join('').length).toBe(25_000)
  })

  it('a page that fits is one fragment, and a blank page is none', () => {
    expect(chunkRenderedText('corto')).toEqual(['corto'])
    expect(chunkRenderedText('   \n  ')).toEqual([])
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

describe('reader-review — un presupuesto de tiempo compra prisa, no silencio', () => {
  // `review:surfaces` unbounded measured 568s over six routes. git kills a
  // pre-push hook at ten minutes, and husky turns a killed hook into a refused
  // push — so the hook now passes `--budget-seconds`. The risk that buys is the
  // original sin of this file wearing a clock instead of a `.slice(0, 12000)`:
  // a check that quietly covers less than it implies.
  it('no confunde el VALOR del presupuesto con una ruta llamada «60»', () => {
    // El parser viejo era `filter(a => !a.startsWith('--'))`, que se habría
    // llevado el 60 por delante y habría intentado revisar http://…/60.
    const a = parseReviewArgs(['--budget-seconds', '60'])
    expect(a.routes).toEqual([])
    expect(a.budgetSeconds).toBe(60)

    const b = parseReviewArgs(['--budget-seconds=90', '/plenos'])
    expect(b.routes).toEqual(['/plenos'])
    expect(b.budgetSeconds).toBe(90)
  })

  it('reconoce --rotate sin tragárselo como ruta', () => {
    // El gancho de pre-push le pasa las rutas que ESTE push puede haber roto y,
    // si no caben en el presupuesto, tienen que entrar por las más olvidadas —
    // si no, las últimas de la lista no se leen nunca. Una bandera que el
    // parser ignorase en silencio dejaría el orden fijo sin que nadie lo note,
    // que es la avería que la bandera viene a arreglar.
    const r = parseReviewArgs(['--budget-seconds', '300', '--rotate', '/eficiencia', '/gestion'])
    expect(r.rotate).toBe(true)
    expect(r.routes).toEqual(['/eficiencia', '/gestion'])
    expect(r.budgetSeconds).toBe(300)
    // Y por defecto NO rota: un conjunto explícito conserva el orden de quien
    // llama salvo que lo pida.
    expect(parseReviewArgs(['/eficiencia']).rotate).toBe(false)
  })

  it('sin bandera y sin entorno NO hay límite — el pase completo sigue siendo el pase completo', () => {
    expect(parseReviewArgs(['/'], undefined).budgetSeconds).toBe(0)
    expect(parseReviewArgs([], '45').budgetSeconds).toBe(45)
    // La bandera manda sobre el entorno.
    expect(parseReviewArgs(['--budget-seconds', '10'], '45').budgetSeconds).toBe(10)
  })

  it('un presupuesto ilegible es NINGÚN presupuesto, nunca un presupuesto de cero', () => {
    // Un cero silencioso revisaría cero fragmentos e imprimiría un resumen. El
    // fallo por defecto de esta herramienta tiene que ser revisar de más.
    for (const bad of ['abracadabra', '0', '-30', '']) {
      expect(parseReviewArgs(['--budget-seconds', bad]).budgetSeconds).toBe(0)
    }
    expect(parseReviewArgs([], 'lo-que-sea').budgetSeconds).toBe(0)
    expect(parseReviewArgs(['--json', '--force']).json && parseReviewArgs(['--force']).force).toBe(
      true,
    )
  })
})

describe('reader-review — la caché no puede hacer desaparecer un señalamiento', () => {
  const finding = {
    quote: 'Presup. 2025 €41,6M',
    inference: 'x'.repeat(12),
    contradictedBy: 'y'.repeat(6),
    severity: 'unclear' as const,
  }

  it('recuerda QUÉ encontró, no sólo que miró', () => {
    // El fallo: la caché guardaba el hash a secas, así que una ruta se retiraba
    // tras CUALQUIER pase completo — incluido uno que acababa de señalar dos
    // yuxtaposiciones engañosas. La siguiente ejecución imprimía «sin cambios,
    // se omite» y el resumen, «0 señalamiento(s)», sobre defectos vivos.
    const e = readCacheEntry({ hash: 'abc123', findings: [finding], at: '2026-08-05T00:00:00Z' })
    expect(e?.hash).toBe('abc123')
    expect(e?.findings).toHaveLength(1)
    expect(e?.at).toBe('2026-08-05T00:00:00Z')
  })

  it('lee la caché vieja de sólo-hash sin inventarse hallazgos', () => {
    const e = readCacheEntry('deadbeefdeadbeef')
    expect(e).toEqual({ hash: 'deadbeefdeadbeef', findings: [] })
  })

  it('una entrada corrupta es un fallo de caché, y un fallo de caché revisa MÁS', () => {
    // La dirección segura: perder la caché cuesta una llamada, confiar en una
    // caché rota cuesta una página sin leer que se declara limpia.
    expect(readCacheEntry(undefined)).toBeNull()
    expect(readCacheEntry({} as never)).toBeNull()
    expect(readCacheEntry({ findings: [finding] } as never)).toBeNull()
    expect(readCacheEntry({ hash: 'ok' } as never)).toEqual({ hash: 'ok', findings: [] })
  })
})

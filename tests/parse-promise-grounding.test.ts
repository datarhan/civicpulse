import { describe, it, expect } from 'vitest'
import {
  quoteFoundInText,
  partyDateOk,
  stripHtml,
  groundDraft,
  groundStatusDraft,
  groundStructuredCite,
  isGoogleNewsUrl,
  extractBatchParams,
  buildBatchRequestBody,
  parseResolvedUrl,
  type FetchLike,
} from '../src/scraper/promise-grounding'
import type { DraftNewPromise, DraftStatusChange } from '../src/scraper/promise-draft'
import { defaultGroundingFetch, MOZILLA_UA } from '../src/scraper/promise-grounding'

const NOW = new Date('2026-07-02T00:00:00.000Z')

function draft(overrides: Partial<DraftNewPromise['proposed']> = {}): DraftNewPromise {
  return {
    draftId: 'dnp-psoe-abc',
    kind: 'new-promise',
    requiresHumanApproval: true,
    confidence: 0.9,
    grounding: { grounded: false, urlResolved: false, quoteFound: false, checkedAt: '' },
    decision: 'queue',
    proposed: {
      party: 'PSOE',
      title: 'Carril bici',
      quote: 'Construiremos un carril bici en la Avenida del Camp de Túria antes de 2027',
      source: { url: 'https://example.com/n', publisher: 'Levante-EMV' },
      madeAt: '2026-06-20',
      topic: 'movilidad',
      kind: 'anuncio-gobierno',
      status: 'documentada',
      ...overrides,
    },
    reasoning: [],
    generatedAt: '2026-07-02T00:00:00.000Z',
  }
}

describe('promise-grounding', () => {
  it('stripHtml removes tags and collapses whitespace', () => {
    expect(stripHtml('<p>Hola   <b>mundo</b></p>')).toBe('Hola mundo')
  })

  it('quoteFoundInText matches ignoring case/diacritics', () => {
    expect(
      quoteFoundInText('Construiremos un CARRIL bici', 'nota: construiremos un carril bici pronto'),
    ).toBe(true)
  })

  it('quoteFoundInText rejects an absent quote', () => {
    expect(
      quoteFoundInText('Bajaremos el IBI un 10%', 'la noticia habla de otra cosa distinta'),
    ).toBe(false)
  })

  it('partyDateOk rejects future dates and bad party', () => {
    expect(partyDateOk('PSOE', '2026-06-20', NOW)).toBe(true)
    expect(partyDateOk('PSOE', '2099-01-01', NOW)).toBe(false)
    expect(partyDateOk('PODEMOS', '2026-06-20', NOW)).toBe(false)
  })

  it('groundDraft returns grounded when URL resolves and quote is present', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      url: 'https://real-publisher.example/n',
      text: async () =>
        '<article>Construiremos un carril bici en la Avenida del Camp de Túria antes de 2027, dijo el alcalde.</article>',
    })
    const g = await groundDraft(draft(), fetchImpl, NOW)
    expect(g.grounded).toBe(true)
    expect(g.urlResolved).toBe(true)
    expect(g.quoteFound).toBe(true)
    expect(g.resolvedUrl).toBe('https://real-publisher.example/n')
  })

  it('groundDraft fails safe when quote is absent', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      url: 'https://x/n',
      text: async () => '<p>texto sin la cita</p>',
    })
    const g = await groundDraft(draft(), fetchImpl, NOW)
    expect(g.grounded).toBe(false)
    expect(g.quoteFound).toBe(false)
  })

  it('groundDraft fails safe on network error', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('ECONNREFUSED')
    }
    const g = await groundDraft(draft(), fetchImpl, NOW)
    expect(g.grounded).toBe(false)
    expect(g.urlResolved).toBe(false)
  })

  it('groundDraft fails safe on non-200', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: false,
      url: 'https://x/404',
      text: async () => '',
    })
    const g = await groundDraft(draft(), fetchImpl, NOW)
    expect(g.grounded).toBe(false)
    expect(g.urlResolved).toBe(false)
  })

  it('groundDraft fails safe when body is unreadable', async () => {
    const fetchImpl: FetchLike = async () => ({
      ok: true,
      url: 'https://x/n',
      text: async () => {
        throw new Error('decode error')
      },
    })
    const g = await groundDraft(draft(), fetchImpl, NOW)
    expect(g.grounded).toBe(false)
    expect(g.urlResolved).toBe(true)
  })

  it('quoteFoundInText rejects a short quote', () => {
    expect(quoteFoundInText('Sí', 'sí, claro que sí')).toBe(false)
  })

  it('partyDateOk rejects a non-ISO date', () => {
    expect(partyDateOk('PSOE', '20/06/2026', NOW)).toBe(false)
  })
})

describe('promise-grounding — default fetch UA', () => {
  it('defaultGroundingFetch sends a Mozilla-leading UA and follows redirects', async () => {
    let seenInit: RequestInit | undefined
    const realFetch = globalThis.fetch
    // @ts-expect-error test stub
    globalThis.fetch = async (url: string, init?: RequestInit) => {
      seenInit = init
      return { ok: true, url, text: async () => '<p>ok</p>' } as unknown as Response
    }
    try {
      await defaultGroundingFetch('https://ribarroja.es/x')
    } finally {
      globalThis.fetch = realFetch
    }
    expect(MOZILLA_UA.startsWith('Mozilla/5.0')).toBe(true)
    expect((seenInit?.headers as Record<string, string>)['User-Agent']).toBe(MOZILLA_UA)
    expect(seenInit?.redirect).toBe('follow')
  })
})

describe('promise-grounding — Google-News resolution', () => {
  it('isGoogleNewsUrl detects the wrapper and rejects publisher URLs', () => {
    expect(isGoogleNewsUrl('https://news.google.com/rss/articles/CBMisw?oc=5')).toBe(true)
    expect(isGoogleNewsUrl('https://news.google.com/read/CBMisw')).toBe(true)
    expect(isGoogleNewsUrl('https://www.lasprovincias.es/camp-turia/ejercito-ribaroja.html')).toBe(
      false,
    )
  })

  it('extractBatchParams lifts the three data-n-a-* attributes, null if any missing', () => {
    const html =
      '<c-wiz data-n-a-id="CBMisw123" data-n-a-ts="1718900000" data-n-a-sg="ABC_sig">x</c-wiz>'
    expect(extractBatchParams(html)).toEqual({ id: 'CBMisw123', ts: '1718900000', sg: 'ABC_sig' })
    expect(extractBatchParams('<c-wiz data-n-a-id="x" data-n-a-ts="1">no sg</c-wiz>')).toBeNull()
  })

  it('buildBatchRequestBody encodes the Fbv4je/garturlreq envelope with id/ts/sg', () => {
    const body = buildBatchRequestBody({ id: 'CBMisw123', ts: '1718900000', sg: 'ABC_sig' })
    const decoded = decodeURIComponent(body)
    expect(decoded).toContain('Fbv4je')
    expect(decoded).toContain('garturlreq')
    expect(decoded).toContain('CBMisw123')
    expect(decoded).toContain('1718900000')
    expect(decoded).toContain('ABC_sig')
  })

  it('parseResolvedUrl returns the first non-Google https URL, null if none', () => {
    const resp =
      ')]}\'\n\n[["wrb.fr","Fbv4je","[\\"garturlres\\",\\"https://www.gstatic.com/x\\",\\"https://www.lasprovincias.es/camp-turia/ejercito-ribaroja.html\\"]"]]'
    expect(parseResolvedUrl(resp)).toBe(
      'https://www.lasprovincias.es/camp-turia/ejercito-ribaroja.html',
    )
    expect(
      parseResolvedUrl('only https://news.google.com/x and https://www.gstatic.com/y'),
    ).toBeNull()
  })

  it('groundDraft resolves a Google-News URL then grounds against the publisher', async () => {
    const publisher = 'https://www.lasprovincias.es/camp-turia/ejercito-ribaroja.html'
    let fetchedUrl = ''
    const fetchImpl: FetchLike = async (url) => {
      fetchedUrl = url
      return {
        ok: true,
        url,
        text: async () =>
          '<article>Construiremos un carril bici en la Avenida del Camp de Túria antes de 2027.</article>',
      }
    }
    const resolveGn = async () => publisher
    const g = await groundDraft(
      draft({ source: { url: 'https://news.google.com/rss/articles/CBMisw', publisher: 'LP' } }),
      fetchImpl,
      NOW,
      resolveGn,
    )
    expect(fetchedUrl).toBe(publisher)
    expect(g.grounded).toBe(true)
    expect(g.resolvedUrl).toBe(publisher)
  })

  it('groundDraft falls back to the original URL when resolution yields null', async () => {
    let fetchedUrl = ''
    const fetchImpl: FetchLike = async (url) => {
      fetchedUrl = url
      return {
        ok: true,
        url,
        text: async () =>
          '<article>Construiremos un carril bici en la Avenida del Camp de Túria antes de 2027.</article>',
      }
    }
    const resolveGn = async () => null
    const original = 'https://news.google.com/rss/articles/CBMisw'
    const g = await groundDraft(
      draft({ source: { url: original, publisher: 'LP' } }),
      fetchImpl,
      NOW,
      resolveGn,
    )
    expect(fetchedUrl).toBe(original)
    expect(g.grounded).toBe(true)
    expect(g.resolvedUrl).toBe(original)
  })
})

const NOW2 = new Date('2026-07-02T00:00:00.000Z')
function statusDraft(over: Partial<DraftStatusChange> = {}): DraftStatusChange {
  return {
    draftId: 'dsc-x',
    kind: 'status-change',
    requiresHumanApproval: true,
    confidence: 0.85,
    grounding: { grounded: false, urlResolved: false, quoteFound: false, checkedAt: '' },
    decision: 'queue',
    promiseId: 'psoe-obra',
    currentStatus: 'documentada',
    proposedStatus: 'en-progreso',
    evidence: {
      date: '2026-05-01',
      url: 'https://placsp/t1',
      quote: 'obra adjudicada por 240000',
      publisher: 'PLACSP',
      kind: 'tender',
      addedBy: 'auto-curation-v1',
    },
    reasoning: [],
    generatedAt: 'x',
    ...over,
  }
}

describe('status grounding', () => {
  it('groundStructuredCite: cite present + candidate exists → true', () => {
    expect(groundStructuredCite('tender[0].status=awarded', true)).toBe(true)
    expect(groundStructuredCite(undefined, true)).toBe(true) // real candidate, no explicit cite → still grounded
    expect(groundStructuredCite('tender[0].status=awarded', false)).toBe(false)
  })

  it('groundStatusDraft: structured corpus (tender) grounds without network', async () => {
    const g = await groundStatusDraft(statusDraft(), undefined, NOW2)
    expect(g.grounded).toBe(true)
  })

  it('groundStatusDraft: page-quote corpus (press) grounds when the quote is on the page', async () => {
    const fetchImpl = async () => ({
      ok: true,
      url: 'https://pub/a',
      text: async () => '<p>obra adjudicada por 240000 euros</p>',
    })
    const g = await groundStatusDraft(
      statusDraft({ evidence: { ...statusDraft().evidence, kind: 'press', url: 'https://pub/a' } }),
      fetchImpl as never,
      NOW2,
    )
    expect(g.grounded).toBe(true)
  })

  it('groundStatusDraft: press quote absent → fails safe', async () => {
    const fetchImpl = async () => ({
      ok: true,
      url: 'https://pub/a',
      text: async () => '<p>texto sin la cita</p>',
    })
    const g = await groundStatusDraft(
      statusDraft({ evidence: { ...statusDraft().evidence, kind: 'press', url: 'https://pub/a' } }),
      fetchImpl as never,
      NOW2,
    )
    expect(g.grounded).toBe(false)
  })
})

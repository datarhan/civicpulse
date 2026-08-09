import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { liveNetworkTest } from './setup/no-network'

// Tools imported lazily inside `beforeAll` AFTER we chdir to a tmp
// workspace so the snapshot paths the tools read resolve cleanly.
let tools: typeof import('../src/scraper/journalist-tools')
let originalCwd: string
let work: string

beforeAll(async () => {
  originalCwd = process.cwd()
  work = mkdtempSync(join(tmpdir(), 'cp-journalist-tools-'))
  mkdirSync(join(work, 'public/data'), { recursive: true })

  // Seed minimal snapshots.
  writeFileSync(
    join(work, 'public/data/officials.json'),
    JSON.stringify({
      officials: [
        {
          slug: 'sample-slug',
          name: 'Sample Subject',
          role: 'alcalde',
          party: 'PSOE',
          portfolios: ['Alcaldía', 'Innovación'],
          photoUrl: '/data/photos/sample-slug.jpg',
          cvUrl: 'https://example.org/cv-bio',
        },
        {
          slug: 'other-person',
          name: 'Other Councillor',
          role: 'concejal',
          party: 'PP',
          portfolios: ['Hacienda'],
        },
      ],
    }),
  )
  writeFileSync(
    join(work, 'public/data/press.json'),
    JSON.stringify({
      items: [
        {
          title: 'Sample Subject impulsa una nueva obra en el municipio',
          source: 'Levante-EMV',
          publishedAt: '2026-03-24T10:00:00Z',
          url: 'https://www.levante-emv.com/sample',
          summary: 'Síntesis breve',
        },
        {
          title: 'Otra historia sin relación',
          source: 'Las Provincias',
          publishedAt: '2026-02-01T08:00:00Z',
          url: 'https://www.lasprovincias.es/otra',
        },
      ],
    }),
  )
  writeFileSync(
    join(work, 'public/data/promises.json'),
    JSON.stringify({
      version: '1.0.0',
      generatedAt: '2026-04-20T06:02:41.968Z',
      frozenUntil: null,
      legalNotice: 'forty or more chars editorial promise notice content for the test fixture only',
      contactUrl: 'https://github.com/datarhan/civicpulse/issues',
      methodologyUrl: '/metodologia',
      items: [
        {
          id: 'psoe-test-001',
          party: 'PSOE',
          title: 'Promesa PSOE de muestra',
          quote: 'Construiremos algo importante para los vecinos',
          topic: 'urbanismo',
          status: 'documentada',
          madeAt: '2024-05-01',
        },
        {
          id: 'pp-test-001',
          party: 'PP',
          title: 'Promesa PP de muestra',
          quote: 'Defenderemos la transparencia municipal',
          topic: 'transparencia',
          status: 'documentada',
          madeAt: '2024-05-01',
        },
      ],
    }),
  )

  process.chdir(work)
  tools = await import('../src/scraper/journalist-tools')
  tools.resetCitationCounter()
})

afterAll(() => {
  process.chdir(originalCwd)
  rmSync(work, { recursive: true, force: true })
})

describe('searchLocalSnapshots', () => {
  it('finds an official by name', () => {
    const hits = tools.searchLocalSnapshots('Sample Subject', {
      files: ['public/data/officials.json'],
    })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].localPath).toBe('public/data/officials.json')
    expect(hits[0].matchedField).toBe('officials')
  })

  it('returns empty array for an empty query', () => {
    expect(tools.searchLocalSnapshots('', { files: ['public/data/officials.json'] })).toEqual([])
  })

  it('is case-insensitive and diacritic-insensitive', () => {
    const hits = tools.searchLocalSnapshots('alcaldia', {
      files: ['public/data/officials.json'],
    })
    expect(hits.length).toBeGreaterThan(0)
  })

  it('honors perFileLimit', () => {
    const hits = tools.searchLocalSnapshots('sample', {
      files: ['public/data/officials.json'],
      perFileLimit: 1,
    })
    expect(hits.length).toBeLessThanOrEqual(1)
  })

  it('searches multiple files', () => {
    const hits = tools.searchLocalSnapshots('Sample Subject', {
      files: ['public/data/officials.json', 'public/data/press.json'],
    })
    const paths = new Set(hits.map((h) => h.localPath))
    expect(paths.has('public/data/officials.json')).toBe(true)
    expect(paths.has('public/data/press.json')).toBe(true)
  })
})

describe('fetchOfficialBySlug', () => {
  it('returns the official record for a known slug', () => {
    const row = tools.fetchOfficialBySlug('sample-slug')
    expect(row?.name).toBe('Sample Subject')
    expect(row?.party).toBe('PSOE')
    expect(row?.portfolios).toContain('Innovación')
  })

  it('returns null for an unknown slug', () => {
    expect(tools.fetchOfficialBySlug('nope')).toBeNull()
  })
})

describe('fetchPressForSubject', () => {
  it('filters press.json by name token', () => {
    const hits = tools.fetchPressForSubject('Sample')
    expect(hits.length).toBe(1)
    expect(hits[0].source).toBe('Levante-EMV')
    expect(hits[0].publishedAt).toBe('2026-03-24')
  })

  it('returns empty when name does not appear', () => {
    expect(tools.fetchPressForSubject('Inexistente')).toEqual([])
  })
})

describe('fetchPromisesForParty', () => {
  it('filters by party, case-insensitive', () => {
    const hits = tools.fetchPromisesForParty('psoe')
    expect(hits.length).toBe(1)
    expect(hits[0].id).toBe('psoe-test-001')
  })

  it('returns empty for unknown party', () => {
    expect(tools.fetchPromisesForParty('VERDES')).toEqual([])
  })
})

describe('citation builders', () => {
  it('builds local-snapshot citations with monotonically-increasing ids', () => {
    tools.resetCitationCounter()
    const c1 = tools.buildLocalCitation({
      localPath: 'public/data/officials.json',
      title: 'Officials snapshot',
      excerpt: 'role: alcalde · party: PSOE',
    })
    const c2 = tools.buildLocalCitation({
      localPath: 'public/data/press.json',
      title: 'Press snapshot',
    })
    expect(c1.id).toBe('src-001')
    expect(c2.id).toBe('src-002')
    expect(c1.kind).toBe('local-snapshot')
    expect(c1.trust).toBe('high')
    expect(c1.excerpt?.length).toBeGreaterThan(0)
    expect(c2.excerpt).toBeUndefined()
  })

  it('builds web citations with domain-table trust (unknown → low, press → medium, override wins)', () => {
    tools.resetCitationCounter()
    const unknown = tools.buildWebCitation({
      url: 'https://example.org/article',
      title: 'External article',
      publisher: 'Example',
      publishedAt: '2026-03-01',
      excerpt: 'Some excerpt from the page',
      archiveUrl: 'https://web.archive.org/web/20260301/https://example.org/article',
    })
    expect(unknown.kind).toBe('web')
    expect(unknown.trust).toBe('low') // unknown domain: honest default
    expect(unknown.url).toBe('https://example.org/article')
    expect(unknown.archiveUrl).toContain('web.archive.org')

    const press = tools.buildWebCitation({
      url: 'https://www.lasprovincias.es/comunitat/x.html',
      title: 'Pieza de prensa',
    })
    expect(press.trust).toBe('medium')

    const official = tools.buildWebCitation({
      url: 'https://www.transportes.gob.es/nota',
      title: 'Nota ministerial',
    })
    expect(official.trust).toBe('high')

    const overridden = tools.buildWebCitation({
      url: 'https://example.org/article',
      title: 'Con override explícito',
      trust: 'high',
    })
    expect(overridden.trust).toBe('high')
  })

  it('builds Wikidata citations with high trust', () => {
    tools.resetCitationCounter()
    const cite = tools.buildWikidataCitation(
      {
        qid: 'Q1234567',
        labels: { es: 'Etiqueta de prueba', en: 'Test label' },
        descriptions: { es: 'Descripción breve' },
        claims: {},
        sitelinks: {},
        url: 'https://www.wikidata.org/wiki/Q1234567',
      },
      'es',
    )
    expect(cite.kind).toBe('wikidata')
    expect(cite.title).toContain('Etiqueta de prueba')
    expect(cite.trust).toBe('high')
    expect(cite.publisher).toBe('Wikidata')
  })
})

describe('webSearch backend dispatcher', () => {
  // Save + restore both env vars around every case so tests don't bleed
  // into each other or into whatever shell the suite was launched from.
  function withEnv<T>(
    patch: Record<string, string | undefined>,
    body: () => Promise<T>,
  ): Promise<T> {
    const previous: Record<string, string | undefined> = {}
    for (const k of Object.keys(patch)) previous[k] = process.env[k]
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    return body().finally(() => {
      for (const [k, v] of Object.entries(previous)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    })
  }

  /**
   * A fetch stub that answers from memory and records where it was asked to go.
   *
   * The URL log is the point: "which backend did the dispatcher pick" is not
   * something an error string can answer. The version of these tests that
   * matched `/Exa|fetch|ENOTFOUND|ECONN|undici|HTTP/i` passed identically
   * against a live 401 and against an offline DNS failure, which is why it
   * went unnoticed that `npm test` was calling api.exa.ai on every run.
   */
  function recordingFetch(respond: (url: string) => Response) {
    const calls: Array<{ url: string; method: string; headers: Headers }> = []
    const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url
      calls.push({
        url,
        method: (init?.method ?? 'GET').toUpperCase(),
        headers: new Headers(init?.headers),
      })
      return respond(url)
    })
    globalThis.fetch = fn as unknown as typeof globalThis.fetch
    return calls
  }

  it('returns an empty result set + helpful error when neither backend is configured, without issuing a request', async () => {
    await withEnv({ SEARXNG_URL: undefined, EXA_API_KEY: undefined }, async () => {
      const calls = recordingFetch(() => new Response('unreachable', { status: 500 }))
      const out = await tools.webSearch('no-backend-probe')
      expect(out.results).toEqual([])
      expect(out.error).toMatch(/SEARXNG_URL|EXA_API_KEY/)
      // The "no network" half of the claim, asserted instead of assumed: the
      // early return fires before `cached()` and before a request is built.
      expect(calls).toEqual([])
    })
  })

  it('routes to the Exa endpoint when only EXA_API_KEY is set, and degrades to an empty result set on an auth failure', async () => {
    await withEnv({ SEARXNG_URL: undefined, EXA_API_KEY: 'sk-fake' }, async () => {
      const calls = recordingFetch(
        () =>
          new Response(JSON.stringify({ error: 'unauthorized' }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }),
      )

      const out = await tools.webSearch('exa-branch-probe')

      // Discriminating: this pins the wire, not a message. SearXNG would have
      // gone to a different host, and the unconfigured path would not have
      // fetched at all — neither can masquerade as this.
      expect(calls.map((c) => c.url)).toEqual(['https://api.exa.ai/search'])
      expect(calls[0].method).toBe('POST')
      expect(calls[0].headers.get('x-api-key')).toBe('sk-fake')

      // …and the branch degrades gracefully rather than throwing. Exact
      // string: an offline DNS failure produces a different one, so this can
      // no longer pass for the wrong reason.
      expect(out.results).toEqual([])
      expect(out.error).toBe('Exa HTTP 401')

      // `cached()` writes that failure to disk — a real bad key would poison a
      // future search with a stale error, since there is no TTL. `CACHE_DIR`
      // is resolved at import time, which is the only reason it lands in this
      // throwaway workspace instead of the developer's repo cache. Pin it, so
      // dropping the chdir above cannot quietly start poisoning `.research-cache/`.
      expect(existsSync(join(work, '.research-cache'))).toBe(true)
      expect(existsSync(join(originalCwd, '.research-cache', 'exa-branch-probe.json'))).toBe(false)
    })
  })

  // Opt-in live smoke against a real SearXNG instance. `liveNetworkTest` is the
  // skip gate AND the network-guard lift in one declaration, so it cannot run
  // without permission or hold permission without running.
  liveNetworkTest(
    { enabledBy: 'RUN_E2E_SEARXNG', requires: ['SEARXNG_URL'] },
    'returns ≥1 result against a live SearXNG instance',
    async () => {
      const out = await tools.webSearch('Riba-roja de Túria ayuntamiento', { numResults: 5 })
      expect(out.error).toBeUndefined()
      expect(out.results.length).toBeGreaterThan(0)
      for (const r of out.results) {
        expect(r.url).toMatch(/^https?:\/\//)
        expect(r.title.length).toBeGreaterThan(0)
      }
    },
    15_000,
  )
})

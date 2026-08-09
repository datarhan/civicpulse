/**
 * The research-cache TTL policy.
 *
 * `.research-cache/` had no TTL and no notion of failure, so the first answer
 * was the only answer. On 31 Jul / 1 Aug 2026 that froze 21 empty biography
 * searches — «"<Surname>" universidad OR licenciado OR estudios» and the
 * social-media probes for Robert Raga — into permanent "nothing found", which
 * the biographies' `gaps-detected` sections then published about named living
 * people, forever.
 *
 * Every test below is written to DISCRIMINATE, because this repo has twice
 * shipped a suite that was green while measuring nothing. In particular:
 *
 *   · the TTL tests assert BOTH directions from the same clock, so "always a
 *     miss" and "always a hit" both fail;
 *   · the empty-vs-populated test varies only the payload, so a single global
 *     TTL cannot satisfy it;
 *   · the per-call-site test varies only the tool, so a single global TTL
 *     cannot satisfy that one either;
 *   · the coverage test derives the list of call sites from the SOURCE and
 *     asserts it found some, so an empty regex match cannot pass for "all
 *     covered" (CLAUDE.md data-integrity rule 1).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEFAULT_TTL_HOURS,
  TOOL_TTL_HOURS,
  classifyPayload,
  decideCacheRead,
  decideCacheWrite,
  hasExplicitTtl,
  inferToolCandidates,
  ttlHoursFor,
} from '../src/scraper/research-cache-policy'

const HOUR = 3_600_000
const T0 = Date.parse('2026-08-01T09:30:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

/** The real payload shapes, as the tools build them. */
const emptySearch = { query: '"Pla Giménez" universidad OR licenciado OR estudios', results: [] }
const fullSearch = {
  query: '"Pla Giménez" concejal',
  results: [{ title: 'Nota', url: 'https://www.ribarroja.es/nota' }],
}
const fetchOk = {
  url: 'https://www.ribarroja.es/x',
  status: 200,
  ok: true,
  contentType: 'text/html; charset=UTF-8',
  bodyExcerpt: '<html>algo de contenido</html>',
  archiveUrl: null,
  archivedAt: null,
  retrievedAt: iso(T0),
}
const fetchNoBody = { ...fetchOk, status: 403, ok: false, bodyExcerpt: null }
const fetchErrored = { ...fetchNoBody, status: null, error: 'The operation was aborted' }

describe('classifyPayload — what counts as an answer', () => {
  it('classes a truthy error as error whatever shape carries it', () => {
    expect(classifyPayload(fetchErrored).klass).toBe('error')
    expect(classifyPayload({ query: 'q', results: [], error: 'Exa HTTP 401' }).klass).toBe('error')
    // …and names it, so the withheld-write log says which failure it was.
    expect(classifyPayload({ query: 'q', results: [], error: 'Exa HTTP 401' }).detail).toContain(
      'Exa HTTP 401',
    )
  })

  it('classes an empty search, an empty gazette array and a null as empty', () => {
    expect(classifyPayload(emptySearch).klass).toBe('empty')
    expect(classifyPayload([]).klass).toBe('empty')
    expect(classifyPayload(null).klass).toBe('empty')
    // Shapes are kept distinct even though the class is shared: an empty
    // search and a null are not the same claim about the world.
    expect(classifyPayload(emptySearch).shape).toBe('search')
    expect(classifyPayload([]).shape).toBe('array')
    expect(classifyPayload(null).shape).toBe('null')
  })

  it('classes populated payloads as populated', () => {
    expect(classifyPayload(fullSearch).klass).toBe('populated')
    expect(classifyPayload([{ title: 'BOE-A-2024-1' }]).klass).toBe('populated')
    expect(classifyPayload('https://www.ribarroja.es/doc.pdf').klass).toBe('populated')
  })

  it('does not apply "empty" to a record with no collection in it', () => {
    // A Wikipedia summary with no `extract` is not an empty result: the page
    // exists and we resolved it. Applying a results.length test to a shape with
    // no results is exactly the mistake this guards.
    const summary = { lang: 'es', title: 'Riba-roja', url: 'https://es.wikipedia.org/wiki/X' }
    const c = classifyPayload(summary)
    expect(c.klass).toBe('populated')
    expect(c.shape).toBe('record')
    expect(c.detail).toContain('does not apply')
  })

  it('treats a 200 that carried no document as empty, not populated', () => {
    // The discriminating case: ribarroja.es's WAF answers a bare User-Agent
    // with a well-formed 200 and no usable body. Keying on `ok && bodyExcerpt`
    // rather than on `status` is what stops a WAF block being cached as a
    // successful read for a week.
    const wafish = { ...fetchOk, status: 200, ok: true, bodyExcerpt: '   ' }
    expect(classifyPayload(wafish).klass).toBe('empty')
    expect(classifyPayload(fetchNoBody).klass).toBe('empty')
    // …and the populated case still passes, so this is not "always empty".
    expect(classifyPayload(fetchOk).klass).toBe('populated')
  })
})

describe('rule 1 — a failure is not a result', () => {
  it('refuses to persist a payload carrying a truthy error, and says why', () => {
    const d = decideCacheWrite({ tool: 'fetchUrl', payload: fetchErrored })
    expect(d.persist).toBe(false)
    expect(d.reason).toContain('withheld')
    expect(d.reason).toContain('The operation was aborted')
  })

  it('persists the same shape once the error is gone', () => {
    // The other direction: without this, "never persists anything" would pass.
    expect(decideCacheWrite({ tool: 'fetchUrl', payload: fetchNoBody }).persist).toBe(true)
    expect(decideCacheWrite({ tool: 'fetchUrl', payload: fetchOk }).persist).toBe(true)
  })

  it('never serves a stored error, however fresh it is', () => {
    // Entries written before this policy existed can still hold one.
    const d = decideCacheRead({
      tool: 'fetchUrlHeadless',
      fetchedAt: iso(T0),
      payload: { ...fetchErrored, error: 'host ribarroja.es not in HEADLESS_FETCH_ALLOW' },
      nowMs: T0 + 1000,
    })
    expect(d.use).toBe(false)
    expect(d.ttlHours).toBe(0)
    expect(d.reason).toContain('never served')
  })
})

describe('rule 2 — an answer expires', () => {
  it('serves an entry inside its TTL and refuses the same entry past it', () => {
    const ttl = TOOL_TTL_HOURS.wikidata.populated // 720h
    const entry = { tool: 'wikidata', fetchedAt: iso(T0), payload: { qid: 'Q23701', labels: {} } }

    const inside = decideCacheRead({ ...entry, nowMs: T0 + (ttl - 1) * HOUR })
    const outside = decideCacheRead({ ...entry, nowMs: T0 + (ttl + 1) * HOUR })

    // Both directions from one entry: neither "always hit" nor "always miss"
    // can satisfy this pair.
    expect(inside.use).toBe(true)
    expect(outside.use).toBe(false)
    expect(inside.ttlHours).toBe(ttl)
    expect(outside.reason).toContain(`past the ${ttl}h TTL`)
  })

  it('treats the boundary itself as expired', () => {
    const ttl = TOOL_TTL_HOURS.webSearch.empty
    const at = decideCacheRead({
      tool: 'webSearch',
      fetchedAt: iso(T0),
      payload: emptySearch,
      nowMs: T0 + ttl * HOUR,
    })
    expect(at.use).toBe(false)
  })

  it('misses on an entry whose fetchedAt cannot be read, or is in the future', () => {
    const base = { tool: 'webSearch', payload: fullSearch, nowMs: T0 }
    expect(decideCacheRead({ ...base, fetchedAt: undefined }).use).toBe(false)
    expect(decideCacheRead({ ...base, fetchedAt: 'no-sé-cuándo' }).use).toBe(false)
    expect(decideCacheRead({ ...base, fetchedAt: iso(T0 + 5 * HOUR) }).use).toBe(false)
    expect(decideCacheRead({ ...base, fetchedAt: iso(T0 + 5 * HOUR) }).reason).toContain('future')
    // Control: a readable, past timestamp on the same payload IS served, so
    // this is measuring the timestamp and not just re-observing a miss.
    expect(decideCacheRead({ ...base, fetchedAt: iso(T0 - HOUR) }).use).toBe(true)
  })
})

describe('rule 3 — an empty answer expires sooner', () => {
  it('drops an empty search while still serving a populated one stored at the same moment', () => {
    // One clock, one tool, one age. The ONLY thing that varies is whether the
    // payload found anything — so a single TTL per tool cannot pass this.
    const fetchedAt = iso(T0)
    const nowMs = T0 + (TOOL_TTL_HOURS.webSearch.empty + 1) * HOUR

    const empty = decideCacheRead({ tool: 'webSearch', fetchedAt, payload: emptySearch, nowMs })
    const full = decideCacheRead({ tool: 'webSearch', fetchedAt, payload: fullSearch, nowMs })

    expect(empty.use).toBe(false)
    expect(full.use).toBe(true)
    expect(empty.ttlHours).toBeLessThan(full.ttlHours)
  })

  it('gives every registered tool a strictly shorter clock for empty than for populated', () => {
    const tools = Object.keys(TOOL_TTL_HOURS)
    // Assert the loop had something to loop over — an empty table would
    // otherwise satisfy every assertion below by vacuum.
    expect(tools.length).toBeGreaterThanOrEqual(10)
    for (const tool of tools) {
      const row = TOOL_TTL_HOURS[tool]
      expect(row.empty, `${tool}: empty TTL must be shorter than populated`).toBeLessThan(
        row.populated,
      )
      expect(ttlHoursFor(tool, 'empty')).toBe(row.empty)
      expect(ttlHoursFor(tool, 'populated')).toBe(row.populated)
    }
    expect(DEFAULT_TTL_HOURS.empty).toBeLessThan(DEFAULT_TTL_HOURS.populated)
  })
})

describe('rule 4 — the TTL is per call site', () => {
  it('serves wikidata and drops webSearch at the same age, same class, same clock', () => {
    // Only the tool name differs. No single global TTL can produce these two
    // verdicts, which is the whole point of the test.
    const fetchedAt = iso(T0)
    const nowMs = T0 + 200 * HOUR // 8d 8h: past webSearch's 72h, inside wikidata's 720h

    const wd = decideCacheRead({
      tool: 'wikidata',
      fetchedAt,
      payload: { qid: 'Q23701', labels: { es: 'x' } },
      nowMs,
    })
    const ws = decideCacheRead({ tool: 'webSearch', fetchedAt, payload: fullSearch, nowMs })

    expect(wd.classification.klass).toBe(ws.classification.klass) // both populated
    expect(wd.ageHours).toBeCloseTo(ws.ageHours as number, 6) // identical age
    expect(wd.use).toBe(true)
    expect(ws.use).toBe(false)
  })

  it('spreads the empty TTLs across call sites rather than sharing one number', () => {
    const emptyTtls = Object.keys(TOOL_TTL_HOURS).map((t) => ttlHoursFor(t, 'empty'))
    expect(emptyTtls.length).toBeGreaterThanOrEqual(10)
    expect(new Set(emptyTtls).size).toBeGreaterThan(1)
    // The search backends are the volatile ones and must be the shortest:
    // an empty webSearch is what reaches a reader as "no encontramos nada".
    expect(ttlHoursFor('webSearch', 'empty')).toBe(Math.min(...emptyTtls))
    // …and short enough that the 09:30 nightly always retries it.
    expect(ttlHoursFor('webSearch', 'empty')).toBeLessThan(24)
  })

  it('covers every cached() call site in the tool modules', () => {
    // Derived from the source, never restated here: a hand-copied list is how
    // six tests in this repo stayed green while production matched nothing.
    const sources = ['journalist-tools/web.ts', 'journalist-tools/gazette.ts'].map((rel) =>
      readFileSync(resolve('src/scraper', rel), 'utf8'),
    )
    const names = new Set<string>()
    for (const src of sources) {
      // Prove the files were actually read before trusting an empty match set.
      expect(src.length).toBeGreaterThan(1000)
      for (const m of src.matchAll(/\bcached\(\s*'([^']+)'/g)) names.add(m[1])
    }

    // Prove the extraction found something before believing what it says.
    expect(names.size).toBeGreaterThanOrEqual(10)
    expect(names.has('webSearch')).toBe(true)

    const missing = [...names].filter((n) => !hasExplicitTtl(n))
    expect(missing, `cached() call sites with no TTL row: ${missing.join(', ')}`).toEqual([])
  })

  it('falls back to a default that is shorter than every deliberate TTL', () => {
    // An unregistered call site is one nobody has reasoned about, so it must
    // behave like the most volatile thing here, not the most stable. Bounds are
    // computed from the table, so adding a shorter row cannot silently make
    // this vacuous.
    expect(hasExplicitTtl('someToolNobodyRegistered')).toBe(false)
    expect(ttlHoursFor('someToolNobodyRegistered', 'populated')).toBe(DEFAULT_TTL_HOURS.populated)
    expect(ttlHoursFor('someToolNobodyRegistered', 'empty')).toBe(DEFAULT_TTL_HOURS.empty)

    const tools = Object.keys(TOOL_TTL_HOURS)
    expect(tools.length).toBeGreaterThanOrEqual(10)
    expect(DEFAULT_TTL_HOURS.populated).toBeLessThan(
      Math.min(...tools.map((t) => ttlHoursFor(t, 'populated'))),
    )
    expect(DEFAULT_TTL_HOURS.empty).toBeLessThan(
      Math.min(...tools.map((t) => ttlHoursFor(t, 'empty'))),
    )
  })
})

describe('inferToolCandidates — reading entries written before the tool field', () => {
  it('attributes a search payload to webSearch and nothing else', () => {
    expect(inferToolCandidates(emptySearch)).toEqual(['webSearch'])
    expect(inferToolCandidates(fullSearch)).toEqual(['webSearch'])
  })

  it('attributes a populated PDF body to fetchPdfUrl, and an HTML one to fetchUrl', () => {
    // fetchUrl only fills bodyExcerpt when the content type contains "text", so
    // a populated application/pdf body can only be the pdf-parse route.
    const pdf = { ...fetchOk, contentType: 'application/pdf', bodyExcerpt: 'Doña ... concejala' }
    expect(inferToolCandidates(pdf)).toEqual(['fetchPdfUrl'])
    expect(inferToolCandidates(fetchOk)).toEqual(['fetchUrl'])
    expect(inferToolCandidates({ ...fetchOk, contentType: 'text/html (rendered)' })).toEqual([
      'fetchUrlHeadless',
    ])
  })

  it('leaves an empty retrieval undetermined, which costs nothing because the TTL is shared', () => {
    const candidates = inferToolCandidates(fetchNoBody)
    expect(candidates.length).toBe(3)
    const ttls = new Set(candidates.map((t) => ttlHoursFor(t, 'empty')))
    expect(ttls.size).toBe(1) // so the verdict is the same whoever wrote it
  })

  it('lists the four gazette tools for a bare array', () => {
    const candidates = inferToolCandidates([])
    expect(candidates).toContain('fetchBoeForSubject')
    expect(candidates).toContain('fetchHemerotecaQuery')
    expect(candidates.every((t) => hasExplicitTtl(t))).toBe(true)
  })
})

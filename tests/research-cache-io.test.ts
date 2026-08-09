/**
 * `cached()` against a real (throwaway) `.research-cache/`.
 *
 * The policy module proves the decisions; this proves they are WIRED — that the
 * withheld write really does not touch the disk, that a surviving good entry
 * really does survive, and that the on-disk `fetchedAt` really is read. A pure
 * policy nobody calls is the same defect as no policy at all.
 *
 * `CACHE_DIR` is resolved at import time, so the module is imported only after
 * chdir'ing into a temp workspace. Getting that wrong would make these tests
 * write into the developer's own research cache, which is the one directory
 * this branch exists to stop corrupting.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
// Imported rather than restated, so a change to the table cannot leave the
// backdating helper below quietly straddling the wrong boundary.
import { TOOL_TTL_HOURS } from '../src/scraper/research-cache-policy'

const TTL_WIKIDATA_EMPTY = TOOL_TTL_HOURS.wikidata.empty

let internal: typeof import('../src/scraper/journalist-tools/internal')
let originalCwd: string
let work: string

beforeAll(async () => {
  originalCwd = process.cwd()
  work = mkdtempSync(join(tmpdir(), 'cp-research-cache-'))
  process.chdir(work)
  internal = await import('../src/scraper/journalist-tools/internal')
})

afterAll(() => {
  process.chdir(originalCwd)
  rmSync(work, { recursive: true, force: true })
})

beforeEach(() => {
  if (existsSync(join(work, '.research-cache'))) {
    rmSync(join(work, '.research-cache'), { recursive: true, force: true })
  }
})

/** Every entry currently on disk, parsed. */
function entries(): Array<{ file: string; fetchedAt: string; tool?: string; payload: unknown }> {
  const dir = join(work, '.research-cache')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: f, ...JSON.parse(readFileSync(join(dir, f), 'utf8')) }))
}

/** Backdate the single entry on disk, leaving its payload untouched. */
function backdateSoleEntry(hours: number): { file: string; fetchedAt: string } {
  const all = entries()
  expect(all.length).toBe(1)
  const fetchedAt = new Date(Date.now() - hours * 3_600_000).toISOString()
  const { file, ...rest } = all[0]
  writeFileSync(join(work, '.research-cache', file), JSON.stringify({ ...rest, fetchedAt }))
  return { file, fetchedAt }
}

const goodBody = {
  url: 'https://www.ribarroja.es/ficha',
  status: 200,
  ok: true,
  contentType: 'text/html; charset=UTF-8',
  bodyExcerpt: '<html>ficha del concejal</html>',
  archiveUrl: null,
  archivedAt: null,
  retrievedAt: '2026-07-31T09:00:00.000Z',
}

describe('cached() — the cache never keeps a failure', () => {
  it('does not write an errored payload, and leaves the previous good answer intact', async () => {
    const args = { url: 'https://www.ribarroja.es/ficha' }

    // 1. A good answer is cached.
    await internal.cached('fetchUrl', args, async () => goodBody)
    expect(entries().length).toBe(1)

    // 2. Age it past fetchUrl's populated TTL so the next call actually runs.
    const { fetchedAt: staleStamp } = backdateSoleEntry(500)

    // 3. The refetch fails.
    const failure = { ...goodBody, status: null, ok: false, bodyExcerpt: null, error: 'ETIMEDOUT' }
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    let returned: unknown
    let logged: string
    try {
      returned = await internal.cached('fetchUrl', args, async () => failure)
    } finally {
      // Read the calls BEFORE restoring: vitest's mockRestore also resets the
      // mock, so `mock.calls` is empty by the time you get to it afterwards.
      logged = stderr.mock.calls.map((c) => String(c[0])).join('')
      stderr.mockRestore()
    }

    // The caller is told it failed — withholding is about the cache, not the
    // return value.
    expect(returned).toEqual(failure)

    // The write was announced rather than passed over in silence.
    expect(logged).toContain('[research-cache]')
    expect(logged).toContain('ETIMEDOUT')

    // …and the disk still holds the GOOD answer, at its original timestamp.
    const after = entries()
    expect(after.length).toBe(1)
    expect(after[0].payload).toEqual(goodBody)
    expect(after[0].fetchedAt).toBe(staleStamp)
  })

  it('writes nothing at all when the very first call fails', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
    try {
      await internal.cached('webSearch', { backend: 'exa', query: 'q' }, async () => ({
        query: 'q',
        results: [],
        error: 'Exa HTTP 401',
      }))
    } finally {
      stderr.mockRestore()
    }
    // No file, so a bad API key cannot pin an empty search result set.
    expect(entries()).toEqual([])

    // Control: the same call without the error DOES land, so "writes nothing"
    // is a property of the error and not of the test setup.
    await internal.cached('webSearch', { backend: 'exa', query: 'q' }, async () => ({
      query: 'q',
      results: [],
    }))
    expect(entries().length).toBe(1)
  })
})

describe('cached() — the stored fetchedAt is finally read', () => {
  it('re-runs an expired entry and serves a fresh one', async () => {
    const args = { query: '"Pla Giménez" universidad OR licenciado OR estudios' }
    const empty = { query: args.query, results: [] as unknown[] }
    const found = { query: args.query, results: [{ title: 'Nota', url: 'https://x.test/a' }] }

    const run = vi.fn(async () => empty)
    await internal.cached('webSearch', args, run)
    expect(run).toHaveBeenCalledTimes(1)

    // Fresh: served from cache, the runner is not called again.
    await internal.cached('webSearch', args, run)
    expect(run).toHaveBeenCalledTimes(1)

    // Aged past webSearch's 12h empty TTL: the runner runs, and this time it
    // finds something — which is precisely what the 21 frozen empties of
    // 31 Jul could never do.
    backdateSoleEntry(13)
    const run2 = vi.fn(async () => found)
    const out = await internal.cached('webSearch', args, run2)
    expect(run2).toHaveBeenCalledTimes(1)
    expect(out).toEqual(found)
    expect(entries()[0].payload).toEqual(found)
  })

  it('serves a cached null instead of re-fetching it', async () => {
    // The old `readCache` returned the payload and the caller tested
    // `hit !== null`, so a cached null — "Wikidata has no item for this
    // councillor" — was indistinguishable from a miss and re-hit the API on
    // every single run. 18 such entries sat on disk having never been used.
    const run = vi.fn(async () => null)
    expect(await internal.cached('wikidata', { qid: 'Q404' }, run)).toBeNull()
    expect(entries().length).toBe(1)

    const run2 = vi.fn(async () => {
      throw new Error('should not re-fetch a null that is still inside its TTL')
    })
    expect(await internal.cached('wikidata', { qid: 'Q404' }, run2)).toBeNull()
    expect(run2).not.toHaveBeenCalled()

    // …and it is still bounded: past the empty TTL for wikidata it re-runs.
    backdateSoleEntry(TTL_WIKIDATA_EMPTY + 1)
    const run3 = vi.fn(async () => null)
    await internal.cached('wikidata', { qid: 'Q404' }, run3)
    expect(run3).toHaveBeenCalledTimes(1)
  })

  it('records which tool wrote the entry, so the cache can be inspected', async () => {
    await internal.cached('fetchDialnet', { name: 'X', limit: 8 }, async () => [])
    expect(entries()[0].tool).toBe('fetchDialnet')
  })
})

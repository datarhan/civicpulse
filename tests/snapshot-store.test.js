import { describe, it, expect } from 'vitest'
import { installFetchMock } from './setup/mockFetch'
import {
  ensureSnapshot,
  peekSnapshot,
  subscribeSnapshot,
  loadSnapshotData,
  loadSnapshotOptional,
  invalidateSnapshots,
} from '../src/lib/snapshot-store'

describe('snapshot-store', () => {
  it('caches a 2xx payload and dedupes concurrent fetches (single-flight)', async () => {
    const fetchFn = installFetchMock({ '/data/a.json': { n: 1 } })
    const [e1, e2] = await Promise.all([
      ensureSnapshot('/data/a.json'),
      ensureSnapshot('/data/a.json'),
    ])
    expect(e1.status).toBe('ready')
    expect(e1.data).toEqual({ n: 1 })
    expect(e2.data).toEqual({ n: 1 })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    await ensureSnapshot('/data/a.json') // session cache: no refetch
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('caches 404 as missing (no refetch) with a 404 error attached', async () => {
    const fetchFn = installFetchMock({})
    const e = await ensureSnapshot('/data/absent.json')
    expect(e.status).toBe('missing')
    expect(String(e.error)).toContain('404')
    await ensureSnapshot('/data/absent.json')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('does NOT cache network errors — next ensure retries', async () => {
    let calls = 0
    globalThis.fetch = async () => {
      calls += 1
      throw new Error('offline')
    }
    const e1 = await ensureSnapshot('/data/flaky.json')
    expect(e1.status).toBe('error')
    const e2 = await ensureSnapshot('/data/flaky.json')
    expect(e2.status).toBe('error')
    expect(calls).toBe(2)
  })

  it('notifies subscribers on settle and on invalidate', async () => {
    installFetchMock({ '/data/b.json': { ok: true } })
    const seen = []
    const unsub = subscribeSnapshot('/data/b.json', () =>
      seen.push(peekSnapshot('/data/b.json')?.status),
    )
    await ensureSnapshot('/data/b.json')
    expect(seen).toContain('loading')
    expect(seen).toContain('ready')
    invalidateSnapshots('/data/b.json')
    expect(peekSnapshot('/data/b.json')).toBeNull()
    unsub()
  })

  it('loadSnapshotData resolves data and throws on missing', async () => {
    installFetchMock({ '/data/c.json': [1, 2] })
    await expect(loadSnapshotData('/data/c.json')).resolves.toEqual([1, 2])
    await expect(loadSnapshotData('/data/nope.json')).rejects.toThrow('404')
  })

  it('loadSnapshotOptional maps missing and error to null', async () => {
    installFetchMock({ '/data/d.json': { x: 1 } })
    await expect(loadSnapshotOptional('/data/d.json')).resolves.toEqual({ x: 1 })
    await expect(loadSnapshotOptional('/data/gone.json')).resolves.toBeNull()
    globalThis.fetch = async () => {
      throw new Error('offline')
    }
    await expect(loadSnapshotOptional('/data/err.json')).resolves.toBeNull()
  })

  it('invalidateSnapshots() with no arg clears everything', async () => {
    installFetchMock({ '/data/e.json': 1, '/data/f.json': 2 })
    await ensureSnapshot('/data/e.json')
    await ensureSnapshot('/data/f.json')
    invalidateSnapshots()
    expect(peekSnapshot('/data/e.json')).toBeNull()
    expect(peekSnapshot('/data/f.json')).toBeNull()
  })
})

# Data-Layer Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the flat-file data architecture a client delivery layer (session-cached single-flight snapshot store), a materialized department claim cross-tab, and a cross-snapshot referential-integrity gate — per `docs/superpowers/specs/2026-07-29-data-layer-refactor-design.md`.

**Architecture:** A module-level snapshot store (`src/lib/snapshot-store.js`, pure JS, framework-free) + a `useSyncExternalStore` React binding (`src/hooks/useSnapshot.js`) that `useJsonFetch` delegates to, so all ~42 domain hooks keep their exact API. The pleno-claims chunk manifest gains a `totals.byTopicVerdict` cross-tab so `/departamentos` reads 12 KB instead of 6.4 MB. A new pure checker (`src/scraper/relations-check.ts`) + CLI (`scripts/check-relations.ts`) audits cross-snapshot foreign keys nightly.

**Tech Stack:** Vite + React 18 (useSyncExternalStore), Vitest + happy-dom + @testing-library, tsx CLIs, no new dependencies.

## Global Constraints

- No new runtime dependencies; no react-query/SWR/state libraries.
- Every existing hook's public API and return-shape stays byte-identical (`{loading, error, data}` + co-located label maps).
- Curated vs machine-written file contracts untouched; no libel-gate logic changes; `/metodologia` unchanged (no editorial behavior change).
- `cache: 'no-cache'` fetch semantics preserved (ETag revalidation on first session load).
- Errors are never cached across mounts (per-mount retry parity); 404-with-fallback semantics per caller.
- `useLabHealth` and external-API hooks (`useLiveWeather`, `useAirQuality`) are NOT migrated.
- Repo conventions: `// @ts-check` in JS modules, Prettier via pre-commit hook, `tsc --noEmit` must stay clean, commit messages end with the Claude co-author trailer.

---

### Task 1: Snapshot store core (framework-free)

**Files:**
- Create: `src/lib/snapshot-store.js`
- Test: `tests/snapshot-store.test.js`
- Modify: `tests/setup/setup.ts` (reset store between tests)

**Interfaces:**
- Produces: `ensureSnapshot(path) → Promise<entry>` (never rejects; single-flight; retries when the cached entry is `error`), `peekSnapshot(path) → entry|null`, `subscribeSnapshot(path, fn) → unsubscribe`, `loadSnapshotData(path) → Promise<data>` (throws on `missing`/`error`), `loadSnapshotOptional(path) → Promise<data|null>`, `invalidateSnapshots(path?)`. Entry shape: `{ status: 'loading'|'ready'|'missing'|'error', data, error, promise }`.

- [ ] **Step 1: Write the failing test** — `tests/snapshot-store.test.js`:

```js
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
    const [e1, e2] = await Promise.all([ensureSnapshot('/data/a.json'), ensureSnapshot('/data/a.json')])
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
    // @ts-expect-error override
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
    const unsub = subscribeSnapshot('/data/b.json', () => seen.push(peekSnapshot('/data/b.json')?.status))
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
    // @ts-expect-error override
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
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/snapshot-store.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/lib/snapshot-store.js`:

```js
// @ts-check
/**
 * Module-level store for the static JSON snapshots under /public/data —
 * the delivery layer of the flat-file data architecture (see
 * docs/superpowers/specs/2026-07-29-data-layer-refactor-design.md).
 *
 * Semantics (deliberate parity with the pre-store useJsonFetch):
 * - single-flight: concurrent ensures share one fetch
 * - session cache: 'ready' (2xx) and 'missing' (404) are cached for the
 *   SPA session — the data refreshes nightly, sessions last minutes
 * - errors are NEVER cached: the failed entry stays visible to current
 *   subscribers, but the next ensureSnapshot() retries (per-mount retry)
 * - fallback mapping happens in the React binding per caller, so two
 *   callers with different 404-fallbacks both behave correctly
 *
 * Framework-free on purpose: unit-testable without React, importable
 * from any future imperative consumer.
 */

/**
 * @typedef {Object} SnapshotEntry
 * @property {'loading'|'ready'|'missing'|'error'} status
 * @property {any} data
 * @property {Error|null} error
 * @property {Promise<SnapshotEntry>} promise
 */

/** @type {Map<string, SnapshotEntry>} */
const entries = new Map()
/** @type {Map<string, Set<() => void>>} */
const listeners = new Map()

function notify(path) {
  for (const fn of listeners.get(path) ?? []) fn()
}

/**
 * Replace the entry for `path` unless a newer fetch superseded it
 * (e.g. invalidate + re-ensure while this one was in flight).
 */
function settle(path, started, patch) {
  const current = entries.get(path)
  if (current !== started) return current ?? { ...started, ...patch }
  const next = { ...started, ...patch }
  entries.set(path, next)
  notify(path)
  return next
}

/**
 * Ensure `path` is loaded (or loading). Returns a promise for the settled
 * entry; never rejects. Re-fetches when the cached entry is an error.
 * @param {string} path
 * @returns {Promise<SnapshotEntry>}
 */
export function ensureSnapshot(path) {
  const existing = entries.get(path)
  if (existing && existing.status !== 'error') return existing.promise
  /** @type {SnapshotEntry} */
  let entry
  const promise = (async () => {
    try {
      const r = await fetch(path, { cache: 'no-cache' })
      if (r.status === 404) {
        return settle(path, entry, {
          status: 'missing',
          error: new Error(`${path} returned 404`),
        })
      }
      if (!r.ok) {
        return settle(path, entry, {
          status: 'error',
          error: new Error(`${path} returned ${r.status}`),
        })
      }
      const data = await r.json()
      return settle(path, entry, { status: 'ready', data, error: null })
    } catch (error) {
      return settle(path, entry, {
        status: 'error',
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  })()
  entry = { status: 'loading', data: null, error: null, promise }
  entries.set(path, entry)
  notify(path)
  return promise
}

/**
 * Synchronous peek — for useSyncExternalStore. Null when never loaded
 * (or invalidated).
 * @param {string} path
 * @returns {SnapshotEntry|null}
 */
export function peekSnapshot(path) {
  return entries.get(path) ?? null
}

/**
 * @param {string} path
 * @param {() => void} fn
 * @returns {() => void} unsubscribe
 */
export function subscribeSnapshot(path, fn) {
  let set = listeners.get(path)
  if (!set) {
    set = new Set()
    listeners.set(path, set)
  }
  set.add(fn)
  return () => {
    set.delete(fn)
  }
}

/**
 * Load a required snapshot: resolves the parsed JSON, throws the entry
 * error on `missing` or `error` (used for chunk fan-outs where a missing
 * chunk is a real failure).
 * @param {string} path
 * @returns {Promise<any>}
 */
export async function loadSnapshotData(path) {
  const entry = await ensureSnapshot(path)
  if (entry.status === 'ready') return entry.data
  throw entry.error ?? new Error(`${path} failed to load`)
}

/**
 * Load an optional snapshot: `missing`/`error` → null (the usePressLab
 * fetchOptional contract).
 * @param {string} path
 * @returns {Promise<any|null>}
 */
export async function loadSnapshotOptional(path) {
  const entry = await ensureSnapshot(path)
  return entry.status === 'ready' ? entry.data : null
}

/**
 * Drop one path (or everything) from the cache and notify subscribers.
 * NOTE: components already mounted keep their last-rendered value until
 * something calls ensureSnapshot() again (a fresh mount does). Today's
 * only caller is the test setup; a future curator mutation flow should
 * invalidate + navigate.
 * @param {string} [path]
 */
export function invalidateSnapshots(path) {
  if (path != null) {
    entries.delete(path)
    notify(path)
    return
  }
  const paths = [...entries.keys()]
  entries.clear()
  for (const p of paths) notify(p)
}
```

- [ ] **Step 4: Wire the global test reset** — `tests/setup/setup.ts` becomes:

```ts
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'

afterEach(() => {
  cleanup()
})

// Reset fetch-layer state between tests: the snapshot store is a
// module-level session cache, and hook tests remap the same path with
// different installFetchMock payloads across tests in one file.
beforeEach(() => {
  invalidateSnapshots()
})
```

- [ ] **Step 5: Run** — `npx vitest run tests/snapshot-store.test.js` → PASS (7 tests). Then `npm test` → full suite still green.

- [ ] **Step 6: Commit** — `git add src/lib/snapshot-store.js tests/snapshot-store.test.js tests/setup/setup.ts && git commit -m "feat(data-layer): session-cached single-flight snapshot store (RED+GREEN)"`

---

### Task 2: React binding + useJsonFetch delegate

**Files:**
- Create: `src/hooks/useSnapshot.js`
- Modify: `src/hooks/useJsonFetch.js` (delegate, API unchanged)
- Test: `tests/use-snapshot.test.js`

**Interfaces:**
- Consumes: `subscribeSnapshot`, `peekSnapshot`, `ensureSnapshot` from Task 1.
- Produces: `useSnapshot(path, fallback=null) → {loading, error, data}` — exact `useJsonFetch` semantics; `useJsonFetch(path, fallback)` re-exported as a delegate so ~42 hooks stay untouched.

- [ ] **Step 1: Write the failing test** — `tests/use-snapshot.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { installFetchMock } from './setup/mockFetch'
import { useJsonFetch } from '../src/hooks/useJsonFetch'

const FALLBACK = { items: [] }

describe('useJsonFetch (snapshot-store backed)', () => {
  it('loads data with loading→ready lifecycle', async () => {
    installFetchMock({ '/data/x.json': { items: [1] } })
    const { result } = renderHook(() => useJsonFetch('/data/x.json'))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.data).toEqual({ items: [1] })
  })

  it('two mounts of the same path fetch once and share data', async () => {
    const fetchFn = installFetchMock({ '/data/shared.json': { n: 7 } })
    const a = renderHook(() => useJsonFetch('/data/shared.json'))
    const b = renderHook(() => useJsonFetch('/data/shared.json'))
    await waitFor(() => expect(a.result.current.loading).toBe(false))
    await waitFor(() => expect(b.result.current.loading).toBe(false))
    expect(a.result.current.data).toEqual({ n: 7 })
    expect(b.result.current.data).toEqual({ n: 7 })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('404 with fallback resolves to the fallback, no error', async () => {
    installFetchMock({})
    const { result } = renderHook(() => useJsonFetch('/data/absent.json', FALLBACK))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.data).toBe(FALLBACK)
  })

  it('404 without fallback surfaces an error', async () => {
    installFetchMock({})
    const { result } = renderHook(() => useJsonFetch('/data/absent.json'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(String(result.current.error)).toContain('404')
    expect(result.current.data).toBeNull()
  })

  it('non-ok non-404 surfaces an error and a remount retries', async () => {
    // @ts-expect-error override
    globalThis.fetch = async () => new Response('boom', { status: 500 })
    const first = renderHook(() => useJsonFetch('/data/e500.json'))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(String(first.result.current.error)).toContain('500')
    first.unmount()
    const fetchFn = installFetchMock({ '/data/e500.json': { ok: 1 } })
    const second = renderHook(() => useJsonFetch('/data/e500.json'))
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(second.result.current.data).toEqual({ ok: 1 })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/use-snapshot.test.js` → the two-mounts test FAILS (2 fetches today) once useJsonFetch delegates; before the delegate exists the suite fails on import. Either RED is acceptable evidence.

- [ ] **Step 3: Implement** — `src/hooks/useSnapshot.js`:

```js
// @ts-check
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { ensureSnapshot, peekSnapshot, subscribeSnapshot } from '../lib/snapshot-store'

const LOADING_STATE = Object.freeze({ loading: true, error: null, data: null })

/**
 * React binding for the snapshot store. Exact useJsonFetch semantics:
 * {loading, error, data}; 404 + non-null fallback → fallback; errors are
 * per-mount retried (the store never caches them). Pass a module-level
 * constant as `fallback` — it is read through a ref at settle time, so a
 * fresh literal per render would not churn, matching the old contract.
 *
 * @param {string} path
 * @param {any} [fallback]
 * @returns {{ loading: boolean, error: Error|null, data: any }}
 */
export function useSnapshot(path, fallback = null) {
  const fallbackRef = useRef(fallback)
  fallbackRef.current = fallback
  const subscribe = useCallback((cb) => subscribeSnapshot(path, cb), [path])
  const getSnap = useCallback(() => peekSnapshot(path), [path])
  const entry = useSyncExternalStore(subscribe, getSnap)
  useEffect(() => {
    // Once per mount: starts the first load, and retries when the cached
    // entry is an error (ensureSnapshot refetches on 'error' status).
    ensureSnapshot(path)
  }, [path])
  return useMemo(() => {
    if (!entry || entry.status === 'loading') return LOADING_STATE
    if (entry.status === 'ready') return { loading: false, error: null, data: entry.data }
    if (entry.status === 'missing') {
      const fb = fallbackRef.current
      if (fb != null) return { loading: false, error: null, data: fb }
      return { loading: false, error: entry.error, data: null }
    }
    return { loading: false, error: entry.error, data: null }
  }, [entry])
}
```

`src/hooks/useJsonFetch.js` becomes (keep the doc comment, updated):

```js
// @ts-check
import { useSnapshot } from './useSnapshot'

/**
 * Shared loader for the static JSON snapshots under /public/data.
 *
 * Since 2026-07 this delegates to the session-cached snapshot store
 * (src/lib/snapshot-store.js): concurrent mounts of the same path share
 * one fetch, and route navigation stops refetching unchanged snapshots.
 * The public contract is unchanged: {loading, error, data}; `fallback`
 * resolves a 404 to a default-shaped object (pass a module-level
 * constant); any other non-ok status surfaces as an error and retries on
 * the next mount.
 *
 * @param {string} path  absolute public path, e.g. '/data/padron.json'
 * @param {any} [fallback]  value to resolve to on a 404 (default: null → 404 errors)
 * @returns {{ loading: boolean, error: Error|null, data: any }}
 */
export function useJsonFetch(path, fallback = null) {
  return useSnapshot(path, fallback)
}
```

- [ ] **Step 4: Run** — `npx vitest run tests/use-snapshot.test.js` → PASS; `npm test` → full suite green (existing hook tests now go through the store; the Task 1 setup reset keeps per-test isolation).

- [ ] **Step 5: Commit** — `git add src/hooks/useSnapshot.js src/hooks/useJsonFetch.js tests/use-snapshot.test.js && git commit -m "feat(data-layer): useJsonFetch delegates to the snapshot store — all domain hooks dedupe + session-cache"`

---

### Task 3: Migrate the bespoke loaders (usePlenoClaims, usePressLab, ReportajeBlockD)

**Files:**
- Modify: `src/hooks/usePlenoClaims.js:58-105` (full-corpus hook only; manifest/chunk variants already ride useJsonFetch)
- Modify: `src/hooks/usePressLab.js:23-31,50`
- Modify: `src/variants/direction-d/blocks/ReportajeBlockD.jsx:14-37`
- Test: extend `tests/use-pleno-claims-hooks.test.js`

**Interfaces:**
- Consumes: `useSnapshot` (Task 2), `loadSnapshotData`, `loadSnapshotOptional` (Task 1).
- Produces: unchanged hook APIs; chunk entries land in the store so `/plenos/:id`, `/declaraciones`, `/departamentos/:slug` share one corpus load per session.

- [ ] **Step 1: Write the failing test** — append to `tests/use-pleno-claims-hooks.test.js`:

```js
import { usePlenoClaims } from '../src/hooks/usePlenoClaims'

describe('usePlenoClaims (store-backed)', () => {
  it('flattens manifest + chunks and fetches each file once across two mounts', async () => {
    const fetchFn = installFetchMock({
      '/data/pleno-claims/index.json': {
        generatedAt: '2026-07-29T00:00:00Z',
        plenos: [
          { plenoId: 'aaa', chunkPath: 'pleno-claims/aaa.json' },
          { plenoId: 'bbb', chunkPath: 'pleno-claims/bbb.json' },
        ],
        totals: { items: 3, byVerdict: { verificado: 1 } },
      },
      '/data/pleno-claims/aaa.json': { items: [{ claim: { id: 'a1' } }, { claim: { id: 'a2' } }] },
      '/data/pleno-claims/bbb.json': { items: [{ claim: { id: 'b1' } }] },
    })
    const first = renderHook(() => usePlenoClaims())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(first.result.current.data.items.map((it) => it.claim.id)).toEqual(['a1', 'a2', 'b1'])
    expect(first.result.current.data.stats.total).toBe(3)
    const callsAfterFirst = fetchFn.mock.calls.length
    const second = renderHook(() => usePlenoClaims())
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(fetchFn.mock.calls.length).toBe(callsAfterFirst) // fully served from cache
  })

  it('manifest 404 resolves to the honest-empty ledger', async () => {
    installFetchMock({})
    const { result } = renderHook(() => usePlenoClaims())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.data.items).toEqual([])
    expect(result.current.data.stats.total).toBe(0)
  })

  it('a failing chunk surfaces as an error', async () => {
    installFetchMock({
      '/data/pleno-claims/index.json': {
        plenos: [{ plenoId: 'aaa', chunkPath: 'pleno-claims/aaa.json' }],
        totals: { items: 1, byVerdict: {} },
      },
      // aaa.json absent → 404 → chunk load throws
    })
    const { result } = renderHook(() => usePlenoClaims())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify RED** — `npx vitest run tests/use-pleno-claims-hooks.test.js` → the once-across-two-mounts assertion FAILS against the bespoke fetcher.

- [ ] **Step 3: Implement** — replace `usePlenoClaims` body (keep the doc comment, note the store):

```js
export function usePlenoClaims() {
  const manifest = useSnapshot('/data/pleno-claims/index.json', EMPTY_MANIFEST)
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    if (manifest.loading) return
    if (manifest.error) {
      setState({ loading: false, error: manifest.error, data: null })
      return
    }
    let alive = true
    const plenos = manifest.data?.plenos ?? []
    Promise.all(plenos.map((p) => loadSnapshotData(`/data/${p.chunkPath}`)))
      .then((chunks) => {
        if (!alive) return
        const items = chunks.flatMap((c) => c?.items ?? [])
        setState({
          loading: false,
          error: null,
          data: {
            generatedAt: manifest.data?.generatedAt,
            items,
            stats: {
              total: manifest.data?.totals?.items ?? items.length,
              byVerdict: manifest.data?.totals?.byVerdict ?? {},
            },
          },
        })
      })
      .catch((error) => {
        if (alive) setState({ loading: false, error, data: null })
      })
    return () => {
      alive = false
    }
  }, [manifest.loading, manifest.error, manifest.data])
  return state
}
```

Imports at top of the file: `import { useSnapshot } from './useSnapshot'` and `import { loadSnapshotData } from '../lib/snapshot-store'` (drop nothing else; `useJsonFetch` stays for the manifest/chunk variants). Move `EMPTY_MANIFEST`/`EMPTY_CHUNK` above `usePlenoClaims`.

`usePressLab.js`: delete `fetchOptional`, import `{ loadSnapshotOptional } from '../lib/snapshot-store'`, and change line 50 to `Promise.all(FILES.map(loadSnapshotOptional)).then((blobs) => {`.

`ReportajeBlockD.jsx`: replace the fetch inside `useReportajesPublicados` with the store:

```js
import { loadSnapshotOptional } from '../../../lib/snapshot-store'
// …
    Promise.all(REPORTAJE_SLUGS.map((slug) => loadSnapshotOptional(`/data/reportajes/${slug}.json`))).then(
      (snaps) => {
        if (!alive) return
        setItems(
          snaps
            .map((snap, i) => ({ slug: REPORTAJE_SLUGS[i], meta: snap?.meta }))
            .filter((x) => x.meta && x.meta.estado === 'publicado'),
        )
      },
    )
```

- [ ] **Step 4: Run** — `npx vitest run tests/use-pleno-claims-hooks.test.js` → PASS; `npm test` → green.

- [ ] **Step 5: Commit** — `git add src/hooks/usePlenoClaims.js src/hooks/usePressLab.js src/variants/direction-d/blocks/ReportajeBlockD.jsx tests/use-pleno-claims-hooks.test.js && git commit -m "refactor(data-layer): bespoke loaders ride the snapshot store (claims fan-out, press-lab, reportajes teaser)"`

---

### Task 4: Manifest cross-tab (`totals.byTopicVerdict`)

**Files:**
- Modify: `src/scraper/pleno-claims-chunks.ts:71-76,167-202`
- Test: extend `tests/pleno-claims-chunks.test.ts`
- Data: regenerate `public/data/pleno-claims/` via `npm run chunk-pleno-claims`

**Interfaces:**
- Produces: `PlenoClaimsChunkManifest.totals.byTopicVerdict: Record<string, Record<string, number>>` — topic → verdict → count over the same post-gate items the chunks contain. Task 6 consumes it.

- [ ] **Step 1: Write the failing test** — add to `tests/pleno-claims-chunks.test.ts` (reuse the file's existing item-builder helpers if present; otherwise inline minimal items):

```ts
it('totals.byTopicVerdict cross-tabs topic × verdict over all chunked items', () => {
  const items = [
    mkItem({ plenoId: 'p1', topic: 'urbanismo', verdict: 'verificado' }),
    mkItem({ plenoId: 'p1', topic: 'urbanismo', verdict: 'sin-datos' }),
    mkItem({ plenoId: 'p2', topic: 'hacienda', verdict: 'contradicho' }),
  ]
  const { manifest } = buildManifest(groupItemsByPleno(items), '2026-07-29T00:00:00Z')
  expect(manifest.totals.byTopicVerdict).toEqual({
    urbanismo: { verificado: 1, 'sin-datos': 1 },
    hacienda: { contradicho: 1 },
  })
})
```

(`mkItem` = whatever fixture builder the file already uses; match its claim shape: `{ claim: { plenoId, plenoDate, segmentIndex, type, topic, … }, verification: { verdict, confidence } }`.)

- [ ] **Step 2: Run to verify RED** — `npx vitest run tests/pleno-claims-chunks.test.ts` → FAIL (`byTopicVerdict` undefined).

- [ ] **Step 3: Implement** — in `pleno-claims-chunks.ts`, extend the `totals` type:

```ts
  /** Aggregate stats — same as the monolith's stats block. */
  totals: {
    items: number
    plenos: number
    byVerdict: Record<string, number>
    /**
     * topic → verdict → count over the exact item set written into the
     * chunks (post gateItemsForPublic). Lets /departamentos aggregate
     * per-department declaration counts from the 12 KB manifest instead
     * of downloading every chunk; the topic→department mapping stays
     * client-side in src/lib/department-claim-topics.js.
     */
    byTopicVerdict: Record<string, Record<string, number>>
  }
```

and in `buildManifest`, accumulate while iterating (alongside `totalsByVerdict`):

```ts
  const byTopicVerdict: Record<string, Record<string, number>> = {}
  // inside the for (const [plenoId, items] of itemsByPleno) loop:
    for (const it of items) {
      const t = it.claim?.topic
      const v = it.verification?.verdict
      if (typeof t !== 'string' || typeof v !== 'string') continue
      const row = (byTopicVerdict[t] ??= {})
      row[v] = (row[v] ?? 0) + 1
    }
  // and in the returned manifest totals:
      totals: {
        items: totalItems,
        plenos: plenosOut.length,
        byVerdict: totalsByVerdict,
        byTopicVerdict,
      },
```

- [ ] **Step 4: Run** — `npx vitest run tests/pleno-claims-chunks.test.ts` → PASS; `npm run typecheck` → clean.

- [ ] **Step 5: Regenerate the committed chunks so prod data carries the cross-tab at deploy time** — `npm run chunk-pleno-claims`; verify with `node -e "const m=require('./public/data/pleno-claims/index.json'); console.log(Object.keys(m.totals.byTopicVerdict).length, 'topics')"` → a positive topic count.

- [ ] **Step 6: Commit** — `git add src/scraper/pleno-claims-chunks.ts tests/pleno-claims-chunks.test.ts public/data/pleno-claims/ && git commit -m "feat(data-layer): chunk manifest carries totals.byTopicVerdict cross-tab (+ regenerated chunks)"`

---

### Task 5: `computeDepartmentStats` accepts the cross-tab

**Files:**
- Modify: `src/lib/department-stats.js:93-114,184-215`
- Test: extend `tests/department-stats.test.ts`

**Interfaces:**
- Consumes: `totals.byTopicVerdict` shape from Task 4.
- Produces: `computeDepartmentStats({ …, claims?, claimsSummary? })` — when `claimsSummary` (topic→verdict→count) is present it is used INSTEAD of `claims.items`; identical bucket output for equivalent inputs. Task 6 relies on the `claimsSummary` name.

- [ ] **Step 1: Write the failing test** — add to `tests/department-stats.test.ts`:

```ts
it('claimsSummary cross-tab path produces identical declaraciones to the items path', () => {
  const items = [
    { claim: { topic: 'urbanismo' }, verification: { verdict: 'verificado' } },
    { claim: { topic: 'urbanismo' }, verification: { verdict: 'contradicho' } },
    { claim: { topic: 'hacienda' }, verification: { verdict: 'sin-datos' } },
    { claim: { topic: 'hacienda' }, verification: { verdict: 'promesa-repetida' } },
  ]
  const summary = {
    urbanismo: { verificado: 1, contradicho: 1 },
    hacienda: { 'sin-datos': 1, 'promesa-repetida': 1 },
  }
  const viaItems = computeDepartmentStats({ claims: { items } })
  const viaSummary = computeDepartmentStats({ claimsSummary: summary })
  for (const slug of Object.keys(viaItems.bySlug)) {
    expect(viaSummary.bySlug[slug].declaraciones).toEqual(viaItems.bySlug[slug].declaraciones)
  }
})
```

- [ ] **Step 2: Run to verify RED** — `npx vitest run tests/department-stats.test.ts` → FAIL (summary path counts zero).

- [ ] **Step 3: Implement** — in `department-stats.js`: add `@param {any} [input.claimsSummary]` to the JSDoc + destructure `claimsSummary,`. Factor the verdict switch into a helper above `computeDepartmentStats`:

```js
/** Add `count` claims with `verdict` into a dept bucket's declaraciones. */
function addDeclaraciones(d, verdict, count) {
  d.total += count
  if (verdict === 'verificado') {
    d.verificado += count
    d.conEvidencia += count
  } else if (verdict === 'parcial') {
    d.parcial += count
    d.conEvidencia += count
  } else if (verdict === 'contradicho') {
    d.contradicho += count
    d.conEvidencia += count
  } else if (verdict === 'promesa-repetida') {
    d.promesaRepetida += count
  } else if (verdict === 'sin-datos') {
    d.sinDatos += count
  }
}
```

Replace the claims block (lines 190-215) with:

```js
  if (claimsSummary && typeof claimsSummary === 'object') {
    // Cross-tab from the chunk manifest (totals.byTopicVerdict) — same
    // numbers as iterating the items, computed by the chunker over the
    // exact item set the chunks contain.
    for (const [topic, verdicts] of Object.entries(claimsSummary)) {
      const slugs = topicToDeptSlugs(topic)
      for (const [verdict, raw] of Object.entries(verdicts ?? {})) {
        const count = Number(raw) || 0
        if (count <= 0) continue
        for (const slug of slugs) {
          if (!buckets[slug]) continue
          addDeclaraciones(buckets[slug].declaraciones, verdict, count)
        }
      }
    }
  } else {
    const claimList = claims?.items ?? []
    for (const it of claimList) {
      const topic = it?.claim?.topic
      const verdict = it?.verification?.verdict
      if (!topic || !verdict) continue
      for (const slug of topicToDeptSlugs(topic)) {
        if (!buckets[slug]) continue
        addDeclaraciones(buckets[slug].declaraciones, verdict, 1)
      }
    }
  }
```

(Keep the original explanatory comment about DEPT_TO_CLAIM_TOPICS above the block.)

- [ ] **Step 4: Run** — `npx vitest run tests/department-stats.test.ts` → PASS; `npm test` green.

- [ ] **Step 5: Commit** — `git add src/lib/department-stats.js tests/department-stats.test.ts && git commit -m "feat(data-layer): computeDepartmentStats accepts the manifest cross-tab (claimsSummary)"`

---

### Task 6: `/departamentos` reads the manifest, not the corpus

**Files:**
- Modify: `src/hooks/useDepartmentStats.js`

**Interfaces:**
- Consumes: `usePlenoClaimsManifest` (existing), `claimsSummary` param (Task 5), manifest `totals.byTopicVerdict` (Task 4).

- [ ] **Step 1: Implement** (behavior covered by Task 5's unit test + the e2e suite; this is a wiring change):

In `useDepartmentStats.js`: replace `import { usePlenoClaims } from './usePlenoClaims'` with `import { usePlenoClaimsManifest } from './usePlenoClaims'`; replace `const claims = usePlenoClaims()` with `const manifest = usePlenoClaimsManifest()`; in `computeDepartmentStats({...})` replace `claims: claims.error ? null : claims.data,` with `claimsSummary: manifest.error ? null : (manifest.data?.totals?.byTopicVerdict ?? null),`; update the memo deps from `claims.data, claims.error` to `manifest.data, manifest.error`; update the doc comment (sources line: "pleno-claims chunk manifest cross-tab (12 KB) instead of the full chunk corpus").

- [ ] **Step 2: Run** — `npm test` → green; `npx playwright test tests/e2e/departamentos.spec.ts` → green (counts unchanged because the regenerated manifest cross-tabs the same items).

- [ ] **Step 3: Commit** — `git add src/hooks/useDepartmentStats.js && git commit -m "perf(departamentos): aggregate declaraciones from the 12 KB manifest cross-tab, not the 6 MB chunk corpus"`

---

### Task 7: Relations integrity checker

**Files:**
- Create: `src/scraper/relations-check.ts`
- Create: `scripts/check-relations.ts`
- Modify: `package.json` (add script), `scripts/scrape-all.sh` (soft-run after queja-contract-relations)
- Test: `tests/relations-check.test.ts`

**Interfaces:**
- Produces: `runRelationsChecks(inputs: RelationsCheckInputs) → RelationCheckResult[]` with `RelationCheckResult = { name, level: 'error'|'warn', status: 'ok'|'broken'|'skipped', checked: number, broken: string[] }`; CLI `npm run check:relations [-- --soft]` (strict exits 1 on error-level breakage; `--soft` always 0).

- [ ] **Step 1: Write the failing test** — `tests/relations-check.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { runRelationsChecks } from '../src/scraper/relations-check'

const byName = (rs: ReturnType<typeof runRelationsChecks>) =>
  Object.fromEntries(rs.map((r) => [r.name, r]))

describe('runRelationsChecks', () => {
  it('flags a finding citing a claimId absent from verified', () => {
    const rs = byName(
      runRelationsChecks({
        verified: { items: [{ claim: { id: 'p1-001-afi-aaaaaa' } }] },
        findings: { items: [{ id: 'f1', sourceClaimIds: ['p1-001-afi-aaaaaa', 'GONE-id'] }] },
      }),
    )
    expect(rs['findings-claims'].status).toBe('broken')
    expect(rs['findings-claims'].level).toBe('error')
    expect(rs['findings-claims'].broken[0]).toContain('GONE-id')
  })

  it('passes a clean findings↔claims join and counts refs', () => {
    const rs = byName(
      runRelationsChecks({
        verified: { items: [{ claim: { id: 'x' } }] },
        findings: { items: [{ id: 'f1', sourceClaimIds: ['x'] }] },
      }),
    )
    expect(rs['findings-claims'].status).toBe('ok')
    expect(rs['findings-claims'].checked).toBe(1)
  })

  it('reports skipped when an input file is absent', () => {
    const rs = byName(runRelationsChecks({}))
    expect(rs['findings-claims'].status).toBe('skipped')
  })

  it('flags manifest chunk itemCount mismatches', () => {
    const rs = byName(
      runRelationsChecks({
        manifest: {
          plenos: [{ plenoId: 'p1', chunkPath: 'pleno-claims/p1.json', itemCount: 2 }],
          totals: { items: 2 },
        },
        chunkFiles: { 'pleno-claims/p1.json': { items: [{}] } },
      }),
    )
    expect(rs['manifest-chunks'].status).toBe('broken')
  })

  it('flags a relation link pointing at an unknown queja or tender', () => {
    const rs = byName(
      runRelationsChecks({
        quejas: { items: [{ service_request_id: 'Q-AAAA1111' }] },
        tenders: { contracts: [{ id: 'c-1' }], tenders: [] },
        relations: { links: [{ quejaId: 'Q-AAAA1111', tenderId: 'c-1' }, { quejaId: 'Q-MISSING', tenderId: 'c-1' }] },
      }),
    )
    expect(rs['relations-quejas-tenders'].status).toBe('broken')
    expect(rs['relations-quejas-tenders'].broken[0]).toContain('Q-MISSING')
  })

  it('treats stale overlay ids as warn-level, not error', () => {
    const rs = byName(
      runRelationsChecks({
        verified: { items: [{ claim: { id: 'live' } }] },
        overlay: { entries: { live: {}, stale: {} } },
      }),
    )
    expect(rs['overlay-verified'].status).toBe('broken')
    expect(rs['overlay-verified'].level).toBe('warn')
  })

  it('flags promise-suggestions pointing at unknown promises and bad dept slugs', () => {
    const rs = byName(
      runRelationsChecks({
        promises: { items: [{ id: 'pr-1', departmentSlug: 'not-a-dept' }] },
        promiseSuggestions: { suggestions: [{ promiseId: 'pr-1' }, { promiseId: 'pr-404' }] },
      }),
    )
    expect(rs['suggestions-promises'].status).toBe('broken')
    expect(rs['promises-dept-slugs'].status).toBe('broken')
  })
})
```

- [ ] **Step 2: Run to verify RED** — `npx vitest run tests/relations-check.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/scraper/relations-check.ts` (pure; the CLI does the I/O). Checks (`name` / level):
  - `findings-claims` / error — every `findings.items[].sourceClaimIds[]` ∈ set of `verified.items[].claim.id`.
  - `findings-promises` / error — every `findings.items[].relatedPromiseIds[]` ∈ `promises.items[].id`.
  - `manifest-chunks` / error — every `manifest.plenos[].chunkPath` present in `chunkFiles` with `items.length === itemCount`; `totals.items === Σ itemCount`.
  - `votes-plenos` / error — every `votes.items[].plenoId` ∈ (`plenos.items[].id` ∪ `manifest.plenos[].plenoId`).
  - `relations-quejas-tenders` / error — every `relations.links[].quejaId` ∈ `quejas.items[].service_request_id` AND `tenderId` ∈ (`tenders.contracts[].id` ∪ `tenders.tenders[].id`).
  - `approved-relations` / error — every `approvedRelations.approvals[]` (quejaId,tenderId) pair present in `relations.links`.
  - `suggestions-promises` / error — every `promiseSuggestions.suggestions[].promiseId` ∈ promises ids.
  - `promises-dept-slugs` / error — every non-null `promises.items[].departmentSlug` ∈ `ALLOWED_DEPARTMENT_SLUGS` (import from `./departments`).
  - `overlay-verified` / warn — every key of `overlay.entries` ∈ verified claim ids.
  - `votes-agendas` / warn — every `votes.items[]` has an agenda item matching `plenoId` + `itemNumber` in `agendas.plenos[].agenda[]`.
  - `dedicaciones-officials` / warn — every `dedicaciones.byOfficial[].slug` ∈ `officials.officials[].slug`.
  Skeleton:

```ts
import { ALLOWED_DEPARTMENT_SLUGS } from './departments'

export type CheckLevel = 'error' | 'warn'
export type CheckStatus = 'ok' | 'broken' | 'skipped'
export interface RelationCheckResult {
  name: string
  level: CheckLevel
  status: CheckStatus
  checked: number
  broken: string[]
}
export interface RelationsCheckInputs {
  verified?: { items?: Array<{ claim?: { id?: string } }> } | null
  overlay?: { entries?: Record<string, unknown> } | null
  manifest?: {
    plenos?: Array<{ plenoId?: string; chunkPath?: string; itemCount?: number }>
    totals?: { items?: number }
  } | null
  chunkFiles?: Record<string, { items?: unknown[] } | null> | null
  findings?: {
    items?: Array<{ id?: string; sourceClaimIds?: string[]; relatedPromiseIds?: string[] }>
  } | null
  plenos?: { items?: Array<{ id?: string }> } | null
  votes?: { items?: Array<{ id?: string; plenoId?: string; itemNumber?: number }> } | null
  agendas?: { plenos?: Array<{ id?: string; agenda?: Array<{ itemNumber?: number }> }> } | null
  promises?: { items?: Array<{ id?: string; departmentSlug?: string | null }> } | null
  promiseSuggestions?: { suggestions?: Array<{ promiseId?: string }> } | null
  quejas?: { items?: Array<{ service_request_id?: string }> } | null
  tenders?: {
    contracts?: Array<{ id?: string | number }>
    tenders?: Array<{ id?: string | number }>
  } | null
  relations?: { links?: Array<{ quejaId?: string; tenderId?: string | number }> } | null
  approvedRelations?: { approvals?: Array<{ quejaId?: string; tenderId?: string | number }> } | null
  dedicaciones?: { byOfficial?: Array<{ slug?: string }> } | null
  officials?: { officials?: Array<{ slug?: string }> } | null
}

const CAP = 20

function check(
  name: string,
  level: CheckLevel,
  available: boolean,
  run: () => { checked: number; broken: string[] },
): RelationCheckResult {
  if (!available) return { name, level, status: 'skipped', checked: 0, broken: [] }
  const { checked, broken } = run()
  return {
    name,
    level,
    status: broken.length > 0 ? 'broken' : 'ok',
    checked,
    broken: broken.slice(0, CAP),
  }
}

export function runRelationsChecks(inputs: RelationsCheckInputs): RelationCheckResult[] {
  // build id sets defensively, then one check(...) per rule above
}
```

  `scripts/check-relations.ts`: `readJson(relPath)` helper (`fs.readFileSync` inside try/catch → undefined on absence), assemble inputs (chunkFiles by reading every manifest `chunkPath` under `public/data/`), call `runRelationsChecks`, print one line per result (`[ok] findings-claims — 132 refs` / `[BROKEN:error] relations-quejas-tenders — 2/240: Q-MISSING→c-1, …` / `[skip] …`), summary counts, and `process.exit(strict && anyErrorBroken ? 1 : 0)` where `strict = !process.argv.includes('--soft')`.
  `package.json` scripts (after `"check:transcripts"`): `"check:relations": "npx tsx scripts/check-relations.ts",`.
  `scripts/scrape-all.sh` — after the `scrape:queja-contract-relations` block:

```bash
echo ""
echo "================================================================"
echo "[scrape-all] running: check:relations (best-effort, report-only)"
echo "================================================================"
# Cross-snapshot referential-integrity audit. --soft: report, never fail
# the nightly (a partial scrape night must not red the commit-then-gate
# design). Strict mode is the default for manual runs.
if ! npm run check:relations -- --soft; then
  echo "[scrape-all] SOFT-FAILED: check:relations — best-effort, not counted"
  soft_failures+=("check:relations")
fi
```

- [ ] **Step 4: Run** — `npx vitest run tests/relations-check.test.ts` → PASS; `npm run typecheck` → clean; `npm run check:relations` against live data → prints the table; investigate any error-level breakage found (fix data or reclassify with justification — do not paper over).

- [ ] **Step 5: Commit** — `git add src/scraper/relations-check.ts scripts/check-relations.ts tests/relations-check.test.ts package.json scripts/scrape-all.sh && git commit -m "feat(data-layer): cross-snapshot referential-integrity gate (check:relations, soft-wired into scrape-all)"`

---

### Task 8: Docs

**Files:**
- Modify: `CLAUDE.md` (commands block: add `check:relations` line near `compute:dept-stats`; Hooks section intro: one paragraph on the snapshot store; Real data pipeline: one line that the chunk manifest carries `byTopicVerdict` for /departamentos)

- [ ] **Step 1: Edit CLAUDE.md** — add to the commands block after `compute:tender-geo`:

```
npm run check:relations             # cross-snapshot FK audit (findings→claims, manifest→chunks,
                                    # relations→quejas/tenders, suggestions→promises …) · strict
                                    # exits 1 on error-level breakage · scrape-all runs it --soft
```

  In the Hooks section intro, replace "Every page loads its snapshot via a small hook that does `fetch()` + `useState` (`loading / error / data`). No data-fetching libraries are wired (yet) — React Query / SWR can be added when we hit a real refresh loop." with a paragraph: hooks ride `useJsonFetch` → `useSnapshot` → the module-level session-cached single-flight store (`src/lib/snapshot-store.js`); concurrent mounts share one fetch; route navigation stops refetching; errors never cached (per-mount retry); `useLabHealth` + external-API hooks deliberately bypass it. Note `/departamentos` aggregates declaraciones from the manifest `totals.byTopicVerdict` cross-tab.

- [ ] **Step 2: Commit** — `git add CLAUDE.md && git commit -m "docs: data-layer notes — snapshot store, manifest cross-tab, check:relations

[no-deploy]"` (keep the co-author trailer above the sentinel).

---

### Task 9: Full verification

- [ ] `npm test` → all files green (floor: 144 files / 1598+ passing).
- [ ] `npm run typecheck` → clean.
- [ ] `npm run lint` → no errors.
- [ ] `npm run build` → succeeds.
- [ ] `npm run test:e2e` → 127+ tests green (landing, departamentos, declaraciones, plenos, laboratorio especially).
- [ ] `npm run check:relations` on live data → reviewed output.
- [ ] Fix any fallout before reporting; report includes the assessment answer + measured wins.

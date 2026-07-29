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
 * from any imperative consumer (chunk fan-outs, teaser blocks).
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
 * (invalidate + re-ensure while this one was still in flight).
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
 * error on `missing` or `error` (chunk fan-outs, where a missing chunk
 * is a real failure).
 * @param {string} path
 * @returns {Promise<any>}
 */
export async function loadSnapshotData(path) {
  const entry = await ensureSnapshot(path)
  if (entry.status === 'ready') return entry.data
  throw entry.error ?? new Error(`${path} failed to load`)
}

/**
 * Load an optional snapshot: `missing`/`error` → null (the fetchOptional
 * contract of usePressLab and the reportajes teaser).
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

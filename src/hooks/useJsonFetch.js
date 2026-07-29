// @ts-check
import { useSnapshot } from './useSnapshot'

/**
 * Shared loader for the static JSON snapshots under /public/data.
 *
 * Every domain hook (usePadron, usePress, useTenders, …) composes this.
 * Since 2026-07 it delegates to the session-cached snapshot store
 * (src/lib/snapshot-store.js): concurrent mounts of the same path share
 * one fetch, and route navigation stops refetching unchanged snapshots.
 *
 * The public contract is unchanged: {loading, error, data}. `fallback`
 * lets a hook treat a **404** as "snapshot not generated yet" and
 * resolve to a default-shaped object instead of erroring — pass a
 * **module-level constant** (not a fresh literal), same rule as before.
 * Any other non-ok status still surfaces as an error, is never cached,
 * and retries on the next mount.
 *
 * @param {string} path  absolute public path, e.g. '/data/padron.json'
 * @param {any} [fallback]  value to resolve to on a 404 (default: null → 404 errors)
 * @returns {{ loading: boolean, error: Error|null, data: any }}
 */
export function useJsonFetch(path, fallback = null) {
  return useSnapshot(path, fallback)
}

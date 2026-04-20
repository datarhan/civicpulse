import { vi } from 'vitest'

export type FetchMockMap = Record<string, unknown>

/**
 * Install a fetch mock that serves known paths with the provided JSON.
 * Unknown paths return 404. Restores automatically when the test exits
 * (vitest tears down the mock via its own lifecycle).
 */
export function installFetchMock(map: FetchMockMap) {
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString()
    const path = url.replace(/^https?:\/\/[^/]+/, '')
    if (path in map) {
      return new Response(JSON.stringify(map[path]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return new Response('not found', { status: 404 })
  })
  // @ts-expect-error — override global fetch for the test window.
  globalThis.fetch = fn
  return fn
}

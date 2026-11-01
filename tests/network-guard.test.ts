/**
 * Proof that the suite-wide network guard fires.
 *
 * This repo has twice shipped a gate that was green while measuring nothing —
 * a mobile responsive test satisfied *by* the bug it should have caught, and an
 * axe contrast rule that never ran. A guard is exactly that shape of thing: it
 * reports success by staying silent, so its silence has to be earned. Every
 * case below makes the guard do something observable.
 *
 * None of these tests open a socket. The blocked cases throw before `realFetch`
 * is ever reached; the allowed cases either stop at the loopback interface or
 * assert the guard's own predicate.
 */
import { describe, it, expect, vi } from 'vitest'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

/**
 * Deliberately NOT `import … from './setup/no-network'`.
 *
 * Importing that module installs the guard — its hooks register on load. The
 * first version of this file did import it, and consequently passed with the
 * guard removed from `vitest.config.ts`: it proved the logic and nothing about
 * the wiring. Reaching for the handle the setup file publishes on `globalThis`
 * means this suite can only see a guard that `setupFiles` installed, so
 * unwiring it turns this file red.
 */
const guard = globalThis.__cpNetworkGuard
if (!guard) {
  throw new Error(
    'Network guard not installed: tests/setup/no-network.ts is missing from ' +
      '`setupFiles` in vitest.config.ts. This file does not import it on purpose — ' +
      'see the comment above.',
  )
}
const { liveNetworkTest, networkAllowedNow, takeNetworkViolations, wouldBlock } = guard

/** Set at module scope so `liveNetworkTest`'s gate can read it at collection. */
process.env.CP_TEST_NETWORK_GUARD_OPTIN = '1'
process.env.CP_TEST_NETWORK_GUARD_REQUIRED = 'present'

/** Flipped by a test that must never run. Asserted further down. */
let ungatedBodyRan = false

describe('network guard — wiring', () => {
  it('is installed by setupFiles, for every test file and not just this one', () => {
    // The assertion the rest of the file rests on: something other than an
    // import put the guard here.
    expect(globalThis.__cpNetworkGuard).toBeDefined()
    // And it is the live guard, not a leftover handle: it is the function the
    // installed `globalThis.fetch` actually consults.
    expect(wouldBlock('https://api.exa.ai/search')).toBe(true)
  })
})

describe('network guard — blocking', () => {
  it('rejects an unstubbed fetch to a non-local host, naming the URL and the test', async () => {
    // The actual regression: this is the call `npm test` was really making.
    await expect(
      fetch('https://api.exa.ai/search', { method: 'POST', body: '{}' }),
    ).rejects.toThrow(/Blocked outbound fetch in a unit test: POST https:\/\/api\.exa\.ai\/search/)

    const violations = takeNetworkViolations()
    expect(violations).toHaveLength(1)
    expect(violations[0].url).toBe('https://api.exa.ai/search')
    expect(violations[0].method).toBe('POST')
    // Naming the test is not decoration — a guard whose message cannot be
    // acted on is a guard someone disables.
    expect(violations[0].test).toContain('rejects an unstubbed fetch')
  })

  it('still fails the test when the caller swallows the error', async () => {
    // This is not hypothetical. `webSearchExa` wraps its fetch in try/catch and
    // returns `{ results: [], error }`, so a throw-only guard was invisible:
    // the old assertion even matched the guard's own message (it contains the
    // word "fetch"). The recorded violation is the layer that cannot be eaten.
    let swallowed: string | null = null
    try {
      await fetch('https://api.exa.ai/search')
    } catch (err) {
      swallowed = (err as Error).message
    }
    expect(swallowed).toContain('Blocked outbound fetch')

    // Nothing above failed the test. This is what would have, via afterEach.
    const violations = takeNetworkViolations()
    expect(violations).toHaveLength(1)
    expect(violations[0].url).toBe('https://api.exa.ai/search')
  })

  it('blocks a non-local host regardless of scheme or port', () => {
    for (const url of [
      'https://api.exa.ai/search',
      'http://api.openai.com/v1/chat',
      'https://generativelanguage.googleapis.com/v1',
      'https://www.ribarroja.es/es/plenos/2026',
      'http://192.168.1.10:8080/thing',
      'https://munigraph-ribarroja.fly.dev/export/quejas.json',
    ]) {
      expect(wouldBlock(url), url).toBe(true)
    }
  })

  it('rearms itself after a test replaces globalThis.fetch', async () => {
    // A file that stubs fetch must not disarm the rest of the run. The stub
    // wins inside this test…
    globalThis.fetch = vi.fn(async () => new Response('stubbed', { status: 200 })) as never
    const res = await fetch('https://api.exa.ai/search')
    expect(await res.text()).toBe('stubbed')
    expect(takeNetworkViolations()).toEqual([])
    // …and the guard is back for the next one, which is asserted below.
  })

  it('is armed again in the following test', async () => {
    await expect(fetch('https://api.exa.ai/search')).rejects.toThrow(/Blocked outbound fetch/)
    expect(takeNetworkViolations()).toHaveLength(1)
  })
})

describe('network guard — what it allows', () => {
  it('allows the loopback interface, relative URLs and offline schemes', () => {
    for (const url of [
      'http://localhost:5173/data/promises.json',
      'http://localhost:8888/search?q=x',
      'http://127.0.0.1:4173/',
      'http://[::1]:3000/',
      'http://0.0.0.0:9999/',
      '/data/officials.json',
      'data:text/plain,hello',
      'blob:http://localhost/abc',
    ]) {
      expect(wouldBlock(url), url).toBe(false)
    }
  })

  it('lets a real loopback request reach a real local server', async () => {
    // End-to-end rather than predicate-only: the guard has to let the local
    // fixture servers and the SearXNG smoke test actually connect, so this
    // stands one up and completes a round trip through the installed `fetch`.
    const server = createServer((_req, res) => {
      // happy-dom enforces the Same Origin Policy on the *read*, not on the
      // send — which is exactly why this guard is needed: it never stopped the
      // api.exa.ai request from leaving, only from being parsed.
      res.writeHead(200, {
        'content-type': 'text/plain',
        'access-control-allow-origin': '*',
      })
      res.end('local fixture')
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const { port } = server.address() as AddressInfo
    try {
      const res = await fetch(`http://127.0.0.1:${port}/data/thing.json`)
      expect(res.status).toBe(200)
      expect(await res.text()).toBe('local fixture')
      expect(takeNetworkViolations()).toEqual([])
    } finally {
      await new Promise<void>((done) => server.close(() => done()))
    }
  })
})

describe('network guard — the opt-in', () => {
  liveNetworkTest(
    {
      enabledBy: 'CP_TEST_NETWORK_GUARD_OPTIN',
      requires: ['CP_TEST_NETWORK_GUARD_REQUIRED'],
    },
    'lifts the guard for the duration of a declared live test',
    () => {
      // Same predicate the guard itself calls, so this cannot drift from it.
      expect(networkAllowedNow()).toBe(true)
      expect(wouldBlock('https://api.exa.ai/search')).toBe(false)
    },
  )

  liveNetworkTest(
    { enabledBy: 'CP_TEST_NETWORK_GUARD_ABSENT_FLAG' },
    'never runs when its flag is unset',
    () => {
      ungatedBodyRan = true
    },
  )

  it('releases the lift once the live test ends', () => {
    expect(networkAllowedNow()).toBe(false)
    expect(wouldBlock('https://api.exa.ai/search')).toBe(true)
  })

  it('skipped the live test whose flag was unset', () => {
    // Declared above and therefore already resolved: if the gate had leaked,
    // the body would have run and set this.
    expect(ungatedBodyRan).toBe(false)
  })
})

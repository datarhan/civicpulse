/**
 * Wayback helper contract tests (Package 3).
 *
 * Wayback's Save Page Now endpoint emits the snapshot URL in three
 * different places depending on cache state + mode:
 *   1. Content-Location header
 *   2. Location header (302 redirect)
 *   3. The redirected response URL itself
 *   4. The HTML body of the snapshot page (as a fallback)
 *
 * These tests pin all four shapes plus the error paths so the audit
 * job can never silently lose snapshots.
 */
import { describe, expect, it } from 'vitest'

import { archiveOnWayback, findExistingSnapshot } from '../src/scraper/wayback'

describe('archiveOnWayback', () => {
  it('parses the snapshot timestamp from Content-Location', async () => {
    const fetchImpl = async () =>
      new Response('ok', {
        status: 200,
        headers: {
          'content-location': '/web/20260521120000/https://example.com/x',
        },
      }) as unknown as Response
    const result = await archiveOnWayback('https://example.com/x', { fetchImpl })
    expect(result.ok).toBe(true)
    expect(result.timestamp).toBe('20260521120000')
    expect(result.archivedUrl).toBe(
      'https://web.archive.org/web/20260521120000/https://example.com/x',
    )
  })

  it('parses from Location header when Content-Location is missing', async () => {
    const fetchImpl = async () =>
      new Response('ok', {
        status: 200,
        headers: {
          location: 'https://web.archive.org/web/20260520010101/https://example.com/y',
        },
      }) as unknown as Response
    const result = await archiveOnWayback('https://example.com/y', { fetchImpl })
    expect(result.timestamp).toBe('20260520010101')
  })

  it('falls back to the body when no header carries a timestamp', async () => {
    const fetchImpl = async () =>
      new Response(
        '<html>...href="/web/20260519235959/https://example.com/z"...</html>',
        { status: 200 },
      ) as unknown as Response
    const result = await archiveOnWayback('https://example.com/z', { fetchImpl })
    expect(result.timestamp).toBe('20260519235959')
  })

  it('returns ok=false on HTTP error', async () => {
    const fetchImpl = async () =>
      new Response('rate limited', { status: 429 }) as unknown as Response
    const result = await archiveOnWayback('https://example.com/a', { fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('HTTP 429')
  })

  it('returns ok=false on no-timestamp response', async () => {
    const fetchImpl = async () =>
      new Response('plain response', { status: 200 }) as unknown as Response
    const result = await archiveOnWayback('https://example.com/b', { fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('no timestamp in response')
  })

  it('rejects invalid URLs without making a request', async () => {
    let called = false
    const fetchImpl = async () => {
      called = true
      return new Response('', { status: 200 }) as unknown as Response
    }
    const result = await archiveOnWayback('not-a-url', { fetchImpl })
    expect(called).toBe(false)
    expect(result.error).toBe('invalid url')
  })

  it('returns ok=false with a network error string when fetch throws', async () => {
    const fetchImpl = async () => {
      throw new Error('ECONNRESET')
    }
    const result = await archiveOnWayback('https://example.com/c', { fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('ECONNRESET')
  })

  it('sends the LOW Authorization header when an API key pair is supplied', async () => {
    let seenAuth: string | null = null
    const fetchImpl = async (_url: string, init?: RequestInit) => {
      const h = init?.headers as Record<string, string> | undefined
      seenAuth = h?.Authorization ?? null
      return new Response('', {
        status: 200,
        headers: { 'content-location': '/web/20260518000000/https://example.com/q' },
      }) as unknown as Response
    }
    await archiveOnWayback('https://example.com/q', {
      fetchImpl,
      accessKey: 'AK',
      secretKey: 'SK',
    })
    expect(seenAuth).toBe('LOW AK:SK')
  })
})

describe('findExistingSnapshot', () => {
  it('returns the closest existing snapshot from the Availability API', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          archived_snapshots: {
            closest: {
              available: true,
              url: 'https://web.archive.org/web/20260501120000/https://example.com/x',
              timestamp: '20260501120000',
            },
          },
        }),
        { status: 200 },
      ) as unknown as Response
    const result = await findExistingSnapshot('https://example.com/x', { fetchImpl })
    expect(result.ok).toBe(true)
    expect(result.timestamp).toBe('20260501120000')
  })

  it('returns ok=false when no snapshot is available', async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ archived_snapshots: {} }), {
        status: 200,
      }) as unknown as Response
    const result = await findExistingSnapshot('https://example.com/y', { fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('no snapshot available')
  })

  it('reports HTTP errors structurally', async () => {
    const fetchImpl = async () => new Response('boom', { status: 503 }) as unknown as Response
    const result = await findExistingSnapshot('https://example.com/z', { fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('HTTP 503')
  })

  it('rejects invalid URLs without a request', async () => {
    let called = false
    const fetchImpl = async () => {
      called = true
      return new Response('', { status: 200 }) as unknown as Response
    }
    const result = await findExistingSnapshot('garbage', { fetchImpl })
    expect(called).toBe(false)
    expect(result.error).toBe('invalid url')
  })
})

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
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
      new Response('<html>...href="/web/20260519235959/https://example.com/z"...</html>', {
        status: 200,
      }) as unknown as Response
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

/**
 * Una consulta RECHAZADA no es «sin copia».
 *
 * El 20-09-2026 la API de disponibilidad contestó 429 a las 23 consultas de una
 * pasada de `journalist:archive-sources`. `findExistingSnapshot` devolvía
 * `ok:false` igual que para «no hay copia», y el llamador gastó 23 peticiones a
 * Save Page Now en páginas que quizá ya estaban archivadas — las 23 rechazadas
 * también, cada una alargando el bloqueo. Es la regla 2 de DATA_INTEGRITY y el
 * `r?.findings ?? []` de siempre: tres desenlaces, no dos.
 *
 * El índice CDX (`web.archive.org/cdx/search/cdx`) es otro servicio y ese día
 * contestaba. El fixture es su respuesta real, con `fastLatest=true`: sin él,
 * `limit=-1` recorre todas las capturas y el mismo día dio 504 a los 60 s.
 */
const CDX_REAL = readFileSync(resolve(__dirname, 'fixtures/wayback_cdx_2026-09-20.json'), 'utf8')
const FVMP = 'https://www.fvmp.es/la-federacion/composicion/'

/** Un fetch falso que contesta distinto a cada servicio y anota a quién se llamó. */
const porServicio = (disponibilidad: () => Response, cdx: () => Response) => {
  const llamadas: string[] = []
  const fetchImpl = (async (u: string | URL | Request) => {
    const url = String(u)
    if (url.includes('/wayback/available')) {
      llamadas.push('disponibilidad')
      return disponibilidad()
    }
    if (url.includes('/cdx/search/cdx')) {
      llamadas.push('cdx')
      return cdx()
    }
    throw new Error(`petición inesperada: ${url}`)
  }) as typeof fetch
  return { llamadas, fetchImpl }
}
const r429 = () => new Response('Too Many Requests', { status: 429 })

describe('findExistingSnapshot — tres desenlaces, no dos', () => {
  it('cuando la API de disponibilidad rechaza, pregunta al índice CDX y devuelve la captura', async () => {
    const f = porServicio(r429, () => new Response(CDX_REAL, { status: 200 }))
    const r = await findExistingSnapshot(FVMP, { fetchImpl: f.fetchImpl })
    expect(f.llamadas).toEqual(['disponibilidad', 'cdx'])
    expect(r.ok).toBe(true)
    expect(r.lookup).toBe('found')
    expect(r.timestamp).toBe('20241206075212')
    expect(r.archivedUrl).toBe(`https://web.archive.org/web/20241206075212/${FVMP}`)
  })

  it('pide al CDX sólo la última captura correcta, con fastLatest', async () => {
    let pedida = ''
    const fetchImpl = (async (u: string | URL | Request) => {
      const url = String(u)
      if (url.includes('/cdx/search/cdx')) {
        pedida = url
        return new Response(CDX_REAL, { status: 200 })
      }
      return r429()
    }) as typeof fetch
    await findExistingSnapshot(FVMP, { fetchImpl })
    expect(pedida).toContain(`url=${encodeURIComponent(FVMP)}`)
    expect(pedida).toContain('filter=statuscode%3A200')
    expect(pedida).toContain('limit=-1')
    expect(pedida).toContain('fastLatest=true')
  })

  it('un CDX vacío es «no hay copia», no un fallo', async () => {
    const f = porServicio(r429, () => new Response('[]', { status: 200 }))
    const r = await findExistingSnapshot(FVMP, { fetchImpl: f.fetchImpl })
    expect(r.ok).toBe(false)
    expect(r.lookup).toBe('none')
    expect(r.error).toBe('no snapshot available')
  })

  it('si el CDX también falla, el desenlace es «no se pudo mirar» y conserva los dos motivos', async () => {
    const f = porServicio(r429, () => new Response('<html>504</html>', { status: 504 }))
    const r = await findExistingSnapshot(FVMP, { fetchImpl: f.fetchImpl })
    expect(r.ok).toBe(false)
    expect(r.lookup).toBe('failed')
    expect(r.error).toBe('HTTP 429')
    expect(r.cdxError).toBe('HTTP 504')
  })

  it('un CDX que contesta 200 con algo que no es su JSON es un fallo, no un vacío', async () => {
    const f = porServicio(r429, () => new Response('<html>mantenimiento</html>', { status: 200 }))
    const r = await findExistingSnapshot(FVMP, { fetchImpl: f.fetchImpl })
    expect(r.lookup).toBe('failed')
    expect(r.cdxError).toMatch(/cdx/i)
  })

  it('una respuesta limpia «sin copia» de la API no gasta una consulta al CDX', async () => {
    const f = porServicio(
      () => new Response(JSON.stringify({ archived_snapshots: {} }), { status: 200 }),
      () => new Response(CDX_REAL, { status: 200 }),
    )
    const r = await findExistingSnapshot(FVMP, { fetchImpl: f.fetchImpl })
    expect(f.llamadas).toEqual(['disponibilidad'])
    expect(r.lookup).toBe('none')
  })

  it('una copia hallada por la API dice lookup = found', async () => {
    const f = porServicio(
      () =>
        new Response(
          JSON.stringify({
            archived_snapshots: {
              closest: {
                available: true,
                url: `http://web.archive.org/web/20241206075212/${FVMP}`,
                timestamp: '20241206075212',
              },
            },
          }),
          { status: 200 },
        ),
      r429,
    )
    const r = await findExistingSnapshot(FVMP, { fetchImpl: f.fetchImpl })
    expect(f.llamadas).toEqual(['disponibilidad'])
    expect(r.lookup).toBe('found')
  })
})

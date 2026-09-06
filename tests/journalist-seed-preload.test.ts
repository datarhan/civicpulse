import { describe, it, expect } from 'vitest'
import { parseSeedSources, preloadSeeds } from '../src/scraper/journalist-agent/seeds'
import type { UrlFetchResult } from '../src/scraper/journalist-tools/web'

/**
 * Cómo entran las fuentes sembradas en una ejecución del agente: las de
 * `fetch`/`pdf` se descargan con los mismos lectores que usa el agente (aquí
 * inyectados), las de `chrome` no tocan la red. Cada semilla que no se pudo
 * usar deja un aviso y cuenta por separado — un run que dice «sembré cinco» y
 * calla que tres no bajaron es el defecto de la regla 2 de DATA_INTEGRITY.
 */
const ok = (url: string, body: string): UrlFetchResult => ({
  url,
  status: 200,
  ok: true,
  contentType: 'text/html',
  bodyExcerpt: body,
  archiveUrl: null,
  archivedAt: null,
  retrievedAt: '2026-09-06T12:00:00.000Z',
})
const ko = (url: string): UrlFetchResult => ({
  url,
  status: 403,
  ok: false,
  contentType: null,
  bodyExcerpt: null,
  archiveUrl: null,
  archivedAt: null,
  retrievedAt: '2026-09-06T12:00:00.000Z',
  error: 'HTTP 403',
})

const seeds = parseSeedSources(
  JSON.stringify([
    {
      url: 'https://valenciaplaza.com/gimeno-candidato',
      title: 'El policía Alberto Gimeno será el candidato del PP',
      publisher: 'Valencia Plaza',
      capturedVia: 'fetch',
      excerpt: 'será el candidato del PP a la alcaldía',
      retrievedAt: '2026-09-06T10:00:00.000Z',
    },
    {
      url: 'https://bop.dival.es/bop/edicto.pdf',
      title: 'BOP n.º 82 — candidaturas 2019',
      capturedVia: 'pdf',
    },
    {
      url: 'https://www.levante-emv.com/pleno.html',
      title: 'Pleno de enero',
      publisher: 'Levante-EMV',
      capturedVia: 'chrome',
      excerpt: 'El portavoz del PP pidió la comparecencia del alcalde.',
      retrievedAt: '2026-09-05T18:00:00.000Z',
    },
    {
      url: 'https://example.org/bloqueada',
      title: 'Página que no baja',
      capturedVia: 'fetch',
    },
  ]),
)

describe('preloadSeeds', () => {
  it('descarga fetch y pdf con los lectores inyectados, no toca la red para chrome, y cuenta cada desenlace', async () => {
    const calls: string[] = []
    const r = await preloadSeeds(seeds, {
      fetchUrl: async (url) => {
        calls.push(`fetch ${url}`)
        if (url.includes('bloqueada')) return ko(url)
        return ok(url, 'Alberto Gimeno será el candidato del PP a la alcaldía de Riba-roja.')
      },
      fetchPdfUrl: async (url) => {
        calls.push(`pdf ${url}`)
        return ok(url, 'Candidatura n.º 3 Partido Popular: 1. Alberto José Gimeno Calvo')
      },
    })
    expect(calls).toEqual([
      'fetch https://valenciaplaza.com/gimeno-candidato',
      'pdf https://bop.dival.es/bop/edicto.pdf',
      'fetch https://example.org/bloqueada',
    ])
    expect(r.summary).toEqual({ attempted: 4, fetched: 2, manual: 1, failed: 1, notInBody: 0 })
    expect(r.sources).toHaveLength(3)
    expect(r.sources.map((s) => s.kind)).toEqual(['web', 'web', 'web'])
    // la semilla que no bajó deja aviso y no deja cita
    expect(r.warnings.some((w) => w.includes('bloqueada') && /403/.test(w))).toBe(true)
    expect(r.sources.some((s) => s.url.includes('bloqueada'))).toBe(false)
  })

  it('el extracto que no aparece en el cuerpo se conserva, avisa y cuenta aparte', async () => {
    const r = await preloadSeeds([seeds[0]], {
      fetchUrl: async (url) =>
        ok(url, '<html><body><p>Un cuerpo sin la frase sembrada.</p></body></html>'),
      fetchPdfUrl: async (url) => ok(url, ''),
    })
    expect(r.summary.notInBody).toBe(1)
    // El curador lo leyó en la página; el cuerpo capado no llegó al párrafo.
    expect(r.sources[0].excerpt).toBe('será el candidato del PP a la alcaldía')
    expect(r.warnings.some((w) => /no se encontró literal/.test(w))).toBe(true)
  })

  it('cada fila de evidencia va marcada como sembrada y conserva confianza de la tabla de dominios', async () => {
    const r = await preloadSeeds(seeds.slice(0, 3), {
      fetchUrl: async (url) => ok(url, 'será el candidato del PP a la alcaldía'),
      fetchPdfUrl: async (url) => ok(url, 'texto del edicto'),
    })
    expect(r.evidence.every((e) => e.seeded === true)).toBe(true)
    const byUrl = new Map(r.evidence.map((e) => [e.url, e.trust]))
    expect(byUrl.get('https://bop.dival.es/bop/edicto.pdf')).toBe('high')
    expect(byUrl.get('https://valenciaplaza.com/gimeno-candidato')).toBe('medium')
  })

  it('sin semillas no hace nada y lo dice con ceros, no con undefined', async () => {
    const r = await preloadSeeds([], {
      fetchUrl: async (url) => ok(url, ''),
      fetchPdfUrl: async (url) => ok(url, ''),
    })
    expect(r.summary).toEqual({ attempted: 0, fetched: 0, manual: 0, failed: 0, notInBody: 0 })
    expect(r.sources).toEqual([])
  })
})

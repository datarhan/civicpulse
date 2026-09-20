/**
 * «No pude mirar» no abre la puerta a un guardado — en NINGUNO de los que guardan.
 *
 * `journalist:archive-sources` no era el único que leía una consulta rechazada
 * como «sin copia». Los otros dos que guardan «cuando no hay copia» tenían la
 * misma rama: la auditoría diaria de enlaces de prensa (`maybeArchive`, que corre
 * en el cron del laboratorio desde la misma IP, y por tanto contra el mismo
 * límite) y la herramienta `audit()` del agente. Con la API de disponibilidad
 * contestando 429, cada enlace muerto se convertía en un Save Page Now — rechazado
 * también, y alargando el bloqueo.
 *
 * Ninguno de los dos pide el índice CDX: ahí la copia es un extra, y el CDX tarda
 * segundos por URL. Se enteran de que no pudieron mirar, y no guardan.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { maybeArchive } from '../scripts/audit-press-links'
import { audit } from '../src/scraper/journalist-tools/web'
import type { WaybackResult } from '../src/scraper/wayback'

const AHORA = '2026-09-20T00:00:00.000Z'
const resultado = (r: Partial<WaybackResult>): WaybackResult => ({
  ok: false,
  archivedUrl: null,
  timestamp: null,
  archivedAt: AHORA,
  error: null,
  ...r,
})
const noSePudoMirar = () => resultado({ lookup: 'failed', error: 'HTTP 429' })
const ninguna = () => resultado({ lookup: 'none', error: 'no snapshot available' })
const guardada = (url: string) =>
  resultado({
    ok: true,
    archivedUrl: `https://web.archive.org/web/20260920000000/${url}`,
    timestamp: '20260920000000',
  })

describe('maybeArchive (auditoría diaria de enlaces de prensa)', () => {
  const URL_MUERTA = 'https://example.org/noticia-retirada'

  it('enlace muerto + consulta rechazada → no guarda', async () => {
    let guardados = 0
    const r = await maybeArchive(URL_MUERTA, 'dead', false, {
      find: async () => noSePudoMirar(),
      save: async (u) => (guardados++, guardada(u)),
    })
    expect(guardados).toBe(0)
    expect(r).toEqual({ archivedUrl: null, archivedAt: null })
  })

  it('--archive + consulta rechazada → tampoco guarda', async () => {
    let guardados = 0
    await maybeArchive('https://example.org/viva', 'alive', true, {
      find: async () => noSePudoMirar(),
      save: async (u) => (guardados++, guardada(u)),
    })
    expect(guardados).toBe(0)
  })

  it('enlace muerto + «sin copia» CONTESTADO → sí guarda: es para lo que sirve', async () => {
    let guardados = 0
    const r = await maybeArchive(URL_MUERTA, 'dead', false, {
      find: async () => ninguna(),
      save: async (u) => (guardados++, guardada(u)),
    })
    expect(guardados).toBe(1)
    expect(r.archivedUrl).toBe(`https://web.archive.org/web/20260920000000/${URL_MUERTA}`)
  })

  it('enlace vivo + «sin copia», sin --archive → no gasta un guardado (como siempre)', async () => {
    let guardados = 0
    await maybeArchive('https://example.org/viva', 'alive', false, {
      find: async () => ninguna(),
      save: async (u) => (guardados++, guardada(u)),
    })
    expect(guardados).toBe(0)
  })
})

describe('audit() del agente, con saveIfDead', () => {
  afterEach(() => vi.unstubAllGlobals())

  const PAGINA = 'https://example.org/pagina-muerta'
  /** La red entera, falsa: la página da 404 y cada servicio de Wayback contesta lo que se le diga. */
  const monta = (disponibilidad: () => Response) => {
    const pedidas: string[] = []
    vi.stubGlobal('fetch', async (entrada: string | URL | Request) => {
      const u = String(entrada)
      if (u.startsWith('https://archive.org/wayback/available')) {
        pedidas.push('disponibilidad')
        return disponibilidad()
      }
      if (u.startsWith('https://web.archive.org/save/')) {
        pedidas.push('guardar')
        return new Response('', {
          status: 200,
          headers: { 'content-location': `/web/20260920000000/${PAGINA}` },
        })
      }
      if (u.startsWith('https://web.archive.org/cdx/')) {
        pedidas.push('cdx')
        return new Response('[]', { status: 200 })
      }
      pedidas.push('pagina')
      return new Response(null, { status: 404 })
    })
    return pedidas
  }

  it('consulta rechazada (429) → ni guarda ni pregunta al CDX', async () => {
    const pedidas = monta(() => new Response('Too Many Requests', { status: 429 }))
    const r = await audit(PAGINA, { saveIfDead: true })
    expect(pedidas).toEqual(['pagina', 'disponibilidad'])
    expect(r.alive).toBe(false)
    expect(r.archiveUrl).toBeNull()
  })

  it('«sin copia» CONTESTADO → sí guarda', async () => {
    const pedidas = monta(
      () => new Response(JSON.stringify({ archived_snapshots: {} }), { status: 200 }),
    )
    const r = await audit(PAGINA, { saveIfDead: true })
    expect(pedidas).toEqual(['pagina', 'disponibilidad', 'guardar'])
    expect(r.archiveUrl).toBe(`https://web.archive.org/web/20260920000000/${PAGINA}`)
  })
})

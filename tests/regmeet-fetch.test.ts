import { describe, it, expect } from 'vitest'
import { fetchConCookies } from '../scripts/lib/regmeet-fetch'

/**
 * regmeet.com puso delante de cada página de sesión (`/participaciones/<hash>`)
 * un 302 A LA MISMA URL que fija `humano=si`. El `fetch` de Node sigue la
 * redirección SIN guardar la cookie, así que da vueltas hasta rendirse con
 * «fetch failed»: 19 de 39 pasadas de `scrape:pleno-agendas` salieron rojas así,
 * y la verificación cruzada de `extract-pleno-votes` devolvía null en silencio.
 * Medido el 2026-09-23 con curl: sin cookie, 302 a sí misma; devolviéndole la
 * que pone, 200 y 290 KB.
 */
type Resp = { status: number; location?: string; cookies?: string[]; body?: string }

function servidor(guion: (url: string, cookie: string | null) => Resp) {
  const vistas: Array<{ url: string; cookie: string | null }> = []
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    const cookie = new Headers(init?.headers).get('cookie')
    vistas.push({ url, cookie })
    const r = guion(url, cookie)
    const h = new Headers()
    if (r.location) h.set('location', r.location)
    for (const c of r.cookies ?? []) h.append('set-cookie', c)
    // Un `new Response` quita `set-cookie` de sus cabeceras (es cabecera
    // prohibida para respuestas construidas en JS), así que el doble no puede
    // ser un Response de verdad.
    return { status: r.status, headers: h, text: async () => r.body ?? '' }
  }) as unknown as typeof fetch
  return { fetchImpl, vistas }
}

const URL_SESION = 'https://regmeet.com/aytoribarroja/participaciones/abc?idioma=castellano'

describe('fetchConCookies', () => {
  it('atraviesa el 302 a sí misma devolviendo la cookie que fija', async () => {
    const s = servidor((url, cookie) =>
      cookie?.includes('humano=si')
        ? { status: 200, body: '<html>sesión</html>' }
        : { status: 302, location: url, cookies: ['humano=si; path=/; domain=regmeet.com'] },
    )
    const res = await fetchConCookies(URL_SESION, {}, s.fetchImpl)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('sesión')
    expect(s.vistas).toHaveLength(2)
    expect(s.vistas[1].cookie).toBe('humano=si')
  })

  it('una página sin puerta se sirve a la primera, sin cookies inventadas', async () => {
    const s = servidor(() => ({ status: 200, body: 'ok' }))
    const res = await fetchConCookies(URL_SESION, {}, s.fetchImpl)
    expect(res.status).toBe(200)
    expect(s.vistas).toEqual([{ url: URL_SESION, cookie: null }])
  })

  it('no gira para siempre: un bucle de redirecciones termina en error', async () => {
    const s = servidor((url) => ({ status: 302, location: url }))
    await expect(fetchConCookies(URL_SESION, {}, s.fetchImpl)).rejects.toThrow(/redirec/i)
    expect(s.vistas.length).toBeLessThanOrEqual(4)
  })

  it('conserva las cabeceras del llamador (User-Agent incluido)', async () => {
    let ua: string | null = null
    const fetchImpl = (async (_u: string, init?: RequestInit) => {
      ua = new Headers(init?.headers).get('user-agent')
      return new Response('ok', { status: 200 })
    }) as unknown as typeof fetch
    await fetchConCookies(URL_SESION, { headers: { 'User-Agent': 'CivicPulse/0.1' } }, fetchImpl)
    expect(ua).toBe('CivicPulse/0.1')
  })
})

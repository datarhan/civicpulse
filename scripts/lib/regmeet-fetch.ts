/**
 * Un `fetch` que devuelve las cookies que el servidor pone al redirigir.
 *
 * regmeet.com contesta a cada página de sesión (`/participaciones/<hash>`) con un
 * 302 A LA MISMA URL que fija `humano=si`, y sirve la página cuando se le
 * devuelve. No es un reto: es la cookie que cualquier navegador guarda sin
 * preguntar. El `fetch` de Node sigue redirecciones pero no guarda cookies, así
 * que daba vueltas sobre la misma URL hasta rendirse con «fetch failed» —19 de 39
 * pasadas de `scrape:pleno-agendas` en rojo, y la verificación cruzada de
 * `extract-pleno-votes` devolviendo null en silencio—. Medido el 2026-09-23.
 *
 * Aquí la redirección se sigue a mano, como mucho `MAX_SALTOS` veces, llevando
 * las cookies que se van poniendo. La identidad del cliente no cambia: las
 * cabeceras del llamador —su User-Agent incluido— viajan intactas.
 */
const MAX_SALTOS = 3

export async function fetchConCookies(
  url: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const cookies = new Map<string, string>()
  let actual = url
  for (let salto = 0; salto <= MAX_SALTOS; salto++) {
    const headers = new Headers(init.headers)
    if (cookies.size > 0) {
      headers.set('cookie', [...cookies].map(([k, v]) => `${k}=${v}`).join('; '))
    }
    const res = await fetchImpl(actual, { ...init, headers, redirect: 'manual' })
    if (res.status < 300 || res.status >= 400) return res
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const par = c.split(';', 1)[0]
      const igual = par.indexOf('=')
      if (igual > 0) cookies.set(par.slice(0, igual).trim(), par.slice(igual + 1).trim())
    }
    const destino = res.headers.get('location')
    if (!destino) return res
    actual = new URL(destino, actual).toString()
  }
  throw new Error(`demasiadas redirecciones (${MAX_SALTOS}) desde ${url}`)
}

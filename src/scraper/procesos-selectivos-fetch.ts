/** Node-only fetcher for the procesos-selectivos list page and each process page. */
const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'

export const PROCESOS_URL = 'https://www.ribarroja.es/es/noticia/publicaciones-procesos-selectivos'

export async function fetchProcesosHtml(): Promise<string | null> {
  const res = await fetch(PROCESOS_URL, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null
  return res.text()
}

/**
 * La página de un proceso, para leer su título entero. Una redirección no
 * vale: la URL del enlace de la lista es lo que dice qué proceso es
 * (`UMBRAL_MISMO_PROCESO` en procesos-selectivos.ts), y una página a la que
 * se llegó por otro camino puede ser la de otro.
 */
export async function fetchPaginaDeProceso(
  url: string,
): Promise<{ html: string } | { error: string }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA },
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    })
    if (res.status >= 300 && res.status < 400) return { error: `redireccion ${res.status}` }
    if (!res.ok) return { error: `HTTP ${res.status}` }
    return { html: await res.text() }
  } catch (e) {
    return { error: (e as Error).message }
  }
}

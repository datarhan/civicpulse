/**
 * Node-only fetcher for BORME (hermano de `bop-fetch.ts` / `boe-fetch.ts`).
 *
 * El camino, que es el hallazgo entero de este módulo:
 *
 *   1. `GET /datosabiertos/api/borme/sumario/YYYYMMDD` → JSON con el sumario
 *      del día. La sección `A` («Empresarios. Actos inscritos») trae un item
 *      por provincia.
 *   2. Cada item lleva `url_html` → `diario_borme/txt.php?id=BORME-A-…`, que
 *      es el texto de esa sección provincial y lo que parsea `borme.ts`.
 *
 * Lo que estaba declarado imposible era la BÚSQUEDA (`buscar/borme.php` da 404
 * y libreborme está tras Cloudflare). Sigue sin haberla: aquí no se busca, se
 * barre por fecha y provincia y se filtra en local. Por eso el CLI pide un
 * rango y no una consulta.
 *
 * Se queda fuera de `borme.ts` para que ese módulo siga siendo puro y
 * ejecutable en el navegador, igual que el par `bop.ts` / `bop-fetch.ts`.
 */

import { seccionesDelSumario, type SeccionProvincial } from './borme'

const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'

/** `2026-05-18` → `20260518`, que es lo que pide la API. */
export function fechaCompacta(iso: string): string {
  return iso.replace(/-/g, '')
}

/**
 * Las secciones provinciales de «Empresarios. Actos inscritos» de un día.
 *
 * Devuelve `[]` cuando no hay boletín ese día —fines de semana y festivos— que
 * es una señal de salto limpia, no un error. Sólo lanza si el transporte falla
 * de verdad, para que quien barre pueda distinguir «ese día no hubo BORME» de
 * «la descarga se rompió». Es la misma disciplina que `fetchBopBulletinText`.
 */
export async function fetchSeccionesDelDia(
  fechaIso: string,
  timeoutMs = 60_000,
): Promise<SeccionProvincial[]> {
  const url = `https://www.boe.es/datosabiertos/api/borme/sumario/${fechaCompacta(fechaIso)}`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`BORME sumario ${fechaIso} -> HTTP ${res.status}`)

  return seccionesDelSumario(await res.json())
}

/** El HTML de una sección provincial, para dárselo a `parseBormeSeccion`. */
export async function fetchSeccionHtml(urlHtml: string, timeoutMs = 60_000): Promise<string> {
  const res = await fetch(urlHtml, {
    headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) throw new Error(`BORME sección ${urlHtml} -> HTTP ${res.status}`)
  return res.text()
}

/** Los días del rango, inclusive, en ISO. Fines de semana incluidos: el 404 los descarta. */
export function diasDelRango(desdeIso: string, hastaIso: string): string[] {
  const out: string[] = []
  const d = new Date(`${desdeIso}T00:00:00Z`)
  const fin = new Date(`${hastaIso}T00:00:00Z`)
  while (d <= fin) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/** Re-exportado para que quien barre no tenga que importar de dos sitios. */
export type { SeccionProvincial }

/**
 * Journalist tools — official-gazette + academic scrapers: BOE, DOGV,
 * Dialnet, and the press-hemeroteca query. Verbatim from the monolith.
 *
 * Two layers since 2026-09-07. The `leer*` readers do the request and the
 * parse and THROW a `GazetteReadError` when the server could not be asked
 * (network failure, non-2xx, the DOGV's bodiless 302): an empty list from
 * them means the gazette was searched and had nothing. The `fetch*` readers
 * are what the agent calls — they wrap `leer*` in the research cache and
 * degrade to `[]` on a read error, but the error is never cached, so the next
 * run asks again. Before this split every failure came back as `[]`, and
 * `journalist:sondeo` wrote «vacío» for four gazettes on a day none of them
 * had answered (rule 2 of docs/DATA_INTEGRITY.md).
 */
import { UA, cached } from './internal'
import { parseSpanishDate, toIsoFromEsSlash } from './bio-extract'

export interface GazetteHit {
  date: string
  title: string
  url: string
  ref?: string
}

type FetchImpl = typeof fetch

/** The gazette could not be asked: network, non-2xx, or a redirect away from the search. */
export class GazetteReadError extends Error {
  readonly fuente: string
  readonly url: string
  readonly status?: number
  constructor(fuente: string, url: string, detalle: string, status?: number) {
    super(`${fuente}: ${detalle} — ${url}`)
    this.name = 'GazetteReadError'
    this.fuente = fuente
    this.url = url
    this.status = status
  }
}

async function pedirHtml(
  fuente: string,
  url: string,
  fetchImpl: FetchImpl,
  init: RequestInit = {},
): Promise<string> {
  let res: Response
  try {
    res = await fetchImpl(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
      ...init,
    })
  } catch (e) {
    throw new GazetteReadError(fuente, url, (e as Error).message)
  }
  if (!res.ok) {
    const location = res.headers.get('location')
    throw new GazetteReadError(
      fuente,
      url,
      `HTTP ${res.status}${location ? ` → ${location}` : ''}`,
      res.status,
    )
  }
  return res.text()
}

function degradar<T>(fuente: string, run: () => Promise<T[]>): Promise<T[]> {
  return run().catch((e: unknown) => {
    if (e instanceof GazetteReadError) {
      process.stderr.write(`[gazette] ${fuente}: ${e.message}\n`)
      return [] as T[]
    }
    throw e
  })
}

const limpiar = (s: string): string =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

export async function leerBoe(
  name: string,
  limit = 8,
  fetchImpl: FetchImpl = fetch,
): Promise<GazetteHit[]> {
  const params = new URLSearchParams({ campo: 'titulo', valor: name, num_buscar: String(limit) })
  const url = `https://www.boe.es/buscar/legislacion.php?${params.toString()}`
  const html = await pedirHtml('BOE', url, fetchImpl)
  const hits: GazetteHit[] = []
  // BOE renders matches in <li class="resultado-busqueda"> or anchors
  // pointing to /diario_boe/txt.php?id=BOE-A-... — parse defensively.
  const linkRx = /<a[^>]+href="(\/diario_boe\/txt\.php\?id=BOE-[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const dateRx =
    /(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+\d{4})/i
  let m: RegExpExecArray | null
  while ((m = linkRx.exec(html)) && hits.length < limit) {
    const path = m[1]
    const title = limpiar(m[2])
    if (!title) continue
    const dateMatch = title.match(dateRx)
    const date = dateMatch ? parseSpanishDate(dateMatch[1]) : ''
    const refMatch = path.match(/id=(BOE-[A-Z0-9-]+)/)
    hits.push({
      date,
      title,
      url: `https://www.boe.es${path}`,
      ...(refMatch ? { ref: refMatch[1] } : {}),
    })
  }
  return hits
}

export function fetchBoeForSubject(
  name: string,
  limit = 8,
  fetchImpl: FetchImpl = fetch,
): Promise<GazetteHit[]> {
  return degradar('BOE', () =>
    cached('fetchBoeForSubject', { name, limit }, () => leerBoe(name, limit, fetchImpl)),
  )
}

/**
 * Same idea for DOGV (Generalitat Valenciana gazette). Catches
 * autonomic-level nombramientos a regidor, mancomunidad appointments,
 * commission memberships, etc. The search endpoint answered a bodiless 302
 * on 2026-09-06; following it lands on a portal page with no results, which
 * read as «empty». Redirects are therefore NOT followed: a 3xx is a failure
 * with its Location in the message.
 */
export async function leerDogv(
  name: string,
  limit = 8,
  fetchImpl: FetchImpl = fetch,
): Promise<GazetteHit[]> {
  const params = new URLSearchParams({ texto: name, numero_lista: String(limit) })
  const url = `https://dogv.gva.es/portal/ficha_buscador_dogv?${params.toString()}`
  const html = await pedirHtml('DOGV', url, fetchImpl, { redirect: 'manual' })
  const hits: GazetteHit[] = []
  const linkRx =
    /<a[^>]+href="(\/portal\/[^"]+(?:dogv|datos\.gva\.es)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
  const dateRx = /(\d{2}\/\d{2}\/\d{4})/
  let m: RegExpExecArray | null
  while ((m = linkRx.exec(html)) && hits.length < limit) {
    const path = m[1]
    const title = limpiar(m[2])
    if (!title) continue
    if (!title.toLowerCase().includes(name.toLowerCase().split(/\s+/)[0])) continue
    const dateMatch = title.match(dateRx)
    const date = dateMatch ? toIsoFromEsSlash(dateMatch[1]) : ''
    hits.push({
      date,
      title,
      url: path.startsWith('http') ? path : `https://dogv.gva.es${path}`,
    })
  }
  return hits
}

export function fetchDogvForSubject(
  name: string,
  limit = 8,
  fetchImpl: FetchImpl = fetch,
): Promise<GazetteHit[]> {
  return degradar('DOGV', () =>
    cached('fetchDogvForSubject', { name, limit }, () => leerDogv(name, limit, fetchImpl)),
  )
}

/**
 * Dialnet author search — the canonical index for Spanish academic
 * publications, theses, and book chapters. Useful for any subject who
 * has written for an academic venue (op-eds excluded; dialnet is
 * strictly scholarly).
 */
export interface DialnetEntry {
  title: string
  year?: number
  venue?: string
  url: string
}

export async function leerDialnet(
  name: string,
  limit = 8,
  fetchImpl: FetchImpl = fetch,
): Promise<DialnetEntry[]> {
  const params = new URLSearchParams({ querysomero: name })
  const url = `https://dialnet.unirioja.es/buscar/autor?${params.toString()}`
  const html = await pedirHtml('Dialnet', url, fetchImpl)
  const out: DialnetEntry[] = []
  const docRx =
    /<a[^>]+href="(\/servlet\/(?:articulo|libro|tesis)\?codigo=\d+)"[^>]*>([\s\S]*?)<\/a>/gi
  const yearRx = /(?:^|[^0-9])(19[5-9]\d|20[0-3]\d)(?:[^0-9]|$)/
  let m: RegExpExecArray | null
  while ((m = docRx.exec(html)) && out.length < limit) {
    const path = m[1]
    const title = limpiar(m[2])
    if (!title) continue
    const y = title.match(yearRx)
    out.push({
      title,
      ...(y ? { year: Number(y[1]) } : {}),
      url: `https://dialnet.unirioja.es${path}`,
    })
  }
  return out
}

export function fetchDialnet(
  name: string,
  limit = 8,
  fetchImpl: FetchImpl = fetch,
): Promise<DialnetEntry[]> {
  return degradar('Dialnet', () =>
    cached('fetchDialnet', { name, limit }, () => leerDialnet(name, limit, fetchImpl)),
  )
}

/**
 * Best-effort historical press query against Lavanguardia's free
 * hemeroteca preview. Many requests are blocked by the publisher's
 * anti-scrape layer; the agent's reader degrades to an empty list so the
 * agent never crashes here, but the block itself is a read error, not a
 * result, and `leerHemeroteca` says so.
 */
export interface HemerotecaHit {
  date: string
  title: string
  url: string
}

export async function leerHemeroteca(
  name: string,
  year: number,
  fetchImpl: FetchImpl = fetch,
): Promise<HemerotecaHit[]> {
  const params = new URLSearchParams({ q: `${name} ${year}` })
  const url = `https://hemeroteca.lavanguardia.com/preview?${params.toString()}`
  const html = await pedirHtml('hemeroteca', url, fetchImpl)
  const out: HemerotecaHit[] = []
  const linkRx = /<a[^>]+href="([^"]+\/preview\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const dateRx = /\/preview\/(\d{4})\/(\d{2})\/(\d{2})\//
  let m: RegExpExecArray | null
  while ((m = linkRx.exec(html)) && out.length < 6) {
    const href = m[1]
    const title = limpiar(m[2])
    const d = href.match(dateRx)
    if (!title || !d) continue
    out.push({
      date: `${d[1]}-${d[2]}-${d[3]}`,
      title,
      url: href.startsWith('http') ? href : `https://hemeroteca.lavanguardia.com${href}`,
    })
  }
  return out
}

export function fetchHemerotecaQuery(
  name: string,
  year: number,
  fetchImpl: FetchImpl = fetch,
): Promise<HemerotecaHit[]> {
  return degradar('hemeroteca', () =>
    cached('fetchHemerotecaQuery', { name, year }, () => leerHemeroteca(name, year, fetchImpl)),
  )
}

/**
 * Spanish-aware regex extractor for biographical entities. Pure code,
 * no LLM. Surfaces the obvious candidates from a fetched body so the
 * later bio-extract LLM stage has structured starting points to
 * promote into identity / education / career-* section payloads.
 *
 * False positives are acceptable — the LLM stage and the validator
 * filter again. False negatives are common; this tool is "first pass"
 * only.
 */

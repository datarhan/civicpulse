/**
 * Journalist tools — official-gazette + academic scrapers: BOE, DOGV,
 * Dialnet, and the press-hemeroteca query. Verbatim from the monolith.
 */
import { UA, cached } from './internal'
import { parseSpanishDate, toIsoFromEsSlash } from './bio-extract'

export interface GazetteHit {
  date: string
  title: string
  url: string
  ref?: string
}

export async function fetchBoeForSubject(name: string, limit = 8): Promise<GazetteHit[]> {
  return cached('fetchBoeForSubject', { name, limit }, async () => {
    const params = new URLSearchParams({ campo: 'titulo', valor: name, num_buscar: String(limit) })
    const url = `https://www.boe.es/buscar/legislacion.php?${params.toString()}`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } })
      if (!res.ok) return []
      const html = await res.text()
      const hits: GazetteHit[] = []
      // BOE renders matches in <li class="resultado-busqueda"> or anchors
      // pointing to /diario_boe/txt.php?id=BOE-A-... — parse defensively.
      const linkRx = /<a[^>]+href="(\/diario_boe\/txt\.php\?id=BOE-[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
      const dateRx =
        /(\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+de\s+\d{4})/i
      let m: RegExpExecArray | null
      while ((m = linkRx.exec(html)) && hits.length < limit) {
        const path = m[1]
        const title = m[2]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
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
    } catch {
      return []
    }
  })
}

/**
 * Same idea for DOGV (Generalitat Valenciana gazette). Catches
 * autonomic-level nombramientos a regidor, mancomunidad appointments,
 * commission memberships, etc.
 */
export async function fetchDogvForSubject(name: string, limit = 8): Promise<GazetteHit[]> {
  return cached('fetchDogvForSubject', { name, limit }, async () => {
    const params = new URLSearchParams({ texto: name, numero_lista: String(limit) })
    const url = `https://dogv.gva.es/portal/ficha_buscador_dogv?${params.toString()}`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } })
      if (!res.ok) return []
      const html = await res.text()
      const hits: GazetteHit[] = []
      const linkRx =
        /<a[^>]+href="(\/portal\/[^"]+(?:dogv|datos\.gva\.es)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi
      const dateRx = /(\d{2}\/\d{2}\/\d{4})/
      let m: RegExpExecArray | null
      while ((m = linkRx.exec(html)) && hits.length < limit) {
        const path = m[1]
        const title = m[2]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
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
    } catch {
      return []
    }
  })
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

export async function fetchDialnet(name: string, limit = 8): Promise<DialnetEntry[]> {
  return cached('fetchDialnet', { name, limit }, async () => {
    const params = new URLSearchParams({ querysomero: name })
    const url = `https://dialnet.unirioja.es/buscar/autor?${params.toString()}`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } })
      if (!res.ok) return []
      const html = await res.text()
      const out: DialnetEntry[] = []
      const docRx =
        /<a[^>]+href="(\/servlet\/(?:articulo|libro|tesis)\?codigo=\d+)"[^>]*>([\s\S]*?)<\/a>/gi
      const yearRx = /(?:^|[^0-9])(19[5-9]\d|20[0-3]\d)(?:[^0-9]|$)/
      let m: RegExpExecArray | null
      while ((m = docRx.exec(html)) && out.length < limit) {
        const path = m[1]
        const title = m[2]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (!title) continue
        const y = title.match(yearRx)
        out.push({
          title,
          ...(y ? { year: Number(y[1]) } : {}),
          url: `https://dialnet.unirioja.es${path}`,
        })
      }
      return out
    } catch {
      return []
    }
  })
}

/**
 * Best-effort historical press query against Lavanguardia's free
 * hemeroteca preview. Many requests are blocked by the publisher's
 * anti-scrape layer; we degrade gracefully (empty array on any error)
 * so the agent never crashes here.
 */
export interface HemerotecaHit {
  date: string
  title: string
  url: string
}

export async function fetchHemerotecaQuery(name: string, year: number): Promise<HemerotecaHit[]> {
  return cached('fetchHemerotecaQuery', { name, year }, async () => {
    const params = new URLSearchParams({ q: `${name} ${year}` })
    const url = `https://hemeroteca.lavanguardia.com/preview?${params.toString()}`
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*' } })
      if (!res.ok) return []
      const html = await res.text()
      const out: HemerotecaHit[] = []
      const linkRx = /<a[^>]+href="([^"]+\/preview\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
      const dateRx = /\/preview\/(\d{4})\/(\d{2})\/(\d{2})\//
      let m: RegExpExecArray | null
      while ((m = linkRx.exec(html)) && out.length < 6) {
        const href = m[1]
        const title = m[2]
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        const d = href.match(dateRx)
        if (!title || !d) continue
        out.push({
          date: `${d[1]}-${d[2]}-${d[3]}`,
          title,
          url: href.startsWith('http') ? href : `https://hemeroteca.lavanguardia.com${href}`,
        })
      }
      return out
    } catch {
      return []
    }
  })
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

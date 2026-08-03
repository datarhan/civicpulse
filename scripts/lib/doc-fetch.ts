/**
 * Fetch a cited document and get its full text, for the checks that have to ask
 * "does the thing we quoted still say what we quoted?".
 *
 * Lives in `scripts/` because that is where `fetch` lives in this repo. The
 * pure half — deciding whether an excerpt appears in the text — is
 * `src/scraper/quote-match.ts`, and is tested without a network.
 *
 * Deliberately NOT shared with `fetch-url-evidence.ts` yet. That script caps
 * its output at 1500 chars because it feeds an LLM prompt; this one needs the
 * whole document because it is looking for one sentence that could be anywhere
 * in it. Consolidating the SSRF guard and the capped reader into one place is
 * worth doing, but not in the same change that repoints 68 published citations.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as cheerio from 'cheerio'

export const UA =
  'CivicPulse/1.0 (watchdog cívico Riba-roja de Túria; +https://github.com/datarhan/civicpulse) citation-check'

const TIMEOUT_MS = 30_000
/** Municipal acta PDFs are routinely 8–10 MB scans. 8 MB was not enough. */
const MAX_BYTES = 32 * 1024 * 1024

/**
 * Three states, not two.
 *
 * `dead` means the server answered and told us the document is not there. That
 * is a fact about our citation, and it blocks.
 *
 * `unverifiable` means we could not get an answer: the host refused this IP
 * (regmeet.com blackholes non-residential ranges), a WAF returned 403, DNS
 * failed, the request timed out. That is a fact about OUR vantage point, not
 * about the citation, and it must never block — a checker that reports "I could
 * not reach it" as "your source is fake" is the one everybody learns to ignore,
 * which is how a real dead link gets waved through.
 */
export type UrlState = 'alive' | 'dead' | 'unverifiable'

export interface UrlVerdict {
  url: string
  state: UrlState
  status?: number
  reason?: string
}

function ssrfReason(url: URL): string | null {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return `unsupported scheme ${url.protocol}`
  }
  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host === '0.0.0.0' || host.endsWith('.localhost')) {
    return 'localhost not allowed'
  }
  if (/^127\./.test(host)) return '127.x not allowed'
  if (/^10\./.test(host)) return '10.x not allowed'
  if (/^192\.168\./.test(host)) return '192.168.x not allowed'
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return '172.16-31.x not allowed'
  if (/^169\.254\./.test(host)) return 'link-local 169.254.x not allowed'
  if (host === '::1' || host === '[::1]') return 'IPv6 loopback not allowed'
  if (host.startsWith('fe80:') || host.startsWith('[fe80:')) return 'IPv6 link-local not allowed'
  return null
}

/**
 * Map an HTTP status to a state.
 *
 * 401/403/429 are `unverifiable`, not `dead`: they mean "not to you, not now".
 * ribarroja.es fronts some paths with a WAF that 403s a non-browser UA, and
 * three of this project's own sources sit behind one.
 */
export function stateForStatus(status: number): UrlState {
  if (status >= 200 && status < 300) return 'alive'
  if (status === 401 || status === 403 || status === 429) return 'unverifiable'
  if (status >= 400 && status < 500) return 'dead'
  return 'unverifiable' // 5xx: the server is broken, the document may be fine
}

/** Does the URL resolve? Never throws — failure is a verdict, not an exception. */
export async function classifyUrl(url: string): Promise<UrlVerdict> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { url, state: 'dead', reason: 'unparseable URL' }
  }
  const ssrf = ssrfReason(parsed)
  if (ssrf) return { url, state: 'unverifiable', reason: ssrf }

  for (const method of ['HEAD', 'GET'] as const) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': UA, accept: '*/*' },
      })
      // Plenty of servers refuse HEAD but serve GET fine.
      if (method === 'HEAD' && (res.status === 405 || res.status === 501)) continue
      return { url, state: stateForStatus(res.status), status: res.status }
    } catch (e) {
      if (method === 'GET') {
        const code = (e as { cause?: { code?: string } }).cause?.code ?? (e as Error).name
        return { url, state: 'unverifiable', reason: String(code) }
      }
    } finally {
      clearTimeout(timer)
    }
  }
  return { url, state: 'unverifiable', reason: 'no response' }
}

/** Fetch with a body-size cap, streaming so a huge PDF cannot OOM the laptop. */
async function fetchCapped(url: string): Promise<{ contentType: string; body: Uint8Array }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': UA, accept: '*/*' },
      redirect: 'follow',
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  if (!res.body) throw new Error('empty response body')

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    received += value.byteLength
    if (received > MAX_BYTES) {
      await reader.cancel().catch(() => {})
      throw new Error(`payload exceeds ${MAX_BYTES / 1024 / 1024} MB cap`)
    }
    chunks.push(value)
  }
  const body = new Uint8Array(received)
  let offset = 0
  for (const c of chunks) {
    body.set(c, offset)
    offset += c.byteLength
  }
  return { contentType: res.headers.get('content-type') ?? 'application/octet-stream', body }
}

function pdfToText(body: Uint8Array): string {
  const dir = mkdtempSync(join(tmpdir(), 'cp-doc-'))
  const path = join(dir, 'doc.pdf')
  try {
    writeFileSync(path, body)
    const r = spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', path, '-'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    if (r.error) throw new Error(`pdftotext unavailable: ${r.error.message}`)
    if (r.status !== 0) throw new Error(`pdftotext: ${r.stderr || 'non-zero exit'}`)
    return r.stdout
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * Full text of the document at `url`. Throws on anything that stops us reading
 * it — callers decide whether that is fatal.
 */
export async function fetchDocumentText(url: string): Promise<string> {
  const { contentType, body } = await fetchCapped(url)
  const type = contentType.toLowerCase()
  if (type.includes('pdf')) return pdfToText(body)
  const text = new TextDecoder('utf-8').decode(body)
  if (type.includes('html') || type.includes('xml')) {
    const $ = cheerio.load(text)
    $('script, style, nav, header, footer, noscript').remove()
    return $('body').text()
  }
  return text
}

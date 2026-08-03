#!/usr/bin/env tsx
/**
 * Fetch a URL and extract a text snippet for the curator's LLM draft.
 *
 *   npm run fetch-url-evidence -- <url>
 *
 * Output (stdout, last line is parseable JSON):
 *   { "kind": "url" | "pdf", "sourceUrl": "...", "title": "...", "snippet": "..." }
 *
 * Used by the curator dashboard's "Add URL" button. The middleware
 * spawns this and passes the JSON back to the modal.
 *
 * Pipeline:
 *   1. SSRF guard — http(s) only, reject private/loopback/link-local IPs.
 *   2. HEAD or GET to learn Content-Type.
 *   3. text/html  → cheerio: title + main article text → snippet.
 *      application/pdf → write to a temp file → pdftotext → snippet.
 *      text/plain → take first 1500 chars.
 *      anything else → reject.
 *   4. Snippet capped at 1500 chars (LLM input is small + cheap).
 *
 * Steps 1 and 2 come from `lib/doc-fetch.ts`. They used to be a local copy, and
 * the copy kept an 8 MB transport cap after the shared one moved to 32 MB —
 * so this script failed on every acta over 8 MB, which is most of them. Only
 * MAX_SNIPPET below is legitimately local: it is a prompt budget, not transport.
 *
 * Audio/video are NOT supported here — those need Whisper transcription
 * which takes minutes. Future addition: a job-queue pattern with
 * background processing + status polling.
 */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve as resolvePath, join } from 'node:path'
import * as cheerio from 'cheerio'
import { buildUA, fetchCapped, ssrfReason } from './lib/doc-fetch'

const UA = buildUA('fetch-url-evidence')
const MAX_SNIPPET = 1500

function fail(msg: string, code = 1): never {
  process.stderr.write(`[fetch-url-evidence] ${msg}\n`)
  process.exit(code)
}

function extractFromHtml(html: string): { title: string; snippet: string } {
  const $ = cheerio.load(html)
  // Strip noise.
  $('script, style, noscript, iframe, nav, footer, aside, form, header').remove()
  // Title: <title> > og:title > h1.
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim()
  const docTitle = $('title').first().text().trim()
  const h1 = $('h1').first().text().trim()
  const title = (ogTitle || docTitle || h1 || '').slice(0, 200)
  // Body: prefer <article>, fall back to <main>, fall back to <body>.
  // Take text + collapse whitespace.
  const candidates = ['article', 'main', '[role="main"]', 'body']
  let raw = ''
  for (const sel of candidates) {
    const el = $(sel).first()
    if (el.length === 0) continue
    raw = el.text()
    if (raw.trim().length > 200) break
  }
  if (!raw) raw = $('body').text() || $.text()
  const cleaned = raw.replace(/\s+/g, ' ').trim()
  return { title, snippet: cleaned.slice(0, MAX_SNIPPET) }
}

function extractFromPdf(body: Uint8Array): { title: string; snippet: string } {
  const dir = mkdtempSync(join(tmpdir(), 'cp-curator-pdf-'))
  const path = join(dir, 'evidence.pdf')
  try {
    writeFileSync(path, body)
    const r: SpawnSyncReturns<string> = spawnSync(
      'pdftotext',
      ['-layout', '-enc', 'UTF-8', path, '-'],
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    )
    if (r.error) {
      throw new Error(`pdftotext not available: ${r.error.message}`)
    }
    if (r.status !== 0) throw new Error(`pdftotext: ${r.stderr || 'non-zero exit'}`)
    const text = r.stdout.replace(/\s+/g, ' ').trim()
    // First line that's >5 chars is a fair guess at the title.
    const firstNonEmpty =
      text
        .split(/[.\n]/)
        .map((s) => s.trim())
        .find((s) => s.length > 5) ?? ''
    return {
      title: firstNonEmpty.slice(0, 200),
      snippet: text.slice(0, MAX_SNIPPET),
    }
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* noop */
    }
  }
}

async function main() {
  const urlArg = process.argv[2]
  if (!urlArg) fail('Usage: fetch-url-evidence <url>', 2)
  let parsed: URL
  try {
    parsed = new URL(urlArg)
  } catch {
    fail(`invalid URL: ${urlArg}`, 2)
  }
  const ssrf = ssrfReason(parsed)
  if (ssrf) fail(`refused: ${ssrf}`, 2)

  let fetched: { contentType: string; body: Uint8Array }
  try {
    fetched = await fetchCapped(parsed.toString(), UA)
  } catch (err) {
    fail((err as Error).message)
  }
  const ct = fetched.contentType.toLowerCase()
  const out = (kind: 'url' | 'pdf', title: string, snippet: string) => {
    process.stdout.write(
      JSON.stringify({
        kind,
        sourceUrl: parsed.toString(),
        title: title.trim(),
        snippet: snippet.trim(),
      }) + '\n',
    )
  }

  if (ct.includes('text/html') || ct.includes('application/xhtml')) {
    const html = new TextDecoder('utf-8', { fatal: false }).decode(fetched.body)
    const { title, snippet } = extractFromHtml(html)
    if (snippet.length < 50) fail(`extracted snippet too short (${snippet.length} chars)`)
    out('url', title || parsed.hostname, snippet)
    return
  }
  if (ct.includes('application/pdf') || parsed.pathname.toLowerCase().endsWith('.pdf')) {
    const { title, snippet } = extractFromPdf(fetched.body)
    if (snippet.length < 50) fail(`PDF extracted snippet too short (${snippet.length} chars)`)
    out('pdf', title || parsed.hostname, snippet)
    return
  }
  if (ct.includes('text/plain')) {
    const text = new TextDecoder('utf-8', { fatal: false })
      .decode(fetched.body)
      .replace(/\s+/g, ' ')
      .trim()
    out('url', parsed.hostname, text.slice(0, MAX_SNIPPET))
    return
  }
  fail(`unsupported content-type: ${fetched.contentType}`)
}

main().catch((err) => {
  process.stderr.write(
    `[fetch-url-evidence] fatal: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
})

// Silence unused-import warning when cheerio types include `resolvePath`.
void resolvePath

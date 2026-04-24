/**
 * Fetch pleno acta PDFs from ribarroja.es and extract text into the same
 * transcript format the LLM extractor consumes. Closes the coverage gap for
 * the ~33 plenos (mostly 2023-early 2024) that have no YouTube video.
 *
 * Per pleno page, finds every <a class="pdf" href="/contenidos.downloadatt…">
 * link whose anchor text mentions "acta". Prefers the approved version
 * (anchor text contains "aprobada") over a draft ("esborrany"/"borrador").
 * Downloads the PDF, runs `pdftotext -layout` on it, and writes to
 * public/data/pleno-transcripts/<plenoId>.txt in the same
 * `[0.0 → 0.0] <line>\n` shape the extractor slides windows over.
 *
 *   npx tsx scripts/fetch-pleno-actas.ts                  # all missing
 *   npx tsx scripts/fetch-pleno-actas.ts --limit 3        # first 3 only
 *   npx tsx scripts/fetch-pleno-actas.ts 1ea8wn5          # one specific pleno
 *   npx tsx scripts/fetch-pleno-actas.ts --force          # redo even if cached
 *
 * Libel note: actas are legal public documents that already name individual
 * councillors verbatim; quoting from them is safe. The extractor's
 * bloc-level speakerGroup contract still applies — the LLM should map
 * "El Sr. López (PP) manifiesta…" → speakerGroup="PP".
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const PLENOS_PATH = resolve('public/data/plenos.json')
const TRANSCRIPT_DIR = resolve('public/data/pleno-transcripts')
const UA = 'CivicPulse/1.0 (+https://github.com/datarhan/civicpulse) acta-extractor'
const BASE = 'http://www.ribarroja.es'

interface Pleno {
  id: string
  title: string
  date: string
  kind: string
  link: string
}

interface ActaLink {
  href: string // absolute URL
  label: string
  preference: number // higher = preferred
}

function score(label: string): number {
  const l = label.toLowerCase()
  if (l.includes('acta') && l.includes('aprobad')) return 3
  if (l.includes('acta') && (l.includes('esborrany') || l.includes('borrador'))) return 2
  if (l.includes('acta')) return 1
  return 0
}

function extractActaLinks(html: string): ActaLink[] {
  // class="pdf" <a> tags. Example:
  //   <li class="descargas"><a class="pdf" href="/contenidos.downloadatt.action?id=9361387" target="_blank">Esborrany acta ple 2 d'octubre de 2023</a></li>
  const re =
    /<a\s+(?:[^>]*?\s)?class="pdf"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  const out: ActaLink[] = []
  for (const m of html.matchAll(re)) {
    const href = m[1]
    const label = m[2]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&aacute;/g, 'á')
      .replace(/&iacute;/g, 'í')
      .replace(/&oacute;/g, 'ó')
      .replace(/&uacute;/g, 'ú')
      .replace(/&eacute;/g, 'é')
      .trim()
    const pref = score(label)
    if (pref === 0) continue
    const abs = href.startsWith('http') ? href : BASE + href
    out.push({ href: abs, label, preference: pref })
  }
  // Prefer highest-preference first, then fall back to others.
  return out.sort((a, b) => b.preference - a.preference)
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  return res.text()
}

async function fetchPdf(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`)
  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

function pdfToText(pdfPath: string): string {
  const r = spawnSync('pdftotext', ['-layout', '-enc', 'UTF-8', pdfPath, '-'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
  if (r.status !== 0) throw new Error(`pdftotext: ${r.stderr || 'non-zero exit'}`)
  return r.stdout
}

function normalizeActaText(raw: string): string {
  // Collapse common acta noise so windows pack more signal:
  //   - page header/footer running-stamps
  //   - multiple blank lines → single blank
  //   - hyphen-at-EOL ("compromi-\nso") → joined word
  const noFormfeeds = raw.replace(/\f/g, '\n\n')
  const joined = noFormfeeds.replace(/(\w)-\n(\w)/g, '$1$2')
  const lines = joined
    .split(/\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)
  return lines.join('\n')
}

function toTranscriptFormat(text: string): string {
  // Match the `[start → end] text\n` shape the extractor slides windows over.
  // Every line gets [0.0 → 0.0] since PDF has no audio timestamps.
  return text
    .split('\n')
    .map((line) => `[0.0 → 0.0] ${line}`)
    .join('\n') + '\n'
}

async function processPleno(p: Pleno, opts: { force: boolean }): Promise<'done' | 'skipped' | 'missing' | 'failed'> {
  const outPath = resolve(TRANSCRIPT_DIR, `${p.id}.txt`)
  if (existsSync(outPath) && !opts.force) return 'skipped'

  process.stdout.write(`[actas] ${p.id} · ${p.date} · ${p.kind}\n`)
  let html: string
  try {
    html = await fetchText(p.link)
  } catch (err) {
    process.stderr.write(`  pleno page fetch failed: ${(err as Error).message}\n`)
    return 'failed'
  }

  const links = extractActaLinks(html)
  if (links.length === 0) {
    process.stdout.write(`  no acta PDF linked on this page\n`)
    return 'missing'
  }
  const best = links[0]
  process.stdout.write(`  PDF: ${best.label} (score=${best.preference})\n`)

  let pdf: Uint8Array
  try {
    pdf = await fetchPdf(best.href)
  } catch (err) {
    process.stderr.write(`  pdf download failed: ${(err as Error).message}\n`)
    return 'failed'
  }

  const tmp = resolve(tmpdir(), `civicpulse-acta-${p.id}.pdf`)
  writeFileSync(tmp, pdf)
  let rawText: string
  try {
    rawText = pdfToText(tmp)
  } catch (err) {
    process.stderr.write(`  pdftotext failed: ${(err as Error).message}\n`)
    return 'failed'
  }

  const text = normalizeActaText(rawText)
  if (text.length < 400) {
    process.stderr.write(`  extracted text too short (${text.length} chars) — likely scanned PDF; skipping\n`)
    return 'failed'
  }
  mkdirSync(TRANSCRIPT_DIR, { recursive: true })
  writeFileSync(outPath, toTranscriptFormat(text), 'utf8')
  process.stdout.write(`  wrote ${text.length.toLocaleString()} chars → ${basename(outPath)}\n`)
  return 'done'
}

async function main() {
  const args = process.argv.slice(2)
  let limit = Infinity
  let force = false
  const positional: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--limit') limit = Number(args[++i])
    else if (a === '--force') force = true
    else if (a.startsWith('--')) {
      process.stderr.write(`unknown flag ${a}\n`)
      process.exit(2)
    } else positional.push(a)
  }

  if (!existsSync(PLENOS_PATH)) {
    process.stderr.write(`[actas] ${PLENOS_PATH} missing — run scrape:plenos first\n`)
    process.exit(1)
  }
  const plenos = (JSON.parse(readFileSync(PLENOS_PATH, 'utf8')).items ?? []) as Pleno[]
  mkdirSync(TRANSCRIPT_DIR, { recursive: true })
  const done = new Set(
    readdirSync(TRANSCRIPT_DIR).filter((f) => f.endsWith('.txt')).map((f) => f.replace('.txt', '')),
  )

  // Default: oldest-first. Recent plenos (last ~6 weeks) haven't had their
  // actas approved + published yet — running newest-first wastes requests on
  // pages that predictably have no acta. Positional mode (explicit plenoIds)
  // keeps the caller's order.
  const targets = positional.length > 0
    ? plenos.filter((p) => positional.includes(p.id))
    : plenos
        .filter((p) => !done.has(p.id))
        .sort((a, b) => a.date.localeCompare(b.date))

  if (positional.length > 0 && targets.length === 0) {
    process.stderr.write(`[actas] no pleno matches: ${positional.join(', ')}\n`)
    process.exit(1)
  }

  process.stdout.write(`[actas] ${targets.length} pleno(s) to process${limit !== Infinity ? ` (limit ${limit})` : ''}\n`)

  const stats = { done: 0, skipped: 0, missing: 0, failed: 0 }
  let n = 0
  for (const p of targets) {
    if (n >= limit) break
    const r = await processPleno(p, { force })
    stats[r] += 1
    n += 1
  }
  process.stdout.write(
    `[actas] summary: done=${stats.done} missing=${stats.missing} failed=${stats.failed} skipped=${stats.skipped}\n`,
  )
}

main().catch((err) => {
  process.stderr.write(`[actas] FATAL: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})

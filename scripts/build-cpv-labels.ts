#!/usr/bin/env tsx
/**
 * Build public/data/cpv-labels.json — a trimmed CPV-2008 → Spanish-label
 * dictionary covering only the codes that actually appear in tenders.json.
 *
 * Source: the official EU CPV-2008 vocabulary published by TED/SIMAP (EU open
 * data). The download is a ZIP containing a multilingual `cpv_2008.xml`
 * (`<CPV CODE="NNNNNNNN-C"><TEXT LANG="ES">…</TEXT>…</CPV>`). We extract the ES
 * labels, intersect with the distinct 8-digit codes present in our contracts,
 * and write a compact `{ code: label }` map.
 *
 * This is an occasional/curator build — the CPV vocabulary is static — so it is
 * deliberately NOT part of `scrape:all`. The runtime (`src/lib/cpv.js`) degrades
 * to embedded 2-digit division labels for any code the dictionary misses, so a
 * missing/stale file never leaves a naked number on screen.
 *
 * Usage: npm run build:cpv-labels
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const TENDERS = join(PROJECT_ROOT, 'public/data/tenders.json')
const OUT = join(PROJECT_ROOT, 'public/data/cpv-labels.json')
const CPV_XML_ZIP = 'https://ted.europa.eu/documents/d/ted/cpv_2008_xml'
const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion'

/** Distinct bare 8-digit CPV codes referenced by any contract in tenders.json. */
function presentCodes(): Set<string> {
  const snap = JSON.parse(readFileSync(TENDERS, 'utf8'))
  const codes = new Set<string>()
  for (const c of snap.contracts || []) {
    for (const raw of c.cpvs || []) {
      const digits = String(raw).replace(/\D/g, '').slice(0, 8)
      if (digits.length === 8) codes.add(digits)
    }
  }
  return codes
}

/** Download the CPV zip and stream `cpv_2008.xml` out of it via the system unzip. */
async function fetchCpvXml(): Promise<string> {
  const res = await fetch(CPV_XML_ZIP, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) throw new Error(`${CPV_XML_ZIP} -> HTTP ${res.status}`)
  const zipBuf = Buffer.from(await res.arrayBuffer())
  const dir = mkdtempSync(join(tmpdir(), 'cpv-'))
  const zipPath = join(dir, 'cpv.zip')
  try {
    writeFileSync(zipPath, zipBuf)
    // `-p` streams a single entry to stdout. Info-ZIP handles the archive's
    // deflate64 entries where some libarchive builds don't.
    const xml = execFileSync('unzip', ['-p', zipPath, 'cpv_2008.xml'], {
      maxBuffer: 64 * 1024 * 1024,
    })
    return xml.toString('utf8')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** One pass over the XML → Map<8-digit code, ES label>. */
function parseEsLabels(xml: string): Map<string, string> {
  const out = new Map<string, string>()
  const blockRe = /<CPV\s+CODE="(\d{8})-\d">([\s\S]*?)<\/CPV>/g
  const esRe = /<TEXT\s+LANG="ES">([\s\S]*?)<\/TEXT>/
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(xml)) !== null) {
    const es = m[2].match(esRe)
    if (es) out.set(m[1], decodeEntities(es[1].trim()))
  }
  return out
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
}

async function main() {
  const wanted = presentCodes()
  console.log(`[cpv] ${wanted.size} distinct CPV codes referenced by tenders.json`)
  console.log('[cpv] downloading official EU CPV-2008 vocabulary…')
  const xml = await fetchCpvXml()
  const all = parseEsLabels(xml)
  console.log(`[cpv] parsed ${all.size} ES labels from cpv_2008.xml`)

  const codes: Record<string, string> = {}
  let hit = 0
  for (const code of [...wanted].sort()) {
    const label = all.get(code)
    if (label) {
      codes[code] = label
      hit++
    }
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      vocabulary: 'CPV-2008 (Common Procurement Vocabulary)',
      publisher: 'European Union / TED-SIMAP (open data)',
      url: CPV_XML_ZIP,
    },
    note: 'Trimmed to the codes present in tenders.json. Missing codes fall back to 2-digit division labels in src/lib/cpv.js.',
    count: hit,
    codes,
  }
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(
    `[cpv] wrote ${OUT} — ${hit}/${wanted.size} codes labelled (rest use division fallback)`,
  )
}

main().catch((err) => {
  console.error('[cpv] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})

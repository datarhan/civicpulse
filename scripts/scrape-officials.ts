#!/usr/bin/env tsx
/**
 * Scrape the live Riba-roja corporation page and produce:
 *   - public/data/officials.json   (canonical Official[] ⊕ curated corrections)
 *   - public/data/photos/<slug>.jpg  (mirrored portrait photos)
 *
 * Usage:
 *   npm run scrape:officials
 *
 * Runs idempotent: re-running refreshes everything. Photos that 404 on
 * the source site are silently skipped and `photoUrl` is left empty in
 * the JSON.
 *
 * ## The page lags the Pleno, and the file says so
 *
 * The council's page is the source of the roster, and it can be months behind
 * what the council itself already decided: a resignation of May 2025 was still
 * unreflected in September 2026. `officials-corrections.json` — curated, each
 * entry citing the acta verbatim — is applied HERE, after parsing, so the
 * published file carries both what was scraped and what the acta corrects.
 * `count` and `composition` derive from the corrected roster only. See
 * `src/scraper/officials-corrections.ts` for the rules, and
 * `npm run roster-correction -- --apply` for the days the page answers 403.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCorporacion } from '../src/scraper/corporacion'
import { composeOfficialsSnapshot } from '../src/scraper/officials-corrections'
import { CORRECTIONS_PUBLIC_PATH, loadCorrections } from './apply-officials-correction'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')

// 2026-05-25: ribarroja.es retired the plain-HTTP /ayuntamiento path; it
// now ECONNRESETs from undici instead of redirecting. Same content lives
// under HTTPS + /es/ — flagged when scrape:officials silently broke the
// nightly chain for 8 days (CLAUDE.md §Nightly refresh).
export const SOURCE_URL = 'https://www.ribarroja.es/es/ayuntamiento/corporacion_municipal'
const OUT_JSON = join(PROJECT_ROOT, 'public/data/officials.json')
const OUT_PHOTOS = join(PROJECT_ROOT, 'public/data/photos')

export async function fetchLiveHtml(): Promise<string> {
  const res = await fetch(SOURCE_URL, {
    headers: {
      // ribarroja.es's WAF (2026-05-25) drops any UA that doesn't lead
      // with a Mozilla token — bare `CivicPulse/0.1` triggers a TLS RST
      // mid-handshake. Keep the project identifier inside a Mozilla-
      // compatible envelope so we stay attributable but not blocked.
      'User-Agent':
        'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Source returned ${res.status} ${res.statusText}`)
  return res.text()
}

async function downloadPhoto(url: string, slug: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || 'image/jpeg'
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
    const filename = `${slug}.${ext}`
    const bytes = Buffer.from(await res.arrayBuffer())
    await writeFile(join(OUT_PHOTOS, filename), bytes)
    return `/data/photos/${filename}`
  } catch (err) {
    console.warn(`[photo] ${slug} failed:`, (err as Error).message)
    return null
  }
}

async function main() {
  console.log(`[scrape] fetching ${SOURCE_URL}`)
  const html = await fetchLiveHtml()

  console.log('[scrape] parsing HTML…')
  const parsed = parseCorporacion(html, { baseUrl: 'https://www.ribarroja.es' })
  console.log(`[scrape] parsed ${parsed.length} officials`)

  // Applied BEFORE the seat count is judged: a baja without its alta is a
  // 20-seat roster, and that is the number the warning below has to see.
  const corrections = loadCorrections()
  const payload = composeOfficialsSnapshot(parsed, corrections, {
    generatedAt: new Date().toISOString(),
    source: SOURCE_URL,
    correctionsFile: CORRECTIONS_PUBLIC_PATH,
  })
  if (
    corrections &&
    payload.corrections &&
    payload.corrections.bajas + payload.corrections.altas === 0
  ) {
    // A run must prove it did work: a corrections file with nothing in it is
    // either a mistake or a leftover, and both deserve a red rather than a pass.
    throw new Error('officials-corrections.json exists but carries no entry — fill it or delete it')
  }
  console.log(
    `[scrape] corrections: ${payload.corrections ? `${payload.corrections.bajas} baja(s) · ${payload.corrections.altas} alta(s)` : 'none'} → ${payload.count} sitting, ${payload.formerOfficials.length} former`,
  )

  if (payload.count < 21) {
    console.warn(
      `[scrape] WARNING: expected at least 21 officials (full council), got ${payload.count}`,
    )
  }

  await mkdir(OUT_PHOTOS, { recursive: true })

  // Mirror photos locally so the SPA has stable, CORS-friendly URLs. A row the
  // corrections added has no photo on the source page (photoUrl '' + photoNote)
  // and is left alone.
  for (const o of [...payload.officials, ...payload.formerOfficials]) {
    if (!o.photoUrl || o.photoUrl.startsWith('/')) continue
    const mirrored = await downloadPhoto(o.photoUrl, o.slug)
    if (mirrored) o.photoUrl = mirrored
  }

  await mkdir(dirname(OUT_JSON), { recursive: true })
  await writeFile(OUT_JSON, JSON.stringify(payload, null, 2) + '\n')

  console.log(`[scrape] wrote ${OUT_JSON}`)
  console.log('[scrape] composition:', payload.composition)
}

// Guarded so `fetchLiveHtml` / `SOURCE_URL` can be imported by the guard
// without the scraper running against public/data on import.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[scrape] failed:', err)
    process.exit(1)
  })
}

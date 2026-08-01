#!/usr/bin/env tsx
/**
 * Walk the last N days of the Boletín Oficial de la Provincia de València and
 * collect every anuncio published by the Ayuntamiento de Riba-roja de Túria.
 *
 * This is the canonical legal-notices channel for the municipality (the town's
 * own tablón de edictos is a Cl@ve-gated GWT app that never renders over HTTP).
 * Each day's whole-bulletin PDF is downloaded once, pdf-parsed, and scanned for
 * Riba-roja anuncios (see src/scraper/bop.ts). Idempotent; rolling 30-day
 * window, so a transient single-day fetch failure self-heals next run.
 *
 * Polite by design: one bulletin per day, throttled, identifying UA.
 *
 * Usage: npm run scrape:bop [-- --days 30]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseBopBulletin, type BopAnuncio, type BopSnapshot } from '../src/scraper/bop'
import { fetchBopBulletinText } from '../src/scraper/bop-fetch'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/bop.json')

const daysArg = process.argv.indexOf('--days')
const DAYS = daysArg >= 0 ? Math.max(1, Number(process.argv[daysArg + 1]) || 30) : 30
const THROTTLE_MS = 400

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function dayKeys(offset: number): { bulletinDate: string; isoDate: string } {
  const d = new Date()
  d.setDate(d.getDate() - offset)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return { bulletinDate: `${dd}/${mm}/${yyyy}`, isoDate: `${yyyy}-${mm}-${dd}` }
}

async function main() {
  const anuncios: BopAnuncio[] = []
  const seen = new Set<string>()
  let daysCovered = 0
  let fetchFailures = 0

  for (let i = 0; i < DAYS; i++) {
    const { bulletinDate, isoDate } = dayKeys(i)
    try {
      const text = await fetchBopBulletinText(bulletinDate)
      if (text === null) continue // no bulletin that day
      daysCovered += 1
      for (const a of parseBopBulletin(text, bulletinDate, isoDate)) {
        if (seen.has(a.regNumber)) continue
        seen.add(a.regNumber)
        anuncios.push(a)
      }
    } catch (err) {
      fetchFailures += 1
      console.warn(`[bop] ${bulletinDate} fetch failed: ${(err as Error).message}`)
    }
    await sleep(THROTTLE_MS)
  }

  // Refuse to clobber a good snapshot with an empty one when EVERY fetch broke
  // (network/upstream outage). Zero anuncios across days that DID load is a
  // legitimate "no Riba-roja notices lately" result and is written normally.
  if (daysCovered === 0) {
    console.error(
      `[bop] 0/${DAYS} bulletins loaded (${fetchFailures} failures) — refusing to overwrite bop.json`,
    )
    process.exit(1)
  }

  anuncios.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  const payload: BopSnapshot = {
    generatedAt: new Date().toISOString(),
    source: {
      name: 'Boletín Oficial de la Provincia de València',
      home: 'https://bop.dival.es/bop/',
      note: `Last ${DAYS} days · anuncios del Ayuntamiento de Riba-roja de Túria`,
    },
    stats: {
      total: anuncios.length,
      daysCovered,
      // Persisted so a partial outage is visible in the snapshot. It was
      // counted and then thrown away, so 21 of 30 days loaded looked exactly
      // like 30 of 30 to anyone reading the file — or the card, which says
      // "en los últimos 30 días".
      daysRequested: DAYS,
      fetchFailures,
      latestDate: anuncios[0]?.date ?? null,
    },
    anuncios,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(
    `[bop] wrote ${OUT} — ${anuncios.length} anuncio(s) across ${daysCovered} bulletin(s) (${DAYS}-day window)`,
  )
}

main().catch((err) => {
  console.error('[bop] failed:', err)
  process.exit(1)
})

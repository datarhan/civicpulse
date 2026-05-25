#!/usr/bin/env tsx
/**
 * Crawl the council's pleno index for the last few years, merge into one
 * newest-first list, write public/data/plenos.json.
 *
 * 2026-05-25: migrated source from ribarroja.es/plenos/<year> (HTTPS now
 * 404s for that path) to the Regmeet SaaS at
 * regmeet.com/aytoribarroja/sesiones_categorias/<entityHash>/<year>.
 * Existing plenoIds are preserved by matching on date so downstream files
 * (pleno-claims, pleno-findings, …) keep working without backfill.
 *
 * Usage: npm run scrape:plenos
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseRegmeetSessions, type PlenoItem } from '../src/scraper/plenos'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/plenos.json')

// Regmeet entity hash for Ajuntament de Riba-roja de Túria. Stable since
// the platform was wired in. Confirmed in the public nav at
// ribarroja.es/es/ayuntamiento — "Plenos" → external link.
const REGMEET_BASE = 'https://regmeet.com'
const REGMEET_ENTITY = '3b56be67439045acfbc7c1552d87a166'
// Most upstream hosts behind a WAF reject bare "CivicPulse/0.1" UAs with
// a TLS RST. The Mozilla-compatible envelope keeps us attributable but
// doesn't trip the filter.
const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'

async function loadExistingIdByDate(): Promise<Map<string, string>> {
  try {
    const buf = await readFile(OUT, 'utf8')
    const snap = JSON.parse(buf) as { items?: PlenoItem[] }
    const map = new Map<string, string>()
    for (const it of snap.items || []) {
      if (it.date && it.id) map.set(it.date, it.id)
    }
    return map
  } catch {
    return new Map()
  }
}

async function fetchYear(
  year: number,
  existingIdByDate: Map<string, string>,
): Promise<PlenoItem[]> {
  const url = `${REGMEET_BASE}/aytoribarroja/sesiones_categorias/${REGMEET_ENTITY}/${year}?idioma=castellano`
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
  })
  if (!res.ok) {
    console.warn(`[plenos] ${year}: HTTP ${res.status} ${res.statusText}`)
    return []
  }
  return parseRegmeetSessions(await res.text(), {
    year,
    baseUrl: REGMEET_BASE,
    existingIdByDate,
  })
}

async function main() {
  const existingIdByDate = await loadExistingIdByDate()
  const nowYear = new Date().getFullYear()
  const years = [nowYear, nowYear - 1, nowYear - 2, nowYear - 3]
  const all: PlenoItem[] = []
  for (const y of years) {
    console.log(`[plenos] fetching ${y}…`)
    const rows = await fetchYear(y, existingIdByDate)
    all.push(...rows)
  }

  // Dedup by id, keep newest-first.
  const byId = new Map<string, PlenoItem>()
  for (const it of all) if (!byId.has(it.id)) byId.set(it.id, it)
  const items = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date))

  const byYear: Record<number, number> = {}
  for (const it of items) {
    const y = parseInt(it.date.slice(0, 4), 10)
    byYear[y] = (byYear[y] || 0) + 1
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      baseUrl: REGMEET_BASE,
      platform: `Regmeet — aytoribarroja/sesiones_categorias/${REGMEET_ENTITY}/<year>`,
    },
    stats: {
      total: items.length,
      byYear,
      latestDate: items[0]?.date ?? null,
    },
    items,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  const reused = items.filter((it) => existingIdByDate.get(it.date) === it.id).length
  console.log(`[plenos] wrote ${OUT} — ${items.length} sesiones (reused ${reused} legacy ids)`)
}

main().catch((err) => {
  console.error('[plenos] failed:', err)
  process.exit(1)
})

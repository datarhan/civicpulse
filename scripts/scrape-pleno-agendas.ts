#!/usr/bin/env tsx
/**
 * Walk the pleno index (public/data/plenos.json), fetch each convocatoria
 * page, extract its ORDEN DEL DÍA, and write an enriched snapshot to
 *   public/data/plenos-agendas.json
 *
 * Polite crawl: 1.5 s between requests, timeout 15 s, no parallel fetches.
 *
 * Usage: npm run scrape:pleno-agendas
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePlenoAgenda, type PlenoAgendaItem } from '../src/scraper/pleno-agenda'
import { canonicalizeDepartment } from '../src/scraper/departments'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const OUT = join(PROJECT_ROOT, 'public/data/plenos-agendas.json')
const PLENOS = join(PROJECT_ROOT, 'public/data/plenos.json')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchPage(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech ingestion',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const ab = await res.arrayBuffer()
    return Buffer.from(ab)
  } catch {
    return null
  }
}

interface EnrichedPleno {
  id: string
  date: string
  title: string
  kind: string
  link: string
  agenda: PlenoAgendaItem[]
  agendaCount: number
  departments: string[]
  hasRuegos: boolean
}

async function main() {
  const index = JSON.parse(await readFile(PLENOS, 'utf8'))
  const plenos: any[] = index.items || []
  const take = Math.min(30, plenos.length) // cap first run to 30 most-recent

  console.log(`[pleno-agendas] fetching ${take} plenos (of ${plenos.length})`)
  const results: EnrichedPleno[] = []
  for (let i = 0; i < take; i++) {
    const p = plenos[i]
    process.stdout.write(`[${i + 1}/${take}] ${p.date} ${p.title.slice(0, 50)} … `)
    const buf = await fetchPage(p.link)
    let agenda: PlenoAgendaItem[] = []
    if (buf) {
      const parsed = parsePlenoAgenda(buf)
      agenda = parsed?.items ?? []
    }
    const departments = Array.from(
      new Set(agenda.map((a) => a.department).filter(Boolean) as string[]),
    )
    const hasRuegos = agenda.some((a) => a.section === 'ruegos')
    console.log(`${agenda.length} items`)
    results.push({
      id: p.id,
      date: p.date,
      title: p.title,
      kind: p.kind,
      link: p.link,
      agenda,
      agendaCount: agenda.length,
      departments,
      hasRuegos,
    })
    await sleep(1500)
  }

  // Rank department frequency for quick dashboards.
  const deptCount: Record<string, number> = {}
  const itemCount = results.reduce((s, r) => s + r.agendaCount, 0)
  for (const r of results) {
    for (const d of r.departments) deptCount[d] = (deptCount[d] || 0) + 1
  }
  const topDepartments = Object.entries(deptCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([department, count]) => ({
      department,
      count,
      departmentSlug: canonicalizeDepartment(department),
    }))

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      baseUrl: 'http://www.ribarroja.es',
      description:
        "Ayuntamiento de Riba-roja de Túria — páginas individuales de 'Pleno ordinario/extraordinario' con la convocatoria y orden del día.",
    },
    stats: {
      plenosFetched: results.length,
      agendaItemsTotal: itemCount,
      plenosWithRuegos: results.filter((r) => r.hasRuegos).length,
      uniqueDepartments: Object.keys(deptCount).length,
    },
    topDepartments,
    plenos: results,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(
    `[pleno-agendas] wrote ${OUT} — ${results.length} plenos · ${itemCount} items · ${Object.keys(deptCount).length} departamentos`,
  )
}

main().catch((err) => {
  console.error('[pleno-agendas] failed:', err)
  process.exit(1)
})

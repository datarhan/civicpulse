/**
 * Deterministic queja ↔ contract relations engine — CLI.
 *
 *   npm run scrape:queja-contract-relations
 *
 * Reads the current JSON snapshots (bot quejas.json, tenders.json,
 * tender-geo.json, promises.json), normalizes them onto the engine's input
 * shapes, and writes scored links to public/data/queja-contract-relations.json.
 * Deterministic + offline: NO LLM, NO network. Honest empty output when there
 * are no quejas (or under a LOREG freeze).
 *
 * `normalizeQueja` + `buildRelContracts` are exported for unit tests — they are
 * the adapters that must track the live snapshot schemas (the previous
 * correlator rotted here: it read `category`/`neighborhood`/`createdAt` while the
 * bot emits `service_code`/`address_string`/`requested_datetime`).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildRelations } from '../src/scraper/queja-contract-relations'
import type { RelQueja, RelContract } from '../src/scraper/queja-contract-relations'
import { canonicalizeDepartment } from '../src/scraper/departments'
import { validatePromisesSnapshot, isFrozen } from '../src/scraper/promises'

const QUEJAS = resolve('public/data/quejas.json')
const TENDERS = resolve('public/data/tenders.json')
const GEO = resolve('public/data/tender-geo.json')
const PROMISES = resolve('public/data/promises.json')
const OUT = resolve('public/data/queja-contract-relations.json')

function s(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

/**
 * Map one raw quejas.json row (Open311-flavoured bot snapshot) → RelQueja, or
 * null when it lacks an id or a timestamp. Reuses the department taxonomy so
 * `concejalia_area` folds onto a canonical slug.
 */
export function normalizeQueja(raw: Record<string, unknown>): RelQueja | null {
  const id = s(raw.service_request_id)
  const createdRaw = s(raw.requested_datetime)
  if (!id || !createdRaw) return null
  const created = new Date(createdRaw.replace(' ', 'T'))
  if (Number.isNaN(created.getTime())) return null
  return {
    id,
    serviceCode: s(raw.service_code),
    department: canonicalizeDepartment(s(raw.concejalia_area) || s(raw.service_name) || null),
    placeSlug: s(raw.address_string) || null,
    description: s(raw.description),
    createdAt: created.toISOString(),
  }
}

/**
 * Project awarded contracts onto RelContract. Situated places come from
 * tender-geo `assignments[].place` — an OBJECT `{name, sourceId, …}`, so we push
 * both the folded name and the sourceId slug — plus its barrio `zones[]`. The
 * expediente (absent on the contract row) is joined from the `tenders[]` twin by
 * shared id, which makes the ironclad expediente signal actually fire.
 */
export function buildRelContracts(
  contracts: Record<string, unknown>[],
  geo: { assignments?: Record<string, unknown>[] },
  tenders: Record<string, unknown>[],
): RelContract[] {
  const expById = new Map<string, string>()
  for (const t of tenders) {
    const id = s(t.id)
    const doc = s(t.documentNumber)
    if (id && doc) expById.set(id, doc)
  }
  const geoById = new Map<string, { places: string[]; zones: string[] }>()
  for (const a of geo.assignments ?? []) {
    const id = s(a.id)
    if (!id) continue
    const e = geoById.get(id) ?? { places: [], zones: [] }
    const place = a.place as Record<string, unknown> | undefined
    if (place) {
      if (place.name) e.places.push(s(place.name))
      if (place.sourceId) e.places.push(s(place.sourceId))
    }
    for (const z of (a.zones as unknown[]) ?? []) e.zones.push(s(z))
    geoById.set(id, e)
  }
  return contracts
    .filter((c) => s(c.status) === 'awarded')
    .map((c) => {
      const id = s(c.id)
      const g = geoById.get(id) ?? { places: [], zones: [] }
      return {
        id,
        permalink: s(c.permalink),
        title: s(c.title),
        department: canonicalizeDepartment(s(c.categoryTitle) || null),
        cpvs: Array.isArray(c.cpvs) ? (c.cpvs as unknown[]).map(s) : [],
        places: g.places,
        zones: g.zones,
        awardDate: s(c.awardDate) || null,
        amount: typeof c.finalAmount === 'number' ? c.finalAmount : null,
        assignee: s(c.assignee) || null,
        expediente: expById.get(id) ?? null,
      }
    })
}

function main(): void {
  const quejasFile = existsSync(QUEJAS)
    ? (JSON.parse(readFileSync(QUEJAS, 'utf8')) as { items?: Record<string, unknown>[] })
    : { items: [] }
  const quejas = (quejasFile.items ?? [])
    .map(normalizeQueja)
    .filter((x): x is RelQueja => x !== null)

  const tendersFile = existsSync(TENDERS)
    ? (JSON.parse(readFileSync(TENDERS, 'utf8')) as {
        contracts?: Record<string, unknown>[]
        tenders?: Record<string, unknown>[]
      })
    : { contracts: [], tenders: [] }
  const geoFile = existsSync(GEO)
    ? (JSON.parse(readFileSync(GEO, 'utf8')) as { assignments?: Record<string, unknown>[] })
    : { assignments: [] }
  const contracts = buildRelContracts(
    tendersFile.contracts ?? [],
    geoFile,
    tendersFile.tenders ?? [],
  )

  const frozen = existsSync(PROMISES)
    ? isFrozen(validatePromisesSnapshot(readFileSync(PROMISES, 'utf8')))
    : false

  const result = buildRelations(quejas, contracts, { frozen })
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'queja-contract-relations engine v1 (deterministic)',
    stats: result.stats,
    links: result.links,
  }
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n')
  process.stdout.write(
    `[relations] ${result.links.length} link(s) · A=${result.stats.tierA} B=${result.stats.tierB} · ` +
      `quejas=${result.stats.quejasScanned} contracts=${result.stats.contractsScanned}` +
      `${result.stats.reason ? ' · ' + result.stats.reason : ''}\n`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}

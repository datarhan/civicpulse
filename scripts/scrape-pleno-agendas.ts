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
import {
  classifyAgendaRun,
  parsePlenoAgenda,
  mergeAgendaPlenos,
  tallyDepartments,
  type PlenoAgendaItem,
  type EnrichedPleno,
} from '../src/scraper/pleno-agenda'
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
        // Browser-like UA: regmeet.com (the post-2026-05 plenos upstream) WAF
        // rejects the bare "CivicPulse/…" UA. Matches scrape-plenos.ts.
        'User-Agent':
          'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.warn(`\n[pleno-agendas] ${url} -> HTTP ${res.status}`)
      return null
    }
    const ab = await res.arrayBuffer()
    return Buffer.from(ab)
  } catch (err) {
    // A silent null here once hid a WAF block for days (the 0-items
    // incident fixed in f4fa424) — always leave a trace.
    console.warn(`\n[pleno-agendas] ${url} failed: ${(err as Error).message}`)
    return null
  }
}

/**
 * Archived fallback. regmeet blackholes GitHub-runner IPs and goes fully
 * unreachable for stretches (2026-08-01: connection refused from three
 * independent networks while answering ping), so the live fetch alone leaves
 * permanent holes. The Wayback Machine has ~120 of these session pages and
 * they parse identically — `id_` returns the raw capture with no toolbar.
 */
async function fetchArchived(url: string): Promise<Buffer | null> {
  const base = url.split('?')[0]
  try {
    const cdx = await fetch(
      `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(base)}*` +
        `&output=text&fl=timestamp,original&filter=statuscode:200&limit=-3`,
      { signal: AbortSignal.timeout(30_000) },
    )
    if (!cdx.ok) return null
    const rows = (await cdx.text())
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => l.split(' '))
    if (rows.length === 0) return null
    // limit=-3 returns the newest captures last; take the newest.
    const [timestamp, original] = rows[rows.length - 1]
    const res = await fetch(`https://web.archive.org/web/${timestamp}id_/${original}`, {
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch (err) {
    console.warn(`\n[pleno-agendas] archive lookup failed: ${(err as Error).message}`)
    return null
  }
}

/** Sessions this recent are always re-fetched — a convocatoria can be edited. */
const REFRESH_NEWEST = 6

async function readExisting(): Promise<EnrichedPleno[]> {
  try {
    const prev = JSON.parse(await readFile(OUT, 'utf8')) as { plenos?: EnrichedPleno[] }
    return Array.isArray(prev.plenos) ? prev.plenos : []
  } catch {
    return []
  }
}

async function main() {
  const index = JSON.parse(await readFile(PLENOS, 'utf8'))
  const plenos: any[] = [...(index.items || [])].sort((a, b) => (a.date < b.date ? 1 : -1))
  const existing = await readExisting()
  const storedCount = new Map(existing.map((p) => [p.id, p.agendaCount]))

  // Walk EVERY session, not the 30 most-recent. The old cap left 29 of 61
  // pleno pages with no orden del día, and because the snapshot was rebuilt
  // rather than merged, each slide of the window silently dropped the oldest
  // covered sessions. Already-known agendas are skipped so the nightly still
  // only makes a handful of requests.
  const targets = plenos.filter((p, i) => i < REFRESH_NEWEST || !(storedCount.get(p.id) > 0))
  console.log(
    `[pleno-agendas] ${plenos.length} sessions · ${existing.length} already stored · ` +
      `${targets.length} to fetch (${REFRESH_NEWEST} newest always refreshed)`,
  )

  const results: EnrichedPleno[] = []
  let fetchFailures = 0
  let fromArchive = 0
  // Lo leído del ORIGEN VIVO, contado aparte de lo rescatado del archivo. Sin
  // esta mitad la puerta del final no distingue «regmeet respondió» de «la
  // Wayback Machine me dio historia vieja», y el 3-sep-2026 salió en verde con
  // el origen entero caído. Ver `classifyAgendaRun`.
  let fromLive = 0
  // The live host is either up or it isn't; after N consecutive failures stop
  // paying its 15 s timeout on every remaining session and run archive-only.
  // Aborting outright (the old behaviour) meant a regmeet outage blocked the
  // backfill entirely, even for sessions the Wayback Machine could serve.
  const MAX_CONSECUTIVE_FETCH_FAILURES = 3
  let consecutiveFetchFailures = 0
  let liveDown = false

  for (let i = 0; i < targets.length; i++) {
    const p = targets[i]
    process.stdout.write(`[${i + 1}/${targets.length}] ${p.date} ${p.title.slice(0, 46)} … `)

    let buf: Buffer | null = null
    let archived = false
    if (!liveDown) {
      buf = await fetchPage(p.link)
      consecutiveFetchFailures = buf ? 0 : consecutiveFetchFailures + 1
      if (!buf && consecutiveFetchFailures >= MAX_CONSECUTIVE_FETCH_FAILURES && !liveDown) {
        liveDown = true
        console.warn(
          `\n[pleno-agendas] ${consecutiveFetchFailures} consecutive live pages unreachable — ` +
            `upstream down or blocking this IP range; falling back to the Wayback Machine ` +
            `for the remaining ${targets.length - i - 1} session(s)`,
        )
      }
    }
    if (!buf) {
      buf = await fetchArchived(p.link)
      archived = buf !== null
    }
    if (!buf) fetchFailures += 1

    const agenda: PlenoAgendaItem[] = buf ? (parsePlenoAgenda(buf)?.items ?? []) : []
    const departments = Array.from(
      new Set(agenda.map((a) => a.department).filter(Boolean) as string[]),
    )
    if (agenda.length > 0) {
      if (archived) fromArchive += 1
      else fromLive += 1
    }
    console.log(`${agenda.length} items${archived ? ' (archivo)' : ''}`)
    results.push({
      id: p.id,
      date: p.date,
      title: p.title,
      kind: p.kind,
      link: p.link,
      agenda,
      agendaCount: agenda.length,
      departments,
      hasRuegos: agenda.some((a) => a.section === 'ruegos'),
    })
    await sleep(1500)
  }

  // Merge over the stored snapshot: coverage only ever grows, and an empty
  // walk can neither erase a good agenda nor publish a session as having
  // zero points (the f4fa424 incident).
  const { plenos: merged, carriedForward, refreshed } = mergeAgendaPlenos(existing, results)

  // Re-derive the department of EVERY stored item from its own title, not just
  // the ones fetched this run. departmentSlug is stamped at parse time, so a
  // rule improvement used to reach only sessions that happened to be refetched
  // — and with regmeet down that is almost none. Adding the Valencian
  // department names (the corporation debates in Valencian; the table was
  // Spanish-only) moved attribution from 34/362 to a real figure only once
  // history was re-derived. Titles are stored, so this costs nothing and is
  // idempotent.
  let rederived = 0
  for (const p of merged) {
    for (const it of p.agenda) {
      const slug = canonicalizeDepartment(it.department || it.title)
      if (slug !== it.departmentSlug) {
        it.departmentSlug = slug
        if (slug) rederived += 1
      }
    }
    // Built from the CANONICAL slug, not the raw `department` string. 57 of
    // 377 items carry a departmentSlug re-derived from their title while
    // `department` stays null, and keying on the raw field dropped every one of
    // them here — so an item counted as a councillor's council business on
    // /cargos/:slug appeared in no department on the session page.
    p.departments = Array.from(
      new Set(p.agenda.map((a) => a.departmentSlug || a.department).filter(Boolean) as string[]),
    )
  }
  if (rederived > 0) console.log(`[pleno-agendas] re-derived ${rederived} department tag(s)`)
  // Numerador y denominador salen del MISMO recorrido. La tarjeta de /plenos
  // rotula el total de puntos y pinta debajo una fila de departamentos que
  // cubre una cuarta parte de él; con los dos contados aparte, nada garantiza
  // que hablen de lo mismo. `tallyDepartments` devuelve ambos y está probado.
  const tally = tallyDepartments(merged)
  const { deptCount, topDepartments } = tally
  const itemCount = tally.itemsTotal

  if (itemCount === 0) {
    console.error(
      `[pleno-agendas] 0 agenda items across ${targets.length} sessions ` +
        `(${fetchFailures} fetch failures) — leaving the existing snapshot untouched`,
    )
    process.exit(1)
  }
  if (fetchFailures > 0) {
    console.warn(`[pleno-agendas] ${fetchFailures}/${targets.length} session pages unavailable`)
  }
  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      baseUrl: 'https://regmeet.com',
      description:
        'Ayuntamiento de Riba-roja de Túria — sesiones plenarias en regmeet.com (aytoribarroja); cada página individual publica el orden del día en la tabla #tableOrdenDia. El departamento se infiere del título del punto.',
    },
    stats: {
      plenosFetched: merged.length,
      agendaItemsTotal: itemCount,
      // Cuántos de esos puntos llevan departamento. Sin este número la
      // tarjeta de /plenos rotula el total y enseña debajo una fila que sólo
      // clasifica una parte, sin decir cuál: el 2026-09-03 eran 109 de 399.
      agendaItemsWithDepartment: tally.itemsWithDepartment,
      plenosWithRuegos: merged.filter((r) => r.hasRuegos).length,
      uniqueDepartments: Object.keys(deptCount).length,
      // Coverage is published so the UI can tell "this session has no agenda
      // yet" apart from "this session had no agenda points".
      sessionsTotal: plenos.length,
      sessionsWithAgenda: merged.length,
      refreshedThisRun: refreshed,
      // Las dos procedencias, por separado y siempre. Su SUMA es lo que dejó
      // pasar una pasada con el origen muerto (3-sep-2026).
      recoveredFromLive: fromLive,
      carriedForward,
      recoveredFromArchive: fromArchive,
    },
    topDepartments,
    plenos: merged,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n')
  console.log(
    `[pleno-agendas] wrote ${OUT} — ${merged.length}/${plenos.length} sessions · ${itemCount} items · ` +
      `${Object.keys(deptCount).length} departamentos (refrescadas ${refreshed}, de archivo ${fromArchive})`,
  )

  // La puerta, en cuatro desenlaces. Se cierra DESPUÉS de escribir, igual que
  // antes: arrastrar lo ya visto deja el fichero íntegro, así que fallar en
  // alto no publica un hueco.
  //
  // Era `liveDown && refreshed === 0`, y `refreshed` suma lo vivo y lo del
  // archivo. El 3-sep-2026 regmeet.com estaba entero caído — ECONNREFUSED
  // desde tres redes distintas — y la pasada salió 0 en verde porque la
  // Wayback Machine devolvió tres sesiones viejas. Los plenos del 6 y del 27
  // de julio se quedaron sin orden del día sin que saltara nada.
  const desenlace = classifyAgendaRun({ attempted: targets.length, fromLive, fromArchive })
  if (!desenlace.ok) {
    console.error(`[pleno-agendas] ${desenlace.outcome}: ${desenlace.motivo}`)
    process.exit(1)
  }
  console.log(`[pleno-agendas] ${desenlace.outcome}: ${desenlace.motivo}`)
}

main().catch((err) => {
  console.error('[pleno-agendas] failed:', err)
  process.exit(1)
})

#!/usr/bin/env tsx
/**
 * Daily link-rot audit + Wayback archival job (Package 3).
 *
 * Walks `public/data/press-claims-suggestions.json`, HEAD-checks each
 * unique `articleUrl`, and (when --archive is passed OR the URL is
 * dead) attempts to find/save a Wayback snapshot. Writes the
 * findings to `public/data/press-link-rot.json` for the lab page.
 *
 * Behaviour:
 *   · Alive URLs (200 / 30x) → status='alive'. No archive call unless
 *     --archive is passed.
 *   · Dead URLs (4xx / 5xx) → status='dead'. Always tries to find
 *     an existing Wayback snapshot via the availability API.
 *   · Unreachable URLs (network errors) → status='error'.
 *   · The run remembers: a copy an earlier run found (read from the snapshot
 *     on disk before it is overwritten) is kept until a lookup finds another,
 *     because the Availability API refuses or answers «none» for URLs that
 *     have one. See `maybeArchive`. A `--limit` run therefore forgets the
 *     copies of the URLs it leaves out — it is a smoke test, not a refresh.
 *
 * Usage:
 *   npm run audit-press-links               # check only
 *   npm run audit-press-links -- --archive  # archive every URL
 *   npm run audit-press-links -- --limit 20 # cap at 20 (smoke-test)
 *
 * Rate-limited at 1.2s/request when --archive is set (Wayback SPN
 * tolerates ~6/min anonymously); 200ms otherwise. Idempotent —
 * re-running just refreshes the snapshot date and any newly-dead
 * URLs.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { archiveOnWayback, findExistingSnapshot, type WaybackResult } from '../src/scraper/wayback'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const IN = join(PROJECT_ROOT, 'public/data/press-claims-suggestions.json')
// Every article /laboratorio renders, not only the handful the extractor has
// audited. Auditing 8 URLs out of 156 meant that for 60 of the 67 cards on the
// page `linkRot` was null, and a dead link rendered as a perfectly normal one:
// the red ⚠︎ only appears when a row exists and says `dead`.
const PRESS_IN = join(PROJECT_ROOT, 'public/data/press.json')
// The promise tracker's citations. These are the most legally material links in
// the project: each is the verbatim quote attributed to a named party, and 12 of
// the 24 promises cite a `news.google.com` RSS redirector — an opaque token that
// resolves today and is known to expire. When one dies, the quote becomes
// unverifiable, and the right-of-reply flow depends on the affected party being
// able to check what they are said to have said. The press lab has had Wayback
// archival for months; /promesas had none.
const PROMISES_IN = join(PROJECT_ROOT, 'public/data/promises.json')
const OUT = join(PROJECT_ROOT, 'public/data/press-link-rot.json')

const HEAD_TIMEOUT_MS = 12_000
const UA = 'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) civic-tech link-audit'

function getFlag(name: string): string | null {
  const i = process.argv.indexOf(name)
  if (i < 0) return null
  return process.argv[i + 1] ?? null
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type LinkStatus = 'alive' | 'dead' | 'error'

interface PressClaimsSnapshot {
  items?: Array<{ articleUrl?: string; articleSource?: string }>
}

/** What TODAY's Wayback lookup said about one URL. `failed` is «could not look», never «no copy». */
export type ArchiveLookup = 'found' | 'saved' | 'none' | 'failed'

interface KnownCopy {
  archivedUrl: string | null
  archivedAt: string | null
}

interface ArchiveColumns extends KnownCopy {
  archiveLookup: ArchiveLookup
  /** The copy shown was found by an EARLIER run; today's lookup (see `archiveLookup`) did not produce one. */
  archiveCarried?: true
}

interface LinkRow extends ArchiveColumns {
  articleUrl: string
  status: LinkStatus
  httpStatus: number | null
  articleSource: string | null
  checkedAt: string
  error: string | null
}

/**
 * What the previous run knew: the rows of the snapshot on disk that had a copy.
 * No snapshot, or an unreadable one, is no memory — not a crash.
 */
export function knownCopies(previousSnapshot: string | null): Map<string, KnownCopy> {
  const known = new Map<string, KnownCopy>()
  if (!previousSnapshot) return known
  let items: unknown
  try {
    items = (JSON.parse(previousSnapshot) as { items?: unknown }).items
  } catch {
    return known
  }
  if (!Array.isArray(items)) return known
  for (const r of items as Array<Partial<LinkRow>>) {
    if (typeof r?.articleUrl === 'string' && typeof r.archivedUrl === 'string' && r.archivedUrl) {
      known.set(r.articleUrl, { archivedUrl: r.archivedUrl, archivedAt: r.archivedAt ?? null })
    }
  }
  return known
}

/** A run proves what it did: a low `archived` beside a high `lookupFailed` is «could not look today», not «few copies». */
export function archiveStats(
  rows: ReadonlyArray<Pick<ArchiveColumns, 'archivedUrl' | 'archiveLookup' | 'archiveCarried'>>,
): { archived: number; archivedCarried: number; lookupNone: number; lookupFailed: number } {
  const n = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length
  return {
    archived: n((r) => Boolean(r.archivedUrl)),
    archivedCarried: n((r) => r.archiveCarried === true),
    lookupNone: n((r) => r.archiveLookup === 'none'),
    lookupFailed: n((r) => r.archiveLookup === 'failed'),
  }
}

async function getCheck(
  url: string,
): Promise<{ status: LinkStatus; httpStatus: number | null; error: string | null }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': UA, Range: 'bytes=0-1', Accept: '*/*' },
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (res.status >= 200 && res.status < 400) {
      return { status: 'alive', httpStatus: res.status, error: null }
    }
    return { status: 'dead', httpStatus: res.status, error: `HTTP ${res.status}` }
  } catch (err) {
    clearTimeout(timer)
    return { status: 'error', httpStatus: null, error: (err as Error).message }
  }
}

async function headCheck(
  url: string,
): Promise<{ status: LinkStatus; httpStatus: number | null; error: string | null }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': UA, Accept: '*/*' },
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (res.status >= 200 && res.status < 400) {
      return { status: 'alive', httpStatus: res.status, error: null }
    }
    if (res.status === 405 || res.status === 501) {
      // Method not allowed → fall back to GET with a tiny range.
      return await getCheck(url)
    }
    return { status: 'dead', httpStatus: res.status, error: `HTTP ${res.status}` }
  } catch (err) {
    clearTimeout(timer)
    return { status: 'error', httpStatus: null, error: (err as Error).message }
  }
}

/** The two Wayback calls, injectable so the policy below is tested without a network. */
interface WaybackIo {
  find: (url: string) => Promise<WaybackResult>
  save: (url: string) => Promise<WaybackResult>
}
const WAYBACK_LIVE: WaybackIo = {
  find: (url) => findExistingSnapshot(url),
  save: (url) => archiveOnWayback(url),
}

/**
 * The archive columns of one row.
 *
 * `known` is the copy an earlier run found. **A Wayback copy does not vanish**,
 * and the Availability API fails to report one in two ways, both seen on
 * 2026-09-20: it refuses the lookup (429), or it answers a clean 200 with
 * `archived_snapshots: {}` for a URL that has a capture. Measured over fourteen
 * runs of this snapshot, without a network: of the eleven URLs that showed a
 * copy in some run, nine «lost» it in a later one and got it back afterwards —
 * on /promesas, a citation's archived-copy link appearing and disappearing from
 * one day to the next. So the known copy stays until a lookup finds another,
 * the row says it is carried and what Wayback said today, and no save is spent
 * on a page that has one — least of all a dead one, where the save would
 * archive the error page. The limit: a capture Wayback has since excluded keeps
 * being linked, and nothing checks those links yet.
 */
export async function maybeArchive(
  url: string,
  status: LinkStatus,
  forceArchive: boolean,
  io: WaybackIo = WAYBACK_LIVE,
  known?: KnownCopy,
): Promise<ArchiveColumns> {
  const existing = await io.find(url)
  if (existing.ok) {
    return {
      archivedUrl: existing.archivedUrl,
      archivedAt: existing.archivedAt,
      archiveLookup: 'found',
    }
  }
  // «Could not look» is not «no copy». A refused lookup (the Availability API
  // answers 429 for hours at a time) used to fall through to a save — refused as
  // well, and each refusal extends the block for every job on this IP.
  const archiveLookup: ArchiveLookup = existing.lookup === 'none' ? 'none' : 'failed'
  if (known?.archivedUrl) return { ...known, archiveLookup, archiveCarried: true }
  const nothing = { archivedUrl: null, archivedAt: null, archiveLookup }
  if (archiveLookup === 'failed') return nothing
  // No existing snapshot. Save Page Now is rate-limited; only spend a slot
  // when forced OR the original is dead (so users still have a copy).
  if (!forceArchive && status === 'alive') return nothing
  const saved = await io.save(url)
  if (saved.ok && saved.archivedUrl) {
    return { archivedUrl: saved.archivedUrl, archivedAt: saved.archivedAt, archiveLookup: 'saved' }
  }
  return nothing
}

async function main() {
  const forceArchive = process.argv.includes('--archive')
  const limit = Number(getFlag('--limit')) || 0

  const claimsRaw = await readFile(IN, 'utf8').catch(() => null)
  if (!claimsRaw) {
    console.error(`[audit-press-links] ${IN} not found. Run npm run extract:press-claims first.`)
    process.exit(2)
  }
  const claims = (JSON.parse(claimsRaw) as PressClaimsSnapshot).items ?? []

  const urls = new Map<string, string | null>()
  // Claim-bearing articles first: those are the ones we quote, so if a limit
  // truncates the run they are the ones that must be checked.
  for (const c of claims) {
    if (c.articleUrl && !urls.has(c.articleUrl)) {
      urls.set(c.articleUrl, c.articleSource ?? null)
    }
  }
  const promisesRaw = await readFile(PROMISES_IN, 'utf8').catch(() => null)
  if (promisesRaw) {
    const promises =
      (
        JSON.parse(promisesRaw) as {
          items?: Array<{
            source?: { url?: string; publisher?: string }
            evidence?: Array<{ url?: string }>
          }>
        }
      ).items ?? []
    for (const p of promises) {
      const u = p.source?.url
      if (u && !urls.has(u)) urls.set(u, p.source?.publisher ?? null)
      for (const e of p.evidence ?? []) {
        if (e.url && !urls.has(e.url)) urls.set(e.url, p.source?.publisher ?? null)
      }
    }
  }

  const pressRaw = await readFile(PRESS_IN, 'utf8').catch(() => null)
  if (pressRaw) {
    const press =
      (JSON.parse(pressRaw) as { items?: Array<{ link?: string; source?: string }> }).items ?? []
    for (const a of press) {
      if (a.link && !urls.has(a.link)) urls.set(a.link, a.source ?? null)
    }
  }
  const allUrls = Array.from(urls.entries())
  const targetUrls = limit > 0 ? allUrls.slice(0, limit) : allUrls
  console.log(
    `[audit-press-links] checking ${targetUrls.length} unique URL(s)` +
      (forceArchive ? ' · archiving every URL' : '') +
      (limit > 0 ? ` · limit=${limit}` : ''),
  )

  // What the run before this one knew, read before the file is overwritten.
  const known = knownCopies(await readFile(OUT, 'utf8').catch(() => null))

  const rows: LinkRow[] = []
  const delayMs = forceArchive ? 1200 : 200
  for (const [url, articleSource] of targetUrls) {
    const head = await headCheck(url)
    const archive = await maybeArchive(url, head.status, forceArchive, WAYBACK_LIVE, known.get(url))
    rows.push({
      articleUrl: url,
      status: head.status,
      httpStatus: head.httpStatus,
      articleSource,
      ...archive,
      checkedAt: new Date().toISOString(),
      error: head.error,
    })
    await delay(delayMs)
  }

  const stats = {
    total: rows.length,
    alive: rows.filter((r) => r.status === 'alive').length,
    dead: rows.filter((r) => r.status === 'dead').length,
    error: rows.filter((r) => r.status === 'error').length,
    ...archiveStats(rows),
  }
  const snap = {
    generatedAt: new Date().toISOString(),
    source: {
      description:
        'Daily press-article link-rot audit + Wayback Machine archival index. ' +
        'Used to surface dead source URLs on /laboratorio and let curators cite the snapshot instead.',
    },
    stats,
    items: rows,
  }

  await mkdir(dirname(OUT), { recursive: true })
  await writeFile(OUT, JSON.stringify(snap, null, 2) + '\n')

  console.log(
    `[audit-press-links] wrote ${OUT} · total=${stats.total} ` +
      `alive=${stats.alive} dead=${stats.dead} error=${stats.error} archived=${stats.archived} ` +
      `(carried=${stats.archivedCarried}) · wayback: none=${stats.lookupNone} could-not-look=${stats.lookupFailed}`,
  )
}

// Guarded so `maybeArchive` can be unit-tested without the audit running against
// 170-odd live URLs on import (same shape as journalist-archive-sources.ts).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[audit-press-links] failed:', err)
    process.exit(1)
  })
}

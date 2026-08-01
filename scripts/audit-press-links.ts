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

import { archiveOnWayback, findExistingSnapshot } from '../src/scraper/wayback'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, '..')
const IN = join(PROJECT_ROOT, 'public/data/press-claims-suggestions.json')
// Every article /laboratorio renders, not only the handful the extractor has
// audited. Auditing 8 URLs out of 156 meant that for 60 of the 67 cards on the
// page `linkRot` was null, and a dead link rendered as a perfectly normal one:
// the red ⚠︎ only appears when a row exists and says `dead`.
const PRESS_IN = join(PROJECT_ROOT, 'public/data/press.json')
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

type LinkStatus = 'alive' | 'dead' | 'error'

interface PressClaimsSnapshot {
  items?: Array<{ articleUrl?: string; articleSource?: string }>
}

interface LinkRow {
  articleUrl: string
  status: LinkStatus
  httpStatus: number | null
  articleSource: string | null
  archivedUrl: string | null
  archivedAt: string | null
  checkedAt: string
  error: string | null
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

async function maybeArchive(
  url: string,
  status: LinkStatus,
  forceArchive: boolean,
): Promise<{ archivedUrl: string | null; archivedAt: string | null }> {
  const existing = await findExistingSnapshot(url)
  if (existing.ok) {
    return { archivedUrl: existing.archivedUrl, archivedAt: existing.archivedAt }
  }
  // No existing snapshot. Save Page Now is rate-limited; only spend a slot
  // when forced OR the original is dead (so users still have a copy).
  if (!forceArchive && status === 'alive') return { archivedUrl: null, archivedAt: null }
  const saved = await archiveOnWayback(url)
  return { archivedUrl: saved.archivedUrl, archivedAt: saved.ok ? saved.archivedAt : null }
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

  const rows: LinkRow[] = []
  const delayMs = forceArchive ? 1200 : 200
  for (const [url, articleSource] of targetUrls) {
    const head = await headCheck(url)
    const archive = await maybeArchive(url, head.status, forceArchive)
    rows.push({
      articleUrl: url,
      status: head.status,
      httpStatus: head.httpStatus,
      articleSource,
      archivedUrl: archive.archivedUrl,
      archivedAt: archive.archivedAt,
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
    archived: rows.filter((r) => r.archivedUrl).length,
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
      `alive=${stats.alive} dead=${stats.dead} error=${stats.error} archived=${stats.archived}`,
  )
}

main().catch((err) => {
  console.error('[audit-press-links] failed:', err)
  process.exit(1)
})

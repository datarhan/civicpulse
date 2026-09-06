/**
 * Curator-seeded sources for a journalist-agent run.
 *
 * The investigative pass (skill `investigar-cargo`) finds documents the agent
 * would not find on its own: press that blocks the crawler, a BOP PDF, a 2011
 * candidacy. They cannot ride in the assignment `brief` — the brief is PUBLIC
 * (served at /data/journalist-assignments.json and rendered on
 * /laboratorio/agentes) — so they travel in a file under editorial/ that
 * `npm run journalist:run -- <id> --seed <path>` reads.
 *
 * Three rules, each with a reason:
 *   · `trust` is never accepted from the file. It always comes from the
 *     domain table (domain-trust.ts), so a curator cannot launder an unknown
 *     host into a high-trust citation by typing a word.
 *   · A `chrome` capture (a page the crawler cannot reach) must carry the
 *     verbatim excerpt read in the browser and when it was read; there is no
 *     body to fall back on, and a citation without an excerpt cannot be
 *     checked by check:citations.
 *   · A seeded excerpt for a fetched document is used only if it is literally
 *     in the fetched body; otherwise the body's own opening is cited and the
 *     caller is told, because a curator's memory of a sentence is not the
 *     sentence.
 *
 * `note` is curator-only and never copied into a citation.
 */
import { JournalistValidationError, type SourceCitation } from '../journalist'
import { buildWebCitation } from '../journalist-tools/citations'
import type { UrlFetchResult } from '../journalist-tools/web'
import { stripHtml } from './builders'

export type SeedCapture = 'fetch' | 'pdf' | 'chrome'

export interface SeedSource {
  url: string
  title: string
  capturedVia: SeedCapture
  publisher?: string
  publishedAt?: string
  excerpt?: string
  retrievedAt?: string
  note?: string
}

const URL_RE = /^https?:\/\/\S+$/i
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z)?$/
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/
const CAPTURES: readonly SeedCapture[] = ['fetch', 'pdf', 'chrome']
const ALLOWED_KEYS = new Set([
  'url',
  'title',
  'capturedVia',
  'publisher',
  'publishedAt',
  'excerpt',
  'retrievedAt',
  'note',
])
/** Same cap as a published SourceCitation.excerpt (validators.ts). */
export const SEED_EXCERPT_MAX = 500

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new JournalistValidationError(msg)
}

function parseRow(row: unknown, i: number): SeedSource {
  const here = `seeds[${i}]`
  must(typeof row === 'object' && row !== null && !Array.isArray(row), `${here} must be an object`)
  const o = row as Record<string, unknown>
  for (const k of Object.keys(o)) {
    if (k === 'trust') {
      throw new JournalistValidationError(
        `${here}.trust is not accepted — trust is derived from the domain table, never supplied`,
      )
    }
    must(ALLOWED_KEYS.has(k), `${here}.${k} is not a seed field`)
  }
  must(typeof o.url === 'string' && URL_RE.test(o.url), `${here}.url must be an http(s) URL`)
  must(typeof o.title === 'string' && o.title.trim().length > 0, `${here}.title required`)
  must(
    typeof o.capturedVia === 'string' && (CAPTURES as readonly string[]).includes(o.capturedVia),
    `${here}.capturedVia must be one of fetch|pdf|chrome`,
  )
  if (o.publisher !== undefined) {
    must(
      typeof o.publisher === 'string' && o.publisher.trim().length > 0,
      `${here}.publisher must be a non-empty string`,
    )
  }
  if (o.publishedAt !== undefined) {
    must(
      typeof o.publishedAt === 'string' && ISO_DATE_RE.test(o.publishedAt),
      `${here}.publishedAt must be an ISO date`,
    )
  }
  if (o.retrievedAt !== undefined) {
    must(
      typeof o.retrievedAt === 'string' && ISO_DATETIME_RE.test(o.retrievedAt),
      `${here}.retrievedAt must be an ISO datetime`,
    )
  }
  if (o.excerpt !== undefined) {
    must(
      typeof o.excerpt === 'string' && o.excerpt.trim().length > 0,
      `${here}.excerpt must be a non-empty string`,
    )
    must(
      o.excerpt.length <= SEED_EXCERPT_MAX,
      `${here}.excerpt exceeds ${SEED_EXCERPT_MAX} chars — the published citation cap`,
    )
    must(
      typeof o.retrievedAt === 'string',
      `${here}.retrievedAt (ISO datetime) is required when an excerpt is supplied`,
    )
  }
  if (o.capturedVia === 'chrome') {
    must(
      typeof o.excerpt === 'string',
      `${here}: capturedVia chrome requires a verbatim excerpt read in the browser`,
    )
  }
  if (o.note !== undefined) must(typeof o.note === 'string', `${here}.note must be a string`)

  const seed: SeedSource = {
    url: o.url,
    title: o.title.trim(),
    capturedVia: o.capturedVia as SeedCapture,
  }
  if (typeof o.publisher === 'string') seed.publisher = o.publisher.trim()
  if (typeof o.publishedAt === 'string') seed.publishedAt = o.publishedAt
  if (typeof o.excerpt === 'string') seed.excerpt = o.excerpt
  if (typeof o.retrievedAt === 'string') seed.retrievedAt = o.retrievedAt
  if (typeof o.note === 'string') seed.note = o.note
  return seed
}

export function parseSeedSources(json: string): SeedSource[] {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (err) {
    throw new JournalistValidationError(`seed file is not JSON: ${(err as Error).message}`)
  }
  must(Array.isArray(raw), 'seed file must be a JSON array of sources')
  return raw.map((row, i) => parseRow(row, i))
}

/**
 * `verbatim`     the seeded excerpt is literally in the fetched body
 * `not-in-body`  it is not — the body's own opening is cited instead
 * `body-only`    no excerpt was seeded; the body's opening is cited
 * `manual`       a chrome capture: the curator's excerpt, no body to check
 */
export type SeedVerification = 'verbatim' | 'not-in-body' | 'body-only' | 'manual'

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim()

export function citationFromSeed(
  seed: SeedSource,
  bodyText?: string,
): { citation: SourceCitation; verified: SeedVerification } {
  const base = {
    url: seed.url,
    title: seed.title,
    ...(seed.publisher ? { publisher: seed.publisher } : {}),
    ...(seed.publishedAt ? { publishedAt: seed.publishedAt } : {}),
  }
  if (seed.capturedVia === 'chrome') {
    const c = buildWebCitation({ ...base, excerpt: seed.excerpt })
    // The excerpt was read on the date the curator recorded, not now.
    return { citation: { ...c, retrievedAt: seed.retrievedAt as string }, verified: 'manual' }
  }
  // fetchUrl hands back the first 8 KB of the RAW body, tags included; the
  // first real run (06-09-2026) compared the curator's excerpt against that and,
  // finding nothing, cited «<!DOCTYPE html> <html lang="es">…» seven times. So:
  // compare against text, and when the (capped) text still does not reach the
  // paragraph, keep what the curator read on the page — it is the more
  // reliable of the two — and let the caller warn. Raw markup is never cited.
  const body = squash(stripHtml(bodyText ?? ''))
  if (seed.excerpt) {
    return {
      citation: buildWebCitation({ ...base, excerpt: seed.excerpt }),
      verified: body.includes(squash(seed.excerpt)) ? 'verbatim' : 'not-in-body',
    }
  }
  return {
    citation: buildWebCitation({ ...base, ...(body ? { excerpt: body.slice(0, 500) } : {}) }),
    verified: 'body-only',
  }
}

/** An evidence row the synth stage sees; `seeded` ranks it ahead of the cap. */
export interface SeedEvidenceRow {
  citationId: string
  kind: string
  title: string
  url?: string
  publishedAt?: string
  trust: 'high' | 'medium' | 'low'
  excerpt?: string
  seeded: true
}

export interface SeedPreloadSummary {
  attempted: number
  /** fetch/pdf seeds whose body came back usable */
  fetched: number
  /** chrome captures, cited from the curator's excerpt */
  manual: number
  /** seeds that produced no citation (download failed or empty body) */
  failed: number
  /** fetched seeds whose seeded excerpt was not literal in the body */
  notInBody: number
}

export interface SeedFetchers {
  fetchUrl: (url: string) => Promise<UrlFetchResult>
  fetchPdfUrl: (url: string) => Promise<UrlFetchResult>
}

/**
 * Turn curator seeds into citations + evidence before the planner runs.
 *
 * Every seed ends in exactly one of the summary buckets, and every seed that
 * left no citation leaves a warning: a run that says «sembré cinco» and keeps
 * quiet about the three that never downloaded is the failure DATA_INTEGRITY
 * rule 2 names. The fetchers are injected so the same code runs under test
 * with no network.
 */
export async function preloadSeeds(
  seeds: SeedSource[],
  deps: SeedFetchers,
): Promise<{
  sources: SourceCitation[]
  evidence: SeedEvidenceRow[]
  warnings: string[]
  summary: SeedPreloadSummary
}> {
  const sources: SourceCitation[] = []
  const evidence: SeedEvidenceRow[] = []
  const warnings: string[] = []
  const summary: SeedPreloadSummary = {
    attempted: 0,
    fetched: 0,
    manual: 0,
    failed: 0,
    notInBody: 0,
  }
  const push = (citation: SourceCitation) => {
    sources.push(citation)
    evidence.push({
      citationId: citation.id,
      kind: citation.kind,
      title: citation.title,
      ...(citation.url ? { url: citation.url } : {}),
      ...(citation.publishedAt ? { publishedAt: citation.publishedAt } : {}),
      trust: citation.trust,
      ...(citation.excerpt ? { excerpt: citation.excerpt } : {}),
      seeded: true,
    })
  }

  for (const seed of seeds) {
    summary.attempted += 1
    if (seed.capturedVia === 'chrome') {
      push(citationFromSeed(seed).citation)
      summary.manual += 1
      continue
    }
    let res: UrlFetchResult
    try {
      res =
        seed.capturedVia === 'pdf'
          ? await deps.fetchPdfUrl(seed.url)
          : await deps.fetchUrl(seed.url)
    } catch (err) {
      summary.failed += 1
      warnings.push(`seed: ${seed.url} no se pudo descargar (${(err as Error).message})`)
      continue
    }
    if (!res.ok || !res.bodyExcerpt || res.bodyExcerpt.trim().length === 0) {
      summary.failed += 1
      const why = res.error ?? (res.status != null ? `HTTP ${res.status}` : 'cuerpo vacío')
      warnings.push(`seed: ${seed.url} no se pudo descargar (${why})`)
      continue
    }
    const { citation, verified } = citationFromSeed(seed, res.bodyExcerpt)
    if (verified === 'not-in-body') {
      summary.notInBody += 1
      warnings.push(
        `seed: el extracto sembrado no se encontró literal en el cuerpo descargado (capado) de ${seed.url}; se conserva el extracto leído por la curaduría`,
      )
    }
    push(citation)
    summary.fetched += 1
  }
  return { sources, evidence, warnings, summary }
}

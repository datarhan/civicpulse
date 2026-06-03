/**
 * Journalist tools — local-snapshot search + per-domain fetchers (officials,
 * press, pleno-claims, promises). Verbatim from the monolith.
 */
import { matchesAnyToken, readJsonSnapshot, tokenize } from './internal'

// ─── Local-snapshot tools ──────────────────────────────────────────────────

export interface LocalHit<T = unknown> {
  localPath: string
  matchedField: string
  preview: string
  row: T
}

const DEFAULT_LOCAL_FILES = [
  'public/data/officials.json',
  'public/data/press.json',
  'public/data/pleno-claims-suggestions.json',
  'public/data/pleno-claims-verified.json',
  'public/data/promises.json',
  'public/data/plenos.json',
  'public/data/plenos-agendas.json',
  'public/data/bdns.json',
  'public/data/tenders.json',
  'public/data/wikidata.json',
] as const

/**
 * Grep a list of `public/data/*.json` snapshots for a query string and
 * return up to N matching rows per file. Pure local — no network. Used
 * by the agent's Stage-2 to bootstrap its knowledge before reaching
 * outside.
 */
export function searchLocalSnapshots(
  query: string,
  opts: { files?: readonly string[]; perFileLimit?: number } = {},
): LocalHit[] {
  const files = opts.files ?? DEFAULT_LOCAL_FILES
  const perFile = opts.perFileLimit ?? 6
  const needleTokens = tokenize(query)
  if (needleTokens.length === 0) return []
  const hits: LocalHit[] = []
  for (const f of files) {
    const data = readJsonSnapshot<Record<string, unknown>>(f)
    if (!data) continue
    const arrays = candidateArrays(data)
    for (const [arrName, arr] of arrays) {
      let kept = 0
      for (const row of arr) {
        if (kept >= perFile) break
        const flat = flattenForSearch(row)
        if (matchesAnyToken(flat, needleTokens)) {
          hits.push({
            localPath: f,
            matchedField: arrName,
            preview: flat.slice(0, 240),
            row,
          })
          kept += 1
        }
      }
    }
  }
  return hits
}

function candidateArrays(obj: Record<string, unknown>): Array<[string, unknown[]]> {
  const out: Array<[string, unknown[]]> = []
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) out.push([k, v as unknown[]])
  }
  return out
}

function flattenForSearch(row: unknown, depth = 0): string {
  if (row === null || row === undefined) return ''
  if (typeof row === 'string') return row
  if (typeof row === 'number' || typeof row === 'boolean') return String(row)
  if (depth > 3) return ''
  if (Array.isArray(row)) return row.map((r) => flattenForSearch(r, depth + 1)).join(' · ')
  if (typeof row === 'object') {
    return Object.values(row as Record<string, unknown>)
      .map((v) => flattenForSearch(v, depth + 1))
      .join(' · ')
  }
  return ''
}

export interface OfficialRow {
  slug: string
  name: string
  honorific?: string
  role: string
  party: string
  portfolios: string[]
  email?: string
  photoUrl?: string
  cvUrl?: string
}

export function fetchOfficialBySlug(slug: string): OfficialRow | null {
  const data = readJsonSnapshot<{ officials?: OfficialRow[] }>('public/data/officials.json')
  if (!data?.officials) return null
  return data.officials.find((o) => o.slug === slug) ?? null
}

export interface PressHit {
  title: string
  source: string
  publishedAt: string
  url: string
  summary?: string
}

export function fetchPressForSubject(name: string, limit = 20): PressHit[] {
  const data = readJsonSnapshot<{ items?: Array<Record<string, unknown>> }>(
    'public/data/press.json',
  )
  if (!data?.items) return []
  const tokens = tokenize(name)
  const hits: PressHit[] = []
  for (const it of data.items) {
    if (hits.length >= limit) break
    const title = (it.title as string) ?? ''
    if (!matchesAnyToken(title, tokens)) continue
    // press.json canonical schema (from src/scraper/press.ts) uses
    // `link` + `date` (ISO datetime). Older test fixtures used
    // `url` + `publishedAt`; we read both defensively so the tool
    // keeps working across schema bumps.
    const url = ((it.url as string) || (it.link as string) || '').trim()
    const rawDate = (it.publishedAt as string) || (it.date as string) || ''
    hits.push({
      title,
      source: (it.source as string) ?? '',
      publishedAt: rawDate.slice(0, 10),
      url,
      summary: (it.summary as string) ?? undefined,
    })
  }
  return hits
}

export interface PlenoClaimHit {
  id: string
  plenoId?: string
  plenoDate?: string
  verbatim: string
  type: string
  topic: string
  speakerGroup: string | null
}

export function fetchPlenoClaimsForSubject(name: string, limit = 15): PlenoClaimHit[] {
  const suggestions = readJsonSnapshot<{
    items?: Array<Record<string, unknown>>
  }>('public/data/pleno-claims-suggestions.json')
  if (!suggestions?.items) return []
  const tokens = tokenize(name)
  const hits: PlenoClaimHit[] = []
  for (const it of suggestions.items) {
    if (hits.length >= limit) break
    const verbatim = (it.verbatim as string) ?? ''
    const context = (it.context as string) ?? ''
    if (!matchesAnyToken(verbatim + ' ' + context, tokens)) continue
    hits.push({
      id: (it.id as string) ?? '',
      plenoId: (it.plenoId as string) ?? undefined,
      plenoDate: (it.plenoDate as string) ?? undefined,
      verbatim,
      type: (it.type as string) ?? 'unknown',
      topic: (it.topic as string) ?? 'other',
      speakerGroup: (it.speakerGroup as string) ?? null,
    })
  }
  return hits
}

export interface PromiseHit {
  id: string
  title: string
  party: string
  topic: string
  status: string
  quote: string
  madeAt: string
}

export function fetchPromisesForParty(party: string, limit = 25): PromiseHit[] {
  const data = readJsonSnapshot<{ items?: Array<Record<string, unknown>> }>(
    'public/data/promises.json',
  )
  if (!data?.items) return []
  const hits: PromiseHit[] = []
  for (const it of data.items) {
    if (hits.length >= limit) break
    if ((it.party as string)?.toLowerCase() !== party.toLowerCase()) continue
    hits.push({
      id: (it.id as string) ?? '',
      title: (it.title as string) ?? '',
      party: (it.party as string) ?? '',
      topic: (it.topic as string) ?? 'other',
      status: (it.status as string) ?? 'documentada',
      quote: (it.quote as string) ?? '',
      madeAt: (it.madeAt as string) ?? '',
    })
  }
  return hits
}


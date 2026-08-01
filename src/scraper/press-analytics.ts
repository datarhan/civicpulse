/**
 * Press laboratory analytics. Three pure functions over the already-
 * produced JSON snapshots (press.json, press-claims-verified.json,
 * plenos-agendas.json, promises.json):
 *
 *   1. Trust Project indicators (per-article + per-outlet scoreboard).
 *      We don't fetch outlet About pages; instead we infer the
 *      8-indicator subset that is verifiable from our local data trail:
 *       - localCoverage: article URL host belongs to a local Camp de
 *         Túria outlet OR the source name matches our known list.
 *       - datedArticle: ISO publish date parses correctly.
 *       - municipalSourceMatch: the verifier matched ≥1 corroborating
 *         municipal data row (tender / BDNS / budget / padron / paro).
 *       - corroboratedAcrossOutlets: ≥2 outlets share the article
 *         fingerprint (FNV title hash).
 *       - factualClaimsPresent: extractor emitted ≥1 claim with
 *         confidence ≥0.5.
 *       - opinionFraction: ratio of opinativa accusations to total
 *         claims. Lower is more "news-y", higher is more "opinion".
 *      We deliberately do NOT rank outlets — ranking with <10 articles
 *      is statistical noise; the lab page sorts by raw article count.
 *
 *   2. Triangulation — for every article fingerprint shared by ≥2
 *      outlets, collect the outlets that ran it, the verdict mix on
 *      their bundled claims, and the numeric drift (max/min of any
 *      shared amountEuros). Surfaces "the same story, told three ways".
 *
 *   3. Coverage gaps — pleno agenda items + curated promises with
 *      ZERO press mentions in a 14-day rolling window. Tells the
 *      reader which decisions the local press isn't following.
 *
 * All three functions are pure and synchronous; the CLI wrapper
 * (scripts/compute-press-analytics.ts) does the IO.
 */

import { fingerprintFor } from './press'
import type { ClaimVerdict } from './claim-verifier'
import type { PressClaim } from './press-claim'
import type { PressClaimVerification } from './press-verifier'

const LOCAL_HOSTS = new Set([
  'infoturia.com',
  'ribarroja.es',
  'ribarroja-cs.es',
  'levante-emv.com',
  'lasprovincias.es',
  'valenciaplaza.com',
  'eldiario.es',
  'cadenaser.com',
])

const LOCAL_SOURCE_HINTS = ['camp de túria', 'periòdic', 'comarcal', 'ribarroja', 'riba-roja']

// ─── 1. Trust Project indicators ────────────────────────────────────────────

export interface ArticleTrustRow {
  articleId: string
  articleFingerprint: string
  outlet: string
  outletHost: string | null
  url: string
  date: string
  indicators: {
    localCoverage: boolean
    datedArticle: boolean
    municipalSourceMatch: boolean
    corroboratedAcrossOutlets: boolean
    factualClaimsPresent: boolean
    opinionFraction: number
  }
  score: number
}

export interface OutletScorecard {
  outlet: string
  outletHost: string | null
  articleCount: number
  verdictCounts: Record<ClaimVerdict, number>
  meanTrustScore: number
  // null (not 0) when the outlet has no audited claims yet — the UI renders
  // "—", so a monitored-but-unverified outlet never masquerades as "0% verified".
  verifiedRatio: number | null
  contradictedRatio: number | null
}

export interface TrustIndicatorsReport {
  generatedAt: string
  windowDays: number
  articles: ArticleTrustRow[]
  outlets: OutletScorecard[]
}

export interface PressArticleLite {
  id: string
  title: string
  link: string
  source: string
  sourceHost: string | null
  date: string
  fingerprint: string
}

export interface VerifiedClaimRow {
  claim: PressClaim
  verification: PressClaimVerification
}

export function computeTrustIndicators(opts: {
  press: PressArticleLite[]
  verified: VerifiedClaimRow[]
  windowDays?: number
  now?: Date
}): TrustIndicatorsReport {
  const windowDays = opts.windowDays ?? 30
  const now = opts.now ?? new Date()
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString()

  const press = opts.press.filter((p) => p.date >= cutoff)

  const claimsByArticle = new Map<string, VerifiedClaimRow[]>()
  for (const row of opts.verified) {
    const arr = claimsByArticle.get(row.claim.articleId)
    if (arr) arr.push(row)
    else claimsByArticle.set(row.claim.articleId, [row])
  }

  // Same-story clustering as triangulation — see clusterArticlesByStory for
  // why exact fingerprint identity can never answer this.
  const outletsByArticleId = new Map<string, number>()
  for (const group of clusterArticlesByStory(press).values()) {
    const outlets = new Set(group.map((a) => a.source)).size
    for (const a of group) outletsByArticleId.set(a.id, outlets)
  }

  const articles: ArticleTrustRow[] = press.map((p) => {
    const claims = claimsByArticle.get(p.id) ?? []
    const opinionCount = claims.filter(
      (c) => c.claim.type === 'acusacion_publica' && c.claim.accusationSubtype === 'opinativa',
    ).length
    const opinionFraction = claims.length === 0 ? 0 : opinionCount / claims.length

    const municipalSourceMatch = claims.some((c) => c.verification.evidence.length > 0)

    const ind = {
      localCoverage:
        LOCAL_HOSTS.has(p.sourceHost ?? '') ||
        LOCAL_SOURCE_HINTS.some((h) => p.source.toLowerCase().includes(h)),
      datedArticle: !!p.date && !Number.isNaN(new Date(p.date).getTime()),
      municipalSourceMatch,
      corroboratedAcrossOutlets: (outletsByArticleId.get(p.id) ?? 0) >= 2,
      factualClaimsPresent: claims.some((c) => c.claim.confidence >= 0.5),
      opinionFraction,
    }

    // The "not opinion" axis only earns credit once claims have actually been
    // extracted. With zero claims, opinionFraction is a vacuous 0 — awarding
    // (1 - 0) would hand every un-analysed article a free trust point it never
    // earned, inflating outlet scores that were never really assessed.
    const score =
      Number(ind.localCoverage) +
      Number(ind.datedArticle) +
      Number(ind.municipalSourceMatch) +
      Number(ind.corroboratedAcrossOutlets) +
      Number(ind.factualClaimsPresent) +
      (claims.length === 0 ? 0 : 1 - ind.opinionFraction)

    return {
      articleId: p.id,
      articleFingerprint: p.fingerprint,
      outlet: p.source,
      outletHost: p.sourceHost,
      url: p.link,
      date: p.date,
      indicators: ind,
      score: Math.round(score * 100) / 100,
    }
  })

  const byOutlet = new Map<string, { rows: ArticleTrustRow[]; host: string | null }>()
  for (const a of articles) {
    const entry = byOutlet.get(a.outlet)
    if (entry) entry.rows.push(a)
    else byOutlet.set(a.outlet, { rows: [a], host: a.outletHost })
  }

  const outlets: OutletScorecard[] = []
  for (const [outlet, { rows, host }] of byOutlet) {
    const articleIds = rows.map((r) => r.articleId)
    const verdictCounts: Record<ClaimVerdict, number> = {
      verificado: 0,
      parcial: 0,
      contradicho: 0,
      'sin-datos': 0,
      'promesa-repetida': 0,
    }
    let totalClaims = 0
    for (const id of articleIds) {
      const claims = claimsByArticle.get(id) ?? []
      for (const c of claims) {
        verdictCounts[c.verification.verdict] += 1
        totalClaims += 1
      }
    }
    const meanTrustScore = rows.reduce((acc, r) => acc + r.score, 0) / Math.max(rows.length, 1)
    const verifiedRatio = totalClaims === 0 ? null : verdictCounts.verificado / totalClaims
    const contradictedRatio = totalClaims === 0 ? null : verdictCounts.contradicho / totalClaims

    outlets.push({
      outlet,
      outletHost: host,
      articleCount: rows.length,
      verdictCounts,
      meanTrustScore: Math.round(meanTrustScore * 100) / 100,
      verifiedRatio: verifiedRatio === null ? null : Math.round(verifiedRatio * 1000) / 1000,
      contradictedRatio:
        contradictedRatio === null ? null : Math.round(contradictedRatio * 1000) / 1000,
    })
  }
  outlets.sort((a, b) => b.articleCount - a.articleCount)

  return {
    generatedAt: now.toISOString(),
    windowDays,
    articles,
    outlets,
  }
}

// ─── 2. Triangulation ──────────────────────────────────────────────────────

export interface TriangulationCluster {
  // A cluster spans MULTIPLE articles/fingerprints (the same story across
  // outlets), so it can't be keyed by a single title fingerprint. `clusterId`
  // is a deterministic representative key (smallest member fingerprint);
  // consumers join to articles via `articleIds`, not this field.
  clusterId: string
  articleIds: string[]
  outlets: string[]
  earliestDate: string
  latestDate: string
  amountDrift?: {
    min: number
    max: number
    spread: number
    spreadPct: number
  } | null
  verdictMix: Record<ClaimVerdict, number>
}

export interface TriangulationReport {
  generatedAt: string
  clusters: TriangulationCluster[]
  stats: {
    totalClusters: number
    triangulated3Plus: number
  }
}

// Two headlines describe "the same story" when their significant-token sets
// (>4 chars, see `tokenise`) overlap strongly. The upstream feed is deduped by
// exact-title fingerprint (press.ts), so cross-outlet coverage ALWAYS arrives
// as distinct fingerprints — clustering must key on similarity, not the hash.
// Tuned for precision (a false cross-outlet cluster misleads readers): require
// both a floor of shared distinctive tokens AND a Jaccard threshold.
const TRIANGULATION_MIN_SHARED_TOKENS = 2
const TRIANGULATION_MIN_JACCARD = 0.34

function titlesSameStory(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false
  let shared = 0
  for (const t of a) if (b.has(t)) shared += 1
  if (shared < TRIANGULATION_MIN_SHARED_TOKENS) return false
  const union = a.size + b.size - shared
  return union > 0 && shared / union >= TRIANGULATION_MIN_JACCARD
}

/**
 * Group articles that tell the same story, by title-token similarity.
 *
 * Connected components (union-find). O(n²) similarity scan is fine at feed
 * scale (≤ a few hundred articles).
 *
 * Shared deliberately. `computeTrustIndicators` used to answer the same
 * question — "did another outlet cover this?" — by comparing exact
 * `fingerprint` hashes, which cannot ever be true: press.ts fingerprints the
 * first six significant words of the title and DROPS the second outlet on a
 * collision, so cross-outlet coverage arrives as distinct fingerprints by
 * construction. The result was measurable nonsense inside one pipeline run —
 * triangulation reported 5 cross-outlet clusters spanning 13 articles while
 * the trust table reported 0 corroborated articles, silently docking every
 * article one of its six trust points.
 */
export function clusterArticlesByStory(
  articles: PressArticleLite[],
): Map<number, PressArticleLite[]> {
  const tokenSets = articles.map((p) => new Set(tokenise(p.title)))
  const parent = articles.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  const union = (i: number, j: number) => {
    const ri = find(i)
    const rj = find(j)
    if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj)
  }
  for (let i = 0; i < articles.length; i++) {
    for (let j = i + 1; j < articles.length; j++) {
      if (titlesSameStory(tokenSets[i], tokenSets[j])) union(i, j)
    }
  }
  const components = new Map<number, PressArticleLite[]>()
  for (let i = 0; i < articles.length; i++) {
    const root = find(i)
    const arr = components.get(root)
    if (arr) arr.push(articles[i])
    else components.set(root, [articles[i]])
  }
  return components
}

export function computeTriangulation(opts: {
  press: PressArticleLite[]
  verified: VerifiedClaimRow[]
  windowDays?: number
  now?: Date
}): TriangulationReport {
  const now = opts.now ?? new Date()
  const windowDays = opts.windowDays ?? 30
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString()
  const recent = opts.press.filter((p) => p.date >= cutoff)

  const components = clusterArticlesByStory(recent)

  const verByArticle = new Map<string, VerifiedClaimRow[]>()
  for (const v of opts.verified) {
    const arr = verByArticle.get(v.claim.articleId)
    if (arr) arr.push(v)
    else verByArticle.set(v.claim.articleId, [v])
  }

  const clusters: TriangulationCluster[] = []
  for (const articles of components.values()) {
    const outlets = new Set(articles.map((a) => a.source))
    // Triangulation = corroboration ACROSS outlets; a same-outlet echo isn't it.
    if (outlets.size < 2) continue
    const dates = articles.map((a) => a.date).sort()
    const verdictMix: Record<ClaimVerdict, number> = {
      verificado: 0,
      parcial: 0,
      contradicho: 0,
      'sin-datos': 0,
      'promesa-repetida': 0,
    }
    const amounts: number[] = []
    for (const a of articles) {
      const claims = verByArticle.get(a.id) ?? []
      for (const c of claims) {
        verdictMix[c.verification.verdict] += 1
        if (
          typeof c.claim.entities.amountEuros === 'number' &&
          Number.isFinite(c.claim.entities.amountEuros)
        ) {
          amounts.push(c.claim.entities.amountEuros)
        }
      }
    }
    let amountDrift: TriangulationCluster['amountDrift'] = null
    if (amounts.length >= 2) {
      const min = Math.min(...amounts)
      const max = Math.max(...amounts)
      const spread = max - min
      const spreadPct = min === 0 ? 0 : spread / min
      amountDrift = { min, max, spread, spreadPct: Math.round(spreadPct * 1000) / 1000 }
    }
    clusters.push({
      clusterId: articles.map((a) => a.fingerprint).sort()[0],
      articleIds: articles.map((a) => a.id).sort(),
      outlets: Array.from(outlets).sort(),
      earliestDate: dates[0],
      latestDate: dates[dates.length - 1],
      amountDrift,
      verdictMix,
    })
  }

  clusters.sort(
    (a, b) => b.outlets.length - a.outlets.length || a.clusterId.localeCompare(b.clusterId),
  )

  return {
    generatedAt: now.toISOString(),
    clusters,
    stats: {
      totalClusters: clusters.length,
      triangulated3Plus: clusters.filter((c) => c.outlets.length >= 3).length,
    },
  }
}

// ─── 3. Coverage gaps ──────────────────────────────────────────────────────

export interface CoverageGapItem {
  kind: 'pleno-item' | 'promise'
  refId: string
  label: string
  date: string
  keyword: string
}

export interface CoverageGapsReport {
  generatedAt: string
  windowDays: number
  items: CoverageGapItem[]
  stats: {
    plenoItemsUncovered: number
    promisesUncovered: number
    /**
     * How many pleno items + promises fell inside the window at all. Zero
     * means "nothing to check", which the UI must not render as "the press
     * covered everything".
     */
    candidatesExamined: number
  }
}

function tokenise(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4)
}

export function computeCoverageGaps(opts: {
  press: PressArticleLite[]
  agendas?: {
    plenos?: Array<{
      id: string
      date: string
      agenda?: Array<{ number: number; title: string; department?: string }>
    }>
  }
  promises?: { items?: Array<{ id: string; title: string; madeAt: string }> }
  windowDays?: number
  now?: Date
}): CoverageGapsReport {
  const windowDays = opts.windowDays ?? 14
  const now = opts.now ?? new Date()
  const cutoff = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString()
  // Agenda + promise dates are YYYY-MM-DD; comparing them against a full ISO
  // timestamp excluded anything dated ON the cutoff day.
  const cutoffDay = cutoff.slice(0, 10)

  const recentPress = opts.press.filter((p) => p.date >= cutoff)
  const pressTokens = new Set<string>()
  for (const p of recentPress) for (const t of tokenise(p.title)) pressTokens.add(t)

  const items: CoverageGapItem[] = []

  const agendas = opts.agendas?.plenos ?? []
  let plenoItemsUncovered = 0
  // How many things we actually looked at. Without this the report cannot
  // tell "the press covered everything" apart from "nothing happened inside
  // the window", and the page asserted the first while meaning the second:
  // the newest pleno was 2026-07-03 and the newest promise 2026-07-02, both
  // outside a 14-day window ending 2026-08-01, so every candidate was skipped
  // by `continue` and the card still read "Sin lagunas detectadas".
  let candidatesExamined = 0
  for (const session of agendas) {
    // Compare date-to-date: `session.date` is YYYY-MM-DD and `cutoff` is a full
    // ISO timestamp, so a session ON the cutoff day sorted as "before" it.
    if (session.date < cutoffDay) continue
    for (const item of session.agenda ?? []) {
      candidatesExamined += 1
      const tokens = tokenise(item.title)
      const keyword = tokens.find((t) => pressTokens.has(t)) ?? ''
      if (!keyword) {
        plenoItemsUncovered += 1
        items.push({
          kind: 'pleno-item',
          refId: `${session.id}:${item.number}`,
          label: `${item.department ? item.department + ' · ' : ''}${item.title}`,
          date: session.date,
          keyword: '',
        })
      }
    }
  }

  let promisesUncovered = 0
  for (const promise of opts.promises?.items ?? []) {
    if (promise.madeAt < cutoffDay) continue
    candidatesExamined += 1
    const tokens = tokenise(promise.title)
    const keyword = tokens.find((t) => pressTokens.has(t)) ?? ''
    if (!keyword) {
      promisesUncovered += 1
      items.push({
        kind: 'promise',
        refId: promise.id,
        label: promise.title,
        date: promise.madeAt,
        keyword: '',
      })
    }
  }

  items.sort((a, b) => b.date.localeCompare(a.date))

  return {
    generatedAt: now.toISOString(),
    windowDays,
    items,
    stats: {
      plenoItemsUncovered,
      promisesUncovered,
      candidatesExamined,
    },
  }
}

export { fingerprintFor }

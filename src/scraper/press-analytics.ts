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
  verifiedRatio: number
  contradictedRatio: number
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

  const outletsByFingerprint = new Map<string, Set<string>>()
  for (const p of press) {
    const set = outletsByFingerprint.get(p.fingerprint)
    if (set) set.add(p.source)
    else outletsByFingerprint.set(p.fingerprint, new Set([p.source]))
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
      corroboratedAcrossOutlets: (outletsByFingerprint.get(p.fingerprint)?.size ?? 0) >= 2,
      factualClaimsPresent: claims.some((c) => c.claim.confidence >= 0.5),
      opinionFraction,
    }

    const score =
      Number(ind.localCoverage) +
      Number(ind.datedArticle) +
      Number(ind.municipalSourceMatch) +
      Number(ind.corroboratedAcrossOutlets) +
      Number(ind.factualClaimsPresent) +
      (1 - ind.opinionFraction)

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
    const verifiedRatio = totalClaims === 0 ? 0 : verdictCounts.verificado / totalClaims
    const contradictedRatio = totalClaims === 0 ? 0 : verdictCounts.contradicho / totalClaims

    outlets.push({
      outlet,
      outletHost: host,
      articleCount: rows.length,
      verdictCounts,
      meanTrustScore: Math.round(meanTrustScore * 100) / 100,
      verifiedRatio: Math.round(verifiedRatio * 1000) / 1000,
      contradictedRatio: Math.round(contradictedRatio * 1000) / 1000,
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
  fingerprint: string
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

export function computeTriangulation(opts: {
  press: PressArticleLite[]
  verified: VerifiedClaimRow[]
  now?: Date
}): TriangulationReport {
  const now = opts.now ?? new Date()

  const groups = new Map<string, { articles: PressArticleLite[]; outlets: Set<string> }>()
  for (const p of opts.press) {
    const g = groups.get(p.fingerprint)
    if (g) {
      g.articles.push(p)
      g.outlets.add(p.source)
    } else {
      groups.set(p.fingerprint, { articles: [p], outlets: new Set([p.source]) })
    }
  }

  const verByArticle = new Map<string, VerifiedClaimRow[]>()
  for (const v of opts.verified) {
    const arr = verByArticle.get(v.claim.articleId)
    if (arr) arr.push(v)
    else verByArticle.set(v.claim.articleId, [v])
  }

  const clusters: TriangulationCluster[] = []
  for (const [fp, g] of groups) {
    if (g.articles.length < 2) continue
    const dates = g.articles.map((a) => a.date).sort()
    const verdictMix: Record<ClaimVerdict, number> = {
      verificado: 0,
      parcial: 0,
      contradicho: 0,
      'sin-datos': 0,
      'promesa-repetida': 0,
    }
    const amounts: number[] = []
    for (const a of g.articles) {
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
      fingerprint: fp,
      articleIds: g.articles.map((a) => a.id),
      outlets: Array.from(g.outlets).sort(),
      earliestDate: dates[0],
      latestDate: dates[dates.length - 1],
      amountDrift,
      verdictMix,
    })
  }

  clusters.sort(
    (a, b) => b.outlets.length - a.outlets.length || a.fingerprint.localeCompare(b.fingerprint),
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

  const recentPress = opts.press.filter((p) => p.date >= cutoff)
  const pressTokens = new Set<string>()
  for (const p of recentPress) for (const t of tokenise(p.title)) pressTokens.add(t)

  const items: CoverageGapItem[] = []

  const agendas = opts.agendas?.plenos ?? []
  let plenoItemsUncovered = 0
  for (const session of agendas) {
    if (session.date < cutoff) continue
    for (const item of session.agenda ?? []) {
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
    if (promise.madeAt < cutoff) continue
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
    },
  }
}

export { fingerprintFor }

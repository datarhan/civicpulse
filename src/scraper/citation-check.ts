/**
 * Is every claim in a report actually cited, and does every citation still hold?
 *
 * Pure. No network, no filesystem — the CLI (`scripts/check-citations.ts`)
 * fetches and hands the results in, so the whole decision layer is testable
 * offline against a fixture.
 *
 * ## What this is for
 *
 * Of the last 300 commits, 27 `fix` commits were on surfaces that name a living
 * person, and they repeat four shapes. Three of the four are deterministic and
 * belong here; the fourth needs judgement and belongs in the
 * `revisar-borrador` skill.
 *
 *   deterministic   a claim with no citation
 *                   a quote that is not in the excerpt it cites
 *                   a citation whose URL no longer resolves
 *   judgement       an excerpt that RELATES to the sentence without SUPPORTING it
 *
 * `promote-report` used to strip `requiresHumanApproval` and stamp, without
 * re-verifying a single citation. The only thing between LLM-written prose
 * about a named councillor and publication was a person reading it.
 */
import { quoteAppearsIn, quoteCoverage } from './quote-match'

export type CitationSeverity = 'error' | 'warn' | 'info'

export interface CitationFinding {
  severity: CitationSeverity
  code:
    | 'orphan-source-ref'
    | 'quote-not-in-excerpt'
    | 'source-without-evidence'
    | 'url-dead'
    | 'url-unverifiable'
  reportId: string
  sourceId?: string
  detail: string
}

/** What the CLI learned about a URL. Mirrors `scripts/lib/doc-fetch.ts`. */
export type UrlState = 'alive' | 'dead' | 'unverifiable'

export interface CitationCheckInput {
  reports: ReportLike[]
  /** url → state. A url absent from the map was NOT checked, and says so. */
  urlStates?: Map<string, { state: UrlState; status?: number; reason?: string }>
}

export interface ReportLike {
  id: string
  sources: Array<{
    id: string
    url?: string
    localPath?: string
    excerpt?: string
  }>
  sections: unknown[]
}

/**
 * Coverage, reported whether or not anything failed.
 *
 * `check:drift` watched 2 figures out of a corpus of many and reported
 * "2 watched · 0 divergent" — which reads as health. A guard's silence is taken
 * for approval, so it has to say how much it actually looked at.
 */
export interface CitationCoverage {
  reports: number
  sources: number
  sourcesWithExcerpt: number
  urls: number
  urlsChecked: number
  quoteCards: number
}

export interface CitationCheckResult {
  findings: CitationFinding[]
  coverage: CitationCoverage
}

/** Every sourceId referenced anywhere in a section tree, however nested. */
export function collectSourceRefs(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const n of node) collectSourceRefs(n, out)
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k === 'sourceIds' && Array.isArray(v)) out.push(...(v as string[]))
      else if (k === 'sourceId' && typeof v === 'string') out.push(v)
      else collectSourceRefs(v, out)
    }
  }
  return out
}

interface QuoteCardLike {
  kind: string
  payload: { verbatim?: string; sourceId?: string }
}

export function checkCitations(input: CitationCheckInput): CitationCheckResult {
  const findings: CitationFinding[] = []
  const coverage: CitationCoverage = {
    reports: input.reports.length,
    sources: 0,
    sourcesWithExcerpt: 0,
    urls: 0,
    urlsChecked: 0,
    quoteCards: 0,
  }

  for (const r of input.reports) {
    const byId = new Map(r.sources.map((s) => [s.id, s]))
    coverage.sources += r.sources.length

    // 1. Every claim carries a citation that exists.
    for (const ref of new Set(collectSourceRefs(r.sections))) {
      if (!byId.has(ref)) {
        findings.push({
          severity: 'error',
          code: 'orphan-source-ref',
          reportId: r.id,
          sourceId: ref,
          detail: `a section cites ${ref}, which is not in sources[] — the claim has no citation`,
        })
      }
    }

    // 2. A quote card must be IN the excerpt it points at. This is the one that
    //    catches a fabricated quote, and it is free.
    for (const s of r.sections as QuoteCardLike[]) {
      if (!s || typeof s !== 'object' || s.kind !== 'quote-card') continue
      coverage.quoteCards += 1
      const verbatim = s.payload?.verbatim
      const src = s.payload?.sourceId ? byId.get(s.payload.sourceId) : undefined
      if (!verbatim || !src?.excerpt) continue
      if (!quoteAppearsIn(verbatim, src.excerpt)) {
        const cov = quoteCoverage(verbatim, src.excerpt)
        findings.push({
          severity: 'error',
          code: 'quote-not-in-excerpt',
          reportId: r.id,
          sourceId: src.id,
          detail:
            `quote card is not verbatim in the excerpt it cites ` +
            `(longest run present: ${(cov * 100).toFixed(0)}%): ` +
            `"${verbatim.replace(/\s+/g, ' ').slice(0, 90)}…"`,
        })
      }
    }

    // 3. A citation nobody can re-verify later.
    for (const s of r.sources) {
      if (s.excerpt?.trim()) coverage.sourcesWithExcerpt += 1
      else if (!s.localPath) {
        findings.push({
          severity: 'warn',
          code: 'source-without-evidence',
          reportId: r.id,
          sourceId: s.id,
          detail:
            'no excerpt and no localPath — if this URL rots there is nothing left ' +
            'to show the claim was ever supported',
        })
      }

      // 4. Does the URL still resolve?
      if (!s.url) continue
      coverage.urls += 1
      const v = input.urlStates?.get(s.url)
      if (!v) continue // not checked this run; coverage reports the gap
      coverage.urlsChecked += 1
      if (v.state === 'dead') {
        findings.push({
          severity: 'error',
          code: 'url-dead',
          reportId: r.id,
          sourceId: s.id,
          detail: `cited URL returns ${v.status ?? '?'} — ${s.url}`,
        })
      } else if (v.state === 'unverifiable') {
        findings.push({
          severity: 'info',
          code: 'url-unverifiable',
          reportId: r.id,
          sourceId: s.id,
          detail: `could not reach from here (${v.reason ?? v.status ?? '?'}) — ${s.url}`,
        })
      }
    }
  }

  return { findings, coverage }
}

/**
 * Does this result block a promotion?
 *
 * Only `error`. `info` covers the URLs we could not reach from this machine —
 * regmeet.com refuses non-residential IPs, two ministries front their PDFs with
 * a WAF that 403s a non-browser UA. Blocking on those would mean the check is
 * wrong four times out of forty-eight on a clean corpus, and a gate that is
 * wrong that often is one everybody learns to skip.
 */
export function blocks(result: CitationCheckResult): boolean {
  return result.findings.some((f) => f.severity === 'error')
}

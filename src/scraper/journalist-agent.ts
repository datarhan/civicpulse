/**
 * Journalist agent — 4-stage pipeline.
 *
 *   1. PLAN     LLM reads the assignment + local-knowledge summary →
 *                emits a research plan (4-8 questions, each tagged with a
 *                suggested tool).
 *   2. RESEARCH Deterministic Node code dispatches each planned question
 *                to the appropriate tool from journalist-tools.ts. Builds
 *                up `SourceCitation[]` and a parallel `evidence` list
 *                that the LLM will later cite by citationId.
 *   3. SYNTH    LLM receives the assignment + evidence + schema → emits
 *                ReportSection[] + warnings + quote cards.
 *   4. VERIFY   LLM re-reads its own draft + sources → emits extra
 *                warnings and the final legal-sensitivity tier.
 *
 * The deterministic agent code then:
 *   · validates citations referenced by every section
 *   · stamps the auto-judicial-token legalSensitivity bump
 *   · seeds the photoPath / portfolios / partyTone fields on portrait
 *     sections from officials.json
 *   · returns a `JournalistReportDraft` ready to be persisted by the
 *     CLI to public/data/journalist-reports-suggestions.json
 *
 * Every LLM call goes through `callLLM` which caches and meters. The
 * pipeline never throws on a single-stage failure; it returns a draft
 * with an explanatory warning so the curator can see what happened.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { callLLM, loadConfigFromEnv, resetBudget } from '../llm/client'
import {
  buildJournalistBioSystemPrompt,
  buildJournalistBioUserPrompt,
  buildJournalistPlanSystemPrompt,
  buildJournalistPlanUserPrompt,
  buildJournalistSynthSystemPrompt,
  buildJournalistSynthUserPrompt,
  buildJournalistVerifySystemPrompt,
  buildJournalistVerifyUserPrompt,
  JOURNALIST_BIO_VERSION,
  JOURNALIST_PLAN_VERSION,
  JOURNALIST_SYNTH_VERSION,
  JOURNALIST_VERIFY_VERSION,
} from '../llm/prompts'
import {
  JournalistBioResponseSchema,
  JournalistPlanResponseSchema,
  JournalistSynthResponseSchema,
  JournalistVerifyResponseSchema,
  type JournalistPlanResponse,
  type JournalistSynthResponse,
  type JournalistVerifyResponse,
} from '../llm/schemas'
import {
  computeLegalSensitivity,
  isJournalistFrozen,
  JUDICIAL_TOKENS,
  type JournalistAssignment,
  type JournalistReportDraft,
  type LegalSensitivity,
  type ReportSection,
  type SourceCitation,
} from './journalist'
import {
  audit,
  buildLocalCitation,
  buildWebCitation,
  buildWikidataCitation,
  buildWikipediaCitation,
  fetchOfficialBySlug,
  fetchPlenoClaimsForSubject,
  fetchPressForSubject,
  fetchPromisesForParty,
  extractBioEntities,
  fetchBoeForSubject,
  fetchDialnet,
  fetchDogvForSubject,
  fetchHemerotecaQuery,
  fetchPdfUrl,
  fetchTopUrls,
  fetchUrl,
  fetchUrlHeadless,
  fetchWikidata,
  fetchWikipedia,
  resetCitationCounter,
  searchLocalSnapshots,
  webSearch,
  webSearchYears,
  type LocalHit,
  type PressHit,
  type PromiseHit,
} from './journalist-tools'

const AGENT_VERSION = 'journalist-v1'
const DRAFT_PROMPT_VERSION = `plan=${JOURNALIST_PLAN_VERSION};bio=${JOURNALIST_BIO_VERSION};synth=${JOURNALIST_SYNTH_VERSION};verify=${JOURNALIST_VERIFY_VERSION}`

const PARTY_TONE: Record<string, string> = {
  PSOE: 'civic',
  PP: 'intel',
  VOX: 'warn',
  Compromís: 'ok',
  Ciudadanos: 'neutral',
  Otro: 'neutral',
}

export interface RunAgentOptions {
  /** Token budget for the whole assignment (default 200K). */
  tokenBudget?: number
  /** Stop after stage N — useful for tests. Defaults to full pipeline. */
  stopAfter?: 'plan' | 'research' | 'synth' | 'verify'
}

export interface RunAgentResult {
  draft: JournalistReportDraft
  debug: {
    plan: JournalistPlanResponse | null
    synth: JournalistSynthResponse | null
    verify: JournalistVerifyResponse | null
    researchSummary: {
      localHits: number
      pressHits: number
      plenoClaimHits: number
      promiseHits: number
      wikidataOk: boolean
      wikipediaOk: boolean
      webResults: number
      urlFetches: number
      auditRuns: number
    }
  }
}

const PROMISES_PATH = resolve('public/data/promises.json')

function readPromisesSnapshot(): { frozenUntil: string | null } | null {
  if (!existsSync(PROMISES_PATH)) return null
  try {
    const raw = JSON.parse(readFileSync(PROMISES_PATH, 'utf8')) as { frozenUntil?: string | null }
    return { frozenUntil: raw.frozenUntil ?? null }
  } catch {
    return null
  }
}

export class JournalistAgentError extends Error {
  constructor(msg: string) {
    super(msg)
    this.name = 'JournalistAgentError'
  }
}

/**
 * Run the four-stage pipeline for one assignment. Returns the draft +
 * the intermediate LLM outputs (for tests). Throws only on freeze or
 * fatal config error; partial failures end up in `draft.warnings`.
 */
export async function runJournalistAgent(
  assignment: JournalistAssignment,
  opts: RunAgentOptions = {},
): Promise<RunAgentResult> {
  const tokenBudget = opts.tokenBudget ?? (Number(process.env.JOURNALIST_TOKEN_BUDGET) || 200_000)
  resetBudget(tokenBudget)
  resetCitationCounter()

  const promises = readPromisesSnapshot()
  if (isJournalistFrozen(promises)) {
    throw new JournalistAgentError(
      `LOREG electoral freeze active until ${promises?.frozenUntil} — refusing to draft`,
    )
  }

  const config = loadConfigFromEnv()
  const warnings: string[] = []
  const sources: SourceCitation[] = []
  const evidence: Array<{
    citationId: string
    kind: string
    title: string
    url?: string
    publishedAt?: string
    trust: 'high' | 'medium' | 'low'
    excerpt?: string
  }> = []

  const subjectName = assignment.subject.name
  const subjectSlug = assignment.subject.slug

  // ─── Local hints (before Stage 1) ────────────────────────────────────────
  const officialRow = subjectSlug ? fetchOfficialBySlug(subjectSlug) : null
  const pressHits: PressHit[] = fetchPressForSubject(subjectName, 30)
  const plenoClaimHits = fetchPlenoClaimsForSubject(subjectName, 20)
  const partyHint = officialRow?.party ?? null
  const promiseHits: PromiseHit[] = partyHint ? fetchPromisesForParty(partyHint, 25) : []
  const judicialMentions =
    plenoClaimHits.filter((c) => JUDICIAL_TOKENS.some((rx) => rx.test(c.verbatim))).length +
    pressHits.filter((p) => JUDICIAL_TOKENS.some((rx) => rx.test(p.title))).length

  // ─── Stage 1: PLAN ───────────────────────────────────────────────────────
  const plan = await callLLM({
    systemPrompt: buildJournalistPlanSystemPrompt(),
    userPrompt: buildJournalistPlanUserPrompt({
      assignment: {
        id: assignment.id,
        kind: assignment.kind,
        subjectName,
        subjectSlug,
        subjectKind: assignment.subject.kind,
        brief: assignment.brief,
      },
      localHints: {
        officialRow: officialRow as unknown as Record<string, unknown> | null,
        pressCount: pressHits.length,
        plenoClaimCount: plenoClaimHits.length,
        promiseCount: promiseHits.length,
        judicialMentions,
      },
    }),
    promptVersion: JOURNALIST_PLAN_VERSION,
    schema: JournalistPlanResponseSchema,
    input: { assignmentId: assignment.id, version: JOURNALIST_PLAN_VERSION },
    config,
  })
  if (!plan) {
    warnings.push('stage 1 (plan) returned no output — falling back to local-only research')
  }
  if (opts.stopAfter === 'plan') {
    return buildEarlyDraft(assignment, sources, evidence, warnings, plan, null, null, {
      localHits: 0,
      pressHits: pressHits.length,
      plenoClaimHits: plenoClaimHits.length,
      promiseHits: promiseHits.length,
      wikidataOk: false,
      wikipediaOk: false,
      webResults: 0,
      urlFetches: 0,
      auditRuns: 0,
    })
  }

  // ─── Stage 2: RESEARCH (deterministic) ───────────────────────────────────
  let localHitCount = 0
  let wikidataOk = false
  let wikipediaOk = false
  let webResults = 0
  let urlFetches = 0
  let auditRuns = 0

  if (officialRow) {
    const cite = buildLocalCitation({
      localPath: 'public/data/officials.json',
      title: `Officials snapshot — ${officialRow.name}`,
      excerpt: `role: ${officialRow.role} · party: ${officialRow.party} · portfolios: ${officialRow.portfolios.join(', ')}`,
    })
    sources.push(cite)
    evidence.push({
      citationId: cite.id,
      kind: cite.kind,
      title: cite.title,
      trust: cite.trust,
      excerpt: cite.excerpt,
    })
  }

  for (const ph of pressHits.slice(0, 8)) {
    if (!ph.url || !/^https?:\/\//.test(ph.url)) continue
    const cite = buildWebCitation({
      url: ph.url,
      title: ph.title,
      publisher: ph.source,
      publishedAt: ph.publishedAt || undefined,
      excerpt: ph.summary,
      trust: 'medium',
    })
    sources.push(cite)
    evidence.push({
      citationId: cite.id,
      kind: cite.kind,
      title: cite.title,
      url: cite.url,
      publishedAt: cite.publishedAt,
      trust: cite.trust,
      excerpt: cite.excerpt,
    })
  }

  for (const pc of plenoClaimHits.slice(0, 8)) {
    const cite = buildLocalCitation({
      localPath: 'public/data/pleno-claims-suggestions.json',
      title: `Pleno claim ${pc.id} · ${pc.plenoDate ?? '?'} · ${pc.type}`,
      excerpt: pc.verbatim,
    })
    sources.push(cite)
    evidence.push({
      citationId: cite.id,
      kind: cite.kind,
      title: cite.title,
      trust: cite.trust,
      excerpt: cite.excerpt,
    })
  }

  if (plan?.questions) {
    for (const q of plan.questions) {
      try {
        switch (q.suggestedTool) {
          case 'local-snapshot': {
            const hits: LocalHit[] = searchLocalSnapshots(q.queryHint ?? subjectName, {
              perFileLimit: 2,
            })
            localHitCount += hits.length
            for (const h of hits.slice(0, 3)) {
              const cite = buildLocalCitation({
                localPath: h.localPath,
                title: `${h.localPath} · ${h.matchedField}`,
                excerpt: h.preview,
              })
              sources.push(cite)
              evidence.push({
                citationId: cite.id,
                kind: cite.kind,
                title: cite.title,
                trust: cite.trust,
                excerpt: cite.excerpt,
              })
            }
            break
          }
          case 'wikidata': {
            const qid = q.queryHint?.trim()
            if (!qid || !/^Q\d+$/.test(qid)) break
            const wd = await fetchWikidata(qid)
            if (wd) {
              wikidataOk = true
              const cite = buildWikidataCitation(wd, 'es')
              sources.push(cite)
              evidence.push({
                citationId: cite.id,
                kind: cite.kind,
                title: cite.title,
                url: cite.url,
                trust: cite.trust,
                excerpt: cite.excerpt,
              })
            }
            break
          }
          case 'wikipedia': {
            const title = q.queryHint?.trim() || subjectName
            const wp = await fetchWikipedia(title, 'es')
            if (wp) {
              wikipediaOk = true
              const cite = buildWikipediaCitation(wp)
              sources.push(cite)
              evidence.push({
                citationId: cite.id,
                kind: cite.kind,
                title: cite.title,
                url: cite.url,
                trust: cite.trust,
                excerpt: cite.excerpt,
              })
            }
            break
          }
          case 'web-search': {
            const query = q.queryHint?.trim() || `${subjectName} Riba-roja`
            const result = await webSearch(query, { numResults: 5 })
            webResults += result.results.length
            for (const r of result.results.slice(0, 3)) {
              if (!r.url || !/^https?:\/\//.test(r.url)) continue
              const cite = buildWebCitation({
                url: r.url,
                title: r.title || r.url,
                publishedAt: r.publishedDate?.slice(0, 10),
                excerpt: r.text,
                trust: 'medium',
              })
              sources.push(cite)
              evidence.push({
                citationId: cite.id,
                kind: cite.kind,
                title: cite.title,
                url: cite.url,
                publishedAt: cite.publishedAt,
                trust: cite.trust,
                excerpt: cite.excerpt,
              })
            }
            break
          }
          case 'fetch-url': {
            const url = q.queryHint?.trim()
            if (!url || !/^https?:\/\//.test(url)) break
            const fetched = await fetchUrl(url)
            urlFetches += 1
            if (fetched.ok && fetched.bodyExcerpt) {
              const cite = buildWebCitation({
                url: fetched.url,
                title: `Fuente oficial: ${new URL(fetched.url).hostname}`,
                excerpt: stripHtml(fetched.bodyExcerpt).slice(0, 480),
                archiveUrl: fetched.archiveUrl,
                trust: isWhitelisted(fetched.url) ? 'high' : 'medium',
              })
              sources.push(cite)
              evidence.push({
                citationId: cite.id,
                kind: cite.kind,
                title: cite.title,
                url: cite.url,
                trust: cite.trust,
                excerpt: cite.excerpt,
              })
            }
            break
          }
          case 'audit-url': {
            const url = q.queryHint?.trim()
            if (!url || !/^https?:\/\//.test(url)) break
            const result = await audit(url)
            auditRuns += 1
            if (result.archiveUrl) {
              const cite = buildWebCitation({
                url: result.archiveUrl,
                title: `Snapshot Wayback de ${new URL(url).hostname}`,
                trust: 'high',
                archiveUrl: result.archiveUrl,
              })
              sources.push(cite)
              evidence.push({
                citationId: cite.id,
                kind: cite.kind,
                title: cite.title,
                url: cite.url,
                trust: cite.trust,
                excerpt: cite.excerpt,
              })
            }
            break
          }
          // Phase A↔B: deeper soul.md tools the planner can request.
          case 'pdf-fetch': {
            const url = q.queryHint?.trim()
            if (!url || !/^https?:\/\//.test(url)) break
            const fetched = await fetchPdfUrl(url)
            urlFetches += 1
            if (fetched.ok && fetched.bodyExcerpt) {
              const cite = buildWebCitation({
                url: fetched.url,
                title: `PDF: ${(() => {
                  try {
                    return new URL(fetched.url).hostname.replace(/^www\./, '')
                  } catch {
                    return fetched.url
                  }
                })()}`,
                excerpt: fetched.bodyExcerpt.slice(0, 480),
                archiveUrl: fetched.archiveUrl,
                trust: isWhitelisted(fetched.url) ? 'high' : 'medium',
              })
              sources.push(cite)
              evidence.push({
                citationId: cite.id,
                kind: cite.kind,
                title: cite.title,
                url: cite.url,
                trust: cite.trust,
                excerpt: cite.excerpt,
              })
            }
            break
          }
          case 'headless-fetch': {
            const url = q.queryHint?.trim()
            if (!url || !/^https?:\/\//.test(url)) break
            const fetched = await fetchUrlHeadless(url)
            urlFetches += 1
            if (fetched.ok && fetched.bodyExcerpt) {
              const cite = buildWebCitation({
                url: fetched.url,
                title: `SPA: ${(() => {
                  try {
                    return new URL(fetched.url).hostname.replace(/^www\./, '')
                  } catch {
                    return fetched.url
                  }
                })()}`,
                excerpt: stripHtml(fetched.bodyExcerpt).slice(0, 480),
                archiveUrl: fetched.archiveUrl,
                trust: isWhitelisted(fetched.url) ? 'high' : 'medium',
              })
              sources.push(cite)
              evidence.push({
                citationId: cite.id,
                kind: cite.kind,
                title: cite.title,
                url: cite.url,
                trust: cite.trust,
                excerpt: cite.excerpt,
              })
            }
            break
          }
          case 'boe-search':
          case 'dogv-search': {
            const fn = q.suggestedTool === 'boe-search' ? fetchBoeForSubject : fetchDogvForSubject
            const hits = await fn(q.queryHint?.trim() || subjectName, 6)
            for (const h of hits.slice(0, 4)) {
              const cite = buildWebCitation({
                url: h.url,
                title: h.title.slice(0, 240),
                publisher: q.suggestedTool === 'boe-search' ? 'BOE' : 'DOGV',
                publishedAt: h.date || undefined,
                trust: 'high',
              })
              sources.push(cite)
              evidence.push({
                citationId: cite.id,
                kind: cite.kind,
                title: cite.title,
                url: cite.url,
                publishedAt: cite.publishedAt,
                trust: cite.trust,
              })
            }
            break
          }
          case 'dialnet-search': {
            const hits = await fetchDialnet(q.queryHint?.trim() || subjectName, 6)
            for (const h of hits.slice(0, 4)) {
              const cite = buildWebCitation({
                url: h.url,
                title: h.title.slice(0, 240),
                publisher: 'Dialnet',
                publishedAt: h.year ? `${h.year}-01-01` : undefined,
                trust: 'high',
              })
              sources.push(cite)
              evidence.push({
                citationId: cite.id,
                kind: cite.kind,
                title: cite.title,
                url: cite.url,
                publishedAt: cite.publishedAt,
                trust: cite.trust,
              })
            }
            break
          }
          case 'hemeroteca-search': {
            const raw = (q.queryHint ?? '').trim()
            const [name, yearStr] = raw.includes('|') ? raw.split('|') : [subjectName, raw]
            const year = Number(yearStr)
            if (!Number.isInteger(year) || year < 1900 || year > 2099) break
            const hits = await fetchHemerotecaQuery(name.trim() || subjectName, year)
            for (const h of hits.slice(0, 4)) {
              const cite = buildWebCitation({
                url: h.url,
                title: h.title.slice(0, 240),
                publisher: 'Hemeroteca La Vanguardia',
                publishedAt: h.date,
                trust: 'medium',
              })
              sources.push(cite)
              evidence.push({
                citationId: cite.id,
                kind: cite.kind,
                title: cite.title,
                url: cite.url,
                publishedAt: cite.publishedAt,
                trust: cite.trust,
              })
            }
            break
          }
          // officials/press/plenoclaims/promises are seed-only — duplicating
          // them per planned question would just inflate the citation list
          // without adding signal.
          default:
            break
        }
      } catch (err) {
        warnings.push(`research[${q.id}] failed: ${(err as Error).message.slice(0, 160)}`)
      }
    }
  }

  // ─── Stage 2b: Biography enrichment (deterministic) ──────────────────────
  // For `kind: 'biography'`, the LLM-planned questions rarely span the full
  // public-career timeline. Issue a year-binned web-search sweep so the
  // press-sparkline + narrative actually reach back to early mentions,
  // then auto-fetch full bodies for the top whitelist-trusted URLs so
  // synth has educational/career details to work with — not just snippets.
  const datedWebHits: Array<{ title: string; url: string; publishedAt: string; source: string }> =
    []
  if (assignment.kind === 'biography' || assignment.kind === 'profile') {
    try {
      const sweep = await webSearchYears(subjectName)
      webResults += sweep.results.length
      // Promote each unique sweep result to a web citation + extract any
      // parseable published date for the sparkline pool.
      // Subject-name relevance gate: at least one >=4-char token from the
      // subject's name must appear (case/diacritic-insensitive) in either
      // the title or the URL host/path. Filters out hits like
      // `Robert (muñeco)` Wikipedia page when the subject is "Robert Raga".
      const subjectTokens = subjectName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 4)
      for (const r of sweep.results.slice(0, 18)) {
        if (!r.url || !/^https?:\/\//.test(r.url)) continue
        const haystack = ((r.title ?? '') + ' ' + r.url)
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
        const relevant = subjectTokens.some((t) => haystack.includes(t))
        if (!relevant) continue
        // Try explicit publishedDate first; fall back to a date pattern
        // in the URL itself (common on news sites — /YYYY/MM/DD/slug/ or
        // /YYYY-MM-DD-slug.html); finally fall back to a 4-digit year
        // in the URL path (best-effort, anchored to month-01-01).
        const publishedAt = extractDateFromHit(r.publishedDate, r.url) ?? undefined
        const cite = buildWebCitation({
          url: r.url,
          title: r.title || r.url,
          publishedAt,
          excerpt: r.text,
          trust: 'medium',
        })
        sources.push(cite)
        evidence.push({
          citationId: cite.id,
          kind: cite.kind,
          title: cite.title,
          url: cite.url,
          publishedAt: cite.publishedAt,
          trust: cite.trust,
          excerpt: cite.excerpt,
        })
        if (publishedAt) {
          let host = ''
          try {
            host = new URL(r.url).hostname.replace(/^www\./, '')
          } catch {
            host = ''
          }
          datedWebHits.push({ title: r.title || r.url, url: r.url, publishedAt, source: host })
        }
      }
      // Auto-fetch full body for the top whitelist-trusted URLs from the
      // sweep so the synth stage sees real article text (~8KB) rather
      // than the ~200-char SearXNG snippet. This is where educational
      // background, dates of birth, party affiliations, etc. tend to live.
      const candidates = [
        ...(officialRow?.cvUrl ? [{ url: officialRow.cvUrl, title: 'CV oficial' }] : []),
        ...sweep.results,
      ]
      const fetched = await fetchTopUrls(candidates, { max: 6 })
      urlFetches += fetched.length
      for (const f of fetched) {
        const cite = buildWebCitation({
          url: f.url,
          title: `Texto completo: ${(() => {
            try {
              return new URL(f.url).hostname.replace(/^www\./, '')
            } catch {
              return f.url
            }
          })()}`,
          excerpt: stripHtml(f.bodyExcerpt ?? '').slice(0, 480),
          archiveUrl: f.archiveUrl,
          trust: 'high', // whitelist-only, see DEFAULT_FETCH_ALLOW
        })
        sources.push(cite)
        evidence.push({
          citationId: cite.id,
          kind: cite.kind,
          title: cite.title,
          url: cite.url,
          trust: cite.trust,
          excerpt: cite.excerpt,
        })
      }
    } catch (err) {
      warnings.push(`biography sweep failed: ${(err as Error).message.slice(0, 160)}`)
    }
  }

  if (opts.stopAfter === 'research') {
    return buildEarlyDraft(assignment, sources, evidence, warnings, plan, null, null, {
      localHits: localHitCount,
      pressHits: pressHits.length,
      plenoClaimHits: plenoClaimHits.length,
      promiseHits: promiseHits.length,
      wikidataOk,
      wikipediaOk,
      webResults,
      urlFetches,
      auditRuns,
    })
  }

  // ─── Stage 2c: BIO-EXTRACT (LLM) ─────────────────────────────────────────
  // Reads the top fetched bodies + a regex hint table and emits a
  // structured BioResponse the agent then projects directly into the
  // new soul.md section kinds (identity / education / career-* /
  // legal-record / financial / online-presence / awards / publications /
  // gaps-detected). Skipped for non-biography assignments.
  const bioSections: ReportSection[] = []
  const newGaps: Array<{ field: string; reason: string }> = []
  if ((assignment.kind === 'biography' || assignment.kind === 'profile') && sources.length > 0) {
    // Compose hint table by concatenating all fetched bodies through the
    // regex extractor. Cheap and resilient — even when the LLM fails,
    // the projection still ships whatever regex-only data we got.
    const allBodies = sources
      .filter((s) => s.excerpt && s.excerpt.length > 80)
      .map((s) => ({ citationId: s.id, url: s.url, title: s.title, excerpt: s.excerpt as string }))
    const concatText = allBodies.map((b) => b.excerpt).join('\n\n')
    const hints = extractBioEntities(concatText, subjectName)
    const bio = await callLLM({
      systemPrompt: buildJournalistBioSystemPrompt(),
      userPrompt: buildJournalistBioUserPrompt({
        subjectName,
        ...(subjectSlug ? { subjectSlug } : {}),
        hints,
        bodies: allBodies.slice(0, 8),
      }),
      promptVersion: JOURNALIST_BIO_VERSION,
      schema: JournalistBioResponseSchema,
      input: { assignmentId: assignment.id, sourceCount: allBodies.length },
      config,
    })

    const sourceIdSet = new Set(sources.map((s) => s.id))
    const validateRefs = (ids: string[]): string[] => ids.filter((id) => sourceIdSet.has(id))
    const allowFinancialHosts = (ids: string[]): string[] =>
      ids.filter((id) => {
        const src = sources.find((s) => s.id === id)
        if (!src?.url) return false
        try {
          const host = new URL(src.url).hostname.replace(/^www\./, '')
          return [
            'transparentia.newtral.es',
            'newtral.es',
            'boe.es',
            'dogv.gva.es',
            'gva.es',
          ].includes(host)
        } catch {
          return false
        }
      })

    // Project bio response (or regex-only fallback when LLM returns null)
    // into the 10 new section kinds. Each projection drops rows that:
    //  - reference unknown citation ids (validateRefs)
    //  - violate libel rules (financial requires allowlisted host;
    //    family names require all-high-trust citations)
    const proj = bio ?? {
      identity:
        hints.dateOfBirth || hints.birthplace
          ? {
              dateOfBirth: hints.dateOfBirth ?? null,
              birthplace: hints.birthplace ?? null,
              residence: null,
              nationality: null,
            }
          : null,
      education: hints.degrees.map((d) => ({
        degree: d.degree,
        institution: d.institution ?? null,
        startYear: d.startYear ?? null,
        endYear: d.endYear ?? null,
        citationIds: [] as string[],
      })),
      careerPolitical: [],
      careerProfessional: hints.careerSpans
        .filter((c) => c.startYear !== undefined)
        .map((c) => ({
          role: c.role,
          org: c.org ?? '?',
          startYear: c.startYear ?? null,
          endYear: c.endYear ?? null,
          citationIds: [] as string[],
        })),
      legalRecord: hints.judicialRefs.slice(0, 4).map((j) => ({
        caseRef: j.caseRef,
        court: '(según fuentes citadas)',
        date: null,
        outcome: null,
        verbatimRef: j.verbatim.slice(0, 600),
        citationIds: [] as string[],
      })),
      financial: [],
      onlinePresence: [],
      awards: [],
      publications: [],
      gapsDetected: [
        ...(hints.dateOfBirth
          ? []
          : [{ field: 'fecha de nacimiento', reason: 'no encontrado en fuentes' }]),
        ...(hints.degrees.length > 0
          ? []
          : [{ field: 'formación', reason: 'no encontrado en fuentes' }]),
      ],
    }
    if (!bio)
      warnings.push('stage 2c (bio-extract) returned no LLM output — using regex-only hints')

    // identity
    if (proj.identity) {
      const fam = (proj.identity.family ?? [])
        .map((f) => {
          const refs = validateRefs(f.citationIds ?? [])
          // Family rows that name a person: require all-high-trust sources
          if (f.name) {
            const allHighTrust = refs.every(
              (id) => sources.find((s) => s.id === id)?.trust === 'high',
            )
            if (!allHighTrust) return null
          }
          return {
            relation: f.relation,
            ...(f.name ? { name: f.name } : {}),
            sourceIds: refs,
          }
        })
        .filter((f): f is { relation: string; name?: string; sourceIds: string[] } => f !== null)
      const idPayload = {
        ...(proj.identity.dateOfBirth ? { dateOfBirth: proj.identity.dateOfBirth } : {}),
        ...(proj.identity.birthplace ? { birthplace: proj.identity.birthplace } : {}),
        ...(proj.identity.residence ? { residence: proj.identity.residence } : {}),
        ...(proj.identity.nationality ? { nationality: proj.identity.nationality } : {}),
        ...(fam.length > 0 ? { family: fam } : {}),
        sourceIds: validateRefs(
          // fall back to citing the strongest single source (officials)
          // so the identity card always has a parent ref.
          [sources[0]?.id].filter(Boolean) as string[],
        ),
      }
      if (
        idPayload.dateOfBirth ||
        idPayload.birthplace ||
        idPayload.residence ||
        idPayload.nationality ||
        idPayload.family
      ) {
        bioSections.push({ kind: 'identity', payload: idPayload })
      }
    }

    // education
    const education = (proj.education ?? [])
      .map((e) => ({
        degree: e.degree,
        ...(e.institution ? { institution: e.institution } : {}),
        ...(e.startYear !== undefined && e.startYear !== null ? { startYear: e.startYear } : {}),
        ...(e.endYear !== undefined && e.endYear !== null ? { endYear: e.endYear } : {}),
        sourceIds: validateRefs(e.citationIds ?? []),
      }))
      .filter((e) => e.degree.length >= 2)
    if (education.length > 0) bioSections.push({ kind: 'education', payload: { items: education } })

    // career-political
    const cp = (proj.careerPolitical ?? [])
      .filter((c) => c.startYear !== undefined && c.startYear !== null)
      .map((c) => ({
        role: c.role,
        org: c.org,
        startYear: c.startYear as number,
        ...(c.endYear !== undefined && c.endYear !== null ? { endYear: c.endYear } : {}),
        sourceIds: validateRefs(c.citationIds ?? []),
      }))
    if (cp.length > 0) bioSections.push({ kind: 'career-political', payload: { items: cp } })

    // career-professional
    const cpro = (proj.careerProfessional ?? []).map((c) => ({
      role: c.role,
      org: c.org,
      ...(c.startYear !== undefined && c.startYear !== null ? { startYear: c.startYear } : {}),
      ...(c.endYear !== undefined && c.endYear !== null ? { endYear: c.endYear } : {}),
      sourceIds: validateRefs(c.citationIds ?? []),
    }))
    if (cpro.length > 0) bioSections.push({ kind: 'career-professional', payload: { items: cpro } })

    // legal-record
    const legal = (proj.legalRecord ?? [])
      .filter((l) => l.verbatimRef.length >= 20)
      .map((l) => ({
        caseRef: l.caseRef,
        court: l.court,
        ...(l.date ? { date: l.date } : {}),
        ...(l.outcome ? { outcome: l.outcome } : {}),
        verbatimRef: l.verbatimRef,
        sourceIds: validateRefs(l.citationIds ?? []),
      }))
      .filter((l) => l.sourceIds.length >= 1) // schema requires ≥1
    if (legal.length > 0) bioSections.push({ kind: 'legal-record', payload: { items: legal } })

    // financial (hostname allowlist)
    const fin = (proj.financial ?? [])
      .map((f) => ({
        year: f.year,
        metric: f.metric,
        ...(f.amountEuros !== undefined && f.amountEuros !== null
          ? { amountEuros: f.amountEuros }
          : {}),
        description: f.description,
        sourceIds: allowFinancialHosts(validateRefs(f.citationIds ?? [])),
      }))
      .filter((f) => f.sourceIds.length >= 1)
    if (fin.length > 0) bioSections.push({ kind: 'financial', payload: { items: fin } })

    // online-presence
    const onl = (proj.onlinePresence ?? []).map((o) => ({
      platform: o.platform,
      handle: o.handle,
      url: o.url,
      ...(o.verifiedAt ? { verifiedAt: o.verifiedAt } : {}),
      sourceIds: validateRefs(o.citationIds ?? []),
    }))
    if (onl.length > 0) bioSections.push({ kind: 'online-presence', payload: { accounts: onl } })

    // awards
    const aw = (proj.awards ?? []).map((a) => ({
      name: a.name,
      awardedBy: a.awardedBy,
      ...(a.year !== undefined && a.year !== null ? { year: a.year } : {}),
      sourceIds: validateRefs(a.citationIds ?? []),
    }))
    if (aw.length > 0) bioSections.push({ kind: 'awards', payload: { items: aw } })

    // publications
    const pubs = (proj.publications ?? []).map((p) => ({
      title: p.title,
      venue: p.venue,
      ...(p.year !== undefined && p.year !== null ? { year: p.year } : {}),
      ...(p.url ? { url: p.url } : {}),
      sourceIds: validateRefs(p.citationIds ?? []),
    }))
    if (pubs.length > 0) bioSections.push({ kind: 'publications', payload: { items: pubs } })

    // gaps-detected — always emit (libel rule says report MUST admit gaps).
    // Merge LLM gaps + regex-derived gaps + any field we couldn't fill at
    // all. We collect now and push the final section after synth so any
    // gaps the synth itself reports get unified into one section.
    for (const g of proj.gapsDetected ?? []) newGaps.push({ field: g.field, reason: g.reason })
  }

  // ─── Stage 3: SYNTH ──────────────────────────────────────────────────────
  // Cap evidence at 18 rows for the prompt — biography sweeps can yield
  // 30+ sources which overflow gemini's prompt budget (returns truncated
  // JSON) and OOM smaller ollama models. Keep all rows in `sources`/the
  // sourceLedger UI; just hand the synth a curated top-N. Rank: high-trust
  // first, then most-recent published, then fall back to original order.
  const cappedEvidence = [...evidence]
    .sort((a, b) => {
      const trustRank = { high: 0, medium: 1, low: 2 } as const
      const t = trustRank[a.trust] - trustRank[b.trust]
      if (t !== 0) return t
      const ad = a.publishedAt ?? ''
      const bd = b.publishedAt ?? ''
      return bd.localeCompare(ad)
    })
    .slice(0, 18)
  const synth = await callLLM({
    systemPrompt: buildJournalistSynthSystemPrompt(),
    userPrompt: buildJournalistSynthUserPrompt({
      assignment: {
        id: assignment.id,
        kind: assignment.kind,
        subjectName,
        subjectSlug,
        subjectKind: assignment.subject.kind,
        brief: assignment.brief,
      },
      evidence: cappedEvidence,
      pressHits,
      promiseHits,
    }),
    promptVersion: JOURNALIST_SYNTH_VERSION,
    schema: JournalistSynthResponseSchema,
    input: { assignmentId: assignment.id, evidenceCount: evidence.length },
    config,
  })
  if (!synth) {
    warnings.push('stage 3 (synth) returned no output — producing minimal draft')
  }

  const sourceIdSet = new Set(sources.map((s) => s.id))
  const synthSections: ReportSection[] = buildSections(
    synth,
    sourceIdSet,
    officialRow,
    pressHits,
    promiseHits,
    warnings,
    datedWebHits,
  )

  // Merge synth's sections with the bio-extract Phase-B sections.
  // Order: portrait first (synth), then identity (bio), then synth
  // narratives, then bio dossier (education/career/legal/financial/
  // online/awards/publications), then synth's timeline/relationships/
  // sparkline/promise-board/quote-cards, then gaps-detected last.
  const portraitS = synthSections.filter((s) => s.kind === 'portrait')
  const identityS = bioSections.filter((s) => s.kind === 'identity')
  const narrativeS = synthSections.filter((s) => s.kind === 'narrative')
  const dossierS = bioSections.filter((s) =>
    [
      'education',
      'career-political',
      'career-professional',
      'legal-record',
      'financial',
      'online-presence',
      'awards',
      'publications',
    ].includes(s.kind),
  )
  const restS = synthSections.filter((s) => !['portrait', 'narrative'].includes(s.kind))
  // Build the final gaps-detected section by unifying:
  //   - newGaps (LLM bio output)
  //   - regex-derived gaps (already in newGaps when LLM was null)
  //   - any field the dossier still left empty
  const dossierKindsPresent = new Set(dossierS.map((s) => s.kind))
  const autoGaps: Array<{ field: string; reason: string }> = []
  if (assignment.kind === 'biography' || assignment.kind === 'profile') {
    if (!identityS.some((s) => s.kind === 'identity' && s.payload.dateOfBirth)) {
      autoGaps.push({ field: 'fecha de nacimiento', reason: 'no encontrado en fuentes accesibles' })
    }
    if (!dossierKindsPresent.has('education')) {
      autoGaps.push({ field: 'formación', reason: 'no encontrado en fuentes accesibles' })
    }
    if (
      !dossierKindsPresent.has('career-political') &&
      !dossierKindsPresent.has('career-professional')
    ) {
      autoGaps.push({ field: 'carrera profesional', reason: 'no encontrado en fuentes accesibles' })
    }
  }
  const mergedGaps = [...newGaps, ...autoGaps]
  const seenGapFields = new Set<string>()
  const uniqueGaps = mergedGaps.filter((g) => {
    const k = g.field.toLowerCase()
    if (seenGapFields.has(k)) return false
    seenGapFields.add(k)
    return true
  })
  const gapsSection: ReportSection[] =
    uniqueGaps.length > 0 ? [{ kind: 'gaps-detected', payload: { missing: uniqueGaps } }] : []

  const sections: ReportSection[] = [
    ...portraitS,
    ...identityS,
    ...narrativeS,
    ...dossierS,
    ...restS,
    ...gapsSection,
  ]

  if (opts.stopAfter === 'synth') {
    return finalize(assignment, sections, sources, warnings, evidence, plan, synth, null, {
      localHits: localHitCount,
      pressHits: pressHits.length,
      plenoClaimHits: plenoClaimHits.length,
      promiseHits: promiseHits.length,
      wikidataOk,
      wikipediaOk,
      webResults,
      urlFetches,
      auditRuns,
    })
  }

  // ─── Stage 4: VERIFY ─────────────────────────────────────────────────────
  const verify = await callLLM({
    systemPrompt: buildJournalistVerifySystemPrompt(),
    userPrompt: buildJournalistVerifyUserPrompt({
      draftJson: JSON.stringify({ sections, warnings }),
      sourcesJson: JSON.stringify(sources),
    }),
    promptVersion: JOURNALIST_VERIFY_VERSION,
    schema: JournalistVerifyResponseSchema,
    input: { assignmentId: assignment.id, sectionCount: sections.length },
    config,
  })
  if (verify?.warnings) {
    for (const w of verify.warnings) {
      if (!warnings.includes(w)) warnings.push(w)
    }
  }
  if (!verify) {
    warnings.push('stage 4 (verify) returned no output — escalation defaulted from heuristics')
  }

  return finalize(assignment, sections, sources, warnings, evidence, plan, synth, verify, {
    localHits: localHitCount,
    pressHits: pressHits.length,
    plenoClaimHits: plenoClaimHits.length,
    promiseHits: promiseHits.length,
    wikidataOk,
    wikipediaOk,
    webResults,
    urlFetches,
    auditRuns,
  })
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const TRUSTED_HOSTS = new Set([
  'ribarroja.es',
  'www.ribarroja.es',
  'wikidata.org',
  'www.wikidata.org',
  'es.wikipedia.org',
  'ca.wikipedia.org',
  'en.wikipedia.org',
  'boe.es',
  'www.boe.es',
  'gva.es',
  'www.gva.es',
  'juntaelectoralcentral.es',
  'web.archive.org',
])

function isWhitelisted(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return TRUSTED_HOSTS.has(host) || host.endsWith('.gva.es')
  } catch {
    return false
  }
}

/**
 * Best-effort date extractor for a web-search hit. Tries (in order):
 *   1. The engine-provided publishedDate, if present + ISO-ish.
 *   2. Date patterns in the URL itself (/YYYY/MM/DD/ or /YYYY-MM-DD/).
 *   3. A 4-digit year in the URL path (anchored to Jan-01).
 * Returns YYYY-MM-DD on success, null otherwise.
 */
function extractDateFromHit(publishedDate: string | undefined, url: string): string | null {
  if (publishedDate) {
    const m = publishedDate.match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) return m[1]
  }
  // /2024/03/14/ or /2024-03-14/ in URL path
  const dateInPath = url.match(/\/(\d{4})[-/](\d{2})[-/](\d{2})(?:[/_.-]|$)/)
  if (dateInPath) {
    const y = Number(dateInPath[1])
    const mo = Number(dateInPath[2])
    const d = Number(dateInPath[3])
    if (y >= 1990 && y <= 2099 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${dateInPath[1]}-${dateInPath[2]}-${dateInPath[3]}`
    }
  }
  // Year only somewhere in the URL path (e.g. /2019/some-article-slug)
  const yearOnly = url.match(/\/(19[0-9]{2}|20[0-9]{2})\b/)
  if (yearOnly) return `${yearOnly[1]}-01-01`
  return null
}

function stripHtml(s: string): string {
  // Drop the entire <head>, all script/style/nav/footer/aside blocks,
  // remaining tags, all-whitespace runs. Try to find a main-content
  // container first; if present, slice from there so we don't leak
  // navigation/CSS-link cruft into the excerpt.
  let working = s
  // Cheap heuristic: prefer the slice starting at <main>, <article>,
  // <div id="content"|"main"|"contenido">, in that order. These cover
  // ribarroja.es (Drupal-ish) and most Spanish news sites we hit.
  const anchorRx = [
    /<main[^>]*>/i,
    /<article[^>]*>/i,
    /<div[^>]+(?:id|class)\s*=\s*["'][^"']*\b(?:content|main|contenido|cuerpo|body-content|node-content)\b[^"']*["'][^>]*>/i,
  ]
  for (const rx of anchorRx) {
    const m = working.match(rx)
    if (m && m.index !== undefined) {
      working = working.slice(m.index)
      break
    }
  }
  return working
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSections(
  synth: JournalistSynthResponse | null,
  sourceIdSet: Set<string>,
  officialRow: ReturnType<typeof fetchOfficialBySlug>,
  pressHits: PressHit[],
  promiseHits: PromiseHit[],
  warnings: string[],
  datedWebHits: Array<{ title: string; url: string; publishedAt: string; source: string }> = [],
): ReportSection[] {
  const sections: ReportSection[] = []

  if (officialRow) {
    const partyTone = PARTY_TONE[officialRow.party] ?? 'civic'
    sections.push({
      kind: 'portrait',
      payload: {
        officialSlug: officialRow.slug,
        photoPath: officialRow.photoUrl ?? `/data/photos/${officialRow.slug}.jpg`,
        partyTone,
        portfolios: officialRow.portfolios,
        ...(officialRow.cvUrl ? { cvUrl: officialRow.cvUrl } : {}),
      },
    })
  }

  if (!synth) {
    if (sourceIdSet.size > 0) {
      sections.push({
        kind: 'narrative',
        payload: {
          heading: 'Borrador automático sin síntesis',
          bodyMarkdown:
            'La etapa de síntesis no devolvió contenido. Revisar los registros locales y reintentar el agente. La sección de fuentes muestra todo el material recopilado.',
          sourceIds: [Array.from(sourceIdSet)[0]],
        },
      })
    }
    const unified = unifyDatedSources(pressHits, datedWebHits)
    if (unified.headlines.length > 0 || unified.points.length > 0) {
      sections.push({
        kind: 'press-sparkline',
        payload: { points: unified.points, headlines: unified.headlines },
      })
    }
    return sections
  }

  for (const n of synth.narratives ?? []) {
    const valid = n.citationIds.filter((id) => sourceIdSet.has(id))
    if (valid.length === 0) {
      warnings.push(`narrative "${n.heading.slice(0, 40)}" dropped — no valid citations`)
      continue
    }
    sections.push({
      kind: 'narrative',
      payload: { heading: n.heading, bodyMarkdown: n.bodyMarkdown, sourceIds: valid },
    })
  }

  if (synth.timeline && synth.timeline.length > 0) {
    const events = synth.timeline
      .map((e) => ({
        date: e.date,
        label: e.label,
        sourceIds: e.citationIds.filter((id) => sourceIdSet.has(id)),
      }))
      .filter((e) => e.label.length >= 3)
    if (events.length > 0) {
      sections.push({ kind: 'timeline', payload: { events } })
    }
  }

  if (synth.relationships) {
    const nodes = synth.relationships.nodes
    const validNodeIds = new Set(nodes.map((n) => n.id))
    const edges = synth.relationships.edges
      .filter((e) => validNodeIds.has(e.from) && validNodeIds.has(e.to))
      .map((e) => ({
        from: e.from,
        to: e.to,
        relation: e.relation,
        sourceIds: e.citationIds.filter((id) => sourceIdSet.has(id)),
      }))
      .filter((e) => e.sourceIds.length >= 1)
    if (nodes.length > 0) {
      sections.push({ kind: 'relationships', payload: { nodes, edges } })
    }
  }

  // Unified dated-source pool: local press hits + dated web hits from
  // the biography year-binned sweep. This is what feeds the sparkline
  // points + headline strip when the synth LLM didn't provide its own,
  // OR when the synth's set is sparse vs. the data we actually have.
  const unifiedDated = unifyDatedSources(pressHits, datedWebHits)

  if (synth.pressSparkline) {
    // Merge synth's chosen headlines with our richer pool, preferring
    // synth's selections when present but back-filling from the pool
    // up to a 12-headline cap so the report doesn't look anaemic when
    // the LLM only echoed 1–2 headlines.
    const synthHeadlines = synth.pressSparkline.headlines.filter(
      (h) => h.url && /^https?:\/\//.test(h.url),
    )
    const seenUrls = new Set(synthHeadlines.map((h) => h.url))
    const merged = [...synthHeadlines]
    for (const h of unifiedDated.headlines) {
      if (merged.length >= 12) break
      if (seenUrls.has(h.url)) continue
      seenUrls.add(h.url)
      merged.push(h)
    }
    // Prefer the unified pool when it spans MORE dates than the synth's
    // chosen points — biography sweeps reach back further than the LLM
    // usually echoes in its `pressSparkline.points`. Fall back to the
    // synth's choice only when our pool is empty/narrower.
    const points =
      unifiedDated.points.length >= synth.pressSparkline.points.length
        ? unifiedDated.points
        : synth.pressSparkline.points
    sections.push({ kind: 'press-sparkline', payload: { points, headlines: merged } })
  } else if (unifiedDated.headlines.length > 0 || unifiedDated.points.length > 0) {
    sections.push({
      kind: 'press-sparkline',
      payload: { points: unifiedDated.points, headlines: unifiedDated.headlines },
    })
  }

  if (synth.promiseBoardIds && synth.promiseBoardIds.length > 0) {
    const validIds = synth.promiseBoardIds.filter((id) => promiseHits.some((p) => p.id === id))
    if (validIds.length > 0) {
      sections.push({ kind: 'promise-board', payload: { promiseIds: validIds } })
    }
  } else if (promiseHits.length > 0) {
    sections.push({
      kind: 'promise-board',
      payload: { promiseIds: promiseHits.map((p) => p.id) },
    })
  }

  for (const q of synth.quoteCards ?? []) {
    if (!sourceIdSet.has(q.citationId)) {
      warnings.push(`quoteCard dropped — citation ${q.citationId} unknown`)
      continue
    }
    sections.push({
      kind: 'quote-card',
      payload: {
        verbatim: q.verbatim,
        attributedTo: q.attributedTo,
        ...(q.date ? { date: q.date } : {}),
        sourceId: q.citationId,
      },
    })
  }

  return sections
}

/**
 * Merge local press hits + dated web-search hits into one canonical
 * dated-source pool. Returns {points, headlines}:
 *
 *  · points     — bucketed by YEAR when the span >2 years (so a
 *                 25-year sweep doesn't render as 30 unreadable
 *                 single-day dots); bucketed by MONTH otherwise.
 *  · headlines  — chronologically sorted (newest first), capped at 12,
 *                 deduped by URL.
 */
function unifyDatedSources(
  pressHits: PressHit[],
  datedWebHits: Array<{ title: string; url: string; publishedAt: string; source: string }>,
): {
  points: Array<{ date: string; count: number }>
  headlines: Array<{ title: string; url: string; date: string }>
} {
  type Row = { title: string; url: string; date: string }
  const rows: Row[] = []
  const seenUrl = new Set<string>()
  for (const p of pressHits) {
    if (!p.url || !/^https?:\/\//.test(p.url)) continue
    if (!p.publishedAt || !/^\d{4}-\d{2}-\d{2}/.test(p.publishedAt)) continue
    if (seenUrl.has(p.url)) continue
    seenUrl.add(p.url)
    rows.push({ title: p.title, url: p.url, date: p.publishedAt.slice(0, 10) })
  }
  for (const h of datedWebHits) {
    if (seenUrl.has(h.url)) continue
    seenUrl.add(h.url)
    rows.push({ title: h.title, url: h.url, date: h.publishedAt.slice(0, 10) })
  }
  // Decide bucket granularity from the span. >2 years → bucket by year
  // so the sparkline reads as a career arc; ≤2 years → bucket by month.
  const dates = rows
    .map((r) => r.date)
    .filter(Boolean)
    .sort()
  let bucketByYear = false
  if (dates.length >= 2) {
    const minYear = Number(dates[0].slice(0, 4))
    const maxYear = Number(dates[dates.length - 1].slice(0, 4))
    bucketByYear = maxYear - minYear > 2
  }
  const buckets = new Map<string, number>()
  for (const r of rows) {
    const key = bucketByYear ? `${r.date.slice(0, 4)}-01-01` : `${r.date.slice(0, 7)}-01`
    buckets.set(key, (buckets.get(key) ?? 0) + 1)
  }
  const points = Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))
  const headlines = rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12)
  return { points, headlines }
}

function sparklineFromPress(pressHits: PressHit[]): Array<{ date: string; count: number }> {
  const buckets = new Map<string, number>()
  for (const p of pressHits) {
    if (!p.publishedAt || !/^\d{4}-\d{2}-\d{2}/.test(p.publishedAt)) continue
    const month = p.publishedAt.slice(0, 7) + '-01'
    buckets.set(month, (buckets.get(month) ?? 0) + 1)
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))
}

function buildEarlyDraft(
  assignment: JournalistAssignment,
  sources: SourceCitation[],
  evidence: Array<{
    citationId: string
    kind: string
    title: string
    url?: string
    publishedAt?: string
    trust: 'high' | 'medium' | 'low'
    excerpt?: string
  }>,
  warnings: string[],
  plan: JournalistPlanResponse | null,
  synth: JournalistSynthResponse | null,
  verify: JournalistVerifyResponse | null,
  research: RunAgentResult['debug']['researchSummary'],
): RunAgentResult {
  const draft: JournalistReportDraft = {
    id: nextDraftId(assignment.id),
    assignmentId: assignment.id,
    generatedAt: new Date().toISOString(),
    agentVersion: AGENT_VERSION,
    promptVersion: DRAFT_PROMPT_VERSION,
    budgetTokens: 0,
    costUSD: 0,
    sections:
      sources.length > 0
        ? [
            {
              kind: 'narrative',
              payload: {
                heading: 'Borrador interrumpido — sólo etapa parcial',
                bodyMarkdown:
                  'El agente se detuvo antes de la síntesis. El listado de fuentes recopiladas se muestra a continuación.',
                sourceIds: [sources[0].id],
              },
            },
          ]
        : [],
    sources,
    warnings: [...warnings, `pipeline stopped early — debug snapshot only`],
    legalSensitivity: computeLegalSensitivity(sources, warnings),
    requiresHumanApproval: true,
  }
  void evidence
  return { draft, debug: { plan, synth, verify, researchSummary: research } }
}

function finalize(
  assignment: JournalistAssignment,
  sections: ReportSection[],
  sources: SourceCitation[],
  warnings: string[],
  evidence: Array<{
    citationId: string
    kind: string
    title: string
    url?: string
    publishedAt?: string
    trust: 'high' | 'medium' | 'low'
    excerpt?: string
  }>,
  plan: JournalistPlanResponse | null,
  synth: JournalistSynthResponse | null,
  verify: JournalistVerifyResponse | null,
  research: RunAgentResult['debug']['researchSummary'],
): RunAgentResult {
  // Final legal-sensitivity = max(verify's escalation, judicial-token heuristic,
  // presence of any legal-record section).
  const heuristic = computeLegalSensitivity(sources, warnings, sections)
  const llmEscalation = verify?.escalateLegalSensitivity ?? 'low'
  const legalSensitivity: LegalSensitivity =
    heuristic === 'high' || llmEscalation === 'high'
      ? 'high'
      : heuristic === 'medium' || llmEscalation === 'medium'
        ? 'medium'
        : 'low'

  const draft: JournalistReportDraft = {
    id: nextDraftId(assignment.id),
    assignmentId: assignment.id,
    generatedAt: new Date().toISOString(),
    agentVersion: AGENT_VERSION,
    promptVersion: DRAFT_PROMPT_VERSION,
    budgetTokens: 0,
    costUSD: 0,
    sections: sections.length > 0 ? sections : fallbackSections(sources, warnings),
    sources,
    warnings,
    legalSensitivity,
    requiresHumanApproval: true,
  }

  void evidence
  return { draft, debug: { plan, synth, verify, researchSummary: research } }
}

function fallbackSections(sources: SourceCitation[], warnings: string[]): ReportSection[] {
  warnings.push('synth produced no rendered sections — fallback narrative emitted')
  if (sources.length === 0) return []
  return [
    {
      kind: 'narrative',
      payload: {
        heading: 'Material disponible',
        bodyMarkdown:
          'La síntesis automática no devolvió contenido coherente. Las fuentes recopiladas se listan a continuación para revisión humana.',
        sourceIds: [sources[0].id],
      },
    },
  ]
}

function nextDraftId(assignmentId: string): string {
  const today = new Date().toISOString().slice(0, 10)
  const base = assignmentId.replace(/^a-/, '')
  return `r-${base}-${today}`
}

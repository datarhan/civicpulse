/**
 * Journalist agent — standalone helpers + section/draft builders, extracted
 * from the orchestrator. Pure functions over the stage outputs (no LLM calls,
 * no shared closure state). Verbatim from the monolith.
 */
import {
  computeLegalSensitivity,
  type JournalistAssignment,
  type JournalistReportDraft,
  type LegalSensitivity,
  type ReportSection,
  type SourceCitation,
} from '../journalist'
import { fetchOfficialBySlug, type PressHit, type PromiseHit } from '../journalist-tools'
import type {
  JournalistPlanResponse,
  JournalistSynthResponse,
  JournalistVerifyResponse,
} from '../../llm/schemas'
import { AGENT_VERSION, DRAFT_PROMPT_VERSION, PARTY_TONE, type RunAgentResult } from './shared'

// ─── Helpers ───────────────────────────────────────────────────────────────

export interface GapRow {
  field: string
  reason: string
}

// The bio-extract prompt mandates one gap row PER self-declared item
// («education[0]», «careerProfessional[2]», …) — precise for merging, but
// unreadable raw on a public page (2026-07-30 operator review: 9 identical
// machine strings drowned the one informative row). Collapse the per-item
// self-declared rows into one human row per theme; every other row passes
// through untouched, in order.
const SELF_DECLARED_REASON_RE = /s[oó]lo autodeclarado/i
const SELF_DECLARED_THEMES: Array<{ rx: RegExp; label: string; reason: string }> = [
  {
    rx: /^identity/i,
    label: 'Identidad (nacimiento)',
    reason:
      'La fecha y el lugar de nacimiento constan únicamente en el CV autodeclarado del propio sujeto (ficha oficial de transparencia); sin corroboración independiente localizada.',
  },
  {
    rx: /^education/i,
    label: 'Formación declarada',
    reason:
      'Los estudios declarados constan únicamente en el CV autodeclarado del propio sujeto; sin corroboración independiente localizada.',
  },
  {
    rx: /^career/i,
    label: 'Trayectoria declarada',
    reason:
      'Las etapas profesionales o políticas marcadas «según su CV» constan únicamente en el CV autodeclarado del propio sujeto; sin corroboración independiente localizada.',
  },
]

export function groupSelfDeclaredGaps(rows: ReadonlyArray<GapRow>): GapRow[] {
  const out: GapRow[] = []
  const emitted = new Set<string>()
  for (const g of rows) {
    const theme = SELF_DECLARED_REASON_RE.test(g.reason)
      ? SELF_DECLARED_THEMES.find((t) => t.rx.test(g.field))
      : undefined
    if (!theme) {
      out.push(g)
      continue
    }
    if (emitted.has(theme.label)) continue
    emitted.add(theme.label)
    out.push({ field: theme.label, reason: theme.reason })
  }
  return out
}

// Published contract = sources CITED by the report. Research sweeps leave
// dozens of unused (often homonym) hits in the draft ledger; publishing
// them misleads (2026-07-30: 35 of 52 rows were cited by nothing, incl.
// Wikipedia's «Robert (muñeco)»). Walk the sections for sourceIds/sourceId
// refs and keep only cited rows. The draft keeps the full research trail.
export function pruneUncitedSources(
  sections: ReadonlyArray<ReportSection>,
  sources: ReadonlyArray<SourceCitation>,
): SourceCitation[] {
  const referenced = new Set<string>()
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) {
      for (const x of v) walk(x)
    } else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      if (Array.isArray(o.sourceIds)) for (const id of o.sourceIds) referenced.add(String(id))
      if (typeof o.sourceId === 'string') referenced.add(o.sourceId)
      for (const x of Object.values(o)) walk(x)
    }
  }
  walk(sections)
  return sources.filter((s) => referenced.has(s.id))
}

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

export function isWhitelisted(url: string): boolean {
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
export function extractDateFromHit(publishedDate: string | undefined, url: string): string | null {
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

export function stripHtml(s: string): string {
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

export function buildSections(
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

export function buildEarlyDraft(
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

export function finalize(
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

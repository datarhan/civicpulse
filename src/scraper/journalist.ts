/**
 * Journalist agent — schemas + validators for the
 * `/laboratorio/agentes` subsystem.
 *
 * The journalist is the first iterative LLM agent in the repo. It receives
 * an investigative assignment (e.g. "compile a biography of alcalde Robert
 * Raga"), mines local snapshots, calls a curated set of research tools
 * (Wikidata, Wikipedia, the official CV URL, Exa web search), and emits a
 * structured report with sections, sources, and warnings. A curator then
 * promotes the draft into a published report visible on the SPA.
 *
 * Three layers, three files (mirroring the promises → claims → findings
 * contract):
 *
 *   public/data/journalist-assignments.json
 *     Curator-seeded. Each row = one task for the agent. Status moves
 *     pending → running → drafted → promoted | failed.
 *
 *   public/data/journalist-reports-suggestions.json
 *     Machine-written. Every row has `requiresHumanApproval:true`. Never
 *     rendered on a public page; only the /curator dashboard shows it.
 *
 *   public/data/journalist-reports.json
 *     Curator-promoted. This is what the public SPA reads. Inherits the
 *     draft's payload + adds promoter, curator notes, corrections trail,
 *     and an optional right-of-reply slot.
 *
 * Libel boundary: this subsystem produces long-form prose about named
 * living elected officials. Three invariants are encoded below:
 *
 *   · `legalSensitivity:'high'` is automatically stamped onto reports
 *     whose source citations contain judicial-case tokens (PA NNNN/YYYY,
 *     "Sentencia", "recurso contencioso-administrativo"). The
 *     promote-report CLI refuses high-sensitivity reports without an
 *     explicit `--ack-legal-review` flag.
 *
 *   · `requiresHumanApproval` is a literal `true` on every draft — not a
 *     boolean field that could be flipped to `false` by a buggy CLI.
 *     The published-report validator forbids the field on its own type
 *     and ignores it in input, so the curator promotion step strips it
 *     by construction.
 *
 *   · Every source citation must carry a `retrievedAt` ISO timestamp and
 *     (for kind:'web') a Wayback `archiveUrl` if one could be obtained
 *     at retrieval time. That preserves an audit trail even if the
 *     upstream URL goes 404 later.
 */

import { isFrozen } from './promises'

// ─── Public enums ──────────────────────────────────────────────────────────

export type AssignmentKind = 'biography' | 'investigation' | 'profile' | 'topic-deep-dive'
export const ALLOWED_ASSIGNMENT_KINDS: readonly AssignmentKind[] = [
  'biography',
  'investigation',
  'profile',
  'topic-deep-dive',
] as const

export type AssignmentStatus = 'pending' | 'running' | 'drafted' | 'promoted' | 'failed'
export const ALLOWED_ASSIGNMENT_STATUSES: readonly AssignmentStatus[] = [
  'pending',
  'running',
  'drafted',
  'promoted',
  'failed',
] as const

export type SubjectKind = 'official' | 'topic' | 'entity'
export const ALLOWED_SUBJECT_KINDS: readonly SubjectKind[] = [
  'official',
  'topic',
  'entity',
] as const

export type SectionKind =
  | 'portrait'
  | 'narrative'
  | 'timeline'
  | 'relationships'
  | 'press-sparkline'
  | 'promise-board'
  | 'quote-card'
  // Phase B — soul.md / digital-person dossier kinds:
  | 'identity'
  | 'education'
  | 'career-political'
  | 'career-professional'
  | 'legal-record'
  | 'financial'
  | 'online-presence'
  | 'awards'
  | 'publications'
  | 'gaps-detected'
export const ALLOWED_SECTION_KINDS: readonly SectionKind[] = [
  'portrait',
  'narrative',
  'timeline',
  'relationships',
  'press-sparkline',
  'promise-board',
  'quote-card',
  'identity',
  'education',
  'career-political',
  'career-professional',
  'legal-record',
  'financial',
  'online-presence',
  'awards',
  'publications',
  'gaps-detected',
] as const

// Hosts that may back `financial` rows. Pulled from official transparency
// portals only — schema rejects financial rows whose sources don't match.
export const FINANCIAL_SOURCE_ALLOW: readonly string[] = [
  'transparentia.newtral.es',
  'newtral.es',
  'boe.es',
  'www.boe.es',
  'dogv.gva.es',
  'gva.es',
] as const

export type CitationKind =
  | 'local-snapshot'
  | 'web'
  | 'official-doc'
  | 'wikidata'
  | 'wikipedia'
  | 'boe'
export const ALLOWED_CITATION_KINDS: readonly CitationKind[] = [
  'local-snapshot',
  'web',
  'official-doc',
  'wikidata',
  'wikipedia',
  'boe',
] as const

export type CitationTrust = 'high' | 'medium' | 'low'
export const ALLOWED_CITATION_TRUST: readonly CitationTrust[] = ['high', 'medium', 'low'] as const

export type LegalSensitivity = 'low' | 'medium' | 'high'
export const ALLOWED_LEGAL_SENSITIVITY: readonly LegalSensitivity[] = [
  'low',
  'medium',
  'high',
] as const

export type RelationshipNodeKind = 'person' | 'party' | 'entity'
export const ALLOWED_RELATIONSHIP_NODE_KINDS: readonly RelationshipNodeKind[] = [
  'person',
  'party',
  'entity',
] as const

const RESPONSE_BLOCS = ['PSOE', 'PP', 'VOX', 'Compromís', 'Ciudadanos', 'Otro', 'person'] as const

// Tokens that mark judicial sensitivity. Used by reports the LLM emits to
// auto-promote legalSensitivity to 'high'. Mirrors the libel-discipline list
// in pleno-claim.ts's accusation_publica gate; deliberately broad — false
// positives just mean the curator has to pass --ack-legal-review.
export const JUDICIAL_TOKENS: readonly RegExp[] = [
  /\bPA\s*\d+\s*\/\s*\d{2,4}\b/i,
  /\bSentencia\b/i,
  /\brecurso contencioso-administrativo\b/i,
  /\bquerella\b/i,
  /\bdemanda penal\b/i,
  /\bimputad[oa]\b/i,
  /\binvestigad[oa]\b/i,
] as const

// ─── Public types ──────────────────────────────────────────────────────────

export interface JournalistAssignment {
  id: string
  kind: AssignmentKind
  subject: {
    slug?: string
    name: string
    kind: SubjectKind
  }
  brief: string
  createdBy: string
  createdAt: string
  status: AssignmentStatus
  lastRunAt?: string
  lastErrorMsg?: string
}

export interface SourceCitation {
  id: string
  kind: CitationKind
  url?: string
  archiveUrl?: string
  title: string
  publisher?: string
  publishedAt?: string
  retrievedAt: string
  excerpt?: string
  localPath?: string
  trust: CitationTrust
}

export interface TimelineEvent {
  date: string
  label: string
  sourceIds: string[]
}

export interface RelationshipNode {
  id: string
  label: string
  tone: string
  kind: RelationshipNodeKind
}

export interface RelationshipEdge {
  from: string
  to: string
  relation: string
  sourceIds: string[]
}

export interface PressHeadline {
  title: string
  url: string
  date: string
}

export interface SparklinePoint {
  date: string
  count: number
}

export type ReportSection =
  | {
      kind: 'portrait'
      payload: {
        officialSlug: string
        photoPath: string
        partyTone: string
        portfolios: string[]
        cvUrl?: string
      }
    }
  | {
      kind: 'narrative'
      payload: {
        heading: string
        bodyMarkdown: string
        sourceIds: string[]
      }
    }
  | {
      kind: 'timeline'
      payload: {
        events: TimelineEvent[]
      }
    }
  | {
      kind: 'relationships'
      payload: {
        nodes: RelationshipNode[]
        edges: RelationshipEdge[]
      }
    }
  | {
      kind: 'press-sparkline'
      payload: {
        points: SparklinePoint[]
        headlines: PressHeadline[]
      }
    }
  | {
      kind: 'promise-board'
      payload: {
        promiseIds: string[]
      }
    }
  | {
      kind: 'quote-card'
      payload: {
        verbatim: string
        attributedTo: string
        date?: string
        sourceId: string
      }
    }
  // ─── Phase B: soul.md / digital-person dossier sections ────────────────
  | {
      kind: 'identity'
      payload: {
        dateOfBirth?: string
        birthplace?: string
        residence?: string
        nationality?: string
        family?: Array<{ relation: string; name?: string; sourceIds: string[] }>
        sourceIds: string[]
      }
    }
  | {
      kind: 'education'
      payload: {
        items: Array<{
          degree: string
          institution?: string
          startYear?: number
          endYear?: number
          sourceIds: string[]
        }>
      }
    }
  | {
      kind: 'career-political'
      payload: {
        items: Array<{
          role: string
          org: string
          startYear: number
          endYear?: number | null
          sourceIds: string[]
        }>
      }
    }
  | {
      kind: 'career-professional'
      payload: {
        items: Array<{
          role: string
          org: string
          startYear?: number
          endYear?: number
          sourceIds: string[]
        }>
      }
    }
  | {
      kind: 'legal-record'
      payload: {
        items: Array<{
          caseRef: string
          court: string
          date?: string
          outcome?: string
          verbatimRef: string
          sourceIds: string[]
        }>
      }
    }
  | {
      kind: 'financial'
      payload: {
        items: Array<{
          year: number
          metric: 'salary' | 'declared-assets' | 'business'
          amountEuros?: number
          description: string
          sourceIds: string[]
        }>
      }
    }
  | {
      kind: 'online-presence'
      payload: {
        accounts: Array<{
          platform: string
          handle: string
          url: string
          verifiedAt?: string
          sourceIds: string[]
        }>
      }
    }
  | {
      kind: 'awards'
      payload: {
        items: Array<{ name: string; awardedBy: string; year?: number; sourceIds: string[] }>
      }
    }
  | {
      kind: 'publications'
      payload: {
        items: Array<{
          title: string
          venue: string
          year?: number
          url?: string
          sourceIds: string[]
        }>
      }
    }
  | {
      kind: 'gaps-detected'
      payload: {
        missing: Array<{ field: string; reason: string }>
      }
    }

export interface JournalistReportDraft {
  id: string
  assignmentId: string
  generatedAt: string
  agentVersion: string
  promptVersion: string
  budgetTokens: number
  costUSD: number
  sections: ReportSection[]
  sources: SourceCitation[]
  warnings: string[]
  legalSensitivity: LegalSensitivity
  /** Literal `true` on every draft. The published-report shape strips it. */
  requiresHumanApproval: true
}

export interface JournalistReportCorrection {
  field: string
  original: string
  corrected: string
  reason: string
  editor: string
  correctedAt: string
}

export interface JournalistReportResponse {
  from: string
  quote: string
  respondedAt: string
  sourceUrl?: string
}

export interface JournalistReport {
  id: string
  assignmentId: string
  generatedAt: string
  agentVersion: string
  promptVersion: string
  budgetTokens: number
  costUSD: number
  sections: ReportSection[]
  sources: SourceCitation[]
  warnings: string[]
  legalSensitivity: LegalSensitivity
  promotedBy: string
  promotedAt: string
  curatorNotes?: string
  corrections: JournalistReportCorrection[]
  response: JournalistReportResponse | null
}

export interface JournalistAssignmentsSnapshot {
  version: string
  generatedAt: string
  items: JournalistAssignment[]
}

export interface JournalistDraftsSnapshot {
  version: string
  generatedAt: string
  items: JournalistReportDraft[]
}

export interface JournalistReportsSnapshot {
  version: string
  generatedAt: string
  legalNotice: string
  contactUrl: string
  methodologyUrl: string
  items: JournalistReport[]
}

// ─── Validators ────────────────────────────────────────────────────────────

export class JournalistValidationError extends Error {
  constructor(msg: string) {
    super(`journalist: ${msg}`)
    this.name = 'JournalistValidationError'
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/
const ISO_FULL = /^\d{4}-\d{2}-\d{2}T/
const URL_RE = /^https?:\/\/\S+$/
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

function must(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new JournalistValidationError(msg)
}

function validateSnapshotMeta(raw: Record<string, unknown>): {
  version: string
  generatedAt: string
} {
  must(typeof raw.version === 'string' && raw.version.length > 0, 'version required')
  must(
    typeof raw.generatedAt === 'string' && ISO_FULL.test(raw.generatedAt),
    'generatedAt must be ISO datetime',
  )
  return { version: raw.version, generatedAt: raw.generatedAt }
}

function validateAssignment(a: unknown, idx: number): JournalistAssignment {
  must(typeof a === 'object' && a !== null, `assignments[${idx}] must be object`)
  const o = a as Record<string, unknown>
  must(typeof o.id === 'string' && o.id.length >= 3, `assignments[${idx}].id must be ≥3 chars`)
  must(
    typeof o.kind === 'string' && (ALLOWED_ASSIGNMENT_KINDS as readonly string[]).includes(o.kind),
    `assignments[${idx}].kind must be one of ${ALLOWED_ASSIGNMENT_KINDS.join(',')}`,
  )
  must(typeof o.subject === 'object' && o.subject !== null, `assignments[${idx}].subject required`)
  const sub = o.subject as Record<string, unknown>
  must(
    typeof sub.name === 'string' && sub.name.trim().length >= 2,
    `assignments[${idx}].subject.name required`,
  )
  must(
    typeof sub.kind === 'string' && (ALLOWED_SUBJECT_KINDS as readonly string[]).includes(sub.kind),
    `assignments[${idx}].subject.kind must be one of ${ALLOWED_SUBJECT_KINDS.join(',')}`,
  )
  if (sub.slug !== undefined) {
    must(
      typeof sub.slug === 'string' && SLUG_RE.test(sub.slug),
      `assignments[${idx}].subject.slug must be kebab-case`,
    )
  }
  must(
    typeof o.brief === 'string' && o.brief.trim().length >= 40,
    `assignments[${idx}].brief must be ≥40 chars (explain what the journalist should produce)`,
  )
  must(
    typeof o.createdBy === 'string' && o.createdBy.length > 0,
    `assignments[${idx}].createdBy required`,
  )
  must(
    typeof o.createdAt === 'string' && ISO_FULL.test(o.createdAt),
    `assignments[${idx}].createdAt must be ISO datetime`,
  )
  must(
    typeof o.status === 'string' &&
      (ALLOWED_ASSIGNMENT_STATUSES as readonly string[]).includes(o.status),
    `assignments[${idx}].status must be one of ${ALLOWED_ASSIGNMENT_STATUSES.join(',')}`,
  )
  if (o.lastRunAt !== undefined) {
    must(
      typeof o.lastRunAt === 'string' && ISO_FULL.test(o.lastRunAt),
      `assignments[${idx}].lastRunAt must be ISO datetime`,
    )
  }
  if (o.lastErrorMsg !== undefined) {
    must(typeof o.lastErrorMsg === 'string', `assignments[${idx}].lastErrorMsg must be string`)
  }
  return {
    id: o.id,
    kind: o.kind as AssignmentKind,
    subject: {
      ...(sub.slug !== undefined ? { slug: sub.slug as string } : {}),
      name: (sub.name as string).trim(),
      kind: sub.kind as SubjectKind,
    },
    brief: (o.brief as string).trim(),
    createdBy: o.createdBy as string,
    createdAt: o.createdAt as string,
    status: o.status as AssignmentStatus,
    ...(o.lastRunAt ? { lastRunAt: o.lastRunAt as string } : {}),
    ...(o.lastErrorMsg ? { lastErrorMsg: o.lastErrorMsg as string } : {}),
  }
}

export function validateAssignmentsSnapshot(json: string): JournalistAssignmentsSnapshot {
  const raw = JSON.parse(json) as Record<string, unknown>
  const meta = validateSnapshotMeta(raw)
  must(Array.isArray(raw.items), 'items must be array')
  const items = (raw.items as unknown[]).map((it, i) => validateAssignment(it, i))
  const seen = new Set<string>()
  for (const it of items) {
    must(!seen.has(it.id), `duplicate assignment id ${it.id}`)
    seen.add(it.id)
  }
  return { ...meta, items }
}

function validateSourceCitation(s: unknown, idx: number, ci: number): SourceCitation {
  must(typeof s === 'object' && s !== null, `items[${idx}].sources[${ci}] must be object`)
  const o = s as Record<string, unknown>
  must(typeof o.id === 'string' && o.id.length >= 2, `items[${idx}].sources[${ci}].id required`)
  must(
    typeof o.kind === 'string' && (ALLOWED_CITATION_KINDS as readonly string[]).includes(o.kind),
    `items[${idx}].sources[${ci}].kind must be one of ${ALLOWED_CITATION_KINDS.join(',')}`,
  )
  must(
    typeof o.title === 'string' && o.title.length >= 3,
    `items[${idx}].sources[${ci}].title required`,
  )
  must(
    typeof o.retrievedAt === 'string' && ISO_FULL.test(o.retrievedAt),
    `items[${idx}].sources[${ci}].retrievedAt must be ISO datetime`,
  )
  must(
    typeof o.trust === 'string' && (ALLOWED_CITATION_TRUST as readonly string[]).includes(o.trust),
    `items[${idx}].sources[${ci}].trust must be one of ${ALLOWED_CITATION_TRUST.join(',')}`,
  )
  if (o.url !== undefined) {
    must(
      typeof o.url === 'string' && URL_RE.test(o.url),
      `items[${idx}].sources[${ci}].url must be http(s) URL`,
    )
  }
  if (o.archiveUrl !== undefined) {
    must(
      typeof o.archiveUrl === 'string' && URL_RE.test(o.archiveUrl),
      `items[${idx}].sources[${ci}].archiveUrl must be URL`,
    )
  }
  if (o.publisher !== undefined) {
    must(typeof o.publisher === 'string', `items[${idx}].sources[${ci}].publisher must be string`)
  }
  if (o.publishedAt !== undefined) {
    must(
      typeof o.publishedAt === 'string' && ISO_DATE.test(o.publishedAt),
      `items[${idx}].sources[${ci}].publishedAt must be ISO date`,
    )
  }
  if (o.excerpt !== undefined) {
    must(
      typeof o.excerpt === 'string' && o.excerpt.length <= 500,
      `items[${idx}].sources[${ci}].excerpt must be ≤500 chars`,
    )
  }
  if (o.localPath !== undefined) {
    must(typeof o.localPath === 'string', `items[${idx}].sources[${ci}].localPath must be string`)
  }
  // Web/official-doc citations should carry a URL — they're external claims.
  // Local-snapshot citations must carry a localPath.
  if (o.kind === 'web' || o.kind === 'official-doc' || o.kind === 'boe') {
    must(typeof o.url === 'string', `items[${idx}].sources[${ci}] kind=${o.kind} requires url`)
  }
  if (o.kind === 'local-snapshot') {
    must(
      typeof o.localPath === 'string',
      `items[${idx}].sources[${ci}] kind=local-snapshot requires localPath`,
    )
  }
  return {
    id: o.id as string,
    kind: o.kind as CitationKind,
    ...(o.url ? { url: o.url as string } : {}),
    ...(o.archiveUrl ? { archiveUrl: o.archiveUrl as string } : {}),
    title: o.title as string,
    ...(o.publisher ? { publisher: o.publisher as string } : {}),
    ...(o.publishedAt ? { publishedAt: o.publishedAt as string } : {}),
    retrievedAt: o.retrievedAt as string,
    ...(o.excerpt ? { excerpt: o.excerpt as string } : {}),
    ...(o.localPath ? { localPath: o.localPath as string } : {}),
    trust: o.trust as CitationTrust,
  }
}

function validateSection(
  s: unknown,
  idx: number,
  si: number,
  sourceIds: Set<string>,
): ReportSection {
  must(typeof s === 'object' && s !== null, `items[${idx}].sections[${si}] must be object`)
  const o = s as Record<string, unknown>
  must(
    typeof o.kind === 'string' && (ALLOWED_SECTION_KINDS as readonly string[]).includes(o.kind),
    `items[${idx}].sections[${si}].kind must be one of ${ALLOWED_SECTION_KINDS.join(',')}`,
  )
  must(
    typeof o.payload === 'object' && o.payload !== null,
    `items[${idx}].sections[${si}].payload required`,
  )
  const p = o.payload as Record<string, unknown>
  const here = `items[${idx}].sections[${si}](${o.kind})`

  const checkRefs = (refs: unknown, field: string) => {
    must(Array.isArray(refs), `${here}.${field} must be array`)
    for (const r of refs as unknown[]) {
      must(
        typeof r === 'string' && sourceIds.has(r),
        `${here}.${field} contains unknown sourceId ${String(r)}`,
      )
    }
  }

  switch (o.kind) {
    case 'portrait': {
      must(
        typeof p.officialSlug === 'string' && SLUG_RE.test(p.officialSlug),
        `${here}.payload.officialSlug must be kebab-case slug`,
      )
      must(
        typeof p.photoPath === 'string' && p.photoPath.startsWith('/'),
        `${here}.payload.photoPath must start with /`,
      )
      must(
        typeof p.partyTone === 'string' && p.partyTone.length > 0,
        `${here}.payload.partyTone required`,
      )
      must(
        Array.isArray(p.portfolios) &&
          (p.portfolios as unknown[]).every((x) => typeof x === 'string'),
        `${here}.payload.portfolios must be string[]`,
      )
      if (p.cvUrl !== undefined)
        must(
          typeof p.cvUrl === 'string' && URL_RE.test(p.cvUrl),
          `${here}.payload.cvUrl must be URL`,
        )
      return {
        kind: 'portrait',
        payload: {
          officialSlug: p.officialSlug as string,
          photoPath: p.photoPath as string,
          partyTone: p.partyTone as string,
          portfolios: p.portfolios as string[],
          ...(p.cvUrl ? { cvUrl: p.cvUrl as string } : {}),
        },
      }
    }
    case 'narrative': {
      must(
        typeof p.heading === 'string' && p.heading.trim().length >= 3,
        `${here}.payload.heading must be ≥3 chars`,
      )
      must(
        typeof p.bodyMarkdown === 'string' &&
          p.bodyMarkdown.trim().length >= 40 &&
          p.bodyMarkdown.length <= 8000,
        `${here}.payload.bodyMarkdown must be 40-8000 chars`,
      )
      checkRefs(p.sourceIds, 'payload.sourceIds')
      must(
        (p.sourceIds as unknown[]).length >= 1,
        `${here}.payload.sourceIds must reference ≥1 citation (no unsupported prose)`,
      )
      return {
        kind: 'narrative',
        payload: {
          heading: (p.heading as string).trim(),
          bodyMarkdown: (p.bodyMarkdown as string).trim(),
          sourceIds: p.sourceIds as string[],
        },
      }
    }
    case 'timeline': {
      must(
        Array.isArray(p.events) && (p.events as unknown[]).length >= 1,
        `${here}.payload.events must have ≥1 event`,
      )
      const events: TimelineEvent[] = (p.events as unknown[]).map((e, ei) => {
        must(typeof e === 'object' && e !== null, `${here}.payload.events[${ei}] must be object`)
        const ev = e as Record<string, unknown>
        must(
          typeof ev.date === 'string' && ISO_DATE.test(ev.date),
          `${here}.payload.events[${ei}].date must be ISO date`,
        )
        must(
          typeof ev.label === 'string' && ev.label.length >= 3,
          `${here}.payload.events[${ei}].label required`,
        )
        checkRefs(ev.sourceIds, `payload.events[${ei}].sourceIds`)
        return {
          date: ev.date as string,
          label: ev.label as string,
          sourceIds: ev.sourceIds as string[],
        }
      })
      return { kind: 'timeline', payload: { events } }
    }
    case 'relationships': {
      must(
        Array.isArray(p.nodes) && (p.nodes as unknown[]).length >= 1,
        `${here}.payload.nodes required`,
      )
      must(Array.isArray(p.edges), `${here}.payload.edges must be array`)
      const nodes: RelationshipNode[] = (p.nodes as unknown[]).map((n, ni) => {
        must(typeof n === 'object' && n !== null, `${here}.payload.nodes[${ni}] must be object`)
        const nd = n as Record<string, unknown>
        must(
          typeof nd.id === 'string' && nd.id.length > 0,
          `${here}.payload.nodes[${ni}].id required`,
        )
        must(
          typeof nd.label === 'string' && nd.label.length > 0,
          `${here}.payload.nodes[${ni}].label required`,
        )
        must(
          typeof nd.tone === 'string' && nd.tone.length > 0,
          `${here}.payload.nodes[${ni}].tone required`,
        )
        must(
          typeof nd.kind === 'string' &&
            (ALLOWED_RELATIONSHIP_NODE_KINDS as readonly string[]).includes(nd.kind),
          `${here}.payload.nodes[${ni}].kind must be one of ${ALLOWED_RELATIONSHIP_NODE_KINDS.join(',')}`,
        )
        return {
          id: nd.id as string,
          label: nd.label as string,
          tone: nd.tone as string,
          kind: nd.kind as RelationshipNodeKind,
        }
      })
      const nodeIds = new Set(nodes.map((n) => n.id))
      const edges: RelationshipEdge[] = (p.edges as unknown[]).map((e, ei) => {
        must(typeof e === 'object' && e !== null, `${here}.payload.edges[${ei}] must be object`)
        const ed = e as Record<string, unknown>
        must(
          typeof ed.from === 'string' && nodeIds.has(ed.from),
          `${here}.payload.edges[${ei}].from unknown node`,
        )
        must(
          typeof ed.to === 'string' && nodeIds.has(ed.to),
          `${here}.payload.edges[${ei}].to unknown node`,
        )
        must(
          typeof ed.relation === 'string' && ed.relation.length > 0,
          `${here}.payload.edges[${ei}].relation required`,
        )
        checkRefs(ed.sourceIds, `payload.edges[${ei}].sourceIds`)
        must(
          (ed.sourceIds as unknown[]).length >= 1,
          `${here}.payload.edges[${ei}].sourceIds must reference ≥1 citation`,
        )
        return {
          from: ed.from as string,
          to: ed.to as string,
          relation: ed.relation as string,
          sourceIds: ed.sourceIds as string[],
        }
      })
      return { kind: 'relationships', payload: { nodes, edges } }
    }
    case 'press-sparkline': {
      must(Array.isArray(p.points), `${here}.payload.points must be array`)
      const points: SparklinePoint[] = (p.points as unknown[]).map((pt, pi) => {
        must(typeof pt === 'object' && pt !== null, `${here}.payload.points[${pi}] must be object`)
        const pp = pt as Record<string, unknown>
        must(
          typeof pp.date === 'string' && ISO_DATE.test(pp.date),
          `${here}.payload.points[${pi}].date must be ISO date`,
        )
        must(
          typeof pp.count === 'number' && pp.count >= 0,
          `${here}.payload.points[${pi}].count must be ≥0`,
        )
        return { date: pp.date as string, count: pp.count as number }
      })
      must(Array.isArray(p.headlines), `${here}.payload.headlines must be array`)
      const headlines: PressHeadline[] = (p.headlines as unknown[]).map((h, hi) => {
        must(typeof h === 'object' && h !== null, `${here}.payload.headlines[${hi}] must be object`)
        const hd = h as Record<string, unknown>
        must(
          typeof hd.title === 'string' && hd.title.length > 0,
          `${here}.payload.headlines[${hi}].title required`,
        )
        must(
          typeof hd.url === 'string' && URL_RE.test(hd.url),
          `${here}.payload.headlines[${hi}].url must be URL`,
        )
        must(
          typeof hd.date === 'string' && ISO_DATE.test(hd.date),
          `${here}.payload.headlines[${hi}].date must be ISO date`,
        )
        return { title: hd.title as string, url: hd.url as string, date: hd.date as string }
      })
      return { kind: 'press-sparkline', payload: { points, headlines } }
    }
    case 'promise-board': {
      must(Array.isArray(p.promiseIds), `${here}.payload.promiseIds must be array`)
      const ids: string[] = (p.promiseIds as unknown[]).map((x, xi) => {
        must(typeof x === 'string' && x.length > 0, `${here}.payload.promiseIds[${xi}] required`)
        return x as string
      })
      return { kind: 'promise-board', payload: { promiseIds: ids } }
    }
    case 'quote-card': {
      must(
        typeof p.verbatim === 'string' && p.verbatim.trim().length >= 20,
        `${here}.payload.verbatim must be ≥20 chars`,
      )
      must(
        typeof p.attributedTo === 'string' && p.attributedTo.length > 0,
        `${here}.payload.attributedTo required`,
      )
      must(
        typeof p.sourceId === 'string' && sourceIds.has(p.sourceId),
        `${here}.payload.sourceId unknown citation`,
      )
      if (p.date !== undefined) {
        must(
          typeof p.date === 'string' && ISO_DATE.test(p.date),
          `${here}.payload.date must be ISO date`,
        )
      }
      return {
        kind: 'quote-card',
        payload: {
          verbatim: (p.verbatim as string).trim(),
          attributedTo: p.attributedTo as string,
          ...(p.date ? { date: p.date as string } : {}),
          sourceId: p.sourceId as string,
        },
      }
    }
    // ─── Phase B: soul.md / digital-person dossier sections ──────────────
    case 'identity': {
      const family = Array.isArray(p.family) ? (p.family as unknown[]) : []
      const familyOut: Array<{ relation: string; name?: string; sourceIds: string[] }> = []
      for (let fi = 0; fi < family.length; fi++) {
        const f = family[fi]
        must(typeof f === 'object' && f !== null, `${here}.payload.family[${fi}] must be object`)
        const fo = f as Record<string, unknown>
        must(
          typeof fo.relation === 'string' && fo.relation.length > 0,
          `${here}.payload.family[${fi}].relation required`,
        )
        const refs = (fo.sourceIds as unknown[]) ?? []
        for (const r of refs)
          must(
            typeof r === 'string' && sourceIds.has(r),
            `${here}.payload.family[${fi}].sourceIds contains unknown ${String(r)}`,
          )
        // Libel rule: naming a family member requires every cited
        // source to be `trust:'high'`. Validator can't see source.trust
        // directly (it only has the ID set), so we mark the row and
        // let validateBaseReport finish the cross-check.
        familyOut.push({
          relation: fo.relation as string,
          ...(typeof fo.name === 'string' && fo.name.length > 0 ? { name: fo.name as string } : {}),
          sourceIds: refs as string[],
        })
      }
      const topRefs = Array.isArray(p.sourceIds) ? (p.sourceIds as unknown[]) : []
      for (const r of topRefs)
        must(
          typeof r === 'string' && sourceIds.has(r),
          `${here}.payload.sourceIds contains unknown ${String(r)}`,
        )
      if (p.dateOfBirth !== undefined)
        must(
          typeof p.dateOfBirth === 'string' && ISO_DATE.test(p.dateOfBirth),
          `${here}.payload.dateOfBirth must be ISO date`,
        )
      if (p.birthplace !== undefined)
        must(typeof p.birthplace === 'string', `${here}.payload.birthplace must be string`)
      if (p.residence !== undefined)
        must(typeof p.residence === 'string', `${here}.payload.residence must be string`)
      if (p.nationality !== undefined)
        must(typeof p.nationality === 'string', `${here}.payload.nationality must be string`)
      return {
        kind: 'identity',
        payload: {
          ...(p.dateOfBirth ? { dateOfBirth: p.dateOfBirth as string } : {}),
          ...(p.birthplace ? { birthplace: p.birthplace as string } : {}),
          ...(p.residence ? { residence: p.residence as string } : {}),
          ...(p.nationality ? { nationality: p.nationality as string } : {}),
          ...(familyOut.length > 0 ? { family: familyOut } : {}),
          sourceIds: topRefs as string[],
        },
      }
    }
    case 'education': {
      must(Array.isArray(p.items), `${here}.payload.items must be array`)
      const items = (p.items as unknown[]).map((it, ii) => {
        must(typeof it === 'object' && it !== null, `${here}.payload.items[${ii}] must be object`)
        const o = it as Record<string, unknown>
        must(
          typeof o.degree === 'string' && o.degree.trim().length >= 2,
          `${here}.payload.items[${ii}].degree required`,
        )
        if (o.institution !== undefined)
          must(
            typeof o.institution === 'string',
            `${here}.payload.items[${ii}].institution must be string`,
          )
        if (o.startYear !== undefined)
          must(
            typeof o.startYear === 'number' && o.startYear >= 1900 && o.startYear <= 2100,
            `${here}.payload.items[${ii}].startYear must be year`,
          )
        if (o.endYear !== undefined)
          must(
            typeof o.endYear === 'number' && o.endYear >= 1900 && o.endYear <= 2100,
            `${here}.payload.items[${ii}].endYear must be year`,
          )
        const refs = Array.isArray(o.sourceIds) ? (o.sourceIds as unknown[]) : []
        for (const r of refs)
          must(
            typeof r === 'string' && sourceIds.has(r),
            `${here}.payload.items[${ii}].sourceIds contains unknown ${String(r)}`,
          )
        return {
          degree: (o.degree as string).trim(),
          ...(o.institution ? { institution: (o.institution as string).trim() } : {}),
          ...(o.startYear !== undefined ? { startYear: o.startYear as number } : {}),
          ...(o.endYear !== undefined ? { endYear: o.endYear as number } : {}),
          sourceIds: refs as string[],
        }
      })
      return { kind: 'education', payload: { items } }
    }
    case 'career-political':
    case 'career-professional': {
      must(Array.isArray(p.items), `${here}.payload.items must be array`)
      const isPolitical = o.kind === 'career-political'
      const items = (p.items as unknown[]).map((it, ii) => {
        must(typeof it === 'object' && it !== null, `${here}.payload.items[${ii}] must be object`)
        const r2 = it as Record<string, unknown>
        must(
          typeof r2.role === 'string' && r2.role.trim().length >= 2,
          `${here}.payload.items[${ii}].role required`,
        )
        must(
          typeof r2.org === 'string' && r2.org.trim().length >= 2,
          `${here}.payload.items[${ii}].org required`,
        )
        if (isPolitical) {
          must(
            typeof r2.startYear === 'number' && r2.startYear >= 1900 && r2.startYear <= 2100,
            `${here}.payload.items[${ii}].startYear required for career-political`,
          )
        } else if (r2.startYear !== undefined) {
          must(
            typeof r2.startYear === 'number' && r2.startYear >= 1900 && r2.startYear <= 2100,
            `${here}.payload.items[${ii}].startYear must be year`,
          )
        }
        if (r2.endYear !== undefined && r2.endYear !== null) {
          must(
            typeof r2.endYear === 'number' && r2.endYear >= 1900 && r2.endYear <= 2100,
            `${here}.payload.items[${ii}].endYear must be year or null`,
          )
        }
        const refs = Array.isArray(r2.sourceIds) ? (r2.sourceIds as unknown[]) : []
        for (const rid of refs)
          must(
            typeof rid === 'string' && sourceIds.has(rid),
            `${here}.payload.items[${ii}].sourceIds contains unknown ${String(rid)}`,
          )
        return {
          role: (r2.role as string).trim(),
          org: (r2.org as string).trim(),
          ...(r2.startYear !== undefined ? { startYear: r2.startYear as number } : {}),
          ...(r2.endYear !== undefined ? { endYear: r2.endYear as number | null } : {}),
          sourceIds: refs as string[],
        }
      })
      return isPolitical
        ? // narrow types for the discriminated union (startYear required)
          {
            kind: 'career-political',
            payload: {
              items: items as Array<{
                role: string
                org: string
                startYear: number
                endYear?: number | null
                sourceIds: string[]
              }>,
            },
          }
        : { kind: 'career-professional', payload: { items } }
    }
    case 'legal-record': {
      must(Array.isArray(p.items), `${here}.payload.items must be array`)
      const items = (p.items as unknown[]).map((it, ii) => {
        must(typeof it === 'object' && it !== null, `${here}.payload.items[${ii}] must be object`)
        const r3 = it as Record<string, unknown>
        must(
          typeof r3.caseRef === 'string' && r3.caseRef.trim().length >= 3,
          `${here}.payload.items[${ii}].caseRef required`,
        )
        must(
          typeof r3.court === 'string' && r3.court.trim().length >= 3,
          `${here}.payload.items[${ii}].court required`,
        )
        must(
          typeof r3.verbatimRef === 'string' && r3.verbatimRef.trim().length >= 20,
          `${here}.payload.items[${ii}].verbatimRef must be verbatim ≥20 chars`,
        )
        if (r3.date !== undefined)
          must(
            typeof r3.date === 'string' && ISO_DATE.test(r3.date),
            `${here}.payload.items[${ii}].date must be ISO date`,
          )
        if (r3.outcome !== undefined)
          must(
            typeof r3.outcome === 'string',
            `${here}.payload.items[${ii}].outcome must be string`,
          )
        const refs = Array.isArray(r3.sourceIds) ? (r3.sourceIds as unknown[]) : []
        must(refs.length >= 1, `${here}.payload.items[${ii}].sourceIds must reference ≥1 citation`)
        for (const rid of refs)
          must(
            typeof rid === 'string' && sourceIds.has(rid),
            `${here}.payload.items[${ii}].sourceIds contains unknown ${String(rid)}`,
          )
        return {
          caseRef: (r3.caseRef as string).trim(),
          court: (r3.court as string).trim(),
          ...(r3.date ? { date: r3.date as string } : {}),
          ...(r3.outcome ? { outcome: (r3.outcome as string).trim() } : {}),
          verbatimRef: (r3.verbatimRef as string).trim(),
          sourceIds: refs as string[],
        }
      })
      return { kind: 'legal-record', payload: { items } }
    }
    case 'financial': {
      must(Array.isArray(p.items), `${here}.payload.items must be array`)
      const items = (p.items as unknown[]).map((it, ii) => {
        must(typeof it === 'object' && it !== null, `${here}.payload.items[${ii}] must be object`)
        const r4 = it as Record<string, unknown>
        must(
          typeof r4.year === 'number' && r4.year >= 1900 && r4.year <= 2100,
          `${here}.payload.items[${ii}].year required`,
        )
        must(
          typeof r4.metric === 'string' &&
            ['salary', 'declared-assets', 'business'].includes(r4.metric),
          `${here}.payload.items[${ii}].metric must be salary|declared-assets|business`,
        )
        must(
          typeof r4.description === 'string' && r4.description.trim().length > 0,
          `${here}.payload.items[${ii}].description required`,
        )
        if (r4.amountEuros !== undefined)
          must(
            typeof r4.amountEuros === 'number' && r4.amountEuros >= 0,
            `${here}.payload.items[${ii}].amountEuros must be ≥0`,
          )
        const refs = Array.isArray(r4.sourceIds) ? (r4.sourceIds as unknown[]) : []
        must(refs.length >= 1, `${here}.payload.items[${ii}].sourceIds must reference ≥1 citation`)
        for (const rid of refs)
          must(
            typeof rid === 'string' && sourceIds.has(rid),
            `${here}.payload.items[${ii}].sourceIds contains unknown ${String(rid)}`,
          )
        return {
          year: r4.year as number,
          metric: r4.metric as 'salary' | 'declared-assets' | 'business',
          ...(r4.amountEuros !== undefined ? { amountEuros: r4.amountEuros as number } : {}),
          description: (r4.description as string).trim(),
          sourceIds: refs as string[],
        }
      })
      return { kind: 'financial', payload: { items } }
    }
    case 'online-presence': {
      must(Array.isArray(p.accounts), `${here}.payload.accounts must be array`)
      const accounts = (p.accounts as unknown[]).map((it, ii) => {
        must(
          typeof it === 'object' && it !== null,
          `${here}.payload.accounts[${ii}] must be object`,
        )
        const r5 = it as Record<string, unknown>
        must(
          typeof r5.platform === 'string' && r5.platform.trim().length > 0,
          `${here}.payload.accounts[${ii}].platform required`,
        )
        must(
          typeof r5.handle === 'string' && r5.handle.trim().length > 0,
          `${here}.payload.accounts[${ii}].handle required`,
        )
        must(
          typeof r5.url === 'string' && URL_RE.test(r5.url),
          `${here}.payload.accounts[${ii}].url must be URL`,
        )
        if (r5.verifiedAt !== undefined)
          must(
            typeof r5.verifiedAt === 'string' && ISO_DATE.test(r5.verifiedAt),
            `${here}.payload.accounts[${ii}].verifiedAt must be ISO date`,
          )
        const refs = Array.isArray(r5.sourceIds) ? (r5.sourceIds as unknown[]) : []
        for (const rid of refs)
          must(
            typeof rid === 'string' && sourceIds.has(rid),
            `${here}.payload.accounts[${ii}].sourceIds contains unknown ${String(rid)}`,
          )
        return {
          platform: (r5.platform as string).trim(),
          handle: (r5.handle as string).trim(),
          url: r5.url as string,
          ...(r5.verifiedAt ? { verifiedAt: r5.verifiedAt as string } : {}),
          sourceIds: refs as string[],
        }
      })
      return { kind: 'online-presence', payload: { accounts } }
    }
    case 'awards': {
      must(Array.isArray(p.items), `${here}.payload.items must be array`)
      const items = (p.items as unknown[]).map((it, ii) => {
        must(typeof it === 'object' && it !== null, `${here}.payload.items[${ii}] must be object`)
        const r6 = it as Record<string, unknown>
        must(
          typeof r6.name === 'string' && r6.name.trim().length >= 2,
          `${here}.payload.items[${ii}].name required`,
        )
        must(
          typeof r6.awardedBy === 'string' && r6.awardedBy.trim().length >= 2,
          `${here}.payload.items[${ii}].awardedBy required`,
        )
        if (r6.year !== undefined)
          must(
            typeof r6.year === 'number' && r6.year >= 1900 && r6.year <= 2100,
            `${here}.payload.items[${ii}].year must be year`,
          )
        const refs = Array.isArray(r6.sourceIds) ? (r6.sourceIds as unknown[]) : []
        for (const rid of refs)
          must(
            typeof rid === 'string' && sourceIds.has(rid),
            `${here}.payload.items[${ii}].sourceIds contains unknown ${String(rid)}`,
          )
        return {
          name: (r6.name as string).trim(),
          awardedBy: (r6.awardedBy as string).trim(),
          ...(r6.year !== undefined ? { year: r6.year as number } : {}),
          sourceIds: refs as string[],
        }
      })
      return { kind: 'awards', payload: { items } }
    }
    case 'publications': {
      must(Array.isArray(p.items), `${here}.payload.items must be array`)
      const items = (p.items as unknown[]).map((it, ii) => {
        must(typeof it === 'object' && it !== null, `${here}.payload.items[${ii}] must be object`)
        const r7 = it as Record<string, unknown>
        must(
          typeof r7.title === 'string' && r7.title.trim().length >= 3,
          `${here}.payload.items[${ii}].title required`,
        )
        must(
          typeof r7.venue === 'string' && r7.venue.trim().length >= 2,
          `${here}.payload.items[${ii}].venue required`,
        )
        if (r7.year !== undefined)
          must(
            typeof r7.year === 'number' && r7.year >= 1900 && r7.year <= 2100,
            `${here}.payload.items[${ii}].year must be year`,
          )
        if (r7.url !== undefined)
          must(
            typeof r7.url === 'string' && URL_RE.test(r7.url),
            `${here}.payload.items[${ii}].url must be URL`,
          )
        const refs = Array.isArray(r7.sourceIds) ? (r7.sourceIds as unknown[]) : []
        for (const rid of refs)
          must(
            typeof rid === 'string' && sourceIds.has(rid),
            `${here}.payload.items[${ii}].sourceIds contains unknown ${String(rid)}`,
          )
        return {
          title: (r7.title as string).trim(),
          venue: (r7.venue as string).trim(),
          ...(r7.year !== undefined ? { year: r7.year as number } : {}),
          ...(r7.url ? { url: r7.url as string } : {}),
          sourceIds: refs as string[],
        }
      })
      return { kind: 'publications', payload: { items } }
    }
    case 'gaps-detected': {
      must(Array.isArray(p.missing), `${here}.payload.missing must be array`)
      const missing = (p.missing as unknown[]).map((it, ii) => {
        must(typeof it === 'object' && it !== null, `${here}.payload.missing[${ii}] must be object`)
        const r8 = it as Record<string, unknown>
        must(
          typeof r8.field === 'string' && r8.field.length > 0,
          `${here}.payload.missing[${ii}].field required`,
        )
        must(
          typeof r8.reason === 'string' && r8.reason.length > 0,
          `${here}.payload.missing[${ii}].reason required`,
        )
        return { field: r8.field as string, reason: r8.reason as string }
      })
      return { kind: 'gaps-detected', payload: { missing } }
    }
  }
  // unreachable — switch above is exhaustive
  throw new JournalistValidationError(`${here}.kind not handled (unreachable)`)
}

function validateBaseReport(
  o: Record<string, unknown>,
  idx: number,
): {
  id: string
  assignmentId: string
  generatedAt: string
  agentVersion: string
  promptVersion: string
  budgetTokens: number
  costUSD: number
  sections: ReportSection[]
  sources: SourceCitation[]
  warnings: string[]
  legalSensitivity: LegalSensitivity
} {
  must(typeof o.id === 'string' && o.id.length >= 3, `items[${idx}].id required`)
  must(
    typeof o.assignmentId === 'string' && o.assignmentId.length >= 3,
    `items[${idx}].assignmentId required`,
  )
  must(
    typeof o.generatedAt === 'string' && ISO_FULL.test(o.generatedAt),
    `items[${idx}].generatedAt must be ISO datetime`,
  )
  must(
    typeof o.agentVersion === 'string' && o.agentVersion.length > 0,
    `items[${idx}].agentVersion required`,
  )
  must(
    typeof o.promptVersion === 'string' && o.promptVersion.length > 0,
    `items[${idx}].promptVersion required`,
  )
  must(
    typeof o.budgetTokens === 'number' && o.budgetTokens >= 0,
    `items[${idx}].budgetTokens must be ≥0`,
  )
  must(typeof o.costUSD === 'number' && o.costUSD >= 0, `items[${idx}].costUSD must be ≥0`)
  must(
    typeof o.legalSensitivity === 'string' &&
      (ALLOWED_LEGAL_SENSITIVITY as readonly string[]).includes(o.legalSensitivity),
    `items[${idx}].legalSensitivity must be one of ${ALLOWED_LEGAL_SENSITIVITY.join(',')}`,
  )
  must(Array.isArray(o.warnings), `items[${idx}].warnings must be array`)
  for (const w of o.warnings as unknown[]) {
    must(typeof w === 'string', `items[${idx}].warnings entries must be strings`)
  }
  must(Array.isArray(o.sources), `items[${idx}].sources must be array`)
  const sources: SourceCitation[] = (o.sources as unknown[]).map((s, ci) =>
    validateSourceCitation(s, idx, ci),
  )
  const sourceIdSet = new Set<string>()
  for (const s of sources) {
    must(!sourceIdSet.has(s.id), `items[${idx}].sources duplicate citation id ${s.id}`)
    sourceIdSet.add(s.id)
  }
  must(
    Array.isArray(o.sections) && (o.sections as unknown[]).length >= 1,
    `items[${idx}].sections must be non-empty`,
  )
  const sections: ReportSection[] = (o.sections as unknown[]).map((s, si) =>
    validateSection(s, idx, si, sourceIdSet),
  )

  // Libel-material rule #1: if any source excerpt/title/warning matches a
  // judicial token, legalSensitivity MUST be 'high'.
  const judicialHit = [
    ...sources.flatMap((s) => [s.excerpt ?? '', s.title]),
    ...(o.warnings as string[]),
  ].some((txt) => JUDICIAL_TOKENS.some((rx) => rx.test(txt)))

  // Phase B additions ─────────────────────────────────────────────────────
  // #2: presence of a `legal-record` section auto-escalates legalSensitivity
  // to 'high'. Same rule the curator CLI would otherwise stamp.
  const hasLegalRecord = sections.some((s) => s.kind === 'legal-record')

  // #3: `family` rows that name a person require every cited source to
  // carry `trust:'high'`. Build a source-by-id index so we can check.
  const sourceById = new Map(sources.map((s) => [s.id, s]))
  for (let si = 0; si < sections.length; si++) {
    const s = sections[si]
    if (s.kind !== 'identity' || !s.payload.family) continue
    for (let fi = 0; fi < s.payload.family.length; fi++) {
      const f = s.payload.family[fi]
      if (!f.name) continue
      for (const rid of f.sourceIds) {
        const src = sourceById.get(rid)
        must(
          !!src && src.trust === 'high',
          `items[${idx}].sections[${si}](identity).payload.family[${fi}] names a person; every cited source must be trust='high' (source ${rid} is ${src?.trust ?? 'missing'})`,
        )
      }
    }
  }

  // #4: `financial` rows pull only from official transparency portals.
  // Validator drops rows whose sources don't match — but rather than
  // silently mutating the section, we fail-closed and surface the offender.
  for (let si = 0; si < sections.length; si++) {
    const s = sections[si]
    if (s.kind !== 'financial') continue
    for (let ii = 0; ii < s.payload.items.length; ii++) {
      for (const rid of s.payload.items[ii].sourceIds) {
        const src = sourceById.get(rid)
        if (!src) continue
        const host = src.url
          ? (() => {
              try {
                return new URL(src.url as string).hostname.replace(/^www\./, '')
              } catch {
                return ''
              }
            })()
          : ''
        if (
          host &&
          !(FINANCIAL_SOURCE_ALLOW as readonly string[]).includes(host) &&
          !(FINANCIAL_SOURCE_ALLOW as readonly string[]).includes(`www.${host}`)
        ) {
          must(
            false,
            `items[${idx}].sections[${si}](financial).payload.items[${ii}] sources must come from FINANCIAL_SOURCE_ALLOW; ${host} is not on the list`,
          )
        }
      }
    }
  }

  if (judicialHit || hasLegalRecord) {
    must(
      o.legalSensitivity === 'high',
      `items[${idx}].legalSensitivity must be 'high' when judicial tokens or a legal-record section are present`,
    )
  }

  return {
    id: o.id as string,
    assignmentId: o.assignmentId as string,
    generatedAt: o.generatedAt as string,
    agentVersion: o.agentVersion as string,
    promptVersion: o.promptVersion as string,
    budgetTokens: o.budgetTokens as number,
    costUSD: o.costUSD as number,
    sections,
    sources,
    warnings: o.warnings as string[],
    legalSensitivity: o.legalSensitivity as LegalSensitivity,
  }
}

function validateDraft(d: unknown, idx: number): JournalistReportDraft {
  must(typeof d === 'object' && d !== null, `items[${idx}] must be object`)
  const o = d as Record<string, unknown>
  must(
    o.requiresHumanApproval === true,
    `items[${idx}].requiresHumanApproval must be literal true on every draft`,
  )
  const base = validateBaseReport(o, idx)
  return { ...base, requiresHumanApproval: true }
}

export function validateDraftsSnapshot(json: string): JournalistDraftsSnapshot {
  const raw = JSON.parse(json) as Record<string, unknown>
  const meta = validateSnapshotMeta(raw)
  must(Array.isArray(raw.items), 'items must be array')
  const items = (raw.items as unknown[]).map((it, i) => validateDraft(it, i))
  const seen = new Set<string>()
  for (const it of items) {
    must(!seen.has(it.id), `duplicate draft id ${it.id}`)
    seen.add(it.id)
  }
  return { ...meta, items }
}

function validateCorrection(c: unknown, idx: number, ci: number): JournalistReportCorrection {
  must(typeof c === 'object' && c !== null, `items[${idx}].corrections[${ci}] must be object`)
  const o = c as Record<string, unknown>
  must(
    typeof o.field === 'string' && o.field.length > 0,
    `items[${idx}].corrections[${ci}].field required`,
  )
  must(typeof o.original === 'string', `items[${idx}].corrections[${ci}].original required`)
  must(
    typeof o.corrected === 'string' && o.corrected.length > 0,
    `items[${idx}].corrections[${ci}].corrected required`,
  )
  must(
    typeof o.reason === 'string' && o.reason.trim().length >= 20,
    `items[${idx}].corrections[${ci}].reason must be ≥20 chars`,
  )
  must(
    typeof o.editor === 'string' && o.editor.length > 0,
    `items[${idx}].corrections[${ci}].editor required`,
  )
  must(
    typeof o.correctedAt === 'string' && ISO_DATE.test(o.correctedAt),
    `items[${idx}].corrections[${ci}].correctedAt must be ISO date`,
  )
  return {
    field: o.field as string,
    original: o.original as string,
    corrected: o.corrected as string,
    reason: (o.reason as string).trim(),
    editor: o.editor as string,
    correctedAt: o.correctedAt as string,
  }
}

function validateResponse(r: unknown, idx: number): JournalistReportResponse | null {
  if (r === null || r === undefined) return null
  must(typeof r === 'object' && r !== null, `items[${idx}].response must be object or null`)
  const o = r as Record<string, unknown>
  must(
    typeof o.from === 'string' && (RESPONSE_BLOCS as readonly string[]).includes(o.from),
    `items[${idx}].response.from must be one of ${RESPONSE_BLOCS.join(',')}`,
  )
  must(
    typeof o.quote === 'string' && o.quote.trim().length >= 20,
    `items[${idx}].response.quote must be verbatim ≥20 chars`,
  )
  must(
    typeof o.respondedAt === 'string' && ISO_DATE.test(o.respondedAt),
    `items[${idx}].response.respondedAt must be ISO date`,
  )
  if (o.sourceUrl !== undefined) {
    must(
      typeof o.sourceUrl === 'string' && URL_RE.test(o.sourceUrl),
      `items[${idx}].response.sourceUrl must be URL`,
    )
  }
  return {
    from: o.from as string,
    quote: (o.quote as string).trim(),
    respondedAt: o.respondedAt as string,
    ...(o.sourceUrl ? { sourceUrl: o.sourceUrl as string } : {}),
  }
}

function validateReport(r: unknown, idx: number): JournalistReport {
  must(typeof r === 'object' && r !== null, `items[${idx}] must be object`)
  const o = r as Record<string, unknown>
  must(
    o.requiresHumanApproval === undefined,
    `items[${idx}].requiresHumanApproval must not be set on published reports (strip before promote)`,
  )
  const base = validateBaseReport(o, idx)
  must(
    typeof o.promotedBy === 'string' && o.promotedBy.length > 0,
    `items[${idx}].promotedBy required`,
  )
  must(
    typeof o.promotedAt === 'string' && ISO_FULL.test(o.promotedAt),
    `items[${idx}].promotedAt must be ISO datetime`,
  )
  if (o.curatorNotes !== undefined) {
    must(typeof o.curatorNotes === 'string', `items[${idx}].curatorNotes must be string`)
  }
  must(Array.isArray(o.corrections), `items[${idx}].corrections must be array`)
  const corrections = (o.corrections as unknown[]).map((c, ci) => validateCorrection(c, idx, ci))
  const response = validateResponse(o.response ?? null, idx)

  return {
    ...base,
    promotedBy: o.promotedBy as string,
    promotedAt: o.promotedAt as string,
    ...(o.curatorNotes ? { curatorNotes: o.curatorNotes as string } : {}),
    corrections,
    response,
  }
}

export function validateReportsSnapshot(json: string): JournalistReportsSnapshot {
  const raw = JSON.parse(json) as Record<string, unknown>
  const meta = validateSnapshotMeta(raw)
  must(
    typeof raw.legalNotice === 'string' && raw.legalNotice.length >= 40,
    'legalNotice must be ≥40 chars',
  )
  must(
    typeof raw.contactUrl === 'string' && URL_RE.test(raw.contactUrl),
    'contactUrl must be http(s) URL',
  )
  must(
    typeof raw.methodologyUrl === 'string' && raw.methodologyUrl.length > 0,
    'methodologyUrl required',
  )
  must(Array.isArray(raw.items), 'items must be array')
  const items = (raw.items as unknown[]).map((it, i) => validateReport(it, i))
  const seen = new Set<string>()
  for (const it of items) {
    must(!seen.has(it.id), `duplicate report id ${it.id}`)
    seen.add(it.id)
  }
  return {
    ...meta,
    legalNotice: raw.legalNotice as string,
    contactUrl: raw.contactUrl as string,
    methodologyUrl: raw.methodologyUrl as string,
    items,
  }
}

// ─── Convenience helpers (shared with CLIs + tests) ────────────────────────

/**
 * Compute the legalSensitivity for a draft from its sources + warnings.
 * Auto-escalates to 'high' on any judicial-token hit. Callers should
 * use this BEFORE persisting so the validator never has to reject.
 */
export function computeLegalSensitivity(
  sources: ReadonlyArray<Pick<SourceCitation, 'excerpt' | 'title'>>,
  warnings: ReadonlyArray<string>,
  sections: ReadonlyArray<{ kind: string }> = [],
): LegalSensitivity {
  const judicialHit = [
    ...sources.flatMap((s) => [s.excerpt ?? '', s.title ?? '']),
    ...warnings,
  ].some((txt) => JUDICIAL_TOKENS.some((rx) => rx.test(txt)))
  if (judicialHit) return 'high'
  // Presence of a legal-record section is itself a high-sensitivity
  // signal (matches the validator rule in validateBaseReport).
  if (sections.some((s) => s.kind === 'legal-record')) return 'high'
  return 'low'
}

/**
 * Re-export the promise-snapshot freeze helper under the journalist
 * namespace so consumer scripts can `import { isJournalistFrozen }`
 * without reaching into the promise subsystem directly.
 */
export function isJournalistFrozen(
  promisesSnap: { frozenUntil: string | null } | null,
  now = new Date(),
): boolean {
  if (!promisesSnap) return false
  return isFrozen(promisesSnap, now)
}

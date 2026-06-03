/**
 * Journalist subsystem — schema types, enums, and libel-rule constants.
 *
 * Pure types + readonly value tables: no logic, no sibling imports. Decomposed
 * out of the original src/scraper/journalist.ts monolith; re-exported wholesale
 * by the ../journalist barrel so every existing import keeps resolving.
 */

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

export const RESPONSE_BLOCS = ['PSOE', 'PP', 'VOX', 'Compromís', 'Ciudadanos', 'Otro', 'person'] as const

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

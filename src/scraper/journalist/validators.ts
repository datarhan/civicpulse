/**
 * Journalist subsystem — assignment / citation / report validators, the
 * high-sensitivity libel predicate (isHighSensitivity), and the freeze +
 * legal-sensitivity helpers. The per-section validator lives in ./sections.
 * Verbatim from the monolith except the defect #2 (single isHighSensitivity
 * predicate) and #3 (fail-closed on an unparseable financial URL) fixes.
 */
import { isFrozen } from '../promises'
import {
  ALLOWED_ASSIGNMENT_KINDS,
  ALLOWED_ASSIGNMENT_STATUSES,
  ALLOWED_CITATION_KINDS,
  ALLOWED_CITATION_TRUST,
  ALLOWED_LEGAL_SENSITIVITY,
  ALLOWED_SUBJECT_KINDS,
  FINANCIAL_SOURCE_ALLOW,
  JUDICIAL_TOKENS,
  RESPONSE_BLOCS,
  type AssignmentKind,
  type AssignmentStatus,
  type CitationKind,
  type CitationTrust,
  type JournalistAssignment,
  type JournalistAssignmentsSnapshot,
  type JournalistDraftsSnapshot,
  type JournalistReport,
  type JournalistReportCorrection,
  type JournalistReportDraft,
  type JournalistReportResponse,
  type JournalistReportsSnapshot,
  type LegalSensitivity,
  type ReportSection,
  type SourceCitation,
  type SubjectKind,
} from './types'
import {
  ISO_DATE,
  ISO_FULL,
  JournalistValidationError,
  must,
  SLUG_RE,
  URL_RE,
  validateSnapshotMeta,
} from './core'
import { validateSection } from './sections'

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
  must(
    o.selfDeclared === undefined || typeof o.selfDeclared === 'boolean',
    `items[${idx}].sources[${ci}].selfDeclared must be a boolean when present`,
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
  // A relocation is only meaningful as a pair: where it was, and when we moved
  // the pointer. One without the other is a half-recorded edit to a published
  // citation, which is worse than not recording it.
  if (o.previousUrl !== undefined) {
    must(
      typeof o.previousUrl === 'string' && URL_RE.test(o.previousUrl),
      `items[${idx}].sources[${ci}].previousUrl must be http(s) URL`,
    )
    must(
      typeof o.relocatedAt === 'string' && ISO_FULL.test(o.relocatedAt),
      `items[${idx}].sources[${ci}].previousUrl requires relocatedAt (ISO datetime)`,
    )
    must(o.previousUrl !== o.url, `items[${idx}].sources[${ci}].previousUrl must differ from url`)
  }
  if (o.relocatedAt !== undefined) {
    must(
      typeof o.previousUrl === 'string',
      `items[${idx}].sources[${ci}].relocatedAt requires previousUrl`,
    )
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
    ...(o.selfDeclared === undefined ? {} : { selfDeclared: o.selfDeclared as boolean }),
    ...(o.previousUrl ? { previousUrl: o.previousUrl as string } : {}),
    ...(o.relocatedAt ? { relocatedAt: o.relocatedAt as string } : {}),
  }
}

/**
 * The single high-sensitivity predicate. A report is high-sensitivity when any
 * source excerpt/title or warning matches a judicial token, OR a legal-record
 * section is present. validateBaseReport (the enforcement) and
 * computeLegalSensitivity (the agent's pre-persist stamp) BOTH call this so the
 * two can never drift — what the agent stamps always matches what the validator
 * demands.
 */
export function isHighSensitivity(
  sources: ReadonlyArray<Pick<SourceCitation, 'excerpt' | 'title'>>,
  warnings: ReadonlyArray<string>,
  sections: ReadonlyArray<{ kind: string }> = [],
): boolean {
  const judicialHit = [
    ...sources.flatMap((s) => [s.excerpt ?? '', s.title ?? '']),
    ...warnings,
  ].some((txt) => JUDICIAL_TOKENS.some((rx) => rx.test(txt)))
  if (judicialHit) return true
  if (sections.some((s) => s.kind === 'legal-record')) return true
  return false
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

  // Libel-material rules. The high-sensitivity predicate (judicial tokens in
  // any source/warning, or a legal-record section) is computed once at the end
  // via isHighSensitivity() — shared with computeLegalSensitivity so the agent's
  // stamp and the validator's demand can never drift.

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
                // Fail closed: a financial source URL we cannot parse must not
                // silently resolve to '' and bypass the allow-list. Surface it
                // so the curator fixes the citation.
                throw new JournalistValidationError(
                  `items[${idx}].sections[${si}](financial).payload.items[${ii}] source ${rid} has an unparseable URL: ${String(src.url)}`,
                )
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

  if (isHighSensitivity(sources, o.warnings as string[], sections)) {
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
  // Snapshot-wide curator log. Carried through explicitly: this rebuild is
  // what gets written back, so a field the validator does not name is a field
  // the next curator CLI deletes. `backfill-self-declared.ts` writes it.
  if (raw.curatorNotes !== undefined) {
    must(typeof raw.curatorNotes === 'string', 'curatorNotes must be string')
  }
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
    ...(raw.curatorNotes ? { curatorNotes: raw.curatorNotes as string } : {}),
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
  return isHighSensitivity(sources, warnings, sections) ? 'high' : 'low'
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

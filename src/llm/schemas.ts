/**
 * Zod schemas for every LLM output shape.
 *
 * The schemas are the canonical contract between the LLM and the rest of the
 * app: any output that doesn't parse is rejected inside the client with retry
 * (see `callLLM` in client.ts). Never widen a schema to let an LLM get away
 * with sloppy output — tighten the prompt instead.
 *
 * These schemas are also mirrored onto the Ollama/OpenAI JSON-schema request
 * bodies at call time via `zodToJsonSchema` (see client.ts).
 */
import { z } from 'zod'
import { ALLOWED_BLOCS, ALLOWED_DIRECTIONS, ALLOWED_OUTCOMES } from '../scraper/pleno-votes'
import {
  ALLOWED_CLAIM_TYPES,
  ALLOWED_CLAIM_TOPICS,
  ALLOWED_ACCUSATION_SUBTYPES,
} from '../scraper/pleno-claim'
import {
  ALLOWED_PARTIES,
  ALLOWED_TOPICS,
  ALLOWED_KINDS,
  type Party,
  type Topic,
  type Kind,
} from '../scraper/promises'

// Mirrors src/scraper/promises.ts V1_STATUSES set. Kept as an array because
// zod.enum() needs a tuple of literals at build time, not a runtime Set.
// Any widening here MUST be reflected in the curator CLI's own gate.
const V1_STATUSES = ['documentada', 'en-verificacion'] as const

// ─── Phase 1 · Pleno vote suggestion ────────────────────────────────────────
// One segment of a transcript → zero or one vote event. The LLM MUST return
// `null` if the segment is preamble, debate, or a non-vote decision.

export const VoteTupleSchema = z.object({
  bloc: z.enum([...ALLOWED_BLOCS] as [(typeof ALLOWED_BLOCS)[number]]),
  direction: z.enum([...ALLOWED_DIRECTIONS] as [(typeof ALLOWED_DIRECTIONS)[number]]),
  seats: z.number().int().min(0).max(21).optional(),
})

export const PlenoVoteSuggestionSchema = z.object({
  itemNumber: z.number().int().positive().nullable(),
  outcome: z.enum([...ALLOWED_OUTCOMES] as [(typeof ALLOWED_OUTCOMES)[number]]).nullable(),
  votes: z.array(VoteTupleSchema).max(6),
  excerpt: z.string().min(10).max(600),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(5).max(500),
  // Optional dueBy + dueBySource — the LLM fills these when a plazo phrase
  // appears near the vote in the transcript. Curator still approves before
  // promotion to pleno-votes.json, but no longer types the fields by hand.
  // dueBySource ≥20 chars mirrors the pleno-votes.ts validator invariant.
  dueBy: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  dueBySource: z.string().min(20).max(500).nullable().optional(),
})

export type PlenoVoteSuggestion = z.infer<typeof PlenoVoteSuggestionSchema>

/** Wrapper for batch responses: "either a vote or explicit null". */
export const PlenoVoteResponseSchema = z.object({
  vote: PlenoVoteSuggestionSchema.nullable(),
})

// ─── Phase 1b · Pleno claim extraction ──────────────────────────────────────
// Free-form assertions made in the floor of a pleno — promesas, numeric
// claims, work citations, grant citations. Always speaker-group attributed,
// never individual (libel line). See src/scraper/pleno-claim.ts for the
// rendered schema.

export const ClaimEntitiesSchema = z.object({
  amountEuros: z.number().nonnegative().max(1e12).nullable().optional(),
  count: z.number().int().nonnegative().max(1e9).nullable().optional(),
  countUnit: z.string().min(1).max(60).nullable().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  referencedEntity: z.string().min(1).max(200).nullable().optional(),
})

export const PlenoClaimSuggestionSchema = z.object({
  type: z.enum([...ALLOWED_CLAIM_TYPES] as [(typeof ALLOWED_CLAIM_TYPES)[number]]),
  speakerGroup: z.enum([...ALLOWED_BLOCS] as [(typeof ALLOWED_BLOCS)[number]]).nullable(),
  // Optional individual attribution — only set when the transcript line
  // carries a high-tier voice-id named tag like `(Robert Raga Gadea)`,
  // produced by `scripts/identify-pleno-speakers.ts --apply`. NEVER
  // populated from prose alone (Whisper WER on proper nouns is too high
  // to be defamation-safe). Validated post-LLM against the enrolled
  // voiceprint set + officials.json party consistency in
  // src/scraper/pleno-claim-llm.ts. speakerGroup remains the primary
  // libel-safe attribution; speakerSlug is editorial signal that the
  // dashboard / curator can use, but is NOT auto-published into
  // /declaraciones or /hallazgos without explicit promote-claim curation.
  speakerSlug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/)
    .nullable()
    .optional(),
  verbatim: z.string().min(20).max(500),
  context: z.string().min(20).max(500),
  topic: z.enum([...ALLOWED_CLAIM_TOPICS] as [(typeof ALLOWED_CLAIM_TOPICS)[number]]),
  entities: ClaimEntitiesSchema,
  // Optional — only meaningful when type==='acusacion_publica'. When absent
  // the verifier treats accusations as opinativa (safe default).
  accusationSubtype: z
    .enum([...ALLOWED_ACCUSATION_SUBTYPES] as [(typeof ALLOWED_ACCUSATION_SUBTYPES)[number]])
    .nullable()
    .optional(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(5).max(400),
})

export type PlenoClaimExtraction = z.infer<typeof PlenoClaimSuggestionSchema>

/** A segment may contain 0..N claims — the LLM returns an array. */
export const PlenoClaimResponseSchema = z.object({
  claims: z.array(PlenoClaimSuggestionSchema).max(8),
})

// ─── Phase 2 · Promise evidence suggestion ──────────────────────────────────
// Per-promise, LLM reranks candidate evidence items from press / plenos /
// tenders / bdns / budget corpora. LOREG-freeze + V1-status gates are enforced
// OUTSIDE the schema (in src/scraper/promise-llm-inference.ts) because zod can't
// read app state.

export const PromiseEvidenceKind = z.enum([
  'press',
  'pleno_agenda',
  'pleno_vote',
  'pleno_transcript', // YouTube-derived Whisper transcript — speaker NEVER attributed
  'tender',
  'bdns',
  'budget',
])

export const PromiseEvidenceItemSchema = z.object({
  promiseId: z.string().min(3),
  // The LLM is explicitly ALLOWED to propose only the safe V1 statuses —
  // everything else must come from a curator reading the evidence. Any output
  // attempting to promote past the gate is rejected post-parse.
  proposedStatus: z
    .enum([...V1_STATUSES] as [(typeof V1_STATUSES)[number], ...(typeof V1_STATUSES)[number][]])
    .optional(),
  corpus: PromiseEvidenceKind,
  evidenceUrl: z.string().url(),
  publisher: z.string().min(1).max(120),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quote: z.string().min(10).max(500),
  reasoning: z.string().min(10).max(500),
  confidence: z.number().min(0).max(1),
})

export type PromiseEvidenceItem = z.infer<typeof PromiseEvidenceItemSchema>

export const PromiseEvidenceBatchSchema = z.object({
  evidence: z.array(PromiseEvidenceItemSchema).max(12),
})

// ─── Phase 2 · Promise STATUS-CHANGE miner (progress transitions) ────────────
// Distinct from PromiseEvidence* (V1-only). Cite-by-candidateIndex: the LLM
// references a retrieved candidate by its index in the flat list; the miner
// rejects any index out of range (the libel boundary — no fabricated source).
export const PROGRESS_STATUSES = ['en-progreso', 'parcial', 'cumplida'] as const
export const PromiseStatusChangeItemSchema = z.object({
  promiseId: z.string().min(3),
  proposedStatus: z.enum([...PROGRESS_STATUSES] as [
    (typeof PROGRESS_STATUSES)[number],
    ...(typeof PROGRESS_STATUSES)[number][],
  ]),
  candidateIndex: z.number().int().nonnegative(),
  corpus: PromiseEvidenceKind,
  quote: z.string().min(10).max(500),
  fieldCite: z.string().max(200).optional(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(10).max(500),
})
export type PromiseStatusChangeItem = z.infer<typeof PromiseStatusChangeItemSchema>
export const PromiseStatusChangeBatchSchema = z.object({
  changes: z.array(PromiseStatusChangeItemSchema).max(8),
})
export type PromiseStatusChangeBatch = z.infer<typeof PromiseStatusChangeBatchSchema>

// ─── Phase 3 · Tender ↔ queja correlation ───────────────────────────────────
// Given one queja and N candidate tenders, pick at most one tender that
// plausibly addresses the queja. LLM may return `null` (no plausible match).

export const TenderQuejaCorrelationSchema = z.object({
  quejaId: z.string().min(3),
  tenderPermalink: z.string().url(),
  // Confidence must clear the 0.6 threshold to be surfaced in the UI.
  confidence: z.number().min(0).max(1),
  // One-sentence justification, citing the tender title / contractor.
  reasoning: z.string().min(10).max(400),
  // The LLM asserts none of these terms implies causation. The UI disclaimer
  // also renders "posiblemente relacionadas" explicitly.
})

export type TenderQuejaCorrelation = z.infer<typeof TenderQuejaCorrelationSchema>

export const TenderQuejaResponseSchema = z.object({
  correlation: TenderQuejaCorrelationSchema.nullable(),
})

// ─── Phase 5 · Claim verifier second-pass (LLM) ─────────────────────────────
// Runs ONLY on claims the deterministic verifier marked sin-datos. The LLM
// receives a pre-filtered top-K candidate list and may upgrade the verdict
// only by citing one or more candidates by their *index* in that list.
// Free-form ref strings are not allowed — that's the libel safety boundary:
// the LLM literally cannot fabricate a tender that doesn't exist, only
// agree or disagree with one we showed it.

export const ClaimVerifierLlmEvidenceSchema = z.object({
  /** Index into the candidates array sent in the user prompt. The runner
   *  rejects any value outside [0, candidates.length). */
  candidateIndex: z.number().int().nonnegative(),
  /** ≤240-char one-line citation showing what matched. */
  snippet: z.string().min(10).max(240),
  /** True if the candidate CONTRADICTS the claim (e.g. tender amount
   *  doesn't match the spoken figure). Required for verdict=contradicho. */
  isContradiction: z.boolean(),
})

export const ClaimVerifierLlmResponseSchema = z.object({
  verdict: z.enum(['verificado', 'parcial', 'contradicho', 'sin-datos']),
  /** One-sentence justification. */
  summary: z.string().min(10).max(300),
  /** Up to 5 candidate citations. Empty when verdict=sin-datos. */
  evidence: z.array(ClaimVerifierLlmEvidenceSchema).max(5),
  /** LLM's self-reported confidence in the verdict (0..1). */
  confidence: z.number().min(0).max(1),
})

export type ClaimVerifierLlmResponse = z.infer<typeof ClaimVerifierLlmResponseSchema>

// ─── Phase 3 (rebuild) · Verdict engine (reason-then-format) ─────────────────

/** Free-text reasoning step (scratchpad before the structured extract). */
export const EngineReasoningSchema = z.object({
  reasoning: z.string().min(1).max(2000),
})
export type EngineReasoning = z.infer<typeof EngineReasoningSchema>

/** Verdict extract — engine NEVER emits contradicho (deterministic + curator only). */
export const EngineExtractSchema = z.object({
  verdict: z.enum(['verificado', 'parcial', 'sin-datos']),
  cites: z
    .array(
      z.object({
        candidateIndex: z.number().int(),
        snippet: z.string(),
      }),
    )
    .max(5),
})
export type EngineExtract = z.infer<typeof EngineExtractSchema>

// ─── Phase 6 · Auto-curation (LLM-written title + summary) ──────────────────
// Generates the editorial chrome for an auto-published finding. The CLI
// (scripts/auto-curate-findings.ts) gates by safety rules (no contradicho,
// all party-attributed, etc.) BEFORE calling this; the LLM only writes
// neutral framing. Severity is fixed at `informational` by the caller —
// the LLM doesn't choose severity.

export const AutoCurateResponseSchema = z.object({
  /** ≤120-char one-line headline. Must include pleno date (YYYY-MM-DD). */
  title: z.string().min(10).max(120),
  /** 2-3 sentences citing each speaker by bloc + at least one corroborating
   *  data record. Length floor matches the FindingsSnapshot validator. */
  summary: z.string().min(40).max(600),
})

export type AutoCurateResponse = z.infer<typeof AutoCurateResponseSchema>

// ─── Phase 6 · Press fact-check laboratory ────────────────────────────────

export const PressTriageResponseSchema = z.object({
  hasCheckableClaim: z.boolean(),
  reasoning: z.string().max(200),
  expectedClaimTypes: z.array(
    z.enum([
      'promesa',
      'afirmacion_numerica',
      'cita_obra',
      'cita_convenio',
      'acusacion_publica',
      'dato_municipal',
    ]),
  ),
  needsBody: z.boolean(),
})
export type PressTriageResponse = z.infer<typeof PressTriageResponseSchema>

export const PressClaimExtractionSchema = z.object({
  type: z.enum([
    'promesa',
    'afirmacion_numerica',
    'cita_obra',
    'cita_convenio',
    'acusacion_publica',
    'dato_municipal',
  ]),
  attributedSource: z.enum(['outlet', 'municipal', 'opposition', 'unspecified']),
  verbatim: z.string().min(20),
  context: z.string().max(400),
  topic: z.enum([
    'fiscal',
    'vivienda',
    'movilidad',
    'medio-ambiente',
    'social',
    'cultura',
    'seguridad',
    'empleo',
    'urbanismo',
    'salud',
    'transparencia',
    'educacion',
    'demografia',
    'other',
  ]),
  entities: z.object({
    amountEuros: z.number().nullable(),
    count: z.number().nullable(),
    countUnit: z.string().nullable(),
    date: z.string().nullable(),
    referencedEntity: z.string().nullable(),
  }),
  accusationSubtype: z.enum(['factual', 'opinativa', 'contra-datos']).nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(280),
})
export type PressClaimExtraction = z.infer<typeof PressClaimExtractionSchema>

export const PressClaimResponseSchema = z.object({
  claims: z.array(PressClaimExtractionSchema),
})
export type PressClaimResponse = z.infer<typeof PressClaimResponseSchema>

export const PressSummaryResponseSchema = z.object({
  // The prompt asks for 200–450 chars; 150 keeps a tolerance band below that
  // while rejecting obviously-truncated outputs (a 60-char "summary" used to
  // pass, get cached, and ship to /laboratorio with no retry).
  summary: z.string().min(150).max(500),
})
export type PressSummaryResponse = z.infer<typeof PressSummaryResponseSchema>

// ─── Phase 7 · Journalist agent ────────────────────────────────────────────
// Stage 1 (planning) emits a research plan with 4-8 questions; Stage 3
// (synthesis) emits the draft report skeleton the agent then projects into
// the formal ReportSection shape; Stage 4 (self-verify) emits warnings +
// legal-sensitivity escalation. Kept liberal (.nullable() everywhere) so
// the LLM can opt out of a section without failing schema validation.

export const JournalistPlanQuestionSchema = z.object({
  id: z.string().min(2).max(60),
  question: z.string().min(8).max(400),
  suggestedTool: z.enum([
    // Pre-seeded local data (officials/press/plenoclaims/promises are injected
    // before planning; requesting them is a no-op but kept in the enum so a
    // planner that names one does not fail validation).
    'local-snapshot',
    'officials',
    'press',
    'plenoclaims',
    'promises',
    'wikidata',
    'wikipedia',
    'web-search',
    'fetch-url',
    'audit-url',
    // External fetch/search tools dispatched in journalist-agent.ts. These were
    // added to the dispatch switch + planner prompt but were missing here, which
    // made them unreachable through validated plan output until this was fixed.
    'pdf-fetch',
    'headless-fetch',
    'boe-search',
    'dogv-search',
    'dialnet-search',
    'hemeroteca-search',
  ]),
  queryHint: z.string().nullable(),
  rationale: z.string().max(280),
})

export const JournalistPlanResponseSchema = z.object({
  questions: z.array(JournalistPlanQuestionSchema).min(1).max(10),
  notes: z.string().max(400).nullable().optional(),
})

export type JournalistPlanResponse = z.infer<typeof JournalistPlanResponseSchema>

export const JournalistSynthPortraitSchema = z.object({
  officialSlug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  cvUrl: z.string().url().nullable().optional(),
})

export const JournalistSynthNarrativeSchema = z.object({
  heading: z.string().min(3).max(160),
  bodyMarkdown: z.string().min(40).max(4000),
  citationIds: z.array(z.string().min(2).max(40)).min(1).max(12),
})

export const JournalistSynthTimelineEventSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  label: z.string().min(3).max(200),
  citationIds: z.array(z.string().min(2).max(40)).max(8),
})

export const JournalistSynthRelationshipNodeSchema = z.object({
  id: z.string().min(1).max(40),
  label: z.string().min(1).max(120),
  tone: z.enum(['civic', 'ok', 'warn', 'crit', 'intel', 'neutral', 'ghost']),
  kind: z.enum(['person', 'party', 'entity']),
})

export const JournalistSynthRelationshipEdgeSchema = z.object({
  from: z.string().min(1).max(40),
  to: z.string().min(1).max(40),
  relation: z.string().min(1).max(80),
  citationIds: z.array(z.string().min(2).max(40)).min(1).max(8),
})

export const JournalistSynthSparklinePointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().nonnegative().max(10_000),
})

export const JournalistSynthHeadlineSchema = z.object({
  title: z.string().min(1).max(280),
  url: z.string().url(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export const JournalistSynthQuoteCardSchema = z.object({
  verbatim: z.string().min(20).max(500),
  attributedTo: z.string().min(1).max(120),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  citationId: z.string().min(2).max(40),
})

export const JournalistSynthResponseSchema = z.object({
  portrait: JournalistSynthPortraitSchema.nullable(),
  narratives: z.array(JournalistSynthNarrativeSchema).min(1).max(8),
  timeline: z.array(JournalistSynthTimelineEventSchema).max(20),
  relationships: z
    .object({
      nodes: z.array(JournalistSynthRelationshipNodeSchema).min(1).max(20),
      edges: z.array(JournalistSynthRelationshipEdgeSchema).max(40),
    })
    .nullable(),
  pressSparkline: z
    .object({
      points: z.array(JournalistSynthSparklinePointSchema).max(60),
      headlines: z.array(JournalistSynthHeadlineSchema).max(20),
    })
    .nullable(),
  promiseBoardIds: z.array(z.string().min(2).max(80)).max(20).nullable(),
  quoteCards: z.array(JournalistSynthQuoteCardSchema).max(12),
  warnings: z.array(z.string().min(2).max(280)).max(20),
})
export type JournalistSynthResponse = z.infer<typeof JournalistSynthResponseSchema>

export const JournalistVerifyResponseSchema = z.object({
  warnings: z.array(z.string().min(2).max(280)).max(20),
  escalateLegalSensitivity: z.enum(['low', 'medium', 'high']),
})
export type JournalistVerifyResponse = z.infer<typeof JournalistVerifyResponseSchema>

// ─── Phase B: bio-extract (soul.md dossier entities) ──────────────────────
// Liberal nullables — the LLM should omit rather than invent. Citation
// arrays are kept tight (≤4 per entity) so a single hallucinated source
// doesn't drag a whole section into the validator's reject path. The
// agent projects this output into the 10 new ReportSection kinds added
// in Phase B.

const Year = z.number().int().min(1900).max(2099)
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const CitationId = z.string().min(2).max(40)
const CitationList = z.array(CitationId).max(4)

export const JournalistBioFamilyMember = z.object({
  relation: z.string().min(2).max(60),
  name: z.string().min(2).max(160).nullable().optional(),
  citationIds: CitationList,
})

export const JournalistBioIdentity = z.object({
  dateOfBirth: IsoDate.nullable().optional(),
  birthplace: z.string().min(2).max(160).nullable().optional(),
  residence: z.string().min(2).max(160).nullable().optional(),
  nationality: z.string().min(2).max(80).nullable().optional(),
  family: z.array(JournalistBioFamilyMember).max(8).optional(),
})

export const JournalistBioEducationItem = z.object({
  degree: z.string().min(2).max(200),
  institution: z.string().min(2).max(200).nullable().optional(),
  startYear: Year.nullable().optional(),
  endYear: Year.nullable().optional(),
  citationIds: CitationList,
})

export const JournalistBioCareerPoliticalItem = z.object({
  role: z.string().min(2).max(200),
  org: z.string().min(2).max(200),
  startYear: Year,
  endYear: Year.nullable().optional(),
  citationIds: CitationList,
})

export const JournalistBioCareerProfessionalItem = z.object({
  role: z.string().min(2).max(200),
  org: z.string().min(2).max(200),
  startYear: Year.nullable().optional(),
  endYear: Year.nullable().optional(),
  citationIds: CitationList,
})

export const JournalistBioLegalRecordItem = z.object({
  caseRef: z.string().min(3).max(120),
  court: z.string().min(3).max(200),
  date: IsoDate.nullable().optional(),
  outcome: z.string().min(2).max(400).nullable().optional(),
  verbatimRef: z.string().min(20).max(800),
  citationIds: CitationList.min(1),
})

export const JournalistBioFinancialItem = z.object({
  year: Year,
  metric: z.enum(['salary', 'declared-assets', 'business']),
  amountEuros: z.number().nonnegative().nullable().optional(),
  description: z.string().min(2).max(400),
  citationIds: CitationList.min(1),
})

export const JournalistBioOnlinePresenceItem = z.object({
  platform: z.string().min(1).max(40),
  handle: z.string().min(1).max(80),
  url: z.string().url(),
  verifiedAt: IsoDate.nullable().optional(),
  citationIds: CitationList,
})

export const JournalistBioAwardItem = z.object({
  name: z.string().min(2).max(200),
  awardedBy: z.string().min(2).max(200),
  year: Year.nullable().optional(),
  citationIds: CitationList,
})

export const JournalistBioPublicationItem = z.object({
  title: z.string().min(3).max(300),
  venue: z.string().min(2).max(200),
  year: Year.nullable().optional(),
  url: z.string().url().nullable().optional(),
  citationIds: CitationList,
})

export const JournalistBioGap = z.object({
  field: z.string().min(2).max(120),
  reason: z.string().min(2).max(280),
})

export const JournalistBioResponseSchema = z.object({
  identity: JournalistBioIdentity.nullable(),
  education: z.array(JournalistBioEducationItem).max(12),
  careerPolitical: z.array(JournalistBioCareerPoliticalItem).max(12),
  careerProfessional: z.array(JournalistBioCareerProfessionalItem).max(20),
  legalRecord: z.array(JournalistBioLegalRecordItem).max(8),
  financial: z.array(JournalistBioFinancialItem).max(16),
  onlinePresence: z.array(JournalistBioOnlinePresenceItem).max(8),
  awards: z.array(JournalistBioAwardItem).max(12),
  publications: z.array(JournalistBioPublicationItem).max(20),
  gapsDetected: z.array(JournalistBioGap).max(20),
})
export type JournalistBioResponse = z.infer<typeof JournalistBioResponseSchema>

// ─── Utility ────────────────────────────────────────────────────────────────

/**
 * Convert a zod schema to a JSON Schema blob for the LLM request body.
 * Zod v4 ships a built-in `toJSONSchema` — we just normalise the output so
 * every top-level object has `additionalProperties: false` (required by
 * OpenAI strict mode and defensive for Ollama too).
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>
  return stripAndTighten(json)
}

function stripAndTighten(node: unknown): Record<string, unknown> {
  if (!node || typeof node !== 'object') return node as Record<string, unknown>
  const obj = { ...(node as Record<string, unknown>) }
  // Remove keys OpenAI strict mode rejects.
  delete obj.$schema
  delete obj.$id
  if (obj.type === 'object') {
    obj.additionalProperties = false
    const props = obj.properties as Record<string, unknown> | undefined
    if (props) {
      const rebuilt: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(props)) rebuilt[k] = stripAndTighten(v)
      obj.properties = rebuilt
    }
  }
  if (obj.type === 'array' && obj.items) obj.items = stripAndTighten(obj.items)
  if (Array.isArray(obj.anyOf)) obj.anyOf = obj.anyOf.map((x) => stripAndTighten(x))
  if (Array.isArray(obj.oneOf)) obj.oneOf = obj.oneOf.map((x) => stripAndTighten(x))
  return obj
}

// ─── Promise discovery (auto-curator Phase 1) ──────────────────────────────
// The LLM proposes NEW public commitments not yet tracked. status is ALWAYS
// 'documentada' downstream (this schema omits it); the deterministic grounder
// + curator gate decide what publishes. Enums mirror src/scraper/promises.ts.
export const PromiseDiscoveryItemSchema = z.object({
  party: z.enum(ALLOWED_PARTIES as unknown as [Party, ...Party[]]),
  title: z.string().min(4).max(200),
  quote: z.string().min(20).max(1500),
  sourceUrl: z.string().url(),
  publisher: z.string().min(1).max(100),
  madeAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  topic: z.enum(ALLOWED_TOPICS as unknown as [Topic, ...Topic[]]),
  kind: z.enum(ALLOWED_KINDS as unknown as [Kind, ...Kind[]]),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(10).max(500),
})
export type PromiseDiscoveryItem = z.infer<typeof PromiseDiscoveryItemSchema>

export const PromiseDiscoveryBatchSchema = z.object({
  promises: z.array(PromiseDiscoveryItemSchema).max(12),
})
export type PromiseDiscoveryBatch = z.infer<typeof PromiseDiscoveryBatchSchema>

// ─── Place geocode (tender map, LLM name recall) ────────────────────────────
// One contract title → the specific place its work sits at, or null. The LLM
// extracts only the NAME (fuzzy / cross-language); the coordinate is looked up
// in our OSM gazetteer downstream (matchNameToGazetteer), so the model never
// emits a coordinate and can never invent one. `placeName` is null when the
// title names no specific location (a service, a supply, generic works).
export const PlaceGeocodeResponseSchema = z.object({
  placeName: z.string().min(2).max(120).nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().min(5).max(400),
})
export type PlaceGeocodeResponse = z.infer<typeof PlaceGeocodeResponseSchema>

/** Findings from the reader-review pass. Empty is the expected answer. */
export const ReaderReviewSchema = z.object({
  findings: z
    .array(
      z.object({
        quote: z.string().min(12),
        inference: z.string().min(10),
        contradictedBy: z.string().min(5),
        severity: z.enum(['misleading', 'unclear']),
      }),
    )
    .max(8),
})

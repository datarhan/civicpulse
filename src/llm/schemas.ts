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
import { ALLOWED_CLAIM_TYPES, ALLOWED_CLAIM_TOPICS } from '../scraper/pleno-claim'

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
  verbatim: z.string().min(20).max(500),
  context: z.string().min(20).max(500),
  topic: z.enum([...ALLOWED_CLAIM_TOPICS] as [(typeof ALLOWED_CLAIM_TOPICS)[number]]),
  entities: ClaimEntitiesSchema,
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
  proposedStatus: z.enum([...V1_STATUSES] as [(typeof V1_STATUSES)[number]]).optional(),
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

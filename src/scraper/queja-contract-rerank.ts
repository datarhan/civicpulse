/**
 * LLM rerank of deterministic Tier-B queja↔contract candidates.
 *
 * The deterministic engine (queja-contract-relations.ts) emits many weak Tier-B
 * links (e.g. every urbanismo-themed contract for an urbanismo queja). This pass
 * helps a CURATOR triage them: a cheap lexical shortlist narrows the field, then
 * an LLM picks the single most plausible relation with a confidence + a NEUTRAL
 * one-sentence reason. Output is ALWAYS `requiresHumanApproval: true` — the LLM
 * never publishes; it only ranks what a curator may then promote via
 * `promote-relation`. Reuses the (libel-reviewed) tender-queja prompt + schema.
 */
import type { ZodTypeAny, z } from 'zod'
import { callLLM, type CallLlmOptions } from '../llm/client'
import { TenderQuejaResponseSchema, type TenderQuejaCorrelation } from '../llm/schemas'
import {
  TENDER_QUEJA_PROMPT_VERSION,
  buildTenderQuejaSystemPrompt,
  buildTenderQuejaUserPrompt,
  type TenderQuejaInput,
} from '../llm/prompts'
import { stripDiacritics } from './normalize'

export type LlmCaller = <T extends ZodTypeAny>(
  opts: CallLlmOptions<T>,
) => Promise<z.infer<T> | null>

export interface RerankQueja {
  id: string
  serviceCode: string
  placeSlug: string | null
  description: string
  createdAt: string
}

export interface RerankCandidate {
  permalink: string
  tenderId: string
  title: string
  contractor?: string
  assignee?: string
  awardDate?: string
  amount?: number
  categoryTitle?: string
}

export interface RerankedLink extends TenderQuejaCorrelation {
  tenderId: string
  via: 'llm'
  requiresHumanApproval: true
}

const STOPWORDS = new Set([
  'para',
  'con',
  'del',
  'las',
  'los',
  'por',
  'una',
  'uno',
  'the',
  'and',
  'que',
  'como',
  'sobre',
  'entre',
  'este',
  'esta',
  'estos',
  'estas',
  'sus',
  'sin',
])

function tokens(s: string): Set<string> {
  return new Set(
    stripDiacritics(String(s).toLowerCase())
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4 && !STOPWORDS.has(t)),
  )
}

/**
 * Cheap lexical pre-filter: rank candidates by word overlap between the queja
 * description and the contract title, drop zero-overlap ones, cap at topN. Keeps
 * the LLM prompt small (and the pick meaningful) when a queja has dozens of
 * same-theme Tier-B candidates.
 */
export function shortlistCandidates(
  queja: RerankQueja,
  candidates: RerankCandidate[],
  topN = 8,
): RerankCandidate[] {
  const qTok = tokens(queja.description)
  return candidates
    .map((c) => {
      const cTok = tokens(c.title)
      let overlap = 0
      for (const t of cTok) if (qTok.has(t)) overlap += 1
      return { c, overlap }
    })
    .filter((s) => s.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, topN)
    .map((s) => s.c)
}

/**
 * Ask the LLM to pick at most one plausible relation from the shortlist. Guards:
 * the returned permalink MUST be a candidate (no hallucinated contract), and the
 * confidence must clear `minConfidence`. Always stamped requiresHumanApproval.
 */
export async function rerankTierB(
  queja: RerankQueja,
  candidates: RerankCandidate[],
  caller: LlmCaller = callLLM,
  minConfidence = 0.6,
): Promise<RerankedLink | null> {
  if (candidates.length === 0) return null
  const input: TenderQuejaInput = {
    queja: {
      id: queja.id,
      category: queja.serviceCode,
      neighborhood: queja.placeSlug,
      description: queja.description,
      createdAt: queja.createdAt,
    },
    candidates: candidates.map((c) => ({
      permalink: c.permalink,
      title: c.title,
      contractor: c.contractor,
      assignee: c.assignee,
      awardDate: c.awardDate,
      amount: c.amount,
      categoryTitle: c.categoryTitle,
    })),
  }
  const res = await caller({
    systemPrompt: buildTenderQuejaSystemPrompt(),
    userPrompt: buildTenderQuejaUserPrompt(input),
    promptVersion: TENDER_QUEJA_PROMPT_VERSION,
    schema: TenderQuejaResponseSchema,
    input: { quejaId: queja.id, permalinks: candidates.map((c) => c.permalink).sort() },
  })
  if (!res || !res.correlation) return null
  const cor = res.correlation
  const match = candidates.find((c) => c.permalink === cor.tenderPermalink)
  if (!match) return null // hallucination guard
  if (cor.confidence < minConfidence) return null
  return { ...cor, tenderId: match.tenderId, via: 'llm', requiresHumanApproval: true }
}

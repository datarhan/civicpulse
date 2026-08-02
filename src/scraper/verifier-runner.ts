/**
 * VerifierFn seam (P0).
 *
 * One socket every verifier plugs into, so `npm run eval:verifier` can compare
 * them apples-to-apples on the gold set:
 *   · storedVerifier      — the verdict already in pleno-claims-verified.json
 *                           (zero-compute shipped baseline, no LLM)
 *   · deterministicVerifier — verifyClaim() only
 *   · currentVerifier     — deterministic, then verifyClaimWithLlm on sin-datos
 *                           (mirrors production's 2-pass)
 *   · nliVerifier         — added in P1 Task 7
 *
 * loadVerifierContext loads every dataset ONCE, including tendersTed +
 * priorClaims — which the production deterministic runner omits (audit R3) — so
 * the eval measures the correctly-wired pipeline.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { PlenoClaim } from './pleno-claim'
import {
  verifyClaim,
  getShortlist,
  type ClaimVerification,
  type VerifierInputs,
} from './claim-verifier'
import { verifyClaimWithLlm } from './claim-verifier-llm'
import { verifyClaimWithNli } from './claim-verifier-nli'
import { verifyClaimWithEngine, type EngineDeps } from './claim-verifier-engine'
import { scoreNliPairs, type NliPair } from './nli-client'
import type { Corpus } from './semantic-shortlist'
import { callLLM } from '../llm/client'
import { EngineReasoningSchema, EngineExtractSchema } from '../llm/schemas'
import {
  buildEngineReasonSystemPrompt,
  buildEngineReasonUserPrompt,
  buildEngineExtractSystemPrompt,
  buildEngineExtractUserPrompt,
  buildEngineArgueAgainstPrompt,
  ENGINE_REASON_VERSION,
  ENGINE_EXTRACT_VERSION,
  ENGINE_ARGUE_VERSION,
} from '../llm/prompts'

export interface VerifierContext {
  tenders: unknown
  tendersTed: unknown
  bdns: unknown
  budget: unknown
  promises: unknown
  priorClaims: PlenoClaim[]
  /** Preloaded embedding corpus (null = lexical-only shortlist). */
  corpus: Corpus | null
}

export type VerifierFn = (claim: PlenoClaim, ctx: VerifierContext) => Promise<ClaimVerification>

const DATA = resolve('public/data')

function loadIfExists(name: string): unknown {
  const p = resolve(DATA, name)
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null
}

export async function loadVerifierContext(
  opts: { withCorpus?: boolean } = {},
): Promise<VerifierContext> {
  const tenders = loadIfExists('tenders.json')
  const tendersTed = loadIfExists('tenders-ted.json')
  const bdns = loadIfExists('bdns.json')
  const budget = loadIfExists('budget.json')
  const promises = loadIfExists('promises.json')
  const sugg = loadIfExists('pleno-claims-suggestions.json') as { items?: PlenoClaim[] } | null
  const priorClaims = sugg?.items ?? []

  let corpus: Corpus | null = null
  if (opts.withCorpus) {
    try {
      const semantic = await import('./semantic-shortlist')
      corpus = semantic.loadCorpus('.embed-cache/verifier-corpus.jsonl')
    } catch {
      corpus = null // degrade to lexical; never block the eval/runner
    }
  }
  return { tenders, tendersTed, bdns, budget, promises, priorClaims, corpus }
}

function inputsFor(claim: PlenoClaim, ctx: VerifierContext): VerifierInputs {
  return {
    claim,
    tenders: ctx.tenders,
    tendersTed: ctx.tendersTed,
    bdns: ctx.bdns,
    budget: ctx.budget,
    promises: ctx.promises,
    priorClaims: ctx.priorClaims,
  }
}

export const deterministicVerifier: VerifierFn = async (claim, ctx) =>
  verifyClaim(inputsFor(claim, ctx))

export const currentVerifier: VerifierFn = async (claim, ctx) => {
  const det = verifyClaim(inputsFor(claim, ctx))
  if (det.verdict !== 'sin-datos') return det
  const shortlist = await getShortlist(inputsFor(claim, ctx), 8)
  if (shortlist.length === 0) return det
  const r = await verifyClaimWithLlm({ claim, candidates: shortlist })
  return r?.upgraded ? r.verification : det
}

/**
 * deterministic → if sin-datos, NLI grounding pass (local, $0). `model`
 * selects the sidecar model (default mDeBERTa-xnli; 'minicheck' for benchmark).
 */
export function makeNliVerifier(opts: { model?: string } = {}): VerifierFn {
  const scorer = (pairs: NliPair[]) => scoreNliPairs(pairs, opts.model ? { model: opts.model } : {})
  return async (claim, ctx) => {
    const det = verifyClaim(inputsFor(claim, ctx))
    if (det.verdict !== 'sin-datos') return det
    const shortlist = await getShortlist(
      inputsFor(claim, ctx),
      8,
      ctx.corpus ? { corpus: ctx.corpus } : {},
    )
    if (shortlist.length === 0) return det
    const r = await verifyClaimWithNli({ claim, candidates: shortlist }, scorer)
    return r?.upgraded ? r.verification : det
  }
}

export const nliVerifier: VerifierFn = makeNliVerifier()

/**
 * P3 verdict engine: deterministic → if sin-datos, reason-then-format over the
 * shortlist (local qwen via ollama) with NEI-default + cite-grounding + an
 * optional PCC consistency gate (argue-both-sides → mDeBERTa contradiction).
 * Never emits contradicho. Set LLM_BACKEND=ollama + OLLAMA_MODEL=qwen2.5:14b-instruct.
 */
export function makeEngineVerifier(
  opts: {
    consistency?: boolean
    /**
     * Judge every claim, instead of only those the deterministic pass gave up
     * on.
     *
     * The default short-circuits on `det.verdict !== 'sin-datos'`, which is
     * right for the engine's original job (re-deriving LLM over-claims, where
     * the deterministic verdict is sin-datos by construction) but makes the
     * `--base` retraction pass a no-op: its targets are precisely the claims
     * where deterministic said verificado/parcial, so every one returned early
     * and the run reported "re-judged 1017 · kept 1017" having made ZERO LLM
     * calls. Deterministic assertions are the least trustworthy thing we
     * publish — 33% precision on verificado, 22% on parcial against the gold
     * set — so they are exactly what needs re-judging.
     */
    always?: boolean
    /**
     * Called when the engine returns WITHOUT consulting the model — no
     * retrieval candidates, or the claim is one the LLM path skips by policy.
     * Callers need this to report coverage honestly; without it a
     * never-asked claim is indistinguishable from an agreed-with one.
     */
    onSkip?: (claimId: string, reason: 'no-candidates' | 'not-attempted') => void
  } = {},
): VerifierFn {
  const deps: EngineDeps = {
    reasonFn: async (claim, candidates) => {
      const r = await callLLM({
        systemPrompt: buildEngineReasonSystemPrompt(),
        userPrompt: buildEngineReasonUserPrompt(claim, candidates),
        promptVersion: ENGINE_REASON_VERSION,
        schema: EngineReasoningSchema,
        input: { claimId: claim.id },
      })
      return r?.reasoning ?? ''
    },
    extractFn: async (reasoning, claim, candidates) => {
      const r = await callLLM({
        systemPrompt: buildEngineExtractSystemPrompt(),
        userPrompt: buildEngineExtractUserPrompt(reasoning, claim, candidates),
        promptVersion: ENGINE_EXTRACT_VERSION,
        schema: EngineExtractSchema,
        input: { claimId: claim.id, reasoning },
      })
      return r ?? { verdict: 'sin-datos', cites: [] }
    },
    consistencyFn:
      opts.consistency === false
        ? undefined
        : async (claim, candidates) => {
            // PCC: argue-for vs argue-against; high NLI contradiction = ambiguous
            // = low confidence → force sin-datos.
            const [forR, againstR] = await Promise.all([
              callLLM({
                systemPrompt: buildEngineReasonSystemPrompt(),
                userPrompt: buildEngineReasonUserPrompt(claim, candidates),
                promptVersion: ENGINE_REASON_VERSION,
                schema: EngineReasoningSchema,
                input: { claimId: claim.id, role: 'for' },
              }),
              callLLM({
                systemPrompt: buildEngineReasonSystemPrompt(),
                userPrompt: buildEngineArgueAgainstPrompt(claim, candidates),
                promptVersion: ENGINE_ARGUE_VERSION,
                schema: EngineReasoningSchema,
                input: { claimId: claim.id, role: 'against' },
              }),
            ])
            const forText = forR?.reasoning ?? ''
            const againstText = againstR?.reasoning ?? ''
            if (!forText || !againstText) return true // can't check → don't block
            const scores = await scoreNliPairs([
              { id: 'c', premise: forText, hypothesis: againstText },
            ])
            return (scores.get('c')?.contradiction ?? 0) < 0.5
          },
  }
  return async (claim, ctx) => {
    const det = verifyClaim(inputsFor(claim, ctx))
    if (!opts.always && det.verdict !== 'sin-datos') {
      opts.onSkip?.(claim.id, 'not-attempted')
      return det
    }
    const shortlist = await getShortlist(
      inputsFor(claim, ctx),
      8,
      ctx.corpus ? { corpus: ctx.corpus } : {},
    )
    if (shortlist.length === 0) {
      opts.onSkip?.(claim.id, 'no-candidates')
      return det
    }
    const r = await verifyClaimWithEngine({ claim, candidates: shortlist }, deps)
    if (r === null) {
      opts.onSkip?.(claim.id, 'not-attempted')
      return det
    }
    // `upgraded` means "the engine found support where the deterministic pass
    // found none" — the engine's original job. It is FALSE for a sin-datos
    // verdict by definition, so the retraction pass, whose entire purpose is to
    // act on sin-datos, had its one trusted signal (~92% precision on the gold
    // set) discarded here before the caller could ever see it. Every claim came
    // back as the deterministic verdict and was counted "kept": a second run
    // that judged ~90 claims and retracted 0.
    if (opts.always) return r.verification
    return r?.upgraded ? r.verification : det
  }
}

export const engineVerifier: VerifierFn = makeEngineVerifier()

/**
 * Reads the verdict already in a verified snapshot — the shipped baseline,
 * computed with no fresh LLM calls. Factory: the eval CLI passes the snapshot.
 */
export function makeStoredVerifier(snapshot: {
  items: { claim: { id: string }; verification: ClaimVerification }[]
}): VerifierFn {
  const byId = new Map(snapshot.items.map((it) => [it.claim.id, it.verification]))
  return async (claim) =>
    byId.get(claim.id) ?? {
      claimId: claim.id,
      verdict: 'sin-datos',
      summary: '',
      evidence: [],
      checkedAgainst: [],
    }
}

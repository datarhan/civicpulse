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
import type { Corpus } from './semantic-shortlist'

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

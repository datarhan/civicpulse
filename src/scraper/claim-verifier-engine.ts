/**
 * Verdict engine (P3) — reason-then-format over retrieved candidates, with
 * NEI-by-default + cite-grounding + a consistency gate. Re-derives the
 * over-claiming LLM second-pass verdicts with a method designed NOT to
 * over-claim. Local/$0 (qwen via ollama + mDeBERTa). Upgrade-capable but
 * eval-gated; NEVER emits contradicho (that stays deterministic + curator-only).
 *
 * Pure orchestration — the LLM/NLI work is injected (testable). Reuses P1's
 * cite-grounding (parseCite + looselyContains): a cited value must literally
 * appear in the candidate snippet, so evidence can't be fabricated.
 *
 * See docs/superpowers/specs/2026-06-24-factcheck-rebuild-p3-verdict-engine-design.md.
 */
import type { PlenoClaim } from './pleno-claim'
import type {
  CandidateShortlist,
  ClaimEvidence,
  ClaimVerdict,
  ClaimVerification,
} from './claim-verifier'
import { shouldSkipLlmVerification, parseCite, looselyContains } from './claim-verifier-llm'
import { stripSimilarityAnnotation } from '../llm/candidate-annotation'
import { corpusDeEvidencia } from './claim-verdicts'
import { charlaDeTarea } from './charla-de-tarea'

/**
 * El razonamiento habla de la tarea del modelo y no de la declaración: no es
 * un juicio.
 *
 * El 02-08-2026, con claude-code, el campo `reasoning` recogió muchas veces un
 * parte del encargo («Task completed: reasoned in Spanish…», «Análisis
 * completado en el texto de respuesta.»). El paso de extracción decidía el
 * veredicto sobre ese parte, y el parte se publicaba como resumen bajo la cita
 * (src/lib/resumenes-retirados.js). Se lanza como una extracción fallida: el
 * llamante lo cuenta aparte y la afirmación se reintenta en la siguiente
 * pasada.
 */
export class RazonamientoConCharla extends Error {
  readonly claimId: string
  readonly clase: string
  constructor(claimId: string, clase: string) {
    super(`[engine] ${claimId}: el razonamiento habla de la tarea (${clase}), no de la declaración`)
    this.name = 'RazonamientoConCharla'
    this.claimId = claimId
    this.clase = clase
  }
}

export interface EngineCite {
  candidateIndex: number
  /** structured cite: `<dataset>[i].<field>=<value> · …` (P1 grounding contract). */
  snippet: string
}

export interface EngineExtract {
  verdict: 'verificado' | 'parcial' | 'sin-datos'
  cites: EngineCite[]
}

export interface EngineDeps {
  /** Free-text reasoning over the candidates (no schema — avoids the "format tax"). */
  reasonFn: (claim: PlenoClaim, candidates: CandidateShortlist[]) => Promise<string>
  /** Extract a verdict + grounded cites from the reasoning. */
  extractFn: (
    reasoning: string,
    claim: PlenoClaim,
    candidates: CandidateShortlist[],
  ) => Promise<EngineExtract>
  /** PCC consistency gate: false → the model isn't confident → force sin-datos. */
  consistencyFn?: (
    claim: PlenoClaim,
    candidates: CandidateShortlist[],
    draftVerdict: ClaimVerdict,
  ) => Promise<boolean>
}

export interface EngineResult {
  verification: ClaimVerification
  upgraded: boolean
}

const CONF = { verificado: 0.9, parcial: 0.6, 'sin-datos': 0.2 } as const

export async function verifyClaimWithEngine(
  inputs: { claim: PlenoClaim; candidates: CandidateShortlist[] },
  deps: EngineDeps,
): Promise<EngineResult | null> {
  if (shouldSkipLlmVerification(inputs.claim)) return null
  if (inputs.candidates.length === 0) return null

  const reasoning = await deps.reasonFn(inputs.claim, inputs.candidates)
  // Antes de extraer: un parte de la tarea no lleva razonamiento del que sacar
  // un veredicto, y es lo que se guardaría como resumen.
  const charla = charlaDeTarea(reasoning)
  if (charla) throw new RazonamientoConCharla(inputs.claim.id, charla)
  const ext = await deps.extractFn(reasoning, inputs.claim, inputs.candidates)

  // Cite-grounding (reuse P1): index in range + value literally in the snippet.
  let evidence: ClaimEvidence[] = []
  for (const c of ext.cites) {
    if (c.candidateIndex < 0 || c.candidateIndex >= inputs.candidates.length) continue
    const cand = inputs.candidates[c.candidateIndex]
    const cite = parseCite(c.snippet)
    if (!cite) continue
    if (!looselyContains(cand.snippet, cite.value)) continue
    evidence.push({
      kind: cand.kind,
      ref: cand.ref,
      // Same store-boundary strip as claim-verifier-llm: the engine's own
      // candidate block renders `· sim=0.50` too, and the extract step returns
      // the line it read. The similarity survives beside it, as a number in a
      // number field.
      snippet: stripSimilarityAnnotation(c.snippet).slice(0, 240),
      similarity: cand.similarity,
      // The engine is NEI-by-default and never emits `contradicho`, so it has
      // no directional finding to record.
      stance: 'checked',
    })
  }

  // NEI-by-default + never contradicho.
  let verdict: ClaimVerdict =
    ext.verdict === 'verificado' || ext.verdict === 'parcial' || ext.verdict === 'sin-datos'
      ? ext.verdict
      : 'sin-datos'
  if (evidence.length === 0) verdict = 'sin-datos'

  // PCC consistency gate — only for would-be upgrades.
  if ((verdict === 'verificado' || verdict === 'parcial') && deps.consistencyFn) {
    const ok = await deps.consistencyFn(inputs.claim, inputs.candidates, verdict)
    if (!ok) {
      verdict = 'sin-datos'
      evidence = []
    }
  }

  return {
    verification: {
      claimId: inputs.claim.id,
      verdict,
      summary: reasoning.slice(0, 300),
      evidence,
      checkedAgainst: corpusDeEvidencia(evidence),
      derivedBy: ['verdict-engine'],
      confidence: CONF[verdict],
    },
    upgraded: verdict !== 'sin-datos' && evidence.length > 0,
  }
}

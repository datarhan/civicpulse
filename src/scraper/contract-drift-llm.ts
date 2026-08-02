/**
 * Does the published editorial contract still describe the system we run?
 *
 * `/metodologia` and `/aviso-legal` are not marketing copy — CLAUDE.md says so
 * in four places, and they are the pages an affected party reads to understand
 * how a claim about them was produced. They go stale the moment a pipeline
 * changes, and nothing notices: on 2026-08-02 the page still said `contradicho`
 * was a published verdict class (it had become curator-only), still described
 * findings as "curados por una persona" (44 of 52 are machine-written), and
 * still described the engine as re-judging only the LLM's verdicts.
 *
 * This is the residue the deterministic drift check cannot reach: no number is
 * involved, only meaning. Comparing prose against what changed in the code is a
 * genuine language task, so it is the one place here where a model earns its
 * keep.
 *
 * Three properties, all of them consequences of a day spent removing checks that
 * confidently said wrong things:
 *
 *   1. It NEVER edits. Output is a lead for a curator, and the corrections flow
 *      is the only path that mutates published text.
 *   2. Every flag must quote the page sentence VERBATIM and name the commit it
 *      believes contradicts it. An unquotable flag is dropped, so a false
 *      positive is visible as one at a glance instead of being argued with.
 *   3. Silence is the default. Asked to find problems, a model will find some;
 *      the prompt says an empty list is the expected answer.
 *
 * Pure orchestration — the model call is injected, so this is testable without
 * a backend.
 */

export interface ContractDriftInput {
  /** Page identifier, e.g. `/metodologia`. */
  page: string
  /** Visible prose of the page, tags stripped. */
  prose: string
  /** Recent commits touching the pipelines the page describes. */
  changes: Array<{ sha: string; subject: string; body?: string }>
}

export interface DriftFlag {
  /** Verbatim sentence from the page. Must appear in `prose` or it is dropped. */
  sentence: string
  /** Short sha of the change that contradicts it. */
  sha: string
  /** Why, in one sentence. */
  why: string
}

export type DriftCaller = (input: ContractDriftInput) => Promise<DriftFlag[] | null>

/** Loose match so trivial whitespace/quote differences do not drop a real flag. */
function normalise(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Keep only flags whose sentence actually appears on the page and whose sha is
 * one we supplied. Both are cheap and both catch the failure mode that matters:
 * a model paraphrasing the page and then objecting to its own paraphrase.
 */
export function groundFlags(flags: DriftFlag[], input: ContractDriftInput): DriftFlag[] {
  const hay = normalise(input.prose)
  const shas = new Set(input.changes.map((c) => c.sha.slice(0, 7)))
  return flags.filter((f) => {
    if (!f?.sentence || !f?.sha) return false
    const needle = normalise(f.sentence)
    if (needle.length < 25) return false // too short to be a real claim
    if (!hay.includes(needle)) return false // paraphrased, not quoted
    return shas.has(f.sha.slice(0, 7))
  })
}

export async function findContractDrift(
  input: ContractDriftInput,
  call: DriftCaller,
): Promise<DriftFlag[]> {
  if (!input.prose.trim() || input.changes.length === 0) return []
  const raw = await call(input)
  if (!raw) return []
  return groundFlags(raw, input)
}

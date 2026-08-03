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
export interface DroppedFlag {
  flag: DriftFlag
  /** Which gate rejected it — a bare count says something is hidden without
   * letting anyone judge whether it mattered. */
  reason: 'no-sentence' | 'too-short' | 'not-on-page' | 'unknown-sha'
}

export function partitionFlags(
  flags: DriftFlag[],
  input: ContractDriftInput,
): { kept: DriftFlag[]; dropped: DroppedFlag[] } {
  const hay = normalise(input.prose)
  const shas = new Set(input.changes.map((c) => c.sha.slice(0, 7)))
  const kept: DriftFlag[] = []
  const dropped: DroppedFlag[] = []
  for (const f of flags ?? []) {
    if (!f?.sentence || !f?.sha) {
      dropped.push({ flag: f, reason: 'no-sentence' })
      continue
    }
    const needle = normalise(f.sentence)
    if (needle.length < 25) dropped.push({ flag: f, reason: 'too-short' })
    else if (!hay.includes(needle)) dropped.push({ flag: f, reason: 'not-on-page' })
    else if (!shas.has(f.sha.slice(0, 7))) dropped.push({ flag: f, reason: 'unknown-sha' })
    else kept.push(f)
  }
  return { kept, dropped }
}

export function groundFlags(flags: DriftFlag[], input: ContractDriftInput): DriftFlag[] {
  return partitionFlags(flags, input).kept
}

export async function findContractDrift(
  input: ContractDriftInput,
  call: DriftCaller,
): Promise<DriftFlag[]> {
  return (await findContractDriftDetailed(input, call)).flags
}

export interface DriftResult {
  flags: DriftFlag[]
  dropped: DroppedFlag[]
  /**
   * Did the model actually answer?
   *
   * `false` means nobody looked — no backend, a timeout, an empty page, no
   * commits. It is NOT the same as "found nothing", and collapsing the two is
   * how a check reports health it never measured. Caught live: on the first
   * real run both backends were exhausted and this printed «el contrato sigue
   * al día» for both pages.
   */
  consulted: boolean
  /** Why not, when `consulted` is false. */
  reason?: 'empty-page' | 'no-changes' | 'no-answer'
}

/**
 * Kept, dropped, and whether anyone was asked.
 *
 * The filter exists to discard a model that paraphrases the page and then
 * objects to its own paraphrase, so a discarded flag is the RIGHT outcome —
 * but printing only the survivors makes "the contract is current" and "I threw
 * three away" the same line.
 */
export async function findContractDriftDetailed(
  input: ContractDriftInput,
  call: DriftCaller,
): Promise<DriftResult> {
  if (!input.prose.trim()) {
    return { flags: [], dropped: [], consulted: false, reason: 'empty-page' }
  }
  if (input.changes.length === 0) {
    return { flags: [], dropped: [], consulted: false, reason: 'no-changes' }
  }
  const raw = await call(input)
  if (!raw) return { flags: [], dropped: [], consulted: false, reason: 'no-answer' }
  const { kept, dropped } = partitionFlags(raw, input)
  return { flags: kept, dropped, consulted: true }
}

/**
 * Would a reasonable reader conclude something from this page that the data
 * does not support?
 *
 * This is the one class of defect no deterministic check reached. The five
 * cross-checks answer "is the data right?"; none answers "does the page say
 * something true?". Those diverge constantly, and today every instance was
 * found by a person reading a rendered page rather than inspecting a snapshot:
 *
 *   · «Presup. 2025 €41,6M» beside «Contratos adj. €68,0M» — one annual, one a
 *     decade cumulative, so the pair invited the reader to conclude the town
 *     awards more than its whole budget.
 *   · «0 votaciones» on 54 sessions nobody had transcribed — asserting a pleno
 *     held no votes.
 *   · «El grupo Otro afirma…» beside a seat map showing Otro holds one seat,
 *     naming that councillor by elimination.
 *   · «hallazgos verificados manualmente» where 44 of 52 are machine-written.
 *   · «Sin lagunas detectadas» after examining zero candidates.
 *
 * Not one is a data error. Every snapshot behind them was correct. The defect
 * lives in the gap between a true number and the sentence wrapped around it,
 * and that gap is a language problem — which is the whole reason a model is the
 * right tool here, and the only place in this codebase where I would say so.
 *
 * Pure orchestration: the render and the model call are both injected.
 */

export interface SurfaceInput {
  /** Route under review, e.g. `/`. */
  route: string
  /** Visible text as a browser rendered it — NOT the JSX source. */
  renderedText: string
  /** Compact facts from the snapshots this route reads, for the model to check against. */
  facts: Record<string, unknown>
}

export interface ReaderFinding {
  /** Verbatim span from `renderedText`. Dropped if it is not literally present. */
  quote: string
  /** What a reader would wrongly conclude. */
  inference: string
  /** The fact that contradicts it, drawn from `facts`. */
  contradictedBy: string
  severity: 'misleading' | 'unclear'
}

export type ReaderCaller = (input: SurfaceInput) => Promise<ReaderFinding[] | null>

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
 * Keep only findings that quote the page literally.
 *
 * The failure mode this exists for is specific and was observed today in a
 * different check: a model restates the page in its own words and then objects
 * to its own restatement. That produces confident, unfalsifiable complaints. If
 * the sentence is not on the page, there is nothing to fix — and requiring the
 * quote makes a false positive visible in one glance instead of arguable.
 */
export function partitionFindings(
  findings: ReaderFinding[],
  input: SurfaceInput,
): { kept: ReaderFinding[]; dropped: ReaderFinding[] } {
  const hay = normalise(input.renderedText)
  const kept: ReaderFinding[] = []
  const dropped: ReaderFinding[] = []
  for (const f of findings ?? []) {
    if (!f?.quote || !f?.inference || !f?.contradictedBy) {
      dropped.push(f)
      continue
    }
    const q = normalise(f.quote)
    // Long enough to identify a real claim; short enough that a model quoting a
    // whole section does not sneak past by including one true sentence.
    if (q.length < 12 || q.length > 400 || !hay.includes(q)) dropped.push(f)
    else kept.push(f)
  }
  return { kept, dropped }
}

export function groundFindings(findings: ReaderFinding[], input: SurfaceInput): ReaderFinding[] {
  return partitionFindings(findings, input).kept
}

/**
 * How many findings the grounding gate discarded.
 *
 * Reported, not just counted. `review-surfaces` used to print the number of
 * SURVIVORS and, at zero, "nada que señalar" — so "the page is clean" and "the
 * model produced three findings and I threw them all away" printed the same
 * line. That is the shape of every silent-failure incident in this repo: the
 * check's silence gets read as approval.
 *
 * A high drop count is not necessarily a bug — the gate exists to discard
 * findings that do not quote the page, and a model that paraphrases SHOULD be
 * discarded. It is a signal to look, not a defect.
 */
export async function reviewSurface(
  input: SurfaceInput,
  call: ReaderCaller,
): Promise<ReaderFinding[]> {
  return (await reviewSurfaceDetailed(input, call)).findings
}

export async function reviewSurfaceDetailed(
  input: SurfaceInput,
  call: ReaderCaller,
): Promise<{ findings: ReaderFinding[]; dropped: ReaderFinding[] }> {
  if (!input.renderedText.trim()) return { findings: [], dropped: [] }
  const raw = await call(input)
  if (!raw) return { findings: [], dropped: [] }
  const { kept, dropped } = partitionFindings(raw, input)
  // The dropped ones travel with the result, not just their count. On the first
  // run that reported them, four of six routes had printed "nada que señalar"
  // while holding five discarded findings between them; a bare number tells you
  // something is hidden without letting you judge whether it mattered.
  return { findings: kept, dropped }
}

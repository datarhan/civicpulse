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
export function groundFindings(findings: ReaderFinding[], input: SurfaceInput): ReaderFinding[] {
  const hay = normalise(input.renderedText)
  return (findings ?? []).filter((f) => {
    if (!f?.quote || !f?.inference || !f?.contradictedBy) return false
    const q = normalise(f.quote)
    // Long enough to identify a real claim; short enough that a model quoting a
    // whole section does not sneak past by including one true sentence.
    if (q.length < 12 || q.length > 400) return false
    return hay.includes(q)
  })
}

export async function reviewSurface(
  input: SurfaceInput,
  call: ReaderCaller,
): Promise<ReaderFinding[]> {
  if (!input.renderedText.trim()) return []
  const raw = await call(input)
  if (!raw) return []
  return groundFindings(raw, input)
}

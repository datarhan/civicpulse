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

/**
 * Characters of rendered text handed to the model in one call.
 *
 * Not a page limit — a CALL limit. The caller splits and reviews every fragment;
 * see `chunkRenderedText`.
 */
export const REVIEW_CHUNK_CHARS = 12_000

/**
 * What `review-surfaces` remembers about a route between runs.
 *
 * The findings travel WITH the hash. Storing the hash alone retired a route
 * after any complete pass, including one that had just flagged two misleading
 * juxtapositions — the next run printed «sin cambios, se omite» and summarised
 * «0 señalamiento(s)» about live, unfixed flags.
 */
export interface ReviewCacheEntry {
  hash: string
  findings: ReaderFinding[]
  /** ISO timestamp of the last real review. Drives oldest-first ordering. */
  at?: string
}

/**
 * Read either cache shape; callers write the new one.
 *
 * Earlier caches held a bare hash string. Returning `null` for those would be
 * safe (a missed cache means MORE review, never less) but would silently throw
 * away every remembered finding on upgrade, so they are read as an entry with
 * no findings — which is exactly what they recorded.
 */
export function readCacheEntry(v: string | ReviewCacheEntry | undefined): ReviewCacheEntry | null {
  if (typeof v === 'string') return { hash: v, findings: [] }
  if (v && typeof v.hash === 'string') return { hash: v.hash, findings: v.findings ?? [], at: v.at }
  return null
}

/**
 * `--budget-seconds N`, `--budget-seconds=N`, or `REVIEW_BUDGET_SECONDS`.
 *
 * Written as a real parser rather than the old `filter(a => !a.startsWith('--'))`,
 * which keeps a flag's VALUE and would have sent the tool off to review a route
 * named `60`. A non-positive or unparseable budget means NO budget: this file's
 * whole subject is checks that quietly do less than they claim, and a typo that
 * silently shrinks coverage to nothing would be one more.
 */
export function parseReviewArgs(argv: string[], budgetEnv?: string) {
  const routes: string[] = []
  let budgetSeconds = Number(budgetEnv ?? 0)
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--budget-seconds') {
      budgetSeconds = Number(argv[i + 1])
      i += 1
    } else if (a.startsWith('--budget-seconds=')) {
      budgetSeconds = Number(a.slice('--budget-seconds='.length))
    } else if (!a.startsWith('--')) {
      routes.push(a)
    }
  }
  if (!Number.isFinite(budgetSeconds) || budgetSeconds <= 0) budgetSeconds = 0
  return {
    routes,
    budgetSeconds,
    json: argv.includes('--json'),
    force: argv.includes('--force'),
    // Ordena por «hace más que no se lee» antes de gastar el presupuesto. Sólo
    // significa algo junto a `--budget-seconds`: sin techo se leen todas.
    rotate: argv.includes('--rotate'),
  }
}

/**
 * Split a rendered page into review-sized fragments, LOSING NOTHING.
 *
 * This function exists because of a silent-truncation bug that is the exact
 * shape of every incident in docs/DATA_INTEGRITY.md. `review-surfaces` sliced
 * the rendered text to the first 12.000 characters and reviewed that, with no
 * mention anywhere that it had done so. On /metodologia — 34.909 characters, the
 * published editorial contract — that is 34% of the page, and the three edits
 * that shipped on the branch that found this all sat past the cut. Worse, the
 * change-detection hash was computed over the same truncated prefix, so an edit
 * beyond it could not even mark the route as changed: the tool reported "sin
 * cambios" about prose it had never read, then "nada que señalar" when forced.
 *
 * Two thirds of the page had never been reviewed by the check built to review it.
 *
 * So: no default truncation anywhere. A page too big for one call is reviewed in
 * several, and the caller reports how much of it was actually reviewed.
 *
 * Splits on line boundaries (`innerText` is newline-separated blocks) so a
 * fragment does not cut a sentence in half — a model cannot judge the meaning of
 * half a claim, and the grounding filter would drop any quote spanning the seam.
 * A single line longer than `size` is hard-split rather than dropped: losing
 * text is the one thing this must never do.
 */
export function chunkRenderedText(text: string, size = REVIEW_CHUNK_CHARS): string[] {
  if (!text.trim()) return []
  if (text.length <= size) return [text]
  const chunks: string[] = []
  let current: string[] = []
  let length = 0
  const flush = () => {
    if (current.length) chunks.push(current.join('\n'))
    current = []
    length = 0
  }
  for (const line of text.split('\n')) {
    if (line.length > size) {
      flush()
      for (let i = 0; i < line.length; i += size) chunks.push(line.slice(i, i + size))
      continue
    }
    // +1 for the newline this line will be rejoined with.
    if (length && length + line.length + 1 > size) flush()
    current.push(line)
    length += line.length + 1
  }
  flush()
  return chunks.filter((c) => c.trim())
}

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

export interface SurfaceResult {
  findings: ReaderFinding[]
  dropped: ReaderFinding[]
  /**
   * Did the model actually answer?
   *
   * `false` means nobody looked — an empty render, or every backend exhausted.
   * That is NOT "the page is clean", and `review:surfaces` printed exactly that
   * for both pages the first time a sibling check hit an exhausted backend.
   * A check that reports health it never measured is the failure this repo has
   * had four recorded instances of.
   */
  consulted: boolean
  reason?: 'empty-page' | 'no-answer'
}

export async function reviewSurfaceDetailed(
  input: SurfaceInput,
  call: ReaderCaller,
): Promise<SurfaceResult> {
  if (!input.renderedText.trim()) {
    return { findings: [], dropped: [], consulted: false, reason: 'empty-page' }
  }
  const raw = await call(input)
  if (!raw) return { findings: [], dropped: [], consulted: false, reason: 'no-answer' }
  const { kept, dropped } = partitionFindings(raw, input)
  // The dropped ones travel with the result, not just their count. On the first
  // run that reported them, four of six routes had printed "nada que señalar"
  // while holding five discarded findings between them; a bare number tells you
  // something is hidden without letting you judge whether it mattered.
  return { findings: kept, dropped, consulted: true }
}

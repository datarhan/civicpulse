/**
 * Suite-wide network guard.
 *
 * `npm test` used to make a real outbound request on every run: one test set
 * `EXA_API_KEY='sk-fake'` and let the dispatcher call `https://api.exa.ai/search`,
 * which answered 401. Nothing failed, because the assertion was a broad
 * alternation (`/Exa|fetch|ENOTFOUND|ECONN|undici|HTTP/i`) that matched the live
 * 401 and an offline DNS failure identically. A suite that cannot tell "I was
 * online" from "I was offline" is not measuring anything.
 *
 * So the rule is enforced here rather than patched there: any `fetch` to a
 * non-local host fails, loudly, naming the URL and the test.
 *
 * ── Two layers, because one is not enough ──────────────────────────────────
 *
 * The guard both REJECTS and RECORDS, and the second layer is not decoration.
 * Measured by ablation: with the recording removed, the original defective test
 * passed again even with the guard installed — `webSearchExa` wraps its fetch in
 * `try/catch` and turns any error into `{ results: [], error }`, and the old
 * assertion `/Exa|fetch|…/i` happily matched the guard's own message, which
 * contains the word "fetch". Rejections can be swallowed; the violation log
 * asserted in `afterEach`/`afterAll` cannot.
 *
 * ── What is allowed ────────────────────────────────────────────────────────
 *
 *   • localhost / 127.0.0.1 / ::1 / 0.0.0.0 — the local fixture servers and the
 *     live SearXNG smoke test all speak to the machine they run on.
 *   • Relative URLs — happy-dom resolves them against its own localhost origin.
 *   • Non-network schemes (data:, blob:, file:) — nothing leaves the process.
 *   • A test declared with `liveNetworkTest()`, for the duration of its body.
 *   • Anything a test stubs itself: assigning `globalThis.fetch` replaces the
 *     guard, which is correct — a stub is not a network call. The guard is
 *     reinstalled before the next test, so one file's stub cannot silently
 *     disarm the rest of the run.
 */
import { afterAll, afterEach, beforeEach, expect, it } from 'vitest'

/** Hosts that never leave the machine. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0', ''])

/** Schemes that carry no network traffic at all. */
const OFFLINE_PROTOCOLS = new Set(['data:', 'blob:', 'file:'])

/** The pre-guard `fetch`, captured before we shadow it. */
const realFetch: typeof globalThis.fetch = globalThis.fetch?.bind(globalThis)

export interface NetworkViolation {
  url: string
  method: string
  test: string
}

let networkAllowed = false
let violations: NetworkViolation[] = []

/** Absolute form of whatever `fetch` was handed, for classification. */
function resolveUrl(input: RequestInfo | URL): string {
  const raw =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : ((input as Request)?.url ?? String(input))
  const base =
    (globalThis as { location?: { href?: string } }).location?.href ?? 'http://localhost/'
  try {
    return new URL(raw, base).href
  } catch {
    return raw
  }
}

/**
 * The guard's decision, exported so a test can assert against the real
 * predicate instead of restating it. `true` means "this call would be blocked
 * right now" — it depends on the live opt-in state, not just the URL.
 */
export function wouldBlock(input: RequestInfo | URL): boolean {
  if (networkAllowed) return false
  let parsed: URL
  try {
    parsed = new URL(resolveUrl(input))
  } catch {
    // Unparseable: treat as local rather than inventing a failure.
    return false
  }
  if (OFFLINE_PROTOCOLS.has(parsed.protocol)) return false
  return !LOCAL_HOSTS.has(parsed.hostname)
}

function currentTestName(): string {
  const state = expect.getState()
  return state.currentTestName ?? '<outside a test — beforeAll/afterAll or module scope>'
}

function currentTestFile(): string {
  return expect.getState().testPath ?? '<unknown file>'
}

class BlockedNetworkCallError extends Error {
  constructor(url: string, method: string, test: string, file: string) {
    super(
      [
        `Blocked outbound fetch in a unit test: ${method} ${url}`,
        `  test: ${test}`,
        `  file: ${file}`,
        '',
        'The vitest suite must be network-silent: real requests make it slow, flaky,',
        'dependent on whoever is running it, and they announce this project to a third',
        'party on every developer machine. Pick one:',
        '',
        '  • Stub it — `installFetchMock({...})` from tests/setup/mockFetch, or',
        "    `vi.stubGlobal('fetch', fn)` / `globalThis.fetch = fn`.",
        '  • Or, if the test genuinely needs the live service, declare it with',
        '    `liveNetworkTest({ enabledBy: "RUN_E2E_<X>", requires: ["<ENV>"] }, name, body)`',
        '    from tests/setup/no-network — it skips unless the flag is set, and the',
        '    guard is lifted only while its body runs.',
        '',
        'Allowed without a flag: localhost, 127.0.0.1, ::1, 0.0.0.0, relative URLs,',
        'and data:/blob:/file: URLs.',
      ].join('\n'),
    )
    this.name = 'BlockedNetworkCallError'
  }
}

function guardedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!wouldBlock(input)) return realFetch(input as RequestInfo, init)
  const url = resolveUrl(input)
  const method = (
    init?.method ??
    (typeof input === 'object' && input !== null && 'method' in input
      ? (input as Request).method
      : 'GET')
  ).toUpperCase()
  violations.push({ url, method, test: currentTestName() })
  // Reject rather than throw synchronously: `fetch` is specified to always
  // return a Promise, and a sync throw would send a caller that uses
  // `.catch()` down a different path than the one it takes in production.
  return Promise.reject(
    new BlockedNetworkCallError(url, method, currentTestName(), currentTestFile()),
  )
}

/**
 * Violations recorded so far, cleared by the read.
 *
 * A test that means to trip the guard calls this to consume the evidence —
 * asserting on it is what stops `afterEach` from failing the test, so the proof
 * and the acquittal are the same act.
 */
export function takeNetworkViolations(): NetworkViolation[] {
  const taken = violations
  violations = []
  return taken
}

/** Is the network currently permitted? Exported for the guard's own tests. */
export function networkAllowedNow(): boolean {
  return networkAllowed
}

function assertNoViolations(scope: string): void {
  if (violations.length === 0) return
  const found = takeNetworkViolations()
  const lines = found.map((v) => `  ${v.method} ${v.url}   (${v.test})`)
  throw new Error(
    [
      `${found.length} outbound network call(s) escaped during ${scope}:`,
      ...lines,
      '',
      'The guard threw on each, but the call site swallowed the error — which is',
      'exactly how the api.exa.ai 401 stayed invisible. Stub the fetch, or declare',
      'the test with liveNetworkTest(). See tests/setup/no-network.ts.',
    ].join('\n'),
  )
}

beforeEach(() => {
  // Reinstall the baseline: whatever the previous test assigned is discarded,
  // so a stub cannot leak into the next test as a disarmed guard.
  networkAllowed = false
  violations = []
  globalThis.fetch = guardedFetch as typeof globalThis.fetch
})

afterEach(() => {
  assertNoViolations(`test "${currentTestName()}"`)
})

afterAll(() => {
  // Catches calls made from beforeAll/afterAll or module scope, where there is
  // no per-test hook to fail.
  assertNoViolations('a hook or module scope in this file')
})

// Install immediately as well as per-test: module scope and `beforeAll` both
// run before the first `beforeEach`.
globalThis.fetch = guardedFetch as typeof globalThis.fetch

export interface LiveNetworkGate {
  /** Env var that must equal '1' for the test to run at all. */
  enabledBy: string
  /** Additional env vars that must be non-empty (a URL, a key). */
  requires?: string[]
}

/**
 * Declare a test that genuinely needs the open network.
 *
 * Composes with the flag the repo already uses rather than adding a second
 * concept: the pre-existing SearXNG smoke test gated itself on
 * `RUN_E2E_SEARXNG === '1' && SEARXNG_URL`, and that same declaration is now
 * also what lifts the guard. Gate and permission are deliberately one
 * statement — you cannot obtain network access without also obtaining the skip,
 * so an unflagged CI run can neither run the test nor reach the network.
 *
 * The lift is scoped to the body and released in `finally`.
 */
export function liveNetworkTest(
  gate: LiveNetworkGate,
  name: string,
  body: () => Promise<void> | void,
  timeout?: number,
): void {
  const enabled =
    process.env[gate.enabledBy] === '1' &&
    (gate.requires ?? []).every((k) => Boolean(process.env[k]?.trim()))
  const runner = enabled ? it : it.skip
  runner(
    name,
    async () => {
      networkAllowed = true
      try {
        await body()
      } finally {
        networkAllowed = false
      }
    },
    timeout,
  )
}

// ─── Wiring handle ─────────────────────────────────────────────────────────

/**
 * The same API, reachable without an `import`.
 *
 * This exists for one reason. `tests/network-guard.test.ts` originally imported
 * this module, and importing it *is* installing it — the hooks below register
 * on load. So the proof test passed with `setupFiles` ablated, proving the
 * guard's logic while proving nothing about whether the suite actually runs it.
 * That is the "green while measuring nothing" failure this repo has shipped
 * twice. Reading the guard off `globalThis` instead means the proof test can
 * only see a guard that `setupFiles` put there.
 */
export interface NetworkGuardHandle {
  wouldBlock: typeof wouldBlock
  takeNetworkViolations: typeof takeNetworkViolations
  networkAllowedNow: typeof networkAllowedNow
  liveNetworkTest: typeof liveNetworkTest
}

declare global {
  var __cpNetworkGuard: NetworkGuardHandle | undefined
}

globalThis.__cpNetworkGuard = {
  wouldBlock,
  takeNetworkViolations,
  networkAllowedNow,
  liveNetworkTest,
}

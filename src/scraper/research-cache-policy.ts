/**
 * "May this research-cache entry be written, and may it still be believed?" —
 * one decision, shared by the cache layer and the inspection CLI.
 *
 * `.research-cache/` wraps every outbound call the journalist agent makes
 * (Wikidata, Wikipedia, SearXNG/Exa, BOE, DOGV, Dialnet, the hemeroteca, raw
 * URL + PDF fetches). It exists for politeness: iterating on the agent must not
 * re-hit a public-sector source for an answer we already have.
 *
 * Until this module it had no TTL and no notion of failure. `fetchedAt` was
 * written into every entry and never read, so the FIRST answer was the ONLY
 * answer, forever:
 *
 *   · On 31 Jul / 1 Aug 2026 the 21-councillor biography batch stored 21 empty
 *     search result sets — «"<Surname>" universidad OR licenciado OR estudios»
 *     and the social-media probes for Robert Raga. Every one of those searches
 *     was frozen as "nothing found". The biographies' `gaps-detected` sections
 *     went on asserting we had looked and found nothing about those people,
 *     indefinitely, with a confident face, and the daily 09:30 cron could never
 *     revisit it because the cache always answered first.
 *   · The same mechanism pins a failure. One entry on disk carries
 *     `error: 'host ribarroja.es not in HEADLESS_FETCH_ALLOW'`; a `401` from an
 *     expired `EXA_API_KEY` would have been stored identically and would have
 *     silenced open-web research until somebody `rm -rf`'d the directory by
 *     hand.
 *
 * Three rules, in the order they fire:
 *
 *   1. A FAILURE IS NOT A RESULT. A payload carrying a truthy `error` is never
 *      persisted. It is still returned to the caller — the caller asked for a
 *      fetch and is entitled to know it failed — but it does not become the
 *      stored answer, and any previously stored good answer survives untouched.
 *   2. AN ANSWER EXPIRES. `fetchedAt` is finally read. Past its TTL the entry
 *      is a miss and the tool re-fetches.
 *   3. AN EMPTY ANSWER EXPIRES SOONER. "I found nothing" is weak evidence about
 *      the world; "here are six rows" is strong evidence. They are not the same
 *      fact and they must not have the same shelf life. This is the local form
 *      of the lesson in `tests/setup/no-network.ts` and in check:contract-drift:
 *      a null or empty result from a call that may simply have failed is not
 *      the same fact as "there is nothing there".
 *
 * Pure by design, exactly like `decideSnapshotWrite` in ./snapshot-write.ts:
 * the payload and the clock are passed in rather than read here, so every
 * branch is unit-testable without touching the filesystem or `Date.now()`.
 */

// ─── What counts as an answer ──────────────────────────────────────────────

/**
 * The three states an entry can be in. Kept separate from `shape` because the
 * TTL depends on this and the *reason* depends on that.
 */
export type PayloadClass = 'error' | 'empty' | 'populated'

/**
 * The payload shapes the twelve `cached()` call sites actually return. Recorded
 * so a log line or the CLI can say WHY something was called empty — "an empty
 * search" and "a fetch that produced no body" are both `empty`, but they are
 * not the same claim (see `classifyPayload`).
 */
export type PayloadShape =
  | 'null' // wikidata / wikipedia / resolveBioDocumentUrl miss
  | 'array' // the four gazette tools
  | 'search' // webSearch  → { query, results[] }
  | 'urlfetch' // fetchUrl / fetchPdfUrl / fetchUrlHeadless → UrlFetchResult
  | 'text' // resolveBioDocumentUrl → a resolved URL string
  | 'record' // any other structured object (a Wikidata item, a Wikipedia summary)

export interface PayloadClassification {
  klass: PayloadClass
  shape: PayloadShape
  /** Human-readable justification, logged verbatim. */
  detail: string
}

/**
 * Is this a plain object (not null, not an array)?
 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Classify a payload.
 *
 * ── Where "empty" means what you'd expect ────────────────────────────────
 *
 * `search` (`{ results: [] }`) and `array` (the gazette tools) are both
 * *queries against an index*. Empty means "this index has no rows for that
 * query" — a claim about the world, and a weak one, because indexes lag,
 * rate-limit, and quietly serve a blocked response as a well-formed page with
 * nothing in it. That is the claim that must not outlive its moment: it is the
 * one that reaches a reader as «no encontramos nada sobre su formación».
 *
 * ── Where "empty" means something DIFFERENT, and is still short-lived ─────
 *
 * `urlfetch` is not a query, it is a retrieval, so there is no such thing as
 * "the document is empty". A `UrlFetchResult` with no `bodyExcerpt` means the
 * retrieval produced no evidence: a 404, a timeout, a WAF challenge served as
 * `text/html`, a `contentType` the fetcher declines to read, or a PDF whose
 * text layer would not parse. None of those are facts about the document; all
 * of them are facts about one attempt. They get the short TTL for the opposite
 * reason to a search — not because the answer is weak evidence, but because it
 * is not an answer at all. The classification is deliberately keyed on
 * `ok && bodyExcerpt`, i.e. "did we come back holding the document", rather
 * than on `status`, so a 200 that carried a WAF interstitial is not mistaken
 * for a successful read. (This repo has already met that one: ribarroja.es's
 * WAF rejects a bare CivicPulse User-Agent.)
 *
 * ── Where the concept does NOT apply ─────────────────────────────────────
 *
 * `record` — a Wikidata item, a Wikipedia summary — has no collection to be
 * empty of. Either the entity exists, in which case we hold it and it is
 * `populated`, or it does not, in which case the tool already returned `null`
 * and we are in the `null` branch. A Wikipedia summary with no `extract` is not
 * "empty": the page exists, we resolved it, and that is a real answer. So a
 * non-null structured object is always `populated`, and no `results.length`
 * style test is applied to a shape that has no results.
 *
 * `null` is its own case and the most ambiguous one on disk. `fetchWikidata`
 * returns `null` both for "no such QID" and for "the API answered 500", and
 * nothing in the payload distinguishes them. Since we cannot tell a real
 * absence from a failure we may not withhold it (that would mean never caching
 * a legitimate "no such item"), so it is classed `empty` and lives on the short
 * clock, which is the honest treatment of a value that means two things.
 */
export function classifyPayload(payload: unknown): PayloadClassification {
  // Rule 1 first, and unconditionally: a truthy `error` disqualifies the
  // payload no matter what else it carries. None of these tools currently
  // return rows AND an error together, but if one starts to, "it failed" is
  // the fact that must win — a partial answer stored as if it were whole is
  // how a 401 becomes a permanent silence.
  if (isRecord(payload) && payload.error) {
    return {
      klass: 'error',
      shape:
        'bodyExcerpt' in payload
          ? 'urlfetch'
          : Array.isArray(payload.results)
            ? 'search'
            : 'record',
      detail: `payload carries error: ${String(payload.error).slice(0, 200)}`,
    }
  }

  if (payload === null || payload === undefined) {
    return {
      klass: 'empty',
      shape: 'null',
      detail: 'null result — the tool cannot distinguish "no such entity" from "the call failed"',
    }
  }

  if (Array.isArray(payload)) {
    return payload.length === 0
      ? { klass: 'empty', shape: 'array', detail: 'index query returned 0 rows' }
      : {
          klass: 'populated',
          shape: 'array',
          detail: `index query returned ${payload.length} row(s)`,
        }
  }

  if (typeof payload === 'string') {
    return payload.trim() === ''
      ? { klass: 'empty', shape: 'text', detail: 'empty string' }
      : { klass: 'populated', shape: 'text', detail: `resolved string, ${payload.length} char(s)` }
  }

  if (isRecord(payload)) {
    if (Array.isArray(payload.results)) {
      return payload.results.length === 0
        ? { klass: 'empty', shape: 'search', detail: 'search returned 0 results' }
        : {
            klass: 'populated',
            shape: 'search',
            detail: `search returned ${payload.results.length} result(s)`,
          }
    }
    if ('bodyExcerpt' in payload) {
      const body = payload.bodyExcerpt
      const gotDocument = payload.ok === true && typeof body === 'string' && body.trim() !== ''
      return gotDocument
        ? {
            klass: 'populated',
            shape: 'urlfetch',
            detail: `retrieved ${(body as string).length} char(s) of body`,
          }
        : {
            klass: 'empty',
            shape: 'urlfetch',
            detail: `retrieval produced no body (ok=${String(payload.ok)}, status=${String(payload.status)})`,
          }
    }
    return {
      klass: 'populated',
      shape: 'record',
      detail: 'structured record — "empty" does not apply to this shape',
    }
  }

  // Numbers, booleans: no tool returns one, but a scalar that arrived is an
  // answer, not an absence.
  return { klass: 'populated', shape: 'record', detail: `scalar ${typeof payload}` }
}

// ─── How long an answer is believed ────────────────────────────────────────

export interface ToolTtl {
  /** Hours a populated answer stays believable. */
  populated: number
  /** Hours an empty answer stays believable. Always < `populated`. */
  empty: number
}

/**
 * Retry-on-the-next-nightly. Deliberately 18h rather than 24h: the consumer is
 * the 09:30 `hallazgos-pipeline` cron, whose runs are ~24h ± minutes apart, so
 * a 24h TTL is a coin flip at the boundary. 18h is unambiguously shorter than a
 * nightly interval and unambiguously longer than a working day, which means a
 * developer iterating on a scraper from morning to evening pays exactly one
 * fetch, not several.
 */
const NEXT_NIGHTLY = 18
const THREE_DAYS = 72
const ONE_WEEK = 168
const ONE_MONTH = 720

/**
 * TTLs per call site, in hours. One global number would be wrong in both
 * directions at once: Wikidata for a sitting councillor changes on the scale of
 * months, and a web-search index changes hourly.
 *
 * The politeness trade-off, stated plainly: shortening a TTL means more
 * requests to somebody else's server. Every source here is public-sector or
 * open-licensed, but "we are allowed to" is not "we should". So the rule is
 * that the TTL tracks how fast the ANSWER can change, and the floor is set by
 * how often the answer being wrong hurts somebody:
 *
 *   · `wikidata` / `wikipedia` — 30 days. A local councillor's Wikidata item and
 *     Wikipedia article are near-static; re-asking daily would be pure noise on
 *     a donated service. Their empty is a `null`, which conflates "no item"
 *     with "the API 500'd", so 3 days rather than 30.
 *   · `webSearch` — 3 days populated, 12 HOURS empty. This is the one that
 *     caused the damage. An empty search is both the most volatile answer here
 *     and the one that reaches a reader as a published "we found nothing", so
 *     it gets the shortest clock in the table: the very next nightly run
 *     retries it, and the 21 frozen empties of 31 Jul could not have survived a
 *     single night. 3 days for a populated set still keeps a full curation
 *     cycle on one biography off the backend. SearXNG is self-hosted, so the
 *     marginal cost of a retry is a request to a metasearch instance we run.
 *   · `fetchBoeForSubject` / `fetchDogvForSubject` — 7 days / next nightly. A
 *     gazette is append-only: a hit found today is still true next week. An
 *     empty is "no entry yet", which tomorrow's issue can falsify — but BOE and
 *     DOGV are public infrastructure serving one query per subject per night,
 *     which is a polite rate, not a hot loop.
 *   · `fetchDialnet` — 30 days / 7 days. Academic bibliography moves at
 *     publication speed, and dialnet.unirioja.es is a single university's
 *     service. A weekly retry on an empty is the polite floor here; nightly
 *     would be asking a small host to answer the same question 365 times a year
 *     to learn nothing.
 *   · `fetchHemerotecaQuery` — 30 days / 3 days. A historical query for a fixed
 *     year is immutable by construction, hence 30 days. But the tool's own
 *     docstring says La Vanguardia's anti-scrape layer blocks many requests and
 *     it degrades to `[]`, so an empty here is more likely a block than an
 *     absence — and hammering an endpoint that is blocking us is precisely the
 *     impolite direction. 3 days, not 12 hours.
 *   · `fetchUrl` / `fetchUrlHeadless` / `resolveBioDocumentUrl` — 7 days / next
 *     nightly. A page body backing a citation excerpt is fresh enough at a
 *     week; a retrieval that came back with nothing is a failed attempt and
 *     should be retried tonight.
 *   · `fetchPdfUrl` — 30 days / next nightly. A PDF at a fixed URL is a frozen
 *     document. A failed download or an unparseable text layer is an attempt.
 */
export const TOOL_TTL_HOURS: Readonly<Record<string, ToolTtl>> = Object.freeze({
  wikidata: { populated: ONE_MONTH, empty: THREE_DAYS },
  wikipedia: { populated: ONE_MONTH, empty: THREE_DAYS },
  webSearch: { populated: THREE_DAYS, empty: 12 },
  fetchUrl: { populated: ONE_WEEK, empty: NEXT_NIGHTLY },
  fetchPdfUrl: { populated: ONE_MONTH, empty: NEXT_NIGHTLY },
  fetchUrlHeadless: { populated: ONE_WEEK, empty: NEXT_NIGHTLY },
  resolveBioDocumentUrl: { populated: ONE_WEEK, empty: NEXT_NIGHTLY },
  fetchBoeForSubject: { populated: ONE_WEEK, empty: NEXT_NIGHTLY },
  fetchDogvForSubject: { populated: ONE_WEEK, empty: NEXT_NIGHTLY },
  fetchDialnet: { populated: ONE_MONTH, empty: ONE_WEEK },
  fetchHemerotecaQuery: { populated: ONE_MONTH, empty: THREE_DAYS },
})

/**
 * TTL for a tool nobody has reasoned about yet.
 *
 * Deliberately the shortest in the file rather than the longest. An unregistered
 * call site is one whose volatility nobody has thought about, and the failure
 * mode of guessing too long (a frozen wrong answer published under our name) is
 * far worse than the failure mode of guessing too short (a few extra polite
 * requests). Adding a `cached()` call site should mean adding a row above; the
 * default is a safety net, not a resting place.
 */
export const DEFAULT_TTL_HOURS: ToolTtl = Object.freeze({ populated: 24, empty: 6 })

/**
 * Hours this (tool, class) pair is believed. An `error` is never believed —
 * rule 1 stops it being written at all, so the only way to read one is a legacy
 * entry from before this module, and those must be misses immediately.
 */
export function ttlHoursFor(tool: string, klass: PayloadClass): number {
  if (klass === 'error') return 0
  const row = TOOL_TTL_HOURS[tool] ?? DEFAULT_TTL_HOURS
  return klass === 'empty' ? row.empty : row.populated
}

/** Is this tool name one the table has an opinion about? */
export function hasExplicitTtl(tool: string): boolean {
  return Object.prototype.hasOwnProperty.call(TOOL_TTL_HOURS, tool)
}

// ─── Inspecting entries that predate the `tool` field ──────────────────────

/**
 * Which call sites could have written this payload?
 *
 * Only needed to inspect the directory. A read never guesses — `cached()` knows
 * the tool name because it was just handed it — but entries written before the
 * `tool` field existed carry no record of who wrote them, and `rm -rf` should
 * not be the only way to find out what is in there.
 *
 * Returns every candidate rather than a single best guess, so the caller can
 * see when the answer is genuinely undetermined instead of being handed a
 * confident wrong one. Where the shape narrows to exactly one tool it says so
 * by returning a single element.
 */
export function inferToolCandidates(payload: unknown): string[] {
  const { klass, shape } = classifyPayload(payload)
  const record = isRecord(payload) ? payload : null

  switch (shape) {
    case 'search':
      // `{ query, results }` is the ExaSearchPayload contract and nothing else
      // returns it.
      return ['webSearch']

    case 'text':
      return ['resolveBioDocumentUrl']

    case 'array':
      return ['fetchBoeForSubject', 'fetchDogvForSubject', 'fetchDialnet', 'fetchHemerotecaQuery']

    case 'null':
      return ['wikidata', 'wikipedia', 'resolveBioDocumentUrl']

    case 'urlfetch': {
      const contentType = String(record?.contentType ?? '')
      // `fetchUrlHeadless` is the only caller that stamps this literal.
      if (contentType === 'text/html (rendered)') return ['fetchUrlHeadless']
      if (klass === 'populated') {
        // `fetchUrl` only fills `bodyExcerpt` when the content type contains
        // "text", so a populated PDF body can only have come from the
        // pdf-parse route.
        return contentType.includes('pdf') ? ['fetchPdfUrl'] : ['fetchUrl']
      }
      // A retrieval that produced nothing looks the same from all three. They
      // share an empty TTL, so leaving it undetermined costs no precision.
      return ['fetchUrl', 'fetchPdfUrl', 'fetchUrlHeadless']
    }

    case 'record':
    default: {
      if (record && ('qid' in record || 'claims' in record || 'sitelinks' in record)) {
        return ['wikidata']
      }
      if (record && 'lang' in record) return ['wikipedia']
      return ['wikidata', 'wikipedia']
    }
  }
}

// ─── The two decisions ─────────────────────────────────────────────────────

export interface CacheWriteDecision {
  persist: boolean
  reason: string
  classification: PayloadClassification
}

/**
 * May this fresh result be written to disk?
 *
 * No clock: whether a result is a failure does not depend on what time it is.
 */
export function decideCacheWrite(args: { tool: string; payload: unknown }): CacheWriteDecision {
  const classification = classifyPayload(args.payload)
  if (classification.klass === 'error') {
    return {
      persist: false,
      reason:
        `withheld — ${classification.detail}. A failure is not a result: caching it ` +
        `would pin the failure for every later run, and any good answer already on ` +
        `disk stays as it is`,
      classification,
    }
  }
  const ttl = ttlHoursFor(args.tool, classification.klass)
  return {
    persist: true,
    reason: `persisted — ${classification.detail}, believable for ${ttl}h`,
    classification,
  }
}

export interface CacheReadDecision {
  /** True ⇒ serve the cached payload. False ⇒ treat as a miss and re-fetch. */
  use: boolean
  reason: string
  classification: PayloadClassification
  /** Hours this entry was allowed to live. */
  ttlHours: number
  /** Age at `nowMs`, in hours. Null when `fetchedAt` is missing or unparseable. */
  ageHours: number | null
}

/**
 * May this stored entry still be believed?
 *
 * `nowMs` is a parameter rather than a `Date.now()` call so the expiry boundary
 * can be tested from both sides deterministically. Production passes
 * `Date.now()`; that is fine, it just does not belong in here.
 */
export function decideCacheRead(args: {
  tool: string
  fetchedAt: unknown
  payload: unknown
  nowMs: number
}): CacheReadDecision {
  const classification = classifyPayload(args.payload)
  const ttlHours = ttlHoursFor(args.tool, classification.klass)

  const stamp = typeof args.fetchedAt === 'string' ? Date.parse(args.fetchedAt) : NaN
  if (!Number.isFinite(stamp)) {
    return {
      use: false,
      reason:
        `miss — entry has no usable fetchedAt (${JSON.stringify(args.fetchedAt)}), ` +
        `so its age cannot be established`,
      classification,
      ttlHours,
      ageHours: null,
    }
  }

  const ageHours = (args.nowMs - stamp) / 3_600_000
  if (ageHours < 0) {
    return {
      use: false,
      reason: `miss — fetchedAt is ${(-ageHours).toFixed(1)}h in the future (clock skew or a corrupt entry)`,
      classification,
      ttlHours,
      ageHours,
    }
  }

  if (classification.klass === 'error') {
    return {
      use: false,
      reason: `miss — ${classification.detail}; a stored failure is never served`,
      classification,
      ttlHours,
      ageHours,
    }
  }

  if (ageHours >= ttlHours) {
    return {
      use: false,
      reason:
        `miss — ${classification.klass} entry is ${ageHours.toFixed(1)}h old, past the ` +
        `${ttlHours}h TTL for ${args.tool} (${classification.detail})`,
      classification,
      ttlHours,
      ageHours,
    }
  }

  return {
    use: true,
    reason:
      `hit — ${classification.klass} entry is ${ageHours.toFixed(1)}h old, within the ` +
      `${ttlHours}h TTL for ${args.tool}`,
    classification,
    ttlHours,
    ageHours,
  }
}

/**
 * Journalist tools — shared internals: the .research-cache layer and the
 * snapshot/text helpers every tool module builds on. Exported for sibling
 * modules but NOT re-exported by the ../journalist-tools barrel, so the
 * public tool surface is unchanged. Verbatim from the monolith.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { decideCacheRead, decideCacheWrite } from '../research-cache-policy'

// ─── Cache layer ───────────────────────────────────────────────────────────

export const CACHE_DIR = resolve('.research-cache')
export const UA =
  'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) journalist-agent research'

export interface CacheEntry<T> {
  fetchedAt: string
  payload: T
  /**
   * Which `cached()` call site wrote this. Added 2026-08-09; entries written
   * before that lack it, which is why `scripts/research-cache.ts` has to infer
   * the tool from the payload shape for the older half of the directory. Not
   * used to serve a read — the tool name is known from the call — it exists so
   * the cache can be inspected without guessing. Deliberately the tool name
   * only, never the arguments, which would put councillors' names on disk in
   * a second place for no benefit.
   */
  tool?: string
}

function cacheKey(name: string, args: unknown): string {
  return createHash('sha256').update(JSON.stringify({ name, args })).digest('hex')
}

/**
 * Read the whole entry, not just the payload.
 *
 * The old form returned `payload` and the caller tested `hit !== null`, which
 * had two consequences. The visible one: `fetchedAt` was unreachable, so no TTL
 * was possible. The invisible one: a legitimately cached `null` — every
 * "Wikidata has no item for this councillor" — was indistinguishable from a
 * cache miss, so those calls re-hit the API on every single run despite having
 * been cached 18 times over. Returning the entry fixes both, and "the entry
 * exists" is now the hit condition, with freshness decided separately.
 */
function readCacheEntry<T>(key: string): CacheEntry<T> | null {
  const path = join(CACHE_DIR, `${key}.json`)
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as CacheEntry<T>
    if (typeof parsed !== 'object' || parsed === null) return null
    return parsed
  } catch {
    return null
  }
}

function writeCacheEntry<T>(key: string, tool: string, payload: T): void {
  mkdirSync(CACHE_DIR, { recursive: true })
  const entry: CacheEntry<T> = { fetchedAt: new Date().toISOString(), tool, payload }
  writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify(entry))
}

/**
 * Memoise a network call on disk, subject to `research-cache-policy`.
 *
 * A withheld write is announced on stderr rather than passed over in silence:
 * "the cache did not take this answer" is exactly the kind of thing that must
 * be visible in a nightly log, since the alternative — a run that quietly
 * re-fetches the same failing endpoint every time — looks identical to a run
 * that is working.
 */
export async function cached<T>(name: string, args: unknown, run: () => Promise<T>): Promise<T> {
  const key = cacheKey(name, args)
  const entry = readCacheEntry<T>(key)
  if (entry) {
    const read = decideCacheRead({
      tool: name,
      fetchedAt: entry.fetchedAt,
      payload: entry.payload,
      nowMs: Date.now(),
    })
    if (read.use) return entry.payload
  }
  const result = await run()
  const write = decideCacheWrite({ tool: name, payload: result })
  if (write.persist) writeCacheEntry(key, name, result)
  else process.stderr.write(`[research-cache] ${name}: ${write.reason}\n`)
  return result
}

// ─── Common helpers ────────────────────────────────────────────────────────

export function nowIso(): string {
  return new Date().toISOString()
}

export function readJsonSnapshot<T>(localPath: string): T | null {
  const abs = resolve(localPath)
  if (!existsSync(abs)) return null
  try {
    return JSON.parse(readFileSync(abs, 'utf8')) as T
  } catch {
    return null
  }
}

export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function tokenize(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 2)
}

/**
 * Does any needle token appear as a WHOLE WORD in the haystack?
 *
 * This used to be `normalize(haystack).includes(t)`, a bare substring test on
 * tokens as short as two characters. Measured against the published corpus:
 * every one of Eva Lara's 576 pleno-claim hits and 14 press hits was false
 * ("eva" inside *Evaluación* and *renueva*), as were all 15 of Alfredo Plá's
 * ("pla" inside *plaza*, *plan*). Those feed the journalist agent's retrieval
 * for biographies of named living people.
 */
export function matchesAnyToken(haystack: string, needleTokens: string[]): boolean {
  if (needleTokens.length === 0) return false
  const words = new Set(tokenize(haystack))
  return needleTokens.some((t) => words.has(t))
}

/**
 * Tokens too short to identify a person on their own.
 *
 * Whole-word matching fixes *Evaluación*, but not the case where the token IS a
 * word: `pla` is Valencian for "plan" and runs through municipal text, so
 * "Alfredo Plá" would still collect every *pla general* in the corpus.
 */
const WEAK_TOKEN_MAX_LEN = 3

/**
 * Does a weak token appear CAPITALISED in the original text?
 *
 * The distinguishing signal, and the reason this is not simply "require two
 * tokens": that stricter rule threw away real mentions — «no estaba Eva» and
 * «como dice Eva» are exactly the kind of first-name reference a transcript
 * carries, and both were lost. Capitalisation separates them from «pla
 * general» without costing either. Checked against the raw haystack, before
 * `normalize` folds case away.
 */
function appearsCapitalised(haystack: string, token: string): boolean {
  // Walk the RAW words and normalise each for comparison, rather than running a
  // normalised token as a regex over raw text: `\bpla\b` never matches «Plá»,
  // because the accent is still in the haystack. Getting that backwards
  // silently rejects every accented surname, which is most of them here.
  for (const raw of haystack.split(/[^\p{L}\p{N}]+/u)) {
    if (!raw || normalize(raw) !== token) continue
    const first = raw[0]
    if (first === first.toUpperCase() && first !== first.toLowerCase()) return true
  }
  return false
}

export function matchesPersonName(haystack: string, nameTokens: string[]): boolean {
  if (nameTokens.length === 0) return false
  const words = new Set(tokenize(haystack))
  const hits = nameTokens.filter((t) => words.has(t))
  if (hits.length === 0) return false
  if (hits.length >= 2) return true
  const only = hits[0]
  if (only.length > WEAK_TOKEN_MAX_LEN) return true
  // A lone short token counts only where it reads as a proper noun.
  return appearsCapitalised(haystack, only)
}

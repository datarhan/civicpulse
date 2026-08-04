/**
 * Journalist tools — shared internals: the .research-cache layer and the
 * snapshot/text helpers every tool module builds on. Exported for sibling
 * modules but NOT re-exported by the ../journalist-tools barrel, so the
 * public tool surface is unchanged. Verbatim from the monolith.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

// ─── Cache layer ───────────────────────────────────────────────────────────

export const CACHE_DIR = resolve('.research-cache')
export const UA =
  'CivicPulse/0.1 (+https://github.com/datarhan/civicpulse) journalist-agent research'

interface CacheEntry<T> {
  fetchedAt: string
  payload: T
}

function cacheKey(name: string, args: unknown): string {
  return createHash('sha256').update(JSON.stringify({ name, args })).digest('hex')
}

function readCache<T>(key: string): T | null {
  const path = join(CACHE_DIR, `${key}.json`)
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf8')
    return (JSON.parse(raw) as CacheEntry<T>).payload
  } catch {
    return null
  }
}

function writeCacheEntry<T>(key: string, payload: T): void {
  mkdirSync(CACHE_DIR, { recursive: true })
  const entry: CacheEntry<T> = { fetchedAt: new Date().toISOString(), payload }
  writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify(entry))
}

export async function cached<T>(name: string, args: unknown, run: () => Promise<T>): Promise<T> {
  const key = cacheKey(name, args)
  const hit = readCache<T>(key)
  if (hit !== null) return hit
  const result = await run()
  writeCacheEntry(key, result)
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

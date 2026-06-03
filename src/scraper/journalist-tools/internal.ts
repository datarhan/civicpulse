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

export function matchesAnyToken(haystack: string, needleTokens: string[]): boolean {
  if (needleTokens.length === 0) return false
  const norm = normalize(haystack)
  return needleTokens.some((t) => norm.includes(t))
}

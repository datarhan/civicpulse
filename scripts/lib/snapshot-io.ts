/**
 * Shared snapshot I/O for the curator CLIs (journalist + siblings).
 *
 * Every curator CLI repeated the same three patterns: load-or-default,
 * validate-before-write, and write-a-per-id-chunk. Factoring them here keeps
 * the validate-before-write contract (a malformed edit throws BEFORE the file
 * is overwritten) in one place, and keeps the exact on-disk format
 * (2-space indent + trailing newline) identical across every CLI.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** Load + validate a snapshot from `path`, or return `fallback` if absent. */
export function loadSnapshot<T>(path: string, validate: (json: string) => T, fallback: T): T {
  if (!existsSync(path)) return fallback
  return validate(readFileSync(path, 'utf8'))
}

/**
 * Serialize (2-space + trailing newline), RE-VALIDATE, then write. The
 * re-validation is the curator safety net: an edit that broke an invariant
 * throws here and the file on disk is left untouched.
 */
export function writeSnapshot<T>(path: string, snapshot: T, validate: (json: string) => T): void {
  const serialized = JSON.stringify(snapshot, null, 2) + '\n'
  validate(serialized)
  writeFileSync(path, serialized, 'utf8')
}

/** Write a per-id chunk file under `dir` (created if needed). Returns its path. */
export function writeJsonChunk(dir: string, filename: string, data: unknown): string {
  mkdirSync(dir, { recursive: true })
  const p = resolve(dir, filename)
  writeFileSync(p, JSON.stringify(data, null, 2) + '\n')
  return p
}

/** Write `data` as pretty JSON (2-space + trailing newline) to `path`. */
export function writeJsonFile(path: string, data: unknown): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n')
}

/** Overwrite a single JSON file (2-space + trailing newline) only if it exists. */
export function rewriteJsonIfPresent(path: string, data: unknown): void {
  if (existsSync(path)) writeJsonFile(path, data)
}

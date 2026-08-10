/**
 * Read the two texts of each pleno session off disk: the transcript published
 * today, and the one it replaced when the session was re-transcribed.
 *
 * The pure half — deciding what a quote's absence from the current file MEANS —
 * is `src/scraper/quote-provenance.ts`, and is tested without a filesystem.
 * This is the only reader, so `check:finding-quotes`,
 * `compute:finding-quote-provenance` and `triage:quote-reanchor` cannot end up
 * disagreeing about which bytes they are looking at.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import type { SessionTexts } from '../../src/scraper/quote-provenance'

export const TRANSCRIPTS_DIR = 'public/data/pleno-transcripts'
export const SUPERSEDED_DIR = 'public/data/pleno-transcripts/superseded'

function readIfExists(path: string): { text: string; bytes: number } | null {
  if (!existsSync(path)) return null
  return { text: readFileSync(path, 'utf8'), bytes: statSync(path).size }
}

/**
 * One entry per distinct `plenoId`. A session with no transcript at all gets a
 * row with both texts null rather than being left out of the map: an absent key
 * and a present-but-empty one read the same to a caller, and only one of them
 * is a fact about the corpus.
 */
export function loadSessionTexts(
  plenoIds: Iterable<string>,
  opts: { transcriptsDir?: string; supersededDir?: string } = {},
): Map<string, SessionTexts> {
  const cur = resolve(opts.transcriptsDir ?? TRANSCRIPTS_DIR)
  const old = resolve(opts.supersededDir ?? SUPERSEDED_DIR)
  const out = new Map<string, SessionTexts>()
  for (const id of plenoIds) {
    if (out.has(id)) continue
    const a = readIfExists(`${cur}/${id}.txt`)
    const b = readIfExists(`${old}/${id}.txt`)
    out.set(id, {
      current: a?.text ?? null,
      superseded: b?.text ?? null,
      currentBytes: a?.bytes ?? 0,
      supersededBytes: b?.bytes ?? 0,
    })
  }
  return out
}

/**
 * Shared stable-ID hashing for the scrapers.
 *
 * These hashes are PRIMARY KEYS downstream: press fingerprints, pleno ids
 * (which pleno-claims / pleno-findings cite), BOE row ids, TED notice ids.
 * They previously lived as byte-identical private copies in four parser
 * modules — a bug fixed in one copy would silently miss the others, and a
 * divergence would re-key every downstream citation. Single source now.
 *
 * Node-only module (node:crypto) — keep it out of browser-imported code;
 * the browser-safe text helpers live in ./normalize.ts.
 */
import { createHash } from 'node:crypto'

/** FNV-1a 32-bit, base36. Identical to the former press.ts/plenos.ts copies. */
export function fnv32(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h.toString(36)
}

/** First 12 hex chars of sha256. Identical to the former boe.ts/tenders-ted.ts copies. */
export function sha256Short(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 12)
}

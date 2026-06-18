/**
 * Node-only fetcher for BOP de València daily bulletins (sibling of
 * boe-fetch.ts / tenders-ted-fetch.ts). Downloads a day's whole-bulletin PDF
 * and extracts its text via pdf-parse, so the pure parser in bop.ts can run
 * against plain text. Kept out of bop.ts to keep that module browser-safe.
 */

import { bopBulletinUrl } from './bop'

const UA = 'Mozilla/5.0 (compatible; CivicPulse/0.1; +https://github.com/datarhan/civicpulse)'

/**
 * Fetch + pdf-parse one day's bulletin. Returns null when there is no bulletin
 * that day (BOP answers 404 on non-publication days — a clean "skip" signal) or
 * when the response is not a PDF; throws only on a genuine transport error so
 * the caller can distinguish "no bulletin" from "fetch broke".
 */
export async function fetchBopBulletinText(
  bulletinDate: string,
  timeoutMs = 90_000,
): Promise<string | null> {
  const url = bopBulletinUrl(bulletinDate)
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*' },
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`BOP ${bulletinDate} -> HTTP ${res.status}`)
  if (!/pdf/i.test(res.headers.get('content-type') || '')) return null
  const buf = Buffer.from(await res.arrayBuffer())
  // Lazy-load pdf-parse (v1: default export → { text }) so its pdfjs-dist dep
  // is only paid when a bulletin is actually downloaded.
  const mod = (await import('pdf-parse')) as unknown as {
    default: (b: Buffer) => Promise<{ text: string }>
  }
  const { text } = await mod.default(buf)
  return text
}

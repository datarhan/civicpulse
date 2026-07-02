/**
 * Deterministic grounding for auto-curator drafts. LLM self-confidence is
 * uncalibrated, so grounding is the real gate before anything auto-publishes:
 * the source URL must resolve (200), the verbatim quote must actually appear
 * in the fetched page, and the party/date must be sane. Any failure returns
 * grounded:false, which forces the draft to the human queue (fail-safe).
 *
 * NOTE: grounding proves the SOURCE exists, not that an accusatory inference
 * is sound. That is why 'no-ejecutada' verdicts never auto-publish even when
 * grounded (see promise-auto-curate.ts STATUS_TIER).
 */
import { stripDiacritics } from './normalize'
import { ALLOWED_PARTIES } from './promises'
import type { DraftNewPromise, Grounding } from './promise-draft'

export function normalizeForMatch(s: string): string {
  return stripDiacritics(s.toLowerCase()).replace(/\s+/g, ' ').trim()
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&laquo;|&raquo;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Substring match after normalization; token-coverage ≥0.9 fallback for
 *  minor punctuation drift. Strict on purpose — a miss costs only a queue
 *  fallback, a false match could auto-publish a wrong attribution. */
export function quoteFoundInText(quote: string, pageText: string): boolean {
  const q = normalizeForMatch(quote)
  const t = normalizeForMatch(pageText)
  if (q.length < 12) return false
  if (t.includes(q)) return true
  const qTokens = q.split(' ').filter((w) => w.length > 2)
  if (qTokens.length < 4) return false
  const tSet = new Set(t.split(' '))
  const hit = qTokens.filter((w) => tSet.has(w)).length
  return hit / qTokens.length >= 0.9
}

export function partyDateOk(party: string, madeAt: string, now: Date = new Date()): boolean {
  if (!(ALLOWED_PARTIES as readonly string[]).includes(party)) return false
  if (!/^\d{4}-\d{2}-\d{2}$/.test(madeAt)) return false
  const d = new Date(madeAt + 'T00:00:00Z')
  if (!Number.isFinite(d.getTime())) return false
  return d.getTime() <= now.getTime()
}

export type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; url: string; text: () => Promise<string> }>

export async function groundDraft(
  draft: DraftNewPromise,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  now: Date = new Date(),
): Promise<Grounding> {
  const checkedAt = now.toISOString()
  const fail: Grounding = { grounded: false, urlResolved: false, quoteFound: false, checkedAt }
  if (!partyDateOk(draft.proposed.party, draft.proposed.madeAt, now)) return fail
  let res: Awaited<ReturnType<FetchLike>>
  try {
    res = await fetchImpl(draft.proposed.source.url)
  } catch {
    return fail
  }
  if (!res.ok) return { ...fail, resolvedUrl: res.url }
  let html = ''
  try {
    html = await res.text()
  } catch {
    return { ...fail, urlResolved: true, resolvedUrl: res.url }
  }
  try {
    const quoteFound = quoteFoundInText(draft.proposed.quote, stripHtml(html))
    return { grounded: quoteFound, urlResolved: true, quoteFound, resolvedUrl: res.url, checkedAt }
  } catch {
    return { ...fail, urlResolved: true, resolvedUrl: res.url }
  }
}

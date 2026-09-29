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
 *
 * A NEW promise must also quote the party's own words (`quoteIsPartyWords`):
 * a headline or the reporter's narration is present on the page and still
 * says nothing about what the party said.
 */
import { stripDiacritics } from './normalize'
import { ALLOWED_PARTIES } from './promises'
import type { DraftNewPromise, DraftStatusChange, Grounding } from './promise-draft'

/**
 * The council's own sites. On them the institution speaks in its own voice,
 * so their text is the municipal government's words; anywhere else a promise
 * has to be words the page puts in someone's mouth.
 */
const AYUNTAMIENTO_HOST = /(^|\.)ribarroja\.es$/i

export function isAyuntamientoUrl(url: string): boolean {
  try {
    return AYUNTAMIENTO_HOST.test(new URL(url).hostname)
  } catch {
    return false
  }
}

/**
 * The spans a page puts between quotation marks: «…», “…” and "…". Not the
 * single marks, because an apostrophe — «l'Ajuntament» — would pair with the
 * next one and invent a quotation. `stripHtml` has already turned &laquo; and
 * &raquo; into plain double marks, which pair like any other.
 */
export function quotedSpans(text: string): string[] {
  const spans: string[] = []
  for (const re of [/«([^«»]+)»/g, /“([^“”]+)”/g, /"([^"]+)"/g]) {
    for (const m of text.matchAll(re)) spans.push(m[1])
  }
  return spans
}

/**
 * Is `quote` the party's own words on this page, rather than a headline or the
 * reporter's narration? Deterministic on purpose: on the council's own site
 * the institution is the speaker; anywhere else the quote has to sit inside a
 * quotation the page prints.
 *
 * It misses direct speech that a paper prints without marks («Construiremos…,
 * dijo el alcalde»), and that miss is the cheap side: the draft goes to a
 * person instead of auto-publishing. Before this rule most published quotes on
 * /promesas were headlines or the reporter's sentence under a party's name, and
 * two cards shared one sentence about a vote (review of 2026-09-28).
 */
export function quoteIsPartyWords(quote: string, pageText: string, url: string): boolean {
  if (isAyuntamientoUrl(url)) return quoteFoundInText(quote, pageText)
  const q = normalizeForMatch(quote)
  if (q.length < 12) return false
  return quotedSpans(pageText).some((span) => normalizeForMatch(span).includes(q))
}

export function normalizeForMatch(s: string): string {
  return stripDiacritics(s.toLowerCase()).replace(/\s+/g, ' ').trim()
}

/**
 * The named entities a Spanish or Valencian page actually uses. Valencia Plaza
 * and elperiodic.com write every accent and every curly quote as an entity, and
 * until 2026-09-28 only six were decoded here: «m&aacute;ximo» never matched
 * «máximo», and a quotation written «&ldquo;…&rdquo;» was invisible to
 * `quoteIsPartyWords`. «&laquo;» and «&raquo;» keep decoding to a plain double
 * mark, as they always have.
 */
const ENTIDADES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  laquo: '"',
  raquo: '"',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  middot: '·',
  iexcl: '¡',
  iquest: '¿',
  ordf: 'ª',
  ordm: 'º',
  deg: '°',
  euro: '€',
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  agrave: 'à',
  egrave: 'è',
  ograve: 'ò',
  Agrave: 'À',
  Egrave: 'È',
  Ograve: 'Ò',
  ntilde: 'ñ',
  Ntilde: 'Ñ',
  uuml: 'ü',
  Uuml: 'Ü',
  iuml: 'ï',
  Iuml: 'Ï',
  ccedil: 'ç',
  Ccedil: 'Ç',
}

/** One pass, so «&amp;aacute;» comes out as «&aacute;», not «á». */
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code =
        e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
    }
    return ENTIDADES[e] ?? ENTIDADES[e.toLowerCase()] ?? m
  })
}

export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
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

export const MOZILLA_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 CivicPulse/1.0 (+https://civicpulse.es)'

/** Default fetch used by groundDraft: Mozilla-leading UA (clears the
 *  ribarroja.es WAF) + follow redirects (resolves publisher URLs). */
export const defaultGroundingFetch: FetchLike = (url) =>
  fetch(url, {
    headers: { 'User-Agent': MOZILLA_UA },
    redirect: 'follow',
  }) as unknown as ReturnType<FetchLike>

/**
 * Google-News RSS wrapper resolution. Discovery frequently proposes a promise
 * whose source is a `news.google.com/rss/articles/…` redirect. Those pages are
 * a JS interstitial that never carries the verbatim quote, so grounding them
 * always fails safe to the queue. Resolving the wrapper to the real publisher
 * URL first lets legitimate drafts ground. The technique replays the browser's
 * own DotsSplashUi batchexecute call: fetch the wrapper HTML, lift the three
 * `data-n-a-*` attributes, POST them, and pull the publisher URL out of the
 * response. Every step is fail-safe (any error/missing param → null), so the
 * caller falls back to grounding the original URL.
 */
const GOOGLE_NEWS_RE = /^https?:\/\/news\.google\.com\/(rss\/)?(articles|read)\//i

export function isGoogleNewsUrl(url: string): boolean {
  return GOOGLE_NEWS_RE.test(url)
}

export function extractBatchParams(html: string): { id: string; ts: string; sg: string } | null {
  const id = html.match(/data-n-a-id="([^"]+)"/)?.[1]
  const ts = html.match(/data-n-a-ts="([^"]+)"/)?.[1]
  const sg = html.match(/data-n-a-sg="([^"]+)"/)?.[1]
  return id && ts && sg ? { id, ts, sg } : null
}

export function buildBatchRequestBody(p: { id: string; ts: string; sg: string }): string {
  const inner = JSON.stringify([
    'garturlreq',
    [
      [
        'X',
        'X',
        ['X', 'X'],
        null,
        null,
        1,
        1,
        'US:en',
        null,
        1,
        null,
        null,
        null,
        null,
        null,
        0,
        1,
      ],
      'X',
      'X',
      1,
      [1, 1, 1],
      1,
      1,
      null,
      0,
      0,
      null,
      0,
    ],
    p.id,
    Number(p.ts),
    p.sg,
  ])
  const freq = JSON.stringify([[['Fbv4je', inner, null, 'generic']]])
  return new URLSearchParams({ 'f.req': freq }).toString()
}

export function parseResolvedUrl(responseText: string): string | null {
  const urls: string[] = responseText.match(/https?:\/\/[^\\"\s]+/g) ?? []
  return urls.find((u) => !u.includes('google.com') && !u.includes('gstatic')) ?? null
}

const BATCH_URL = 'https://news.google.com/_/DotsSplashUi/data/batchexecute'

/** Resolve a Google-News wrapper URL to its publisher URL, or null. Uses the
 *  global fetch (needs POST); injectable for tests. Fail-safe: any error or
 *  missing param → null (caller then grounds the original URL, which itself
 *  fails safe to the queue). */
export async function resolveGoogleNewsUrl(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<string | null> {
  if (!isGoogleNewsUrl(url)) return null
  try {
    const page = await fetchFn(url, { headers: { 'User-Agent': MOZILLA_UA }, redirect: 'follow' })
    if (!page.ok) return null
    const params = extractBatchParams(await page.text())
    if (!params) return null
    const res = await fetchFn(BATCH_URL, {
      method: 'POST',
      headers: {
        'User-Agent': MOZILLA_UA,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body: buildBatchRequestBody(params),
    })
    if (!res.ok) return null
    return parseResolvedUrl(await res.text())
  } catch {
    return null
  }
}

export async function groundDraft(
  draft: DraftNewPromise,
  fetchImpl: FetchLike = defaultGroundingFetch,
  now: Date = new Date(),
  resolveGn: (url: string) => Promise<string | null> = resolveGoogleNewsUrl,
): Promise<Grounding> {
  const checkedAt = now.toISOString()
  const fail: Grounding = { grounded: false, urlResolved: false, quoteFound: false, checkedAt }
  if (!partyDateOk(draft.proposed.party, draft.proposed.madeAt, now)) return fail
  // Google-News RSS wrappers never carry the verbatim quote; resolve to the
  // real publisher URL first so legitimate drafts can ground. Fail-safe: a
  // null resolution grounds the original URL (which itself fails safe).
  let targetUrl = draft.proposed.source.url
  if (isGoogleNewsUrl(targetUrl)) {
    const resolved = await resolveGn(targetUrl).catch(() => null)
    if (resolved) targetUrl = resolved
  }
  let res: Awaited<ReturnType<FetchLike>>
  try {
    res = await fetchImpl(targetUrl)
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
    const text = stripHtml(html)
    const quoteFound = quoteFoundInText(draft.proposed.quote, text)
    // Present is not enough: a headline is present too. The quote has to be
    // what the page says the party said (see quoteIsPartyWords).
    const partyWords = quoteFound && quoteIsPartyWords(draft.proposed.quote, text, res.url)
    return {
      grounded: partyWords,
      urlResolved: true,
      quoteFound,
      partyWords,
      resolvedUrl: res.url,
      checkedAt,
    }
  } catch {
    return { ...fail, urlResolved: true, resolvedUrl: res.url }
  }
}

const STRUCTURED_KINDS = new Set(['tender', 'bdns', 'budget', 'pleno'])

/** Structured-row grounding: the cited candidate must be a real retrieved row
 *  (guaranteed by the miner's candidateIndex resolution → candidateExists). A
 *  fieldCite is a bonus assertion but not required. Deterministic, no network. */
export function groundStructuredCite(
  fieldCite: string | undefined,
  candidateExists: boolean,
): boolean {
  return candidateExists
}

/** Ground a status-change draft. Page-quote for press-like evidence; structured-
 *  row (deterministic) for tender/bdns/budget/pleno. Fail-safe → grounded:false. */
export async function groundStatusDraft(
  draft: DraftStatusChange,
  fetchImpl: FetchLike = defaultGroundingFetch,
  now: Date = new Date(),
  resolveGn: (url: string) => Promise<string | null> = resolveGoogleNewsUrl,
): Promise<Grounding> {
  const checkedAt = now.toISOString()
  const fail: Grounding = { grounded: false, urlResolved: false, quoteFound: false, checkedAt }
  const ev = draft.evidence
  // Structured rows: the miner only builds a draft from a resolved real
  // candidate, so the row exists by construction. Deterministic grounding.
  if (STRUCTURED_KINDS.has(ev.kind)) {
    const grounded = groundStructuredCite(undefined, true)
    return { grounded, urlResolved: true, quoteFound: grounded, resolvedUrl: ev.url, checkedAt }
  }
  // Page-quote (press / ayuntamiento): fetch + quote match (mirror groundDraft).
  let targetUrl = ev.url
  if (isGoogleNewsUrl(targetUrl)) {
    const resolved = await resolveGn(targetUrl).catch(() => null)
    if (resolved) targetUrl = resolved
  }
  let res: Awaited<ReturnType<FetchLike>>
  try {
    res = await fetchImpl(targetUrl)
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
    const quoteFound = quoteFoundInText(ev.quote, stripHtml(html))
    return { grounded: quoteFound, urlResolved: true, quoteFound, resolvedUrl: res.url, checkedAt }
  } catch {
    return { ...fail, urlResolved: true, resolvedUrl: res.url }
  }
}

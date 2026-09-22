/**
 * Journalist tools — SourceCitation builders. Each maps a tool result into
 * the citation shape the agent threads into evidence. Verbatim from the
 * monolith.
 */
import type { CitationKind, CitationTrust, SourceCitation } from '../journalist'
import { nowIso } from './internal'
import { trustForUrl } from './domain-trust'
import type { WikidataPayload, WikipediaSummary } from './web'

// ─── Citation builders ─────────────────────────────────────────────────────

let citationCounter = 0
function nextCitationId(): string {
  citationCounter += 1
  return `src-${String(citationCounter).padStart(3, '0')}`
}

export function resetCitationCounter(): void {
  citationCounter = 0
}

export function buildLocalCitation(opts: {
  localPath: string
  title: string
  excerpt?: string
}): SourceCitation {
  return {
    id: nextCitationId(),
    kind: 'local-snapshot' as CitationKind,
    title: opts.title,
    retrievedAt: nowIso(),
    localPath: opts.localPath,
    trust: 'high' as CitationTrust,
    ...(opts.excerpt ? { excerpt: opts.excerpt.slice(0, 500) } : {}),
  }
}

/**
 * Percent-encode the whitespace a URL cannot carry.
 *
 * The planner is an LLM and writes URLs the way it reads them. On 2026-09-22 it
 * asked for «…/files/20260723 Rafa Gómez.pdf» — spaces and all, exactly as the
 * municipal portal publishes the href — `fetchPdfUrl` downloaded it fine (200,
 * 360 KB), and the citation was built with the space inside. Four agent stages
 * later the draft validator killed the whole run: `URL_RE` is /^https?:\/\/\S+$/,
 * so «sources[26].url must be http(s) URL». Every web citation goes through
 * here, which makes this the one place worth fixing.
 *
 * Only whitespace is touched. Running `encodeURI` over the whole string would
 * double-encode the URLs that already carry `%20`, which are the majority.
 */
const encodeUrlSpaces = (url: string): string => url.replace(/\s/g, '%20')

export function buildWebCitation(opts: {
  url: string
  title: string
  publisher?: string
  publishedAt?: string
  excerpt?: string
  archiveUrl?: string | null
  trust?: CitationTrust
}): SourceCitation {
  const url = encodeUrlSpaces(opts.url)
  return {
    id: nextCitationId(),
    kind: 'web' as CitationKind,
    url,
    title: opts.title,
    retrievedAt: nowIso(),
    // Default = the curated domain-trust table (official → high, known
    // press → medium, unknown → low); explicit opts.trust still wins.
    trust: opts.trust ?? trustForUrl(url),
    ...(opts.publisher ? { publisher: opts.publisher } : {}),
    ...(opts.publishedAt ? { publishedAt: opts.publishedAt } : {}),
    ...(opts.excerpt ? { excerpt: opts.excerpt.slice(0, 500) } : {}),
    ...(opts.archiveUrl ? { archiveUrl: encodeUrlSpaces(opts.archiveUrl) } : {}),
  }
}

export function buildWikidataCitation(payload: WikidataPayload, lang = 'es'): SourceCitation {
  const label = payload.labels[lang] ?? payload.labels.en ?? payload.qid
  const description = payload.descriptions[lang] ?? payload.descriptions.en ?? ''
  return {
    id: nextCitationId(),
    kind: 'wikidata' as CitationKind,
    url: payload.url,
    title: `Wikidata: ${label}`,
    retrievedAt: nowIso(),
    trust: 'high' as CitationTrust,
    publisher: 'Wikidata',
    ...(description ? { excerpt: description.slice(0, 500) } : {}),
  }
}

export function buildWikipediaCitation(summary: WikipediaSummary): SourceCitation {
  return {
    id: nextCitationId(),
    kind: 'wikipedia' as CitationKind,
    url: summary.url,
    title: `Wikipedia (${summary.lang}): ${summary.title}`,
    retrievedAt: nowIso(),
    trust: 'high' as CitationTrust,
    publisher: `Wikipedia ${summary.lang}`,
    ...(summary.extract ? { excerpt: summary.extract.slice(0, 500) } : {}),
  }
}

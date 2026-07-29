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

export function buildWebCitation(opts: {
  url: string
  title: string
  publisher?: string
  publishedAt?: string
  excerpt?: string
  archiveUrl?: string | null
  trust?: CitationTrust
}): SourceCitation {
  return {
    id: nextCitationId(),
    kind: 'web' as CitationKind,
    url: opts.url,
    title: opts.title,
    retrievedAt: nowIso(),
    // Default = the curated domain-trust table (official → high, known
    // press → medium, unknown → low); explicit opts.trust still wins.
    trust: opts.trust ?? trustForUrl(opts.url),
    ...(opts.publisher ? { publisher: opts.publisher } : {}),
    ...(opts.publishedAt ? { publishedAt: opts.publishedAt } : {}),
    ...(opts.excerpt ? { excerpt: opts.excerpt.slice(0, 500) } : {}),
    ...(opts.archiveUrl ? { archiveUrl: opts.archiveUrl } : {}),
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

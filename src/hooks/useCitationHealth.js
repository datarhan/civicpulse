// @ts-check
import { useMemo } from 'react'
import { useJsonFetch } from './useJsonFetch'

const EMPTY = { items: [] }

/**
 * Link-rot status for a cited URL, keyed by the URL itself.
 *
 * /laboratorio has flagged dead press links for months; /promesas had nothing,
 * and it is the surface that needs it most. Every promise attributes a verbatim
 * quote to a named party, and the tracker's whole legal footing is "verbatim
 * quote + source URL + publisher". A citation that no longer resolves makes the
 * URL half of that hollow — and the right-of-reply flow assumes the affected
 * party can go and read what they are said to have said.
 *
 * Found on the first run: four dead promise citations, two of them the primary
 * source, both slug-shaped placeholders that were probably never real articles
 * (`levante-emv.com/metro-l9` → 404).
 */
export function useCitationHealth() {
  const { data } = useJsonFetch('/data/press-link-rot.json', EMPTY)
  return useMemo(() => {
    const byUrl = new Map()
    for (const row of data?.items ?? []) {
      const u = row.articleUrl ?? row.url
      if (u) byUrl.set(u, row)
    }
    return byUrl
  }, [data])
}

/** `dead` | `alive` | null when the URL has never been audited. */
export function citationStatus(byUrl, url) {
  if (!url) return null
  return byUrl.get(url)?.status ?? null
}

/** A Wayback snapshot to cite instead, when one exists. */
export function citationArchive(byUrl, url) {
  return url ? (byUrl.get(url)?.archivedUrl ?? null) : null
}

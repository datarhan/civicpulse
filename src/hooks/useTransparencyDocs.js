import { useJsonFetch } from './useJsonFetch'

// 404-fallback (module-level constant → stable ref).
const EMPTY_TX = {
  generatedAt: null,
  source: null,
  sources: [],
  stats: { total: 0, byCategory: {} },
  docs: [],
}

/**
 * Official transparency-portal documents indexed as links
 * (public/data/transparency-docs.json) — produced by scrape-transparency.ts.
 * A link catalogue (RPT/plantilla, councillor CVs), not a data extraction.
 */
export function useTransparencyDocs() {
  return useJsonFetch('/data/transparency-docs.json', EMPTY_TX)
}

/** Group docs by their category, preserving the snapshot order. */
export function groupTransparencyDocs(data) {
  const groups = new Map()
  for (const d of data?.docs || []) {
    if (!groups.has(d.category)) groups.set(d.category, { label: d.categoryLabel, docs: [] })
    groups.get(d.category).docs.push(d)
  }
  return [...groups.values()]
}

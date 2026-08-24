// @ts-check
/**
 * useLabHealth — fetches every public data snapshot in parallel and
 * rolls them into a single freshness inventory for /lab-health.
 *
 * Sources are listed explicitly (not glob-scanned) so a new scraper
 * adding a file to public/data/ shows up here only when a curator
 * registers it. That makes the page an audit surface, not a
 * file-system mirror — files that are intentionally outside the
 * publication contract stay invisible.
 *
 * Missing files resolve to `{ status: 'missing' }` instead of throwing.
 * The page renders an honest empty/dead state per row.
 */
import { useEffect, useState } from 'react'

/** Curated source registry. Order = display order. */
export const LAB_SOURCES = [
  // — Civic data corpus (citizen-facing)
  { path: '/data/officials.json', label: 'Cargos · Corporación', group: 'core' },
  { path: '/data/budget.json', label: 'Presupuesto · CONPREL', group: 'core' },
  { path: '/data/tenders.json', label: 'Contratos · PLACSP', group: 'core' },
  { path: '/data/tenders-ted.json', label: 'Contratos · EU TED', group: 'core' },
  { path: '/data/bdns.json', label: 'Subvenciones · BDNS', group: 'core' },
  { path: '/data/boe.json', label: 'BOE', group: 'core' },
  // These three are rendered on /quejas, /datos and /cargos/:slug but had no
  // health row, so a stale or broken snapshot behind them was invisible here.
  { path: '/data/bop.json', label: 'BOP València', group: 'core' },
  { path: '/data/sindicatura.json', label: 'Sindicatura de Comptes', group: 'core' },
  {
    path: '/data/sindic-expedientes.json',
    label: 'Síndic CV · índice de expedientes',
    group: 'core',
  },
  { path: '/data/transparency-docs.json', label: 'Portal de Transparencia', group: 'core' },
  { path: '/data/padron.json', label: 'Padrón · INE', group: 'core' },
  { path: '/data/paro.json', label: 'Paro · SEPE', group: 'core' },
  { path: '/data/plenos.json', label: 'Plenos · sesiones', group: 'core' },
  { path: '/data/plenos-agendas.json', label: 'Plenos · órdenes del día', group: 'core' },
  { path: '/data/pleno-votes.json', label: 'Plenos · votos', group: 'core' },
  { path: '/data/participa.json', label: 'Participa Riba-roja', group: 'core' },
  { path: '/data/press.json', label: 'Prensa · feed', group: 'core' },
  { path: '/data/wikidata.json', label: 'Wikidata', group: 'core' },
  { path: '/data/geo.json', label: 'Geo · OSM', group: 'core' },
  { path: '/data/metro-network.json', label: 'Metrovalencia · red', group: 'core' },
  { path: '/data/metro-schedule.json', label: 'Metrovalencia · horario', group: 'core' },
  { path: '/data/spain-ticker.json', label: 'Live ticker (Spain)', group: 'core' },
  // — Curated / human-edited
  { path: '/data/promises.json', label: 'Promesas · curado', group: 'curated' },
  { path: '/data/promise-suggestions.json', label: 'Promesas · sugerencias', group: 'curated' },
  { path: '/data/sindic.json', label: 'Síndic CV · fichas firmadas', group: 'curated' },
  { path: '/data/ctbg.json', label: 'CTBG (estatal)', group: 'curated' },
  { path: '/data/consell-cv.json', label: 'Consell CV', group: 'curated' },
  // — Quejas (bot-owned)
  { path: '/data/quejas.json', label: 'Quejas · bot snapshot', group: 'quejas' },
  { path: '/data/quejas-responses.json', label: 'Quejas · respuestas oficiales', group: 'quejas' },
  // — Press lab
  { path: '/data/press-claims-suggestions.json', label: 'Press claims · sugeridos', group: 'lab' },
  { path: '/data/press-claims-verified.json', label: 'Press claims · verificados', group: 'lab' },
  { path: '/data/press-summaries.json', label: 'Press · resúmenes LLM', group: 'lab' },
  { path: '/data/press-trust.json', label: 'Press · indicadores Trust', group: 'lab' },
  { path: '/data/press-triangulation.json', label: 'Press · triangulación', group: 'lab' },
  { path: '/data/press-coverage-gaps.json', label: 'Press · lagunas', group: 'lab' },
  { path: '/data/press-findings.json', label: 'Hallazgos prensa · curados', group: 'lab' },
  { path: '/data/press-link-rot.json', label: 'Press · link-rot + Wayback', group: 'lab' },
  { path: '/data/factcheck.json', label: 'Fact-checks de terceros', group: 'lab' },
  // — Pleno editorial
  { path: '/data/pleno-findings.json', label: 'Hallazgos pleno · curados', group: 'pleno' },
  // The ungated monoliths (pleno-claims-{suggestions,verified}.json) are
  // curator/CLI-only and excluded from deploy (.vercelignore) so opinativa /
  // sin-datos accusation verbatim is never fetchable. The SPA reads the gated
  // chunk manifest instead — that's the published, health-tracked artifact.
  {
    path: '/data/pleno-claims/index.json',
    label: 'Pleno claims · verificados (chunks)',
    group: 'pleno',
  },
  { path: '/data/pleno-videos.json', label: 'Pleno · videos', group: 'pleno' },
]

function countOf(blob) {
  if (!blob || typeof blob !== 'object') return null
  if (Array.isArray(blob.items)) return blob.items.length
  if (Array.isArray(blob.contracts)) return blob.contracts.length
  if (Array.isArray(blob.suggestions)) return blob.suggestions.length
  if (blob.stats && typeof blob.stats.total === 'number') return blob.stats.total
  if (blob.totals && typeof blob.totals.items === 'number') return blob.totals.items
  // ctbg.json and consell-cv.json expose `matched[]` + stats.matchedEntries;
  // without these two the dashboard showed "—" for both, which reads as
  // "could not load" rather than "loaded, nothing matched".
  if (Array.isArray(blob.matched)) return blob.matched.length
  if (blob.stats && typeof blob.stats.matchedEntries === 'number') return blob.stats.matchedEntries
  if (Array.isArray(blob.docs)) return blob.docs.length
  if (Array.isArray(blob.dedicated) || Array.isArray(blob.sectoral))
    return (blob.dedicated?.length ?? 0) + (blob.sectoral?.length ?? 0)
  if (blob.snapshot && typeof blob.snapshot === 'object') return 1
  return null
}

async function fetchSource(src) {
  try {
    const res = await fetch(src.path, { cache: 'no-cache' })
    if (!res.ok) {
      return {
        ...src,
        status: 'missing',
        generatedAt: null,
        count: null,
        sizeBytes: null,
        error: `HTTP ${res.status}`,
      }
    }
    const text = await res.text()
    const sizeBytes = text.length
    let blob = null
    try {
      blob = JSON.parse(text)
    } catch {
      return {
        ...src,
        status: 'invalid',
        generatedAt: null,
        count: null,
        sizeBytes,
        error: 'invalid JSON',
      }
    }
    return {
      ...src,
      status: 'ok',
      generatedAt: blob?.generatedAt ?? null,
      count: countOf(blob),
      sizeBytes,
      error: null,
    }
  } catch (err) {
    return {
      ...src,
      status: 'missing',
      generatedAt: null,
      count: null,
      sizeBytes: null,
      error: err instanceof Error ? err.message : 'network error',
    }
  }
}

export function useLabHealth() {
  const [state, setState] = useState({ loading: true, rows: [] })

  useEffect(() => {
    let cancelled = false
    Promise.all(LAB_SOURCES.map(fetchSource)).then((rows) => {
      if (cancelled) return
      setState({ loading: false, rows })
    })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

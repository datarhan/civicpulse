// @ts-check
import { useEffect, useState } from 'react'
import { useJsonFetch } from './useJsonFetch'
import { useSnapshot } from './useSnapshot'
import { loadSnapshotData } from '../lib/snapshot-store'

export const CLAIM_TYPE_LABEL = {
  promesa: 'Promesa',
  afirmacion_numerica: 'Afirmación numérica',
  cita_obra: 'Obra citada',
  cita_convenio: 'Convenio citado',
  acusacion_publica: 'Acusación pública',
  valoracion_politica: 'Valoración política',
}

export const CLAIM_TYPE_TONE = {
  promesa: 'civic',
  afirmacion_numerica: 'intel',
  cita_obra: 'neutral',
  cita_convenio: 'ok',
  acusacion_publica: 'warn',
  valoracion_politica: 'neutral',
}

export const VERDICT_LABEL = {
  verificado: 'Verificado',
  parcial: 'Parcial',
  contradicho: 'Contradicho',
  'sin-datos': 'Sin datos',
  'promesa-repetida': 'Promesa repetida',
}

export const VERDICT_TONE = {
  verificado: 'ok',
  parcial: 'warn',
  contradicho: 'crit',
  'sin-datos': 'ghost',
  'promesa-repetida': 'intel',
}

const EMPTY_MANIFEST = { plenos: [], totals: { items: 0, byVerdict: {} } }
const EMPTY_CHUNK = { items: [] }

/**
 * Loads pleno-claims via the chunked layout produced by
 * `npm run chunk-pleno-claims` (called automatically at the end of
 * `verify:pleno-claims`):
 *
 *   public/data/pleno-claims/index.json    ← manifest (~12 KB)
 *   public/data/pleno-claims/<plenoId>.json ← per-pleno chunks
 *
 * Strategy: manifest first (small), then all chunks in parallel — every
 * fetch rides the session-cached snapshot store, so the corpus loads at
 * most once per SPA session no matter how many surfaces mount this hook
 * (/declaraciones + ClaimLedger on /departamentos/:slug share it), and
 * the chunk entries also serve /plenos/:id from cache. The `{items,
 * stats}` shape returned to the consumer is identical to the legacy
 * monolith so existing pages don't change.
 *
 * Falls back to an empty ledger when the manifest isn't generated yet
 * (feature ships honest-empty for the first run on a clean clone).
 */
export function usePlenoClaims() {
  const manifest = useSnapshot('/data/pleno-claims/index.json', EMPTY_MANIFEST)
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    if (manifest.loading) return undefined
    if (manifest.error) {
      setState({ loading: false, error: manifest.error, data: null })
      return undefined
    }
    let alive = true
    const plenos = manifest.data?.plenos ?? []
    Promise.all(plenos.map((p) => loadSnapshotData(`/data/${p.chunkPath}`)))
      .then((chunks) => {
        if (!alive) return
        const items = chunks.flatMap((c) => c?.items ?? [])
        setState({
          loading: false,
          error: null,
          data: {
            generatedAt: manifest.data?.generatedAt,
            items,
            stats: {
              total: manifest.data?.totals?.items ?? items.length,
              byVerdict: manifest.data?.totals?.byVerdict ?? {},
            },
          },
        })
      })
      .catch((error) => {
        if (alive) setState({ loading: false, error, data: null })
      })
    return () => {
      alive = false
    }
  }, [manifest.loading, manifest.error, manifest.data])
  return state
}

/**
 * Per-pleno claim descriptors (counts only) from the chunk manifest — the
 * light source for the /plenos index, which needs per-session verdict counts
 * but not the chunk bodies. 404 → empty.
 */
export function usePlenoClaimsManifest() {
  return useJsonFetch('/data/pleno-claims/index.json', EMPTY_MANIFEST)
}

/**
 * One pleno's verified claims (a single chunk) — the light source for the
 * /plenos/:id detail page. A falsy id fetches a sentinel path that 404s to
 * the empty fallback. 404 → empty items.
 */
export function usePlenoChunk(plenoId) {
  return useJsonFetch(
    plenoId ? `/data/pleno-claims/${plenoId}.json` : '/data/pleno-claims/__none__.json',
    EMPTY_CHUNK,
  )
}

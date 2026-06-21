// @ts-check
import { useEffect, useState } from 'react'
import { useJsonFetch } from './useJsonFetch'

export const CLAIM_TYPE_LABEL = {
  promesa: 'Promesa',
  afirmacion_numerica: 'Afirmación numérica',
  cita_obra: 'Obra citada',
  cita_convenio: 'Convenio citado',
  acusacion_publica: 'Acusación pública',
}

export const CLAIM_TYPE_TONE = {
  promesa: 'civic',
  afirmacion_numerica: 'intel',
  cita_obra: 'neutral',
  cita_convenio: 'ok',
  acusacion_publica: 'warn',
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

/**
 * Loads pleno-claims via the chunked layout produced by
 * `npm run chunk-pleno-claims` (called automatically at the end of
 * `verify:pleno-claims`):
 *
 *   public/data/pleno-claims/index.json    ← manifest (~8 KB)
 *   public/data/pleno-claims/<plenoId>.json ← per-pleno chunks
 *
 * Strategy: fetch the manifest first (small), then fetch all chunks
 * in parallel. The `{items, stats}` shape returned to the consumer is
 * identical to the legacy monolith so existing pages don't change.
 *
 * Vercel serves each chunk individually gzipped + edge-cached, and
 * HTTP/2 multiplexes the parallel fetches. With 11 plenos the
 * round-trip is ~1 wall-clock second on a fresh load and ~0 on
 * cached visits because the manifest's ETag changes only when at
 * least one chunk does.
 *
 * Falls back to an empty ledger when the manifest isn't generated yet
 * (feature ships honest-empty for the first run on a clean clone).
 */
export function usePlenoClaims() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const manifestRes = await fetch('/data/pleno-claims/index.json', { cache: 'no-cache' })
        if (manifestRes.status === 404) {
          if (alive) {
            setState({
              loading: false,
              error: null,
              data: { items: [], stats: { total: 0, byVerdict: {} } },
            })
          }
          return
        }
        if (!manifestRes.ok) {
          throw new Error(`pleno-claims manifest returned ${manifestRes.status}`)
        }
        const manifest = await manifestRes.json()
        const chunks = await Promise.all(
          (manifest.plenos ?? []).map(async (p) => {
            const r = await fetch(`/data/${p.chunkPath}`, { cache: 'no-cache' })
            if (!r.ok) throw new Error(`chunk ${p.chunkPath} returned ${r.status}`)
            return r.json()
          }),
        )
        const items = chunks.flatMap((c) => c.items ?? [])
        const data = {
          generatedAt: manifest.generatedAt,
          items,
          stats: {
            total: manifest.totals?.items ?? items.length,
            byVerdict: manifest.totals?.byVerdict ?? {},
          },
        }
        if (alive) setState({ loading: false, error: null, data })
      } catch (error) {
        if (alive) setState({ loading: false, error, data: null })
      }
    })()
    return () => {
      alive = false
    }
  }, [])
  return state
}

const EMPTY_MANIFEST = { plenos: [], totals: { items: 0, byVerdict: {} } }
const EMPTY_CHUNK = { items: [] }

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

// @ts-check
import { useMemo } from 'react'
import { useOfficials } from './useOfficials'
import { usePromises } from './usePromises'
import { usePlenoAgendas } from './usePlenoAgendas'
import { usePlenoVotes } from './usePlenoVotes'
import { useQuejas } from './useQuejas'
import { usePlenoClaimsManifest } from './usePlenoClaims'
import { computeDepartmentStats } from '../lib/department-stats'

/**
 * Aggregates six upstream snapshots into per-department stats keyed by
 * canonical DepartmentSlug. The heavy lifting lives in
 * src/lib/department-stats.js — this hook only fetches + memoizes.
 *
 * Sources: officials, promises, pleno-agendas, pleno-votes, quejas, and
 * the pleno-claims chunk manifest's totals.byTopicVerdict cross-tab
 * (~12 KB) — the same numbers the full chunk corpus would produce,
 * without downloading it (LLM-second-pass-aware: the chunker runs after
 * the base ⊕ overlay merge).
 *
 * Claims are NOT a blocker for the loading state — when the manifest is
 * missing or still loading, we render the rest of the page with
 * declaraciones=zero. This keeps /departamentos working while a long
 * verify run is in progress (it rewrites the files mid-run).
 *
 * Returns:
 *   { loading: boolean, error: Error|null, data: AggregateResult|null }
 */
export function useDepartmentStats() {
  const officials = useOfficials()
  const promises = usePromises()
  const agendas = usePlenoAgendas()
  const votes = usePlenoVotes()
  const quejas = useQuejas()
  const manifest = usePlenoClaimsManifest()

  // Required sources gate the loading state. Claims are best-effort —
  // a missing/erroring chunk manifest shouldn't block the dept page.
  const loading =
    officials.loading || promises.loading || agendas.loading || votes.loading || quejas.loading
  const error =
    officials.error || promises.error || agendas.error || votes.error || quejas.error || null

  const data = useMemo(() => {
    if (loading || error) return null
    return computeDepartmentStats({
      officials: officials.data,
      promises: promises.data,
      agendas: agendas.data,
      votes: votes.data,
      quejas: quejas.data,
      claimsSummary: manifest.error ? null : (manifest.data?.totals?.byTopicVerdict ?? null),
    })
  }, [
    loading,
    error,
    officials.data,
    promises.data,
    agendas.data,
    votes.data,
    quejas.data,
    manifest.data,
    manifest.error,
  ])

  // Worst-case freshness across the 5 required inputs. A page that
  // aggregates 5 sources is only as fresh as its oldest one.
  const generatedAt = useMemo(() => {
    const stamps = [
      officials.data?.generatedAt,
      promises.data?.generatedAt,
      agendas.data?.generatedAt,
      votes.data?.generatedAt,
      quejas.data?.generatedAt,
    ].filter(Boolean)
    return stamps.length > 0 ? stamps.sort()[0] : null
  }, [officials.data, promises.data, agendas.data, votes.data, quejas.data])

  return { loading, error, data, generatedAt }
}

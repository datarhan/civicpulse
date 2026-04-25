// @ts-check
import { useMemo } from 'react'
import { useOfficials } from './useOfficials'
import { usePromises } from './usePromises'
import { usePlenoAgendas } from './usePlenoAgendas'
import { usePlenoVotes } from './usePlenoVotes'
import { useQuejas } from './useQuejas'
import { usePlenoClaims } from './usePlenoClaims'
import { computeDepartmentStats } from '../lib/department-stats'

/**
 * Aggregates six upstream snapshots into per-department stats keyed by
 * canonical DepartmentSlug. The heavy lifting lives in
 * src/lib/department-stats.js — this hook only fetches + memoizes.
 *
 * Sources: officials, promises, pleno-agendas, pleno-votes, quejas,
 *          pleno-claims-verified (LLM-second-pass-aware).
 *
 * Claims are NOT a blocker for the loading state — when the verifier
 * snapshot is missing or still loading, we render the rest of the page
 * with declaraciones=zero. This keeps /departamentos working while a
 * long verify-llm run is in progress (it rewrites the file mid-run).
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
  const claims = usePlenoClaims()

  // Required sources gate the loading state. Claims are best-effort —
  // a missing/erroring verified.json shouldn't block the dept page.
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
      claims: claims.error ? null : claims.data,
    })
  }, [
    loading,
    error,
    officials.data,
    promises.data,
    agendas.data,
    votes.data,
    quejas.data,
    claims.data,
    claims.error,
  ])

  return { loading, error, data }
}

// @ts-check
import { useEffect, useState, useMemo } from 'react'
import { useOfficials } from './useOfficials'
import { usePromises } from './usePromises'
import { usePlenoAgendas } from './usePlenoAgendas'
import { usePlenoVotes } from './usePlenoVotes'
import { useQuejas } from './useQuejas'
import { computeDepartmentStats } from '../lib/department-stats'

/**
 * Aggregates the five upstream snapshots into per-department stats
 * keyed by canonical DepartmentSlug. The heavy lifting lives in
 * src/lib/department-stats.js — this hook only fetches + memoizes.
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
    })
  }, [loading, error, officials.data, promises.data, agendas.data, votes.data, quejas.data])

  return { loading, error, data }
}

// @ts-check
import { useEffect, useState } from 'react'

export const OUTCOME_LABEL = {
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  retirado: 'Retirado',
  aplazado: 'Aplazado',
}

export const OUTCOME_TONE = {
  aprobado: 'ok',
  rechazado: 'crit',
  retirado: 'neutral',
  aplazado: 'warn',
}

export const DIRECTION_LABEL = {
  a_favor: 'A favor',
  en_contra: 'En contra',
  abstencion: 'Abstención',
  ausente: 'Ausente',
}

export const DIRECTION_TONE = {
  a_favor: 'ok',
  en_contra: 'crit',
  abstencion: 'warn',
  ausente: 'neutral',
}

export function usePlenoVotes() {
  const [state, setState] = useState({ loading: true, error: null, data: null })

  useEffect(() => {
    let alive = true
    fetch('/data/pleno-votes.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => { if (alive) setState({ loading: false, error: null, data }) })
      .catch((error) => { if (alive) setState({ loading: false, error, data: null }) })
    return () => { alive = false }
  }, [])

  return state
}

/** Count how many votes each bloc has cast *a favor* / *en contra* / *abstención*
 *  across a filtered set of records. Used by /plenos to show party alignment. */
export function tallyByBloc(items) {
  const tally = {}
  for (const rec of items || []) {
    for (const v of rec.votes || []) {
      const row = (tally[v.bloc] ||= { a_favor: 0, en_contra: 0, abstencion: 0, ausente: 0, total: 0 })
      row[v.direction] = (row[v.direction] || 0) + 1
      row.total += 1
    }
  }
  return tally
}

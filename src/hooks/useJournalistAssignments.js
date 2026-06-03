// @ts-check
import { useEffect, useState } from 'react'

export const ASSIGNMENT_STATUS_LABEL = {
  pending: 'Pendiente',
  running: 'Ejecutando',
  drafted: 'Borrador',
  promoted: 'Publicado',
  failed: 'Fallido',
}

export const ASSIGNMENT_STATUS_TONE = {
  pending: 'ghost',
  running: 'intel',
  drafted: 'warn',
  promoted: 'ok',
  failed: 'crit',
}

export function useJournalistAssignments() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let alive = true
    fetch('/data/journalist-assignments.json', { cache: 'no-cache' })
      .then((r) => {
        if (r.status === 404) return { version: '1.0', generatedAt: '', items: [] }
        if (!r.ok) throw new Error(`journalist-assignments returned ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (alive) setState({ loading: false, error: null, data })
      })
      .catch((error) => {
        if (alive) setState({ loading: false, error, data: null })
      })
    return () => {
      alive = false
    }
  }, [])
  return state
}

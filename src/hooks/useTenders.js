// @ts-check
import { useEffect, useState } from 'react'

export function useTenders() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let cancelled = false
    fetch('/data/tenders.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`tenders.json returned ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data })
      })
      .catch((err) => {
        if (!cancelled) setState({ loading: false, error: err, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [])
  return state
}

export const STATUS_LABEL = {
  awarded: 'Adjudicado',
  revoked: 'Desistido',
  in_progress: 'En curso',
  open: 'Abierto',
  finalized: 'Finalizado',
  draft: 'Borrador',
  pending: 'Pendiente',
  closed: 'Cerrado',
  evaluation: 'Valoración',
  withdrawn: 'Retirado',
  unknown: 'Sin clasificar',
}

export const STATUS_TONE = {
  awarded: 'ok',
  revoked: 'warn',
  in_progress: 'civic',
  open: 'civic',
  finalized: 'neutral',
  draft: 'ghost',
  pending: 'ghost',
  closed: 'neutral',
  evaluation: 'civic',
  withdrawn: 'warn',
  unknown: 'ghost',
}

export function formatDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

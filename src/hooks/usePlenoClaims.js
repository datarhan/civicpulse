// @ts-check
import { useEffect, useState } from 'react'

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
 * Loads public/data/pleno-claims-verified.json — the snapshot produced by
 * `npm run verify:pleno-claims` that zips every extracted claim with its
 * deterministic verdict. Falls back to an empty ledger when the file
 * isn't generated yet (feature ships honest-empty).
 */
export function usePlenoClaims() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let alive = true
    fetch('/data/pleno-claims-verified.json', { cache: 'no-cache' })
      .then((r) => {
        // 404 is expected when the verifier hasn't run yet — treat as empty.
        if (r.status === 404) return { items: [], stats: { total: 0, byVerdict: {} } }
        if (!r.ok) throw new Error(`pleno-claims-verified returned ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (alive) setState({ loading: false, error: null, data })
      })
      .catch((error) => {
        if (alive) setState({ loading: false, error, data: null })
      })
    return () => {
      alive = true
    }
  }, [])
  return state
}

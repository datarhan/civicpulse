// @ts-check
import { useEffect, useState } from 'react'

export function usePromises() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let cancelled = false
    fetch('/data/promises.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`promises.json returned ${r.status}`)
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

export function usePromiseSuggestions() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let cancelled = false
    fetch('/data/promise-suggestions.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`promise-suggestions.json returned ${r.status}`)
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

export function isPromiseFrozen(snap, now = new Date()) {
  if (!snap?.frozenUntil) return false
  try {
    return now < new Date(snap.frozenUntil)
  } catch {
    return false
  }
}

export const PARTY_TONE = {
  PSOE: '#D01832',
  PP: '#2463EB',
  VOX: '#3A8018',
  'Compromís': '#A06116',
  Otro: '#64748B',
}

export const STATUS_LABEL = {
  'documentada': 'Documentada',
  'en-verificacion': 'En verificación',
  'en-progreso': 'En progreso',
  'cumplida': 'Cumplida',
  'parcial': 'Parcial',
  'no-ejecutada': 'No ejecutada',
  'inviable': 'Inviable',
}

export const STATUS_TONE = {
  'documentada': 'ghost',
  'en-verificacion': 'civic',
  'en-progreso': 'civic',
  'cumplida': 'ok',
  'parcial': 'warn',
  'no-ejecutada': 'crit',
  'inviable': 'neutral',
}

export const TOPIC_LABEL = {
  fiscal: 'Fiscal',
  vivienda: 'Vivienda',
  movilidad: 'Movilidad',
  'medio-ambiente': 'Medio ambiente',
  social: 'Acción social',
  cultura: 'Cultura',
  seguridad: 'Seguridad',
  empleo: 'Empleo',
  urbanismo: 'Urbanismo',
  salud: 'Salud',
  participacion: 'Participación',
  educacion: 'Educación',
  deporte: 'Deporte',
  juventud: 'Juventud',
  mayores: 'Mayores',
  igualdad: 'Igualdad',
  transparencia: 'Transparencia',
  other: 'Otros',
}

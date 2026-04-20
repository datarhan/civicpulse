import { useEffect, useState } from 'react'

export const STATE_LABEL = {
  capturada: 'Capturada',
  apoyada_verificada: 'Verificada',
  registrada: 'Registrada en sede',
  notificada_10d: 'Acuse recibido',
  en_tramite: 'En trámite',
  resuelta: 'Resuelta',
  silencio_negativo: 'Silencio administrativo',
  escalada_sindic: 'Escalada al Síndic',
  cerrada_no_registrada: 'Cerrada sin registrar',
}

export const STATE_TONE = {
  capturada: 'neutral',
  apoyada_verificada: 'civic',
  registrada: 'civic',
  notificada_10d: 'civic',
  en_tramite: 'intel',
  resuelta: 'ok',
  silencio_negativo: 'warn',
  escalada_sindic: 'crit',
  cerrada_no_registrada: 'ghost',
}

export const CATEGORY_LABEL = {
  via_publica: 'Vía pública',
  limpieza: 'Limpieza',
  zonas_verdes: 'Zonas verdes',
  alumbrado: 'Alumbrado',
  trafico: 'Tráfico',
  mobiliario_urbano: 'Mobiliario urbano',
  ruido: 'Ruido',
  agua_saneamiento: 'Agua y saneamiento',
  transporte: 'Transporte',
  transparencia: 'Transparencia',
  urbanismo: 'Urbanismo',
  accesibilidad: 'Accesibilidad',
  seguridad: 'Seguridad',
  cultura: 'Cultura',
  educacion: 'Educación',
  servicios_sociales: 'Servicios sociales',
  medio_ambiente: 'Medio ambiente',
  residuos: 'Residuos',
  comercio: 'Comercio',
  fiestas: 'Fiestas',
  vivienda: 'Vivienda',
  agricultura: 'Agricultura',
  mayores: 'Mayores',
  juventud: 'Juventud',
  turismo: 'Turismo',
  salud: 'Salud',
  deportes: 'Deportes',
  igualdad: 'Igualdad',
  bienestar_animal: 'Bienestar animal',
  otros: 'Otros',
}

export function useQuejas() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let cancelled = false
    fetch('/data/quejas.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`quejas.json ${r.status}`)
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

export function useQuejaResponses() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let cancelled = false
    fetch('/data/quejas-responses.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`quejas-responses.json ${r.status}`)
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

export function prettyNeighborhood(slug) {
  if (!slug) return ''
  return slug
    .split(/[-_\s]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export function timeAgo(iso) {
  if (!iso) return ''
  const now = Date.now()
  const then = new Date(iso).getTime()
  const mins = Math.round((now - then) / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 30) return `hace ${days} d`
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

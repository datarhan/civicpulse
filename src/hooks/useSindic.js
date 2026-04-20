import { useEffect, useState } from 'react'

export const SINDIC_MATERIA_LABEL = {
  urbanismo: 'Urbanismo',
  vivienda: 'Vivienda',
  'medio-ambiente': 'Medio ambiente',
  'via-publica': 'Vía pública',
  'servicios-publicos': 'Servicios públicos',
  seguridad: 'Seguridad',
  'hacienda-tributaria': 'Hacienda',
  transparencia: 'Transparencia',
  contratacion: 'Contratación',
  'servicios-sociales': 'Servicios sociales',
  salud: 'Salud',
  educacion: 'Educación',
  igualdad: 'Igualdad',
  cultura: 'Cultura',
  otros: 'Otros',
}

export const SINDIC_SENTIDO_LABEL = {
  recomendacion: 'Recomendación',
  sugerencia: 'Sugerencia',
  'recordatorio-deberes': 'Recordatorio de deberes legales',
  'cierre-sin-recomendacion': 'Cierre sin recomendación',
  inadmitida: 'Inadmitida',
  archivada: 'Archivada',
}

export const SINDIC_SENTIDO_TONE = {
  recomendacion: 'warn',
  sugerencia: 'civic',
  'recordatorio-deberes': 'crit',
  'cierre-sin-recomendacion': 'ok',
  inadmitida: 'ghost',
  archivada: 'ghost',
}

export function useSindic() {
  const [state, setState] = useState({ loading: true, error: null, data: null })
  useEffect(() => {
    let cancelled = false
    fetch('/data/sindic.json', { cache: 'no-cache' })
      .then((r) => {
        if (!r.ok) throw new Error(`sindic.json ${r.status}`)
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

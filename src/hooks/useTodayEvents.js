// @ts-check
import { useMemo } from 'react'
import { useParticipa, KIND_ICON, KIND_LABEL } from './useParticipa'

/**
 * Filter participa.ribarroja.es posts to "hoy y mañana" for a small
 * event ticker on the landing map. Pure projection over the snapshot
 * loaded by useParticipa — zero extra network.
 *
 * The participa feed publishes both "actividades" (events) and
 * "encuestas" (consultations). We show both; the UI distinguishes them
 * via the KIND_ICON emoji from useParticipa.
 *
 * Rolling window: today + tomorrow (local time), so the ticker stays
 * relevant for someone checking the dashboard in the evening before a
 * next-day event.
 */

function isoDay(date) {
  return date.toISOString().slice(0, 10)
}

export function useTodayEvents() {
  const { data, loading, error } = useParticipa()

  const events = useMemo(() => {
    if (!data?.items) return []
    const today = isoDay(new Date())
    const tomorrow = isoDay(new Date(Date.now() + 24 * 60 * 60 * 1000))
    return data.items
      .filter((it) => {
        const day = (it.date || '').slice(0, 10)
        return day === today || day === tomorrow
      })
      .map((it) => ({
        id: it.id,
        title: it.title,
        kind: it.kind,
        icon: KIND_ICON[it.kind] || '📢',
        kindLabel: KIND_LABEL[it.kind] || 'Participación',
        date: it.date,
        url: it.link,
        isToday: it.date?.slice(0, 10) === today,
      }))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
  }, [data])

  return { loading, error, events }
}

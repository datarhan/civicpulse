import { useJsonFetch } from './useJsonFetch'

// 404-fallback (module-level constant → stable ref, no re-fetch churn).
const EMPTY_EVENTS = {
  generatedAt: null,
  source: null,
  stats: { total: 0, upcoming: 0, nextDate: null },
  events: [],
}

/**
 * Official municipal events / agenda feed (public/data/events.json), produced
 * by scrape-events.ts from ribarroja.es/es/eventos/rss.xml.
 */
export function useEvents() {
  return useJsonFetch('/data/events.json', EMPTY_EVENTS)
}

/** Upcoming events (eventDate in the future), soonest first. */
export function upcomingEvents(data, now = new Date()) {
  const iso = now.toISOString()
  return (data?.events || []).filter((e) => e.eventDate && e.eventDate >= iso)
}

/**
 * Format an event's ISO datetime as a short "12 jul" label, in the interface
 * language: the landing in valencià wrote the Castilian month.
 */
export function formatEventWhen(eventDate, eventDateText, idioma = 'es') {
  if (!eventDate) return eventDateText || ''
  const d = new Date(eventDate)
  if (!Number.isFinite(d.getTime())) return eventDateText || ''
  return d.toLocaleDateString(idioma === 'ca' ? 'ca-ES' : 'es-ES', {
    day: 'numeric',
    month: 'short',
  })
}

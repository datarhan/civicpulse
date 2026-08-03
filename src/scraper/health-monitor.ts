/**
 * Health signals worth waking a human for, and the rules that decide.
 *
 * This repo has ten checks and no delivery. They run nightly, write to logs,
 * and the logs are read when someone already suspects a problem — which is
 * exactly the moment a monitor is no longer useful. Every incident this week
 * was found by looking, not by being told: the bot had been down for hours, the
 * nightly had been red for three days, an embedding corpus had been silently
 * returning nothing, and a merge conflict sat in `main` for a day.
 *
 * So the scarce resource is not detection, it is ATTENTION. Two consequences
 * shape everything here:
 *
 *   · Only signals a person would act on TODAY get pushed. Vocabulary drift and
 *     best-effort cadence stay in the log where they belong. A monitor that
 *     reports everything gets muted, and a muted monitor is worse than none —
 *     it looks like coverage.
 *   · Every alert must name the CAUSE and the remedy. "Pipeline stalled" sends
 *     you digging; "OpenAI has no credit, add funds at <url>" is fixable from a
 *     phone. That difference is the whole product.
 *
 * Pure module: observations in, alerts out. No fs, no network, no clock — the
 * caller supplies `now`, so the rules are testable without waiting three days
 * for a real stall.
 */

export type Severity = 'critical' | 'warning'

export interface Alert {
  code: string
  severity: Severity
  title: string
  /** What is wrong, in one sentence a person can act on. */
  detail: string
  /** What to do about it. Omitted when the cause is not yet known. */
  remedy?: string
}

/** Everything the rules need, gathered by the caller. */
export interface Observations {
  now: Date
  /** Long-running jobs: when each last made progress, and whether work remains. */
  pipelines: {
    name: string
    lastProgressAt: Date | null
    pending: number
    /** Stall threshold in days — differs per pipeline cadence. */
    stallDays: number
    /** Diagnosed cause, when the caller could determine one. */
    cause?: string | null
  }[]
  /** Bot /health reachability. null = not checked. */
  botHealthy: boolean | null
  /** Public site reachability. null = not checked. */
  siteHealthy: boolean | null
  /** Newest published item per feed-backed dataset. */
  sources: { name: string; newestItemAt: Date | null; expectDays: number }[]
  /** Consecutive failed nightly runs. */
  nightlyFailStreak: number
  /** Integrity check failures, already run by the caller. */
  integrity: { check: string; message: string }[]
}

/** A nightly can fail once for a flaky upstream; three in a row is a pattern. */
export const NIGHTLY_STREAK_ALARM = 3

export function evaluateHealth(o: Observations): Alert[] {
  const alerts: Alert[] = []

  // 1 · The bot. Highest stakes in the system: while it is down a citizen files
  // a queja and nothing receives it. There is no retry and no queue — the
  // message is simply lost, and the person believes they reported something.
  if (o.botHealthy === false) {
    alerts.push({
      code: 'bot-down',
      severity: 'critical',
      title: 'El bot no responde',
      detail:
        'Mientras esté caído, las quejas que envíe cualquier vecino se pierden: no hay reintento ' +
        'ni cola, y quien escribe cree que ha denunciado algo.',
      remedy: 'Revisa `fly status` y `fly logs` en munigraph-ribarroja.',
    })
  }

  if (o.siteHealthy === false) {
    alerts.push({
      code: 'site-down',
      severity: 'critical',
      title: 'La web pública no responde',
      detail: 'civicpulse.es no devuelve 200.',
      remedy: 'Comprueba el último despliegue en Vercel.',
    })
  }

  // 2 · Stalled pipelines. Silent by construction: nothing changes on the site,
  // the work simply stops happening.
  for (const p of o.pipelines) {
    if (p.pending <= 0) continue
    const days =
      p.lastProgressAt === null
        ? Infinity
        : (o.now.getTime() - p.lastProgressAt.getTime()) / 86_400_000
    if (days < p.stallDays) continue
    alerts.push({
      code: `stall:${p.name}`,
      severity: 'warning',
      title: `${p.name} sin avanzar`,
      detail: `${p.pending} pendiente(s) y ${days === Infinity ? 'ningún avance registrado' : `sin avance desde hace ${days.toFixed(1)} días`}.`,
      remedy: p.cause ?? undefined,
    })
  }

  // 3 · A source that stopped publishing. The hard part is that "the town hall
  // is quiet in August" and "our scraper broke" look identical from here — the
  // file refreshes nightly either way. This only reports the observation and
  // says so honestly rather than asserting a fault.
  for (const s of o.sources) {
    if (s.newestItemAt === null) continue
    const days = (o.now.getTime() - s.newestItemAt.getTime()) / 86_400_000
    if (days < s.expectDays) continue
    alerts.push({
      code: `silent:${s.name}`,
      severity: 'warning',
      title: `${s.name} sin contenido nuevo`,
      detail:
        `El ítem más reciente tiene ${days.toFixed(1)} días (se esperaba algo cada ${s.expectDays}). ` +
        `El fichero se regenera cada noche, así que esto NO distingue por sí solo entre ` +
        `"la fuente está callada" y "el scraper se rompió".`,
      remedy: 'Abre el feed original y compara con nuestro ítem más reciente.',
    })
  }

  if (o.nightlyFailStreak >= NIGHTLY_STREAK_ALARM) {
    alerts.push({
      code: 'nightly-red',
      severity: 'warning',
      title: `Nocturna en rojo ${o.nightlyFailStreak} noches seguidas`,
      detail:
        'Los datos que sí se refrescan se comitean igual, pero el despliegue queda bloqueado, ' +
        'así que la web se queda con lo último que subió una persona.',
      remedy: 'gh run list --workflow=nightly-scrape.yml',
    })
  }

  for (const i of o.integrity) {
    alerts.push({
      code: `integrity:${i.check}`,
      severity: 'critical',
      title: `Integridad: ${i.check}`,
      detail: i.message,
      remedy: `npm run ${i.check}`,
    })
  }

  return alerts
}

/** Stable key for de-duplication: same problems ⇒ same fingerprint. */
export function alertFingerprint(alerts: readonly Alert[]): string {
  return alerts
    .map((a) => a.code)
    .sort()
    .join('|')
}

export function formatAlerts(alerts: readonly Alert[]): string {
  if (alerts.length === 0) return ''
  const crit = alerts.filter((a) => a.severity === 'critical')
  const warn = alerts.filter((a) => a.severity === 'warning')
  const lines: string[] = []
  lines.push(`<b>CivicPulse · ${alerts.length} aviso(s)</b>`)
  for (const a of [...crit, ...warn]) {
    lines.push('')
    lines.push(`${a.severity === 'critical' ? '🔴' : '🟠'} <b>${a.title}</b>`)
    lines.push(a.detail)
    if (a.remedy) lines.push(`↳ <i>${a.remedy}</i>`)
  }
  return lines.join('\n')
}

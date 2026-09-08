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

/**
 * Cuántas noches seguidas lleva la nocturna sin terminar en verde.
 *
 * Recibe las conclusiones de GitHub Actions de la más reciente a la más
 * antigua. Corta con el primer `success`, porque la racha es lo que va desde
 * hoy hacia atrás.
 *
 * Contaba SÓLO `failure` y cortaba con cualquier otra cosa, y ahí se perdía
 * entera: una nocturna que agota su tiempo concluye `cancelled`, de modo que un
 * `cancelled` a la cabeza devolvía 0. El 7-09-2026 el digest publicó
 * «nocturnas-en-rojo=0» sobre `['cancelled','failure','failure','failure',
 * 'cancelled','success']` —cinco noches sin verde— y la alarma, que salta a las
 * tres, llevaba tres días sin poder saltar mientras `officials.json` y
 * `transparency-docs.json` se quedaban congelados a la vista de todos.
 *
 * La regla es la 2 de DATA_INTEGRITY: una ejecución tiene que DEMOSTRAR que
 * hizo el trabajo. `cancelled`, `timed_out` y `skipped` no lo demuestran, así
 * que cuentan como noche roja igual que `failure`. Sólo el verde absuelve.
 *
 * Una ejecución todavía viva (`conclusion` nula) no ha concluido nada: ni suma
 * ni corta. Si cortara, lanzar la nocturna a mano silenciaría la racha entera
 * mientras corre, que es el mismo agujero por otra puerta.
 */
export function contarNochesEnRojo(conclusiones: readonly (string | null | undefined)[]): number {
  let n = 0
  for (const c of conclusiones ?? []) {
    if (c == null || c === '') continue // en curso: aún no ha concluido
    if (c === 'success') break
    n++
  }
  return n
}

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

/**
 * Cuánto texto de un check cabe en su aviso.
 *
 * Eran 200 y la frase de `nothing-attempted` se cortaba a media palabra, justo
 * antes de «setup, credentials or a dependency» — que es la mitad accionable.
 */
export const CHECK_DETAIL_MAX = 320

/**
 * Un renglón que un check marca como hallazgo: `ERROR`, `FATAL` o `✗`.
 *
 * Kebab-case con al menos un guion, para que `[nothing-attempted]` cuente y
 * `[0.0` o `[12` no.
 */
const FINDING_LINE_RE = /(?:^|\s)(?:ERROR|FATAL)\b|✗/
const FINDING_CODE_RE = /\[([a-z0-9]+(?:-[a-z0-9]+)+)\]/g

/**
 * El renglón de un check que explica QUÉ falló, no cuántos fallos hubo.
 *
 * `monitor-health` se quedaba con las dos últimas líneas de un check caído. Casi
 * todos imprimen sus hallazgos primero y su resumen al final, así que lo que
 * llegaba al móvil era la aritmética: «5 run(s) · 4 error(s)», sin decir cuáles.
 * El 19-ago eso fue la diferencia entre un aviso accionable y cuatro noches de
 * barrido muerto — el motivo, una descarga rota, estaba tres líneas más arriba.
 *
 * Prefiere los renglones marcados; si no hay ninguno cae a la cola de siempre,
 * así que un check que ya se leía bien no empeora.
 */
export function pickCheckDiagnosis(output: string): string {
  const lines = output
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const flagged = lines.filter((l) => FINDING_LINE_RE.test(l))
  if (flagged.length === 0) return lines.slice(-2).join(' · ').slice(0, CHECK_DETAIL_MAX) || 'falló'

  // El recuento por TIPO, no dos renglones cualesquiera. Medido contra los
  // manifiestos reales del 19 al 22-ago-2026: una semana de `check:runs` son
  // ~14 hallazgos de tres clases repetidas y una decena de cabeceras `✗`, así
  // que quedarse con los dos primeros renglones marcados devolvía dos cabeceras
  // y se dejaba fuera el `nothing-attempted` que explicaba la avería.
  //
  // Nombrar todas las clases también es lo que hace útil la huella: los códigos
  // van entre corchetes a propósito, porque `alertFingerprint` los lee de aquí.
  // Así, una clase de fallo NUEVA vuelve a sonar aunque las otras sigan igual.
  const tally = new Map<string, number>()
  for (const l of flagged) {
    const m = /\[([a-z0-9]+(?:-[a-z0-9]+)+)\]/.exec(l)
    if (m) tally.set(m[1], (tally.get(m[1]) ?? 0) + 1)
  }
  const head = [...tally].map(([code, n]) => `[${code}]×${n}`).join(' · ')
  // `flagged[0]` y no el primero con código: en `check:runs` el primer renglón
  // marcado es la pasada MÁS vencida, que no lleva código y es justo el hecho
  // que nueve días de silencio hicieron caro en agosto de 2026.
  return (head ? `${head} — ${flagged[0]}` : flagged.slice(0, 2).join(' · ')).slice(
    0,
    CHECK_DETAIL_MAX,
  )
}

/**
 * Stable key for de-duplication: same problems ⇒ same fingerprint.
 *
 * La huella era sólo `a.code`, y eso silenció el único aviso que sirvió. El
 * 19-ago `check:runs` avisó sin nombrar el fallo; el 21 avisó nombrándolo
 * —`nothing-attempted`— y se descartó por repetido, porque para la huella los
 * dos eran `integrity:check:runs`. Un fallo DISTINTO del mismo check tiene que
 * volver a sonar.
 *
 * Se añaden los códigos de hallazgo, no el texto entero: `check:cadence` y
 * `check:surfaces` llevan cifras y listas de rutas que cambian en cada pasada, y
 * meterlas aquí cambiaría un aviso perdido por un aviso cada dos días, que es la
 * fatiga que `RENOTIFY_DAYS` existe para evitar. Estrictamente más sensible que
 * antes, e inerte para los checks que no emiten códigos.
 */
export function alertFingerprint(alerts: readonly Alert[]): string {
  return alerts
    .map((a) => {
      const codes = [...new Set([...a.detail.matchAll(FINDING_CODE_RE)].map((m) => m[1]))].sort()
      return codes.length > 0 ? `${a.code}(${codes.join(',')})` : a.code
    })
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

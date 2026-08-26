// @ts-check
/**
 * Pure freshness helpers for snapshot-driven pages.
 *
 * The dashboard runs entirely off static JSON files refreshed nightly.
 * When a scraper silently breaks the SPA happily renders the previous
 * snapshot — the reader has no way to know they're looking at stale
 * data. These helpers map a `generatedAt` ISO string onto a tone
 * (matching the existing <Pill> enum) and a numeric age, so the
 * <DataAsOf> chip + /lab-health page can show staleness consistently.
 *
 * Boundaries chosen so a daily scraper that ran ~12h ago is still
 * `ok`, a weekly job is `civic` (notable but expected), a month is
 * `warn` (action item for the curator), and >30d is `crit` (something
 * is genuinely broken).
 *
 * Esos umbrales planos son la respuesta a «¿cuánto tiempo tiene?», y siguen
 * siendo el defecto. Lo que NO pueden hacer solos es afirmar «likely broken»:
 * eso es un juicio de cadencia, y depende del plazo que tenga pactado cada
 * fichero. `promises.json` es clase `curated` con 120 días — a 51 días
 * `check:cadence` lo daba verde y esta píldora lo pintaba `crit` en
 * /departamentos. Por eso `freshnessTone` acepta ahora un presupuesto
 * opcional: con él, el tono de lectura y la puerta de cadencia dicen lo
 * mismo; sin él, nada cambia.
 */
import { expectationFor } from '../scraper/snapshot-cadence'

/** Hours since the given ISO date. Returns +Infinity for missing/invalid input. */
export function ageHours(iso, now = Date.now()) {
  if (!iso || typeof iso !== 'string') return Number.POSITIVE_INFINITY
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY
  return Math.max(0, (now - t) / (1000 * 60 * 60))
}

/**
 * Maps freshness onto the <Pill> tone enum:
 *   < 36 h   → 'ok'    (fresh — well within a nightly cadence)
 *   < 7 d    → 'civic' (recent — weekly job, expected)
 *   < 30 d   → 'warn'  (stale — curator should check)
 *   >= 30 d  → 'crit'  (dead — likely broken)
 * Missing/invalid ISO → 'crit' (we treat absence as broken signal,
 * not as "unknown"; the page renders something either way).
 *
 * Con `budgetDays` (el `maxAgeDays` que el fichero tiene registrado en
 * `DEFAULT_EXPECTATIONS`) los cortes se escalan a ese plazo:
 *   < 0,5·B → 'ok'   · < B → 'civic'   · < 1,5·B → 'warn'   · resto → 'crit'
 * Un presupuesto ausente, cero o negativo cae a los umbrales planos.
 *
 * @param {string|null|undefined} iso
 * @param {number} [now]
 * @param {number|null} [budgetDays]
 * @returns {'ok'|'civic'|'warn'|'crit'}
 */
export function freshnessTone(iso, now = Date.now(), budgetDays = null) {
  const h = ageHours(iso, now)
  const budgetHours =
    typeof budgetDays === 'number' && Number.isFinite(budgetDays) && budgetDays > 0
      ? budgetDays * 24
      : null
  if (budgetHours === null) {
    if (h < 36) return 'ok'
    if (h < 24 * 7) return 'civic'
    if (h < 24 * 30) return 'warn'
    return 'crit'
  }
  // Escalado al plazo del propio fichero. El corte de `warn` cae exactamente
  // donde `classifyFreshness` empieza a decir `stale`, que es lo que hace que
  // los dos módulos dejen de contradecirse.
  if (h < 0.5 * budgetHours) return 'ok'
  if (h < budgetHours) return 'civic'
  if (h < 1.5 * budgetHours) return 'warn'
  return 'crit'
}

/** i18n key for the freshness bucket. The actual label lives in i18n.jsx. */
export function freshnessLabelKey(iso, now = Date.now(), budgetDays = null) {
  const tone = freshnessTone(iso, now, budgetDays)
  if (tone === 'ok') return 'freshness.fresh'
  if (tone === 'civic') return 'freshness.recent'
  if (tone === 'warn') return 'freshness.stale'
  return 'freshness.dead'
}

/** Orden de gravedad de los tonos, de mejor a peor. */
const TONE_ORDER = ['ok', 'civic', 'warn', 'crit']

/**
 * El veredicto de frescura de una página que agrega VARIAS fuentes.
 *
 * /departamentos publicaba `stamps.sort()[0]` —la fecha más vieja— y la pintaba
 * con el umbral plano. Eso hacía dos cosas mal a la vez. La visible: fijaba la
 * píldora en `promises.json`, curado y con derecho a ser viejo, y gritaba
 * «likely broken» sobre una página cuyas tres fuentes automáticas se habían
 * refrescado esa misma madrugada. La invisible, y peor: si mañana un raspador
 * NOCTURNO se para cuarenta días, el `min()` sigue eligiendo el curado —que es
 * más viejo aún— y lo pinta tranquilo. El fallo real queda tapado por el
 * fichero que tiene permiso para estar viejo.
 *
 * Así que se separan las dos preguntas. La FECHA que se enseña sigue siendo la
 * más vieja, porque es cierto que ése es el material más antiguo de la página y
 * borrarlo sería esconder un dato. El TONO es el PEOR de todos, midiendo cada
 * fuente contra su propio plazo, y `pinnedBy` dice cuál lo provoca — que es lo
 * único accionable cuando algo se rompe.
 *
 * @param {Array<{file?: string|null, label: string, iso: string|null|undefined}>} inputs
 * @param {number} [now]
 * @returns {{
 *   tone: 'ok'|'civic'|'warn'|'crit',
 *   oldestIso: string|null,
 *   pinnedBy: {file?: string|null, label: string, iso: string|null|undefined, budgetDays: number|null, tone: string, ageHours: number}|null,
 *   inputs: Array<{file?: string|null, label: string, iso: string|null|undefined, budgetDays: number|null, tone: string, ageHours: number}>,
 * }}
 */
export function worstFreshness(inputs, now = Date.now()) {
  const scored = (inputs ?? []).map((i) => {
    const budgetDays = expectationFor(i.file)?.maxAgeDays ?? null
    return {
      ...i,
      budgetDays,
      tone: freshnessTone(i.iso, now, budgetDays),
      ageHours: ageHours(i.iso, now),
    }
  })
  // Sin fuentes no hay veredicto que dar, y `ok` sería inventárselo: una página
  // que no sabe de qué se alimenta no está sana, está muda.
  if (scored.length === 0) return { tone: 'crit', oldestIso: null, pinnedBy: null, inputs: [] }

  const rank = (/** @type {string} */ t) => TONE_ORDER.indexOf(t)
  let pinnedBy = scored[0]
  for (const s of scored.slice(1)) {
    const better = rank(s.tone) - rank(pinnedBy.tone)
    if (better > 0 || (better === 0 && s.ageHours > pinnedBy.ageHours)) pinnedBy = s
  }

  const conFecha = scored.filter((s) => Number.isFinite(s.ageHours))
  const oldestIso = conFecha.length
    ? (conFecha.reduce((a, b) => (a.ageHours >= b.ageHours ? a : b)).iso ?? null)
    : null

  return {
    tone: /** @type {'ok'|'civic'|'warn'|'crit'} */ (pinnedBy.tone),
    oldestIso,
    pinnedBy,
    inputs: scored,
  }
}

/**
 * Run manifests — "did this run actually do work?"
 *
 * Every scraper and LLM pass here already prints progress, but progress is
 * self-reported: a script can only tell you what it *believes* happened. That
 * belief has been wrong in every expensive way this repo has seen.
 *
 *   · A verdict pass reported `re-judged 1017 · kept 1017` having made zero
 *     successful LLM calls. Its own counters were internally consistent; the
 *     backend had simply stopped answering, and "the model agreed with
 *     everything" and "the model was never asked" printed identically.
 *   · A retrieval bug made every similarity score 0, so 653 claims were
 *     reported as having no candidates — indistinguishable from a corpus that
 *     genuinely held nothing relevant.
 *   · A nightly scrape ran green for weeks while committing nothing, because
 *     "nothing changed" and "nothing ran" collapsed into the same exit code.
 *
 * The shared shape of all three: a run that did nothing looked exactly like a
 * run with nothing to do. A manifest separates them by recording the four
 * counts that must add up — attempted, judged, never-attempted, skipped —
 * alongside LLM traffic measured one layer below the script, in the client
 * itself, where the script's beliefs cannot reach.
 *
 * `assessManifest` is pure and is the part under test. Rule 2 in
 * docs/DATA_INTEGRITY.md ("a run must prove it did work") is what this
 * implements.
 */

import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import type { RunStats } from '../llm/client'

/**
 * Where manifests land. Overridable ONLY so a test can point a real script's
 * run somewhere disposable: this directory is `check:runs`'s entire input, so a
 * test that exercises a failing pass against the default would leave a genuine
 * red in the health digest and teach everybody to ignore it.
 */
export const MANIFEST_DIR = process.env.RUN_MANIFEST_DIR || '.run-manifests'

/**
 * LLM traffic for a pass that makes none.
 *
 * `startRun` was built for the LLM passes, so `getStats` returns the client's
 * `RunStats` and `formatManifest` reads `llm.tokens` off it. A deterministic
 * scraper has no client to ask, and passing its own counters instead crashes
 * the formatter — which is how `check:runs` broke the first time a plain
 * adapter was instrumented. Zero calls is also the honest reading: the pass
 * really did make none.
 */
export const NO_LLM_STATS: RunStats = Object.freeze({
  calls: 0,
  cacheHits: 0,
  ok: 0,
  failed: 0,
  zeroTokenFailures: 0,
  shortCircuited: 0,
  freeBackendFallbacks: 0,
  tokens: 0,
  costUSD: 0,
})

/** Backends whose reported cost is an API-equivalent estimate, not money spent. */
const SUBSCRIPTION_BACKENDS: ReadonlySet<string> = new Set(['claude-code', 'gemini', 'agy'])

export interface RunManifest {
  /** npm script / CLI name, e.g. `verify-pleno-claims-engine`. */
  script: string
  runId: string
  startedAt: string
  endedAt: string
  /** Free-form mode tag so `--base` and default runs are distinguishable. */
  mode?: string
  backend: string | null
  model: string | null
  /**
   * Work outstanding when the run STARTED — the backlog, not the plan.
   *
   * Optional, and it has to stay optional: a pass that cannot cheaply count
   * what it owes omits it and is judged exactly as before. Filling it in with a
   * guess would be worse than leaving it out, since the whole point is to make
   * `attempted: 0` falsifiable.
   */
  owed?: number
  /** Items the run set out to process. */
  attempted: number
  /** Items a judgement was actually obtained for. */
  judged: number
  /** Items where the model was never consulted (no candidates, policy skip). */
  neverAttempted: number
  /** reason → count. Errors, missing records, anything that aborted an item. */
  skipped: Record<string, number>
  /** Domain-specific results, e.g. `{retracted: 40, kept: 12}`. */
  outcome: Record<string, number>
  llm: RunStats
  exitCode: number
}

export type FindingLevel = 'error' | 'warn'

export interface ManifestFinding {
  level: FindingLevel
  code: string
  message: string
}

/**
 * Consecutive zero-token failures that mean "the backend is refusing", not
 * "these items are hard". Set low: the real incident produced 189 in a row, and
 * there is no legitimate reason for a handful of calls to be rejected before
 * the prompt is read.
 */
export const ZERO_TOKEN_ALARM = 5

/** Above this share of never-attempted items, coverage is the story. */
export const NEVER_ATTEMPTED_WARN = 0.5

/** Above this share of failed calls, the backend is degraded. */
export const FAILURE_RATE_WARN = 0.25

export function assessManifest(m: RunManifest): ManifestFinding[] {
  const out: ManifestFinding[] = []
  const skippedTotal = Object.values(m.skipped).reduce((a, b) => a + b, 0)

  // Un tercer desenlace que `no-work` no sabía nombrar: la pasada llegó al
  // modelo, el modelo contestó TODAS las veces, y fue nuestra propia puerta de
  // calidad la que tiró lo que devolvió.
  //
  // El parte real de `extract-speaker-map` del 2026-08-28: 3 trozos
  // intentados, 0 juzgados — y 9 llamadas, 9 OK, 0 fallos, 180.414 tokens, con
  // `skipped: { 'below-coverage-floor': 3 }`. Los tres volvieron por debajo del
  // suelo de cobertura del 85 % (81 %, 82 % y una lectura basura del 2 %).
  // `no-work` lo publicaba como ERROR diciendo «check retrieval and the
  // backend» — señalando la única parte del run que funcionaba perfectamente.
  //
  // Es la regla 2 de CLAUDE.md aplicada a la regla misma: intentado / hecho /
  // nunca intentado / SALTADO-CON-MOTIVO se informan por separado. El cuarto
  // cubo ya venía en el manifiesto; quien lo tiraba era esta función.
  //
  // Dos guardas para que esto no se coma una avería de verdad:
  //   · `llm.ok > 0` — un backend mudo trae ok 0 y sigue cayendo en `no-work`.
  //   · `skippedTotal === attempted` — TODO lo intentado tiene que traer
  //     motivo. Si sobra un solo ítem sin explicar, esto no aplica.
  const todoSaltadoConMotivo =
    m.attempted > 0 && m.judged === 0 && skippedTotal === m.attempted && m.llm.ok > 0

  if (todoSaltadoConMotivo) {
    const motivos = Object.entries(m.skipped)
      .map(([motivo, n]) => `${motivo}=${n}`)
      .join(', ')
    out.push({
      level: 'warn',
      code: 'rejected-on-quality',
      message:
        `${m.script} processed ${m.attempted} item(s) and judged NONE — but every one ` +
        `was skipped WITH A REASON (${motivos}) after ${m.llm.ok} successful model ` +
        `call(s) and ${m.llm.tokens.toLocaleString('en-US')} token(s). The backend ` +
        `answered; OUR OWN quality gate rejected the output. Look at the threshold and ` +
        `the inputs, not at retrieval.`,
    })
  }

  // The headline failure: work was attempted and nothing came of it. This is
  // the shape that shipped as success three separate times.
  if (!todoSaltadoConMotivo && m.attempted > 0 && m.judged === 0) {
    out.push({
      level: 'error',
      code: 'no-work',
      message:
        `${m.script} processed ${m.attempted} item(s) and judged NONE. ` +
        `A run like this is indistinguishable from "everything already agreed" ` +
        `unless it is flagged. Check retrieval and the backend.`,
    })
  }

  // Work was owed and the run touched none of it.
  //
  // Every rule in this function was gated on `attempted > 0`, which left the
  // cheapest failure of all unjudgeable: a pass that dies during setup attempts
  // nothing, and "attempted nothing" was indistinguishable from "there was
  // nothing to attempt". `extract-speaker-map` died on its audio download two
  // nights running in August 2026 and `check:runs` printed a ✓ over both, while
  // 21 sessions waited. `owed` is what separates the two, and it is the only
  // rule here that can fire on a run with no attempts at all.
  if (typeof m.owed === 'number' && m.owed > 0 && m.attempted === 0) {
    out.push({
      level: 'error',
      code: 'nothing-attempted',
      message:
        `${m.script} had ${m.owed} item(s) outstanding and attempted NONE of them. ` +
        `The run started and stopped without reaching the work — setup, credentials ` +
        `or a dependency, not the model. A finished backlog reports owed 0; this did not.`,
    })
  }

  // No tokens read, no money spent, still "failed" — the backend refused before
  // it looked at the prompt.
  //
  // Pero eso sólo describe una avería si el backend NO estaba contestando. El
  // parte real de `extract-pleno-claims` traía 165 llamadas, 153 OK y 12 de
  // cero tokens, y el motivo estaba en su log: «You've hit your session limit».
  // Es la cuota Max, esperada, que se cura sola. Publicarlo como ERROR diciendo
  // que «the work was never attempted» era falso de un backend que había
  // respondido 153 veces, y dejaba monitor:health en rojo a diario por algo
  // sobre lo que no hay nada que hacer — que es como se entrena a la gente a
  // ignorar una puerta.
  //
  // El discriminante NO puede ser `ok === 0`: la avería real de las 190
  // llamadas muertas traía `ok: 1`. Lo que separa las dos formas es si los
  // fallos MANDAN sobre los aciertos. Si mandan, el backend se niega; si no,
  // la pasada iba bien y se cortó, que es otra cosa y baja a aviso —pero se
  // sigue nombrando, porque bajar de nivel no es callar.
  // Un primario de coste cero que se cayó y al que otro backend tapó.
  //
  // El agujero que esto cierra: `gemini-3.5-flash-medium` dejó de existir en
  // el catálogo de agy, agy fallaba en TODAS las llamadas, y la pasada salía
  // limpia porque claude-code contestaba detrás. `ok` subía, `zeroTokenFailures`
  // no se movía, y ZERO_TOKEN_ALARM no podía saltar: mira fallos de la CADENA
  // ENTERA, y la cadena no falló. Es la segunda vez que este modelo se queda
  // atrás sin que nada lo note; la primera costó 317 ventanas en openai medido.
  //
  // Aviso, no error: la pasada hizo su trabajo y el resultado es válido. Lo que
  // no es válido es no enterarse — con openai tercero en la cadena, un primario
  // muerto está a una caída de claude-code de una llamada con tarjeta.
  if (m.llm.freeBackendFallbacks > 0) {
    out.push({
      level: 'warn',
      code: 'free-backend-fallback',
      message:
        `${m.llm.freeBackendFallbacks} llamada(s) abandonaron un backend de coste cero y las ` +
        `respondió el siguiente de la cadena. La pasada salió bien, pero el primario está ` +
        `roto: mira el stderr por «falling back to». Un modelo retirado da exactamente esta ` +
        `forma, y el respaldo la tapa.`,
    })
  }

  if (m.llm.zeroTokenFailures >= ZERO_TOKEN_ALARM) {
    const seNiega = m.llm.zeroTokenFailures > m.llm.ok
    out.push(
      seNiega
        ? {
            level: 'error',
            code: 'backend-refusing',
            message:
              `${m.llm.zeroTokenFailures} call(s) failed having consumed 0 tokens and $0, ` +
              `against ${m.llm.ok} that succeeded. The backend refused instantly ` +
              `(rate limit, session lock, dead binary) — the work was never attempted, ` +
              `not merely unsuccessful.`,
          }
        : {
            level: 'warn',
            code: 'backend-cut-short',
            message:
              `${m.llm.ok} call(s) succeeded and then ${m.llm.zeroTokenFailures} failed having ` +
              `consumed 0 tokens — the backend was answering and stopped (quota or session ` +
              `limit). The run is partial, not broken: re-run once it resets.`,
          },
    )
  }

  // Claimed judgements with no traffic to back them.
  //
  // Only meaningful for a pass that HAS a backend. A deterministic adapter — a
  // plain scraper — judges items with no LLM anywhere, and cannot suffer the
  // failure this rule looks for (a backend that went quiet while the script's
  // own counters kept climbing). Firing on it would paint every non-LLM pass
  // red forever, which is the failure mode this whole file argues against.
  if (m.backend && m.judged > 0 && m.llm.calls === 0 && m.llm.cacheHits === 0) {
    out.push({
      level: 'error',
      code: 'judged-without-calls',
      message:
        `${m.script} reports ${m.judged} judged item(s) but made 0 LLM calls and ` +
        `hit 0 cache entries. The counts cannot both be true.`,
    })
  }

  // The four buckets must account for every attempted item.
  const accounted = m.judged + m.neverAttempted + skippedTotal
  if (m.attempted > 0 && accounted !== m.attempted) {
    out.push({
      level: 'warn',
      code: 'unaccounted-items',
      message:
        `judged ${m.judged} + never-attempted ${m.neverAttempted} + skipped ${skippedTotal} ` +
        `= ${accounted}, but ${m.attempted} were attempted. ${Math.abs(m.attempted - accounted)} item(s) ` +
        `are unaccounted for.`,
    })
  }

  if (m.attempted > 0 && m.neverAttempted / m.attempted > NEVER_ATTEMPTED_WARN) {
    const pct = Math.round((m.neverAttempted / m.attempted) * 100)
    out.push({
      level: 'warn',
      code: 'low-coverage',
      message:
        `${pct}% of items (${m.neverAttempted}/${m.attempted}) never reached the model. ` +
        `Usually retrieval, not the corpus.`,
    })
  }

  if (m.llm.calls > 0 && m.llm.failed / m.llm.calls > FAILURE_RATE_WARN) {
    const pct = Math.round((m.llm.failed / m.llm.calls) * 100)
    out.push({
      level: 'warn',
      code: 'high-failure-rate',
      message: `${pct}% of LLM calls failed (${m.llm.failed}/${m.llm.calls}).`,
    })
  }

  if (m.llm.shortCircuited > 0) {
    out.push({
      level: 'warn',
      code: 'circuit-tripped',
      message:
        `the circuit breaker opened and short-circuited ${m.llm.shortCircuited} call(s). ` +
        `Results are partial by design — re-run once the backend recovers.`,
    })
  }

  return out
}

/**
 * Pasadas cuyo fallo YA está resuelto: la misma pasada volvió a correr después,
 * dentro de la ventana, y volvió limpia.
 *
 * El caso que lo trae, y que se repetirá cada vez que se arregle un defecto de
 * instrumentación: `scrape-incendios` escribió dos manifiestos con
 * `attempted 32 · judged 0` porque el script no llamaba a `judge()`. Arreglado
 * el script y relanzado, el manifiesto nuevo salió ✓ — y el parte siguió en
 * ROJO por los dos viejos hasta que caducaran de la ventana de 36 h. Un rojo
 * sobre el que no hay nada que hacer, que es exactamente cómo se entrena a la
 * gente a no leer la puerta; el mismo defecto que el arreglo del script venía
 * a quitar, un piso más arriba.
 *
 * La regla es la de siempre en este fichero: NO se silencia, se BAJA de nivel y
 * se dice por qué. El fallo sigue impreso, con su motivo, y encima la línea que
 * explica que una pasada posterior de lo mismo vino bien. Lo único que cambia
 * es que deja de contar como error, porque no describe el estado de hoy.
 *
 * Dos guardas para que esto no se coma una avería de verdad:
 *
 *   · Sólo lo posterior rescata. Si la ÚLTIMA pasada de un script trae errores,
 *     no se baja nada — ni la última ni las anteriores. Una pasada que sigue
 *     rota sigue en rojo por muchas veces que haya ido bien antes.
 *   · Se agrupa por script Y modo. `--base` y una pasada normal del mismo
 *     script hacen trabajos distintos, y dejar que una tape a la otra sería
 *     inventarse que se ha comprobado algo que nadie comprobó.
 */
export function fallosYaSuperados(manifests: readonly RunManifest[]): ReadonlySet<string> {
  const porPasada = new Map<string, RunManifest[]>()
  for (const m of manifests) {
    const clave = `${m.script} ${m.mode ?? ''}`
    const lista = porPasada.get(clave)
    if (lista) lista.push(m)
    else porPasada.set(clave, [m])
  }

  const out = new Set<string>()
  for (const lista of porPasada.values()) {
    const ordenadas = [...lista].sort((a, b) => a.startedAt.localeCompare(b.startedAt))
    const ultima = ordenadas[ordenadas.length - 1]
    // La última manda. Si ella falla, el estado de hoy es «falla».
    if (assessManifest(ultima).some((f) => f.level === 'error')) continue
    for (const m of ordenadas.slice(0, -1)) {
      if (assessManifest(m).some((f) => f.level === 'error')) out.add(m.runId)
    }
  }
  return out
}

export function formatManifest(m: RunManifest): string {
  const skipped = Object.entries(m.skipped)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
  const outcome = Object.entries(m.outcome)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
  // A manifest from an older or buggier build may carry a partial `llm` block.
  // check:runs formats EVERY manifest on disk, so throwing here blinds the gate
  // entirely instead of degrading one line of its output.
  const llm = { ...NO_LLM_STATS, ...(m.llm ?? {}) }
  return [
    `${m.script}${m.mode ? ` (${m.mode})` : ''} · ${m.backend ?? 'no-backend'}${m.model ? `/${m.model}` : ''}`,
    `  ${typeof m.owed === 'number' ? `owed ${m.owed} · ` : ''}attempted ${m.attempted} · ` +
      `judged ${m.judged} · never-attempted ${m.neverAttempted}` +
      (skipped ? ` · skipped ${skipped}` : ''),
    outcome ? `  outcome: ${outcome}` : '',
    `  llm: ${llm.calls} calls (${llm.ok} ok, ${llm.failed} failed, ` +
      `${llm.zeroTokenFailures} zero-token) · ${llm.cacheHits} cache hits · ` +
      `${llm.tokens.toLocaleString('en-US')} tokens · ` +
      // claude-code on a Max plan bills nothing; its reported cost is an
      // API-equivalent estimate. Printing it as money once made a $0 night read
      // as $16.51.
      `${SUBSCRIPTION_BACKENDS.has(m.backend ?? '') ? `~$${llm.costUSD.toFixed(4)} est. (subscription, not billed)` : `$${llm.costUSD.toFixed(4)}`}`,
  ]
    .filter(Boolean)
    .join('\n')
}

// ─── Builder ────────────────────────────────────────────────────────────────

export interface RunRecorder {
  /**
   * How much work was outstanding when this run began. SETS, never accumulates
   * — a backlog is a level, not an event, and a caller that measures it twice
   * must not end up claiming twice as much was owed.
   */
  owe(n: number): void
  attempt(n?: number): void
  judge(n?: number): void
  neverAttempt(n?: number): void
  skip(reason: string, n?: number): void
  record(key: string, n?: number): void
  /** Finalise, write to disk, and return the manifest (plus its findings). */
  finish(opts?: { exitCode?: number; write?: boolean }): {
    manifest: RunManifest
    findings: ManifestFinding[]
  }
}

/**
 * `getStats` is injected so the recorder stays testable without importing the
 * live client, and so a caller can snapshot traffic for one phase of a run.
 */
export function startRun(
  script: string,
  opts: {
    mode?: string
    backend?: string | null
    model?: string | null
    getStats: () => RunStats
    now?: () => Date
  },
): RunRecorder {
  const now = opts.now ?? (() => new Date())
  const startedAt = now().toISOString()
  const runId = `${startedAt.replace(/[:.]/g, '-')}`
  let owed: number | undefined
  let attempted = 0
  let judged = 0
  let neverAttempted = 0
  const skipped: Record<string, number> = {}
  const outcome: Record<string, number> = {}

  return {
    owe: (n) => {
      owed = n
    },
    attempt: (n = 1) => {
      attempted += n
    },
    judge: (n = 1) => {
      judged += n
    },
    neverAttempt: (n = 1) => {
      neverAttempted += n
    },
    skip: (reason, n = 1) => {
      skipped[reason] = (skipped[reason] ?? 0) + n
    },
    record: (key, n = 1) => {
      outcome[key] = (outcome[key] ?? 0) + n
    },
    finish: (fin = {}) => {
      const manifest: RunManifest = {
        script,
        runId,
        startedAt,
        endedAt: now().toISOString(),
        mode: opts.mode,
        backend: opts.backend ?? process.env.LLM_BACKEND ?? null,
        model: opts.model ?? null,
        owed,
        attempted,
        judged,
        neverAttempted,
        skipped,
        outcome,
        llm: opts.getStats(),
        exitCode: fin.exitCode ?? 0,
      }
      const findings = assessManifest(manifest)
      if (fin.write !== false) writeManifest(manifest)
      return { manifest, findings }
    },
  }
}

// ─── I/O ────────────────────────────────────────────────────────────────────

export function writeManifest(m: RunManifest, dir = MANIFEST_DIR): string {
  const abs = resolve(dir)
  mkdirSync(abs, { recursive: true })
  const path = join(abs, `${m.script}-${m.runId}.json`)
  writeFileSync(path, JSON.stringify(m, null, 2) + '\n')
  return path
}

export function readManifests(dir = MANIFEST_DIR): RunManifest[] {
  const abs = resolve(dir)
  if (!existsSync(abs)) return []
  const out: RunManifest[] = []
  for (const f of readdirSync(abs)) {
    if (!f.endsWith('.json')) continue
    try {
      out.push(JSON.parse(readFileSync(join(abs, f), 'utf8')) as RunManifest)
    } catch {
      process.stderr.write(`[run-manifest] skipping unreadable manifest ${f}\n`)
    }
  }
  return out.sort((a, b) => a.startedAt.localeCompare(b.startedAt))
}

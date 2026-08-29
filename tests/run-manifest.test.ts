import { describe, it, expect } from 'vitest'
import {
  assessManifest,
  startRun,
  formatManifest,
  ZERO_TOKEN_ALARM,
  NEVER_ATTEMPTED_WARN,
  FAILURE_RATE_WARN,
  type RunManifest,
} from '../src/scraper/run-manifest'
import type { RunStats } from '../src/llm/client'

/**
 * Thresholds are IMPORTED, never restated. A test that hardcodes `5` keeps
 * passing after someone raises the constant to 50, which is precisely how six
 * tests in this repo stayed green while guarding nothing.
 */

const NO_TRAFFIC: RunStats = {
  calls: 0,
  cacheHits: 0,
  ok: 0,
  failed: 0,
  zeroTokenFailures: 0,
  shortCircuited: 0,
  tokens: 0,
  costUSD: 0,
}

function manifest(over: Partial<RunManifest> = {}): RunManifest {
  return {
    script: 'test-script',
    runId: 'r1',
    startedAt: '2026-08-02T10:00:00.000Z',
    endedAt: '2026-08-02T10:05:00.000Z',
    backend: 'claude-code',
    model: 'claude-code:sonnet',
    attempted: 0,
    judged: 0,
    neverAttempted: 0,
    skipped: {},
    outcome: {},
    llm: { ...NO_TRAFFIC },
    exitCode: 0,
    ...over,
  }
}

const codes = (m: RunManifest) =>
  assessManifest(m)
    .map((f) => f.code)
    .sort()

describe('assessManifest — healthy runs', () => {
  it('passes a run that judged everything it attempted', () => {
    const m = manifest({
      attempted: 100,
      judged: 100,
      llm: { ...NO_TRAFFIC, calls: 100, ok: 100, tokens: 50_000, costUSD: 1.2 },
    })
    expect(assessManifest(m)).toEqual([])
  })

  it('passes a fully cached re-run (no fresh calls, but cache hits)', () => {
    const m = manifest({
      attempted: 40,
      judged: 40,
      llm: { ...NO_TRAFFIC, cacheHits: 40 },
    })
    expect(assessManifest(m)).toEqual([])
  })

  it('passes an empty run — nothing attempted is not a failure', () => {
    expect(assessManifest(manifest())).toEqual([])
  })
})

/**
 * The hole this file's own thesis left open.
 *
 * Every rule below was gated on `attempted > 0`, so a pass that attempted
 * NOTHING was unfalsifiable — and that is a real shape, not a hypothetical.
 * `extract-speaker-map` died on its yt-dlp download on 2026-08-13 and again on
 * 2026-08-14; both nights wrote `attempted 0 · judged 0 · 0 calls`, and
 * `check:runs` printed a ✓ over each while the backlog sat untouched at 21
 * sessions.
 *
 * «Attempted nothing» is only judgeable against how much was owed, which the
 * manifest never carried. So it carries it now: `owed` is the work outstanding
 * when the run started, and a run that had work and attempted none of it is
 * the "did this run do work?" question with a definite answer for the first
 * time.
 *
 * It stays OPTIONAL on purpose. A pass that cannot cheaply count its backlog
 * omits it and is judged exactly as before; making it required would have every
 * other manifest in the repo lying about a number it never measured.
 */
describe('assessManifest — a pass that attempted nothing', () => {
  it('flags a run that had work owed and attempted none of it', () => {
    const m = manifest({ owed: 21, attempted: 0 })
    expect(codes(m)).toContain('nothing-attempted')
  })

  it('names how much was owed, so the line is actionable', () => {
    const f = assessManifest(manifest({ owed: 21, attempted: 0 })).find(
      (x) => x.code === 'nothing-attempted',
    )
    expect(f!.level).toBe('error')
    expect(f!.message).toContain('21')
  })

  // The control that makes the rule mean something. A finished backlog and a
  // crashed run BOTH read `attempted 0`; only `owed` separates them, so if this
  // one ever goes red the check is crying wolf at every completed sweep and
  // will be switched off within the week.
  it('stays quiet when there was genuinely nothing to do', () => {
    expect(codes(manifest({ owed: 0, attempted: 0 }))).not.toContain('nothing-attempted')
  })

  it('stays quiet for a pass that does not report a backlog at all', () => {
    expect(codes(manifest({ attempted: 0 }))).not.toContain('nothing-attempted')
  })

  it('stays quiet once the run has attempted something, however little', () => {
    const m = manifest({
      owed: 21,
      attempted: 1,
      judged: 1,
      llm: { ...NO_TRAFFIC, calls: 1, ok: 1, tokens: 10 },
    })
    expect(codes(m)).not.toContain('nothing-attempted')
  })

  it('records what was owed through the recorder, and prints it', () => {
    const run = startRun('demo', { getStats: () => ({ ...NO_TRAFFIC }), backend: 'gemini-api' })
    run.owe(21)
    const { manifest: m, findings } = run.finish({ write: false })
    expect(m.owed).toBe(21)
    expect(findings.map((f) => f.code)).toContain('nothing-attempted')
    // A number the human never sees cannot be argued with.
    expect(formatManifest(m)).toContain('owed 21')
  })
})

describe('assessManifest — the incidents this exists to catch', () => {
  it('flags a run that processed items and judged none (the "kept 1017" shape)', () => {
    // Reported `re-judged 1017 · kept 1017` while making zero successful calls.
    const m = manifest({
      attempted: 1017,
      neverAttempted: 1017,
      llm: { ...NO_TRAFFIC },
    })
    expect(codes(m)).toContain('no-work')
  })

  it('flags failures that consumed no tokens (the 190-dead-calls shape)', () => {
    const m = manifest({
      attempted: 190,
      judged: 1,
      skipped: { 'engine error': 189 },
      llm: {
        ...NO_TRAFFIC,
        calls: 190,
        ok: 1,
        failed: 189,
        zeroTokenFailures: 189,
        tokens: 1109,
        costUSD: 0.04,
      },
    })
    expect(codes(m)).toContain('backend-refusing')
  })

  it('does not cry wolf on a couple of genuine transient failures', () => {
    const m = manifest({
      attempted: 100,
      judged: 98,
      skipped: { 'engine error': 2 },
      llm: {
        ...NO_TRAFFIC,
        calls: 100,
        ok: 98,
        failed: 2,
        zeroTokenFailures: ZERO_TOKEN_ALARM - 1,
        tokens: 40_000,
        costUSD: 0.9,
      },
    })
    expect(codes(m)).not.toContain('backend-refusing')
  })

  // ── cuota agotada ≠ backend averiado ───────────────────────────────────────
  //
  // `extract-pleno-claims` dejó `check:runs` en rojo con este parte real:
  // 165 llamadas, 153 OK, 12 de cero tokens, circuito abierto, 174 ventanas sin
  // responder. El motivo, en su log: «You've hit your session limit · resets
  // 12:30pm». No es una avería: es la cuota Max, es esperada, se cura sola y no
  // hay nada que hacer salvo reintentar más tarde.
  //
  // Pero salía como ERROR `backend-refusing`, cuyo texto afirma que el backend
  // «refused instantly … the work was never attempted» — falso de uno que
  // contestó 153 veces. Y dejaba monitor:health en rojo A DIARIO por eso, que
  // es como se entrena a la gente a ignorar una puerta.
  //
  // El discriminante NO es `ok === 0`: la forma de las 190 llamadas muertas
  // traía `ok: 1` y sí era una avería. Lo que separa las dos es si los fallos
  // MANDAN sobre los aciertos.
  it('una cuota agotada a mitad de pasada NO es un backend que se niega', () => {
    const m = manifest({
      attempted: 165,
      judged: 153,
      llm: {
        ...NO_TRAFFIC,
        calls: 165,
        ok: 153,
        failed: 12,
        zeroTokenFailures: 12,
        shortCircuited: 162,
        tokens: 663_937,
        costUSD: 10.43,
      },
    })
    expect(codes(m)).not.toContain('backend-refusing')
    // Pero se sigue NOMBRANDO: bajar de nivel no es callar.
    expect(codes(m)).toContain('backend-cut-short')
    expect(assessManifest(m).find((f) => f.code === 'backend-cut-short')?.level).toBe('warn')
  })

  it('sigue siendo ERROR cuando los fallos mandan sobre los aciertos', () => {
    // La forma real de las 190 llamadas muertas: 1 acierto entre 189 fallos.
    const m = manifest({
      attempted: 190,
      judged: 1,
      skipped: { 'engine error': 189 },
      llm: { ...NO_TRAFFIC, calls: 190, ok: 1, failed: 189, zeroTokenFailures: 189 },
    })
    expect(codes(m)).toContain('backend-refusing')
    expect(codes(m)).not.toContain('backend-cut-short')
  })

  it('un backend que no contestó NUNCA es el caso más claro de todos', () => {
    const m = manifest({
      attempted: 20,
      judged: 0,
      llm: { ...NO_TRAFFIC, calls: 20, ok: 0, failed: 20, zeroTokenFailures: 20 },
    })
    expect(codes(m)).toContain('backend-refusing')
  })

  it('por debajo del umbral no salta ninguno de los dos', () => {
    // Sin esto, un arreglo que apagara las dos reglas pasaría por bueno.
    const m = manifest({
      attempted: 100,
      judged: 98,
      skipped: { 'engine error': 2 },
      llm: {
        ...NO_TRAFFIC,
        calls: 100,
        ok: 98,
        failed: 2,
        zeroTokenFailures: ZERO_TOKEN_ALARM - 1,
        tokens: 40_000,
      },
    })
    expect(codes(m)).not.toContain('backend-refusing')
    expect(codes(m)).not.toContain('backend-cut-short')
  })

  it('flags judgements claimed with no traffic to back them', () => {
    const m = manifest({ attempted: 10, judged: 10, llm: { ...NO_TRAFFIC } })
    expect(codes(m)).toContain('judged-without-calls')
  })
})

// A deterministic adapter (a plain scraper) has no backend to fall silent, so
// the LLM-shaped alarms must not fire on it. Firing them would make check:runs
// permanently red for every non-LLM pass — and this file's own thesis is that a
// check nobody can keep green is a check everybody switches off.
describe('assessManifest — deterministic passes have no LLM to blame', () => {
  const deterministic = (over: Record<string, unknown> = {}) => ({
    script: 'scrape-coste-efectivo',
    runId: 'r',
    startedAt: 'a',
    endedAt: 'b',
    mode: 'volcado',
    backend: null,
    model: null,
    attempted: 11,
    judged: 1,
    neverAttempted: 0,
    skipped: { 'entrega-sin-volcado-publico': 10 },
    outcome: { filas: 2467 },
    llm: {
      calls: 0,
      cacheHits: 0,
      ok: 0,
      failed: 0,
      zeroTokenFailures: 0,
      shortCircuited: 0,
      tokens: 0,
      costUSD: 0,
    },
    exitCode: 0,
    ...over,
  })

  it('does not accuse a backendless pass of judging without calls', () => {
    const codes = assessManifest(deterministic() as never).map((f) => f.code)
    expect(codes).not.toContain('judged-without-calls')
  })

  it('still accuses an LLM pass that judged with no traffic', () => {
    const codes = assessManifest(deterministic({ backend: 'openai' }) as never).map((f) => f.code)
    expect(codes).toContain('judged-without-calls')
  })

  it('still accounts for every attempted item', () => {
    const codes = assessManifest(deterministic({ judged: 0 }) as never).map((f) => f.code)
    expect(codes).toContain('unaccounted-items')
  })
})

describe('assessManifest — coverage and accounting', () => {
  it('flags items that fall through every bucket', () => {
    const m = manifest({
      attempted: 100,
      judged: 40,
      neverAttempted: 10,
      skipped: { err: 5 },
      llm: { ...NO_TRAFFIC, calls: 40, ok: 40, tokens: 100 },
    })
    const f = assessManifest(m).find((x) => x.code === 'unaccounted-items')
    expect(f).toBeDefined()
    expect(f!.message).toContain('45')
  })

  it('flags when most items never reached the model (the retrieval shape)', () => {
    const attempted = 100
    const never = Math.ceil(attempted * NEVER_ATTEMPTED_WARN) + 1
    const m = manifest({
      attempted,
      judged: attempted - never,
      neverAttempted: never,
      llm: { ...NO_TRAFFIC, calls: attempted - never, ok: attempted - never, tokens: 10 },
    })
    expect(codes(m)).toContain('low-coverage')
  })

  it('stays quiet when coverage sits just under the threshold', () => {
    const attempted = 100
    const never = Math.floor(attempted * NEVER_ATTEMPTED_WARN)
    const m = manifest({
      attempted,
      judged: attempted - never,
      neverAttempted: never,
      llm: { ...NO_TRAFFIC, calls: attempted - never, ok: attempted - never, tokens: 10 },
    })
    expect(codes(m)).not.toContain('low-coverage')
  })

  it('flags a degraded backend by failure rate', () => {
    const calls = 100
    const failed = Math.ceil(calls * FAILURE_RATE_WARN) + 1
    const m = manifest({
      attempted: calls,
      judged: calls - failed,
      skipped: { err: failed },
      llm: { ...NO_TRAFFIC, calls, ok: calls - failed, failed, tokens: 5000 },
    })
    expect(codes(m)).toContain('high-failure-rate')
  })

  it('reports partial results when the breaker opened', () => {
    const m = manifest({
      attempted: 50,
      judged: 20,
      neverAttempted: 30,
      llm: { ...NO_TRAFFIC, calls: 20, ok: 20, shortCircuited: 30, tokens: 900 },
    })
    expect(codes(m)).toContain('circuit-tripped')
  })
})

describe('startRun', () => {
  const stats = (): RunStats => ({ ...NO_TRAFFIC, calls: 3, ok: 3, tokens: 42, costUSD: 0.01 })

  it('accumulates counts and pulls traffic from the injected client', () => {
    const run = startRun('demo', { getStats: stats, backend: 'claude-code' })
    run.attempt(5)
    run.judge()
    run.judge()
    run.neverAttempt(2)
    run.skip('missing claim')
    run.record('retracted', 2)

    const { manifest: m } = run.finish({ write: false })
    expect(m.attempted).toBe(5)
    expect(m.judged).toBe(2)
    expect(m.neverAttempted).toBe(2)
    expect(m.skipped).toEqual({ 'missing claim': 1 })
    expect(m.outcome).toEqual({ retracted: 2 })
    expect(m.llm.tokens).toBe(42)
  })

  it('a fully-accounted run produces no findings', () => {
    const run = startRun('demo', { getStats: stats })
    run.attempt(3)
    run.judge(3)
    const { findings } = run.finish({ write: false })
    expect(findings).toEqual([])
  })

  // check:runs reads every manifest on disk, so ONE malformed file used to
  // take the whole gate down with a TypeError — a gate that crashes reports
  // nothing, which is worse than a gate that is merely red. A manifest written
  // by an older or buggier build must degrade to a line, not an exception.
  it('formats a manifest whose llm block is missing or partial', () => {
    const run = startRun('demo', { getStats: stats })
    run.attempt(1)
    run.judge(1)
    const { manifest: m } = run.finish({ write: false })
    const sinLlm = { ...m, llm: undefined } as unknown as typeof m
    expect(() => formatManifest(sinLlm)).not.toThrow()
    expect(formatManifest(sinLlm)).toContain('attempted 1')
    const parcial = { ...m, llm: { calls: 2 } } as unknown as typeof m
    expect(() => formatManifest(parcial)).not.toThrow()
  })

  it('formats a human-readable summary', () => {
    const run = startRun('demo', { getStats: stats })
    run.attempt(3)
    run.judge(3)
    run.record('retracted', 1)
    const { manifest: m } = run.finish({ write: false })
    const s = formatManifest(m)
    expect(s).toContain('attempted 3')
    expect(s).toContain('retracted=1')
  })
})

describe('assessManifest — contestado y rechazado NO es "no-work"', () => {
  /**
   * El parte real de `extract-speaker-map` del 2026-08-28. El backend contestó
   * las nueve veces; los tres trozos volvieron por debajo del suelo de
   * cobertura del 85 % y se anotaron con su motivo. `no-work` lo publicaba como
   * ERROR diciendo «check retrieval and the backend» — la única parte del run
   * que funcionaba.
   */
  const rechazadoPorCalidad = () =>
    manifest({
      script: 'extract-speaker-map',
      backend: 'gemini-api',
      model: 'gemini-3.5-flash',
      owed: 16,
      attempted: 3,
      judged: 0,
      neverAttempted: 0,
      skipped: { 'below-coverage-floor': 3 },
      llm: { ...NO_TRAFFIC, calls: 9, ok: 9, tokens: 180414 },
    })

  it('no lo llama no-work', () => {
    expect(codes(rechazadoPorCalidad())).not.toContain('no-work')
  })

  it('lo nombra por lo que es, y como aviso', () => {
    const f = assessManifest(rechazadoPorCalidad()).find((x) => x.code === 'rejected-on-quality')
    expect(f).toBeTruthy()
    expect(f?.level).toBe('warn')
  })

  it('dice el motivo y cuántas llamadas fueron bien', () => {
    const f = assessManifest(rechazadoPorCalidad()).find((x) => x.code === 'rejected-on-quality')
    expect(f?.message).toContain('below-coverage-floor=3')
    expect(f?.message).toContain('9 successful model call')
  })

  // La guarda del hueco. Un backend mudo tiene ok 0, y eso SÍ es no-work: si
  // este caso empezara a salir como aviso, la avería que el manifiesto existe
  // para cazar se publicaría en amarillo.
  it('un backend mudo que lo salta todo SIGUE siendo no-work', () => {
    const m = manifest({
      attempted: 3,
      judged: 0,
      skipped: { 'engine error': 3 },
      llm: { ...NO_TRAFFIC, calls: 3, failed: 3, zeroTokenFailures: 3 },
    })
    expect(codes(m)).toContain('no-work')
    expect(codes(m)).not.toContain('rejected-on-quality')
  })

  // La otra guarda: el aviso exige que TODO lo intentado traiga motivo. Con un
  // ítem sin explicar, la contabilidad no cuadra y no se puede afirmar que la
  // culpa fue de la puerta de calidad.
  it('con un ítem sin motivo vuelve a ser no-work', () => {
    const m = manifest({
      attempted: 3,
      judged: 0,
      skipped: { 'below-coverage-floor': 2 },
      llm: { ...NO_TRAFFIC, calls: 6, ok: 6, tokens: 1000 },
    })
    expect(codes(m)).toContain('no-work')
    expect(codes(m)).not.toContain('rejected-on-quality')
  })

  it('nunca emite los dos a la vez', () => {
    for (const m of [
      rechazadoPorCalidad(),
      manifest({ attempted: 3, judged: 0, skipped: { x: 3 }, llm: { ...NO_TRAFFIC } }),
      manifest({ attempted: 1017, neverAttempted: 1017 }),
    ]) {
      const c = codes(m)
      expect(c.includes('no-work') && c.includes('rejected-on-quality')).toBe(false)
    }
  })
})

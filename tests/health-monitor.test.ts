import { describe, it, expect } from 'vitest'
import {
  evaluateHealth,
  alertFingerprint,
  formatAlerts,
  pickCheckDiagnosis,
  NIGHTLY_STREAK_ALARM,
  type Observations,
} from '../src/scraper/health-monitor'

const NOW = new Date('2026-08-03T12:00:00.000Z')
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000)

function obs(over: Partial<Observations> = {}): Observations {
  return {
    now: NOW,
    pipelines: [],
    botHealthy: true,
    siteHealthy: true,
    sources: [],
    nightlyFailStreak: 0,
    integrity: [],
    ...over,
  }
}

const codes = (o: Observations) =>
  evaluateHealth(o)
    .map((a) => a.code)
    .sort()

describe('silence when healthy', () => {
  it('says nothing when everything is fine', () => {
    expect(evaluateHealth(obs())).toEqual([])
  })

  it('says nothing about a pipeline with no work pending, however long idle', () => {
    // An idle pipeline with an empty queue is finished, not stalled. Alerting
    // here is how a monitor teaches people to ignore it.
    const o = obs({
      pipelines: [{ name: 'extraction', lastProgressAt: daysAgo(90), pending: 0, stallDays: 2 }],
    })
    expect(evaluateHealth(o)).toEqual([])
  })

  it('does not report unchecked subsystems as broken', () => {
    // null means "not checked", which is not the same as "down".
    expect(evaluateHealth(obs({ botHealthy: null, siteHealthy: null }))).toEqual([])
  })
})

describe('bot and site', () => {
  it('treats a dead bot as critical and explains the stake', () => {
    const a = evaluateHealth(obs({ botHealthy: false }))[0]
    expect(a.severity).toBe('critical')
    expect(a.detail).toMatch(/se pierden/)
    expect(a.remedy).toBeTruthy()
  })

  it('reports a dead site', () => {
    expect(codes(obs({ siteHealthy: false }))).toContain('site-down')
  })
})

describe('stalled pipelines', () => {
  const stalled = (days: number, pending = 5, cause?: string) =>
    obs({
      pipelines: [
        { name: 'extraction', lastProgressAt: daysAgo(days), pending, stallDays: 2, cause },
      ],
    })

  it('fires once past the pipeline’s own threshold', () => {
    expect(codes(stalled(3))).toContain('stall:extraction')
  })

  it('stays quiet just under it', () => {
    expect(evaluateHealth(stalled(1.5))).toEqual([])
  })

  it('carries the diagnosed cause through as the remedy', () => {
    const a = evaluateHealth(stalled(5, 5, 'OpenAI sin saldo'))[0]
    expect(a.remedy).toBe('OpenAI sin saldo')
  })

  it('handles a pipeline that has never made progress', () => {
    const o = obs({
      pipelines: [{ name: 'x', lastProgressAt: null, pending: 3, stallDays: 2 }],
    })
    expect(evaluateHealth(o)[0].detail).toMatch(/ningún avance/)
  })
})

describe('silent sources', () => {
  it('reports a feed past its expected cadence', () => {
    const o = obs({ sources: [{ name: 'press', newestItemAt: daysAgo(6), expectDays: 4 }] })
    expect(codes(o)).toContain('silent:press')
  })

  it('is explicit that it CANNOT tell quiet from broken', () => {
    // The honest limit of this signal, stated in the alert itself: the file
    // refreshes nightly either way.
    const o = obs({ sources: [{ name: 'press', newestItemAt: daysAgo(9), expectDays: 4 }] })
    expect(evaluateHealth(o)[0].detail).toMatch(/NO distingue/)
  })

  it('stays quiet inside the expected cadence', () => {
    const o = obs({ sources: [{ name: 'press', newestItemAt: daysAgo(2), expectDays: 4 }] })
    expect(evaluateHealth(o)).toEqual([])
  })

  it('ignores a source with no items rather than guessing', () => {
    const o = obs({ sources: [{ name: 'boe', newestItemAt: null, expectDays: 4 }] })
    expect(evaluateHealth(o)).toEqual([])
  })
})

describe('nightly streak', () => {
  it('tolerates a flaky night', () => {
    expect(evaluateHealth(obs({ nightlyFailStreak: NIGHTLY_STREAK_ALARM - 1 }))).toEqual([])
  })

  it('fires on a streak', () => {
    expect(codes(obs({ nightlyFailStreak: NIGHTLY_STREAK_ALARM }))).toContain('nightly-red')
  })
})

describe('integrity', () => {
  it('escalates every integrity failure to critical', () => {
    const o = obs({ integrity: [{ check: 'check:json', message: 'snapshot ilegible' }] })
    const a = evaluateHealth(o)[0]
    expect(a.severity).toBe('critical')
    expect(a.remedy).toContain('check:json')
  })
})

describe('fingerprint + formatting', () => {
  it('is stable regardless of alert order', () => {
    const a = evaluateHealth(obs({ botHealthy: false, nightlyFailStreak: 9 }))
    const b = evaluateHealth(obs({ nightlyFailStreak: 9, botHealthy: false }))
    expect(alertFingerprint(a)).toBe(alertFingerprint(b))
  })

  it('changes when a NEW problem appears, so a fixed digest is not resent', () => {
    const one = evaluateHealth(obs({ botHealthy: false }))
    const two = evaluateHealth(obs({ botHealthy: false, siteHealthy: false }))
    expect(alertFingerprint(one)).not.toBe(alertFingerprint(two))
  })

  it('puts critical alerts before warnings', () => {
    const a = evaluateHealth(obs({ botHealthy: false, nightlyFailStreak: 9 }))
    const text = formatAlerts(a)
    expect(text.indexOf('🔴')).toBeLessThan(text.indexOf('🟠'))
  })

  it('formats nothing when there is nothing to say', () => {
    expect(formatAlerts([])).toBe('')
  })
})

// ---------------------------------------------------------------------------
// Lo que se rompió el 19-ago: el aviso contaba los fallos sin nombrar ninguno.
// ---------------------------------------------------------------------------

describe('pickCheckDiagnosis', () => {
  // `check:runs` imprime sus hallazgos PRIMERO y su resumen al final, así que
  // quedarse con las dos últimas líneas guardaba la aritmética y tiraba el
  // diagnóstico. El mensaje que llegó a Telegram decía «5 run(s) · 4 error(s)»
  // y nada más; el motivo —una descarga rota— estaba tres líneas más arriba.
  it('nombra el fallo aunque no esté en las dos últimas líneas', () => {
    const out = [
      '✗ extract-speaker-map · 2026-08-22T09:30:11Z',
      '    ERROR [nothing-attempted] extract-speaker-map had 17 item(s) outstanding and attempted NONE of them.',
      '',
      'llm: 21 calls (17 ok, 4 failed, 0 zero-token) · 797,199 tokens · $0.1936',
      '[check-runs] 5 run(s) · 4 error(s) · 4 warning(s) · 2 pasada(s) programada(s), 0 vencida(s)',
    ].join('\n')
    expect(pickCheckDiagnosis(out)).toContain('nothing-attempted')
  })

  // Sin líneas marcadas no hay nada mejor que la cola, que es lo que hacía
  // antes. La mejora es aditiva: nunca empeora un check que ya se leía bien.
  it('cae a la cola cuando ningún renglón viene marcado como hallazgo', () => {
    expect(pickCheckDiagnosis('primera\nsegunda\ntercera')).toBe('segunda · tercera')
  })

  it('nunca devuelve vacío', () => {
    expect(pickCheckDiagnosis('   \n\n')).toBe('falló')
  })
})

describe('alertFingerprint · huella por código de hallazgo', () => {
  const fpOf = (message: string) =>
    alertFingerprint(evaluateHealth(obs({ integrity: [{ check: 'check:runs', message }] })))

  // El 21-ago el mensaje SÍ nombraba `nothing-attempted`, y se silenció porque
  // la huella sólo veía `integrity:check:runs` — idéntica a la del 19, que no
  // nombraba nada. La única vez que el aviso sirvió, se descartó por repetido.
  it('separa dos fallos del mismo check con códigos distintos', () => {
    expect(fpOf('ERROR [nothing-attempted] 17 pendientes')).not.toBe(
      fpOf('ERROR [judged-without-calls] 17 pendientes'),
    )
  })

  // Y al revés: el mismo fallo con otras cifras sigue siendo el mismo fallo.
  // Sin esto, `check:cadence` —que imprime «9d», «122d»— avisaría cada dos días
  // para siempre, que es la fatiga que RENOTIFY_DAYS existe para evitar.
  it('mantiene la huella cuando sólo se mueven las cifras', () => {
    expect(fpOf('ERROR [nothing-attempted] had 17 item(s)')).toBe(
      fpOf('ERROR [nothing-attempted] had 21 item(s)'),
    )
  })

  it('no cambia nada para los checks que no emiten códigos', () => {
    expect(fpOf('[freshness] 41 dataset(s) · 1 stale')).toBe(
      fpOf('[freshness] 40 dataset(s) · 3 stale'),
    )
  })
})

/**
 * Una semana de `check:runs` no son dos renglones.
 *
 * Muestra real del 19 al 22-ago-2026: ~21 hallazgos de tres clases repetidas,
 * intercaladas con una decena de cabeceras `✗ <script> · <backend>`. La primera
 * versión de `pickCheckDiagnosis` se quedaba con los dos primeros renglones
 * marcados y devolvía DOS CABECERAS, dejando fuera el `nothing-attempted` que
 * explicaba la avería — verde en las pruebas de arriba, inútil contra los datos
 * de verdad. Este bloque es lo que separa un diseño del otro.
 */
describe('pickCheckDiagnosis · una semana entera de hallazgos', () => {
  const SEMANA = [
    '  ✗ extract-pleno-claims: se espera cada 48h, última hace 95h (2026-08-19) — lo lanza hallazgos-pipeline (diario 09:30)',
    '',
    '✗ extract-pleno-claims · claude-code/claude-sonnet-5',
    '    ERROR [backend-refusing] 12 call(s) failed having consumed 0 tokens and $0.',
    '✗ extract-pleno-claims · claude-code/claude-sonnet-5',
    '    ERROR [no-work] extract-pleno-claims processed 1 item(s) and judged NONE.',
    '    ERROR [backend-refusing] 12 call(s) failed having consumed 0 tokens and $0.',
    '✗ extract-speaker-map · gemini-api/gemini-3.5-flash',
    '    ERROR [nothing-attempted] extract-speaker-map had 20 item(s) outstanding and attempted NONE of them.',
    '[check-runs] 12 run(s) · 21 error(s) · 3 warning(s)',
  ].join('\n')

  it('names every distinct kind of failure, not just the first two lines', () => {
    const d = pickCheckDiagnosis(SEMANA)
    for (const code of ['backend-refusing', 'no-work', 'nothing-attempted']) {
      expect(d, `no nombró ${code}`).toContain(code)
    }
  })

  // Lo que la versión anterior hacía y que este test convierte en imposible.
  it('is not two manifest headers', () => {
    expect(pickCheckDiagnosis(SEMANA)).not.toMatch(
      /^✗ extract-pleno-claims · [^·]+ · ✗ extract-pleno-claims/,
    )
  })

  it('collapses a repeated failure into one entry with its count', () => {
    expect(pickCheckDiagnosis(SEMANA)).toContain('[backend-refusing]×2')
  })

  // El primer renglón marcado de `check:runs` es la pasada MÁS vencida, y no
  // lleva código: nueve días de silencio en agosto de 2026 fueron exactamente
  // este hecho sin que nadie lo viera.
  it('keeps the most overdue pass, which carries no code of its own', () => {
    expect(pickCheckDiagnosis(SEMANA)).toContain('95h')
  })

  // La huella tiene que ver el perfil ENTERO: una clase nueva vuelve a sonar
  // aunque las de siempre sigan ahí.
  it('gives the fingerprint every code, so a new kind re-alerts', () => {
    const fp = (msg: string) =>
      alertFingerprint(evaluateHealth(obs({ integrity: [{ check: 'check:runs', message: msg }] })))
    const conUnaMas = SEMANA + '\n    ERROR [judged-without-calls] algo nuevo.'
    expect(fp(pickCheckDiagnosis(SEMANA))).not.toBe(fp(pickCheckDiagnosis(conUnaMas)))
  })
})

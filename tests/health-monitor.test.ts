import { describe, it, expect } from 'vitest'
import {
  evaluateHealth,
  alertFingerprint,
  formatAlerts,
  pickCheckDiagnosis,
  contarNochesEnRojo,
  clasificarGuarda,
  resumenIntegridad,
  lineaSinAvisos,
  rachasSinComprobar,
  tocaEnviar,
  NIGHTLY_STREAK_ALARM,
  type Observations,
} from '../src/scraper/health-monitor'
import { valorar } from '../src/scraper/basemap-check'

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
    sinComprobar: [],
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

describe('contarNochesEnRojo', () => {
  // El contador miraba SÓLO `failure` y cortaba con cualquier otra cosa. Una
  // nocturna que agota su tiempo concluye `cancelled`, y un `cancelled` a la
  // cabeza ponía la racha entera a cero: el 7-09-2026 el digest publicaba
  // «nocturnas-en-rojo=0» con cinco noches seguidas sin verde, y la alarma —que
  // salta a las tres— llevaba tres días sin poder saltar.
  //
  // Es la regla 2 de DATA_INTEGRITY otra vez, en el sitio donde más cara sale:
  // «nunca se intentó» doblado dentro de «todo bien». La lista es la real,
  // capturada de `gh run list --workflow=nightly-scrape.yml` ese día.
  const REAL_2026_09_07 = ['cancelled', 'failure', 'failure', 'failure', 'cancelled', 'success']

  it('cuenta la racha real de la nocturna del 7-09-2026, que se leía como 0', () => {
    expect(contarNochesEnRojo(REAL_2026_09_07)).toBe(5)
  })

  it('sólo un verde cierra la racha', () => {
    expect(contarNochesEnRojo(['success', 'failure', 'failure'])).toBe(0)
  })

  // Una noche cancelada no es una noche buena: es una noche que no demostró
  // haber hecho el trabajo, que es justo lo que la racha existe para contar.
  it('cuenta como roja cualquier conclusión que no sea verde', () => {
    expect(contarNochesEnRojo(['cancelled'])).toBe(1)
    expect(contarNochesEnRojo(['timed_out'])).toBe(1)
    expect(contarNochesEnRojo(['startup_failure'])).toBe(1)
    expect(contarNochesEnRojo(['skipped'])).toBe(1)
  })

  // Una ejecución viva todavía no ha concluido nada. Ni suma ni corta: si
  // cortara, lanzar la nocturna a mano silenciaría la racha mientras corre.
  it('una ejecución en curso no cuenta ni corta', () => {
    expect(contarNochesEnRojo([null, 'failure', 'failure'])).toBe(2)
    expect(contarNochesEnRojo([null, 'success'])).toBe(0)
  })

  it('sin ejecuciones no inventa una racha', () => {
    expect(contarNochesEnRojo([])).toBe(0)
  })

  it('la racha real dispara la alarma que el contador viejo silenciaba', () => {
    const racha = contarNochesEnRojo(REAL_2026_09_07)
    expect(racha).toBeGreaterThanOrEqual(NIGHTLY_STREAK_ALARM)
    expect(codes(obs({ nightlyFailStreak: racha }))).toContain('nightly-red')
  })
})

// ---------------------------------------------------------------------------
// Lo que se encontró el 06-10-2026: `runCheck` devolvía null con cualquier
// salida 0, así que una guarda que imprime SALTADO o NO COMPROBADO —no ha
// medido nada, y lo dice— entraba en el parte como «sin fallos», y el parte
// cerraba con «✓ sin avisos». La guarda era honesta; el parte, no.
// ---------------------------------------------------------------------------

/**
 * Salidas reales, todas con código 0, capturadas el 06-10-2026 en un worktree
 * sin `editorial/` ni la base gitignorada, que es donde estas guardas no
 * pueden medir. `check:officials-corrections` va con `--offline`: recorre el
 * mismo camino que un 403 de la web del ayuntamiento y sólo cambia el texto
 * del error. `check:solicitudes` corrió en un árbol sin manifiesto.
 */
const SALIDAS_SIN_MEDIR: Record<string, string> = {
  'check:queues': [
    '  · quote-reanchor-queue       sin fichero — nada que revisar',
    '  · finding-support-queue      sin fichero — nada que revisar',
    '  · finding-exception-queue    sin fichero — nada que revisar',
    '  · attribution-queue          sin fichero — nada que revisar',
    '',
    '[check-queues] 0 cola(s) con fichero · 0 fila(s) · 0 viva(s) · 0 cola(s) desactualizada(s)',
    '[check-queues] NO COMPROBADO: no existe editorial/, así que aquí no hay colas que',
    '               mirar (está en .gitignore; en CI o en un clon nuevo esto es lo normal).',
    '               La revisión de las colas vive en la máquina del curador.',
  ].join('\n'),
  'check:verified-compose': [
    '[check-compose] 1 cotejo(s) · SALTADO: no hay base en disco (está gitignorado): no se ha podido cotejar. Reconstrúyelo con `npm run verify:pleno-claims -- --base-only`.',
    '  No se ha comprobado nada, que no es lo mismo que estar todo bien.',
  ].join('\n'),
  // Midió su pasada principal y saltó el cotejo con la base: un salto puede
  // ser de una parte, y el motivo dice de cuál.
  'check:veredictos': [
    '[check-veredictos] 4962 veredicto(s) evaluado(s) · 28 fuerte(s) · 13 subido(s) por una persona · 3 curado(s) · 0 de procedencia retirada · 0 sin corpus · 0 sin firma',
    '[check-veredictos] cotejo con la base: SALTADO — no hay base que leer en disco (está gitignorada); se regenera con `npm run verify:pleno-claims -- --base-only`. No se ha cotejado ninguna entrada del overlay, que no es lo mismo que no haya ninguna por encima.',
  ].join('\n'),
  'check:officials-corrections': [
    'officials-corrections · 1 corrección(es) recorrida(s)',
    '  aplicación · aplicada 1 · no-aplicada 0 · publicado es punto fijo de la mezcla',
    '  vigencia   · vigente 0 · absorbida 0 · contradicha 0 · no-comprobado 1 — NO COMPROBADO: --offline',
    '  fuente     · viva 0 · sin-fuente 0 · no-verificable 0 · no-comprobado 1',
  ].join('\n'),
  'check:solicitudes':
    '[check-solicitudes] 0 clase(s) · SALTADO: no hay manifiesto de declaraciones que leer. No se ha comprobado nada, que no es lo mismo que estar todo bien.',
}

/**
 * Salidas normales, también reales y del mismo día, que el parte lee cada
 * noche. Las tres llevan una palabra de la familia en minúscula —el recuento
 * `no-comprobado 0`, «saltados 24 binarios», «0 skipped»—, y ninguna es un
 * salto: una marca que casara con ellas pintaría «sin comprobar» todas las
 * noches, que es el aviso que se aprende a ignorar. De officials-corrections
 * falta el renglón de la baja absorbida, que nombra a una persona y aquí no
 * hace falta.
 */
const SALIDAS_QUE_MIDIERON: Record<string, string> = {
  'check:officials-corrections': [
    'officials-corrections · 1 corrección(es) recorrida(s)',
    '  aplicación · aplicada 1 · no-aplicada 0 · publicado es punto fijo de la mezcla',
    '  vigencia   · vigente 0 · absorbida 1 · contradicha 0 · no-comprobado 0',
    '  fuente     · viva 1 · sin-fuente 0 · no-verificable 0 · no-comprobado 0',
  ].join('\n'),
  'check:privado':
    '[check:privado] 2275 fichero(s) rastreado(s) · 0 dato(s) privado(s) · saltados 24 binarios, 4 en la lista, 0 ilegibles',
  'check:relations':
    '[check-relations] 22 ok · 5 empty · 0 broken (error) · 4 broken (warn) · 0 skipped',
}

describe('clasificarGuarda · salir 0 no es haber medido', () => {
  it.each(Object.entries(SALIDAS_SIN_MEDIR))(
    '%s salió 0 sin medir: queda «sin comprobar», no limpia',
    (_check, salida) => {
      expect(clasificarGuarda(0, salida).desenlace).toBe('sin-comprobar')
    },
  )

  // El mensaje sale del módulo de la guarda, no de una copia: si cambia su
  // marca, esta prueba lo ve.
  it('check:basemap sin CDN, con el mensaje de su propio módulo', () => {
    const salida = `AVISO [inalcanzable] mapa base — ${valorar(null, null).mensaje}`
    expect(clasificarGuarda(0, salida).desenlace).toBe('sin-comprobar')
  })

  it.each(Object.entries(SALIDAS_QUE_MIDIERON))(
    '%s midió: la familia en minúscula no es la marca',
    (_check, salida) => {
      expect(clasificarGuarda(0, salida)).toEqual({ desenlace: 'limpia' })
    },
  )

  // Las tres de arriba ya las salvan el guion y el plural; esto fija la
  // mayúscula sola, con la palabra entera en un recuento.
  it('la palabra entera en minúscula, en un recuento, tampoco es la marca', () => {
    expect(
      clasificarGuarda(0, '[check-x] 40 fila(s) · 3 saltado(s) · 2 no comprobado(s) a propósito'),
    ).toEqual({ desenlace: 'limpia' })
  })

  it('el motivo es el renglón de la guarda, con su porqué', () => {
    expect(clasificarGuarda(0, SALIDAS_SIN_MEDIR['check:verified-compose'])).toMatchObject({
      motivo: expect.stringContaining('no hay base en disco'),
    })
  })

  // check:queues parte su aviso en tres renglones sangrados; quedarse con el
  // primero dejaba la frase en «no hay colas que».
  it('un aviso partido en varios renglones llega entero', () => {
    expect(clasificarGuarda(0, SALIDAS_SIN_MEDIR['check:queues'])).toMatchObject({
      motivo: expect.stringContaining('La revisión de las colas vive en la máquina del curador'),
    })
  })

  // Y al revés: en officials-corrections los renglones de los dos ejes van con
  // la misma sangría, y el de la fuente no explica el salto de la vigencia.
  it('no se traga el renglón vecino de otro eje', () => {
    expect(clasificarGuarda(0, SALIDAS_SIN_MEDIR['check:officials-corrections'])).toMatchObject({
      motivo: expect.not.stringContaining('fuente'),
    })
  })

  // Si la marca pudiera más que el código, un rojo con un SALTADO de paso
  // bajaría a «sin comprobar» y perdería su aviso crítico.
  it('un fallo sigue siendo un fallo aunque también diga SALTADO', () => {
    const salida =
      SALIDAS_SIN_MEDIR['check:veredictos'] +
      '\n  ✗ [sin-corpus] 1abc-001-xyz: verificado — veredicto fuerte sin corpus'
    expect(clasificarGuarda(1, salida)).toMatchObject({
      desenlace: 'fallo',
      mensaje: expect.stringContaining('sin-corpus'),
    })
  })

  // Sin código —la mataron, o ni siquiera arrancó— no hay nada que absolver.
  it('una guarda sin código de salida es un fallo, ni salto ni verde', () => {
    expect(clasificarGuarda(null, '').desenlace).toBe('fallo')
  })
})

describe('el parte no absuelve lo que no se midió', () => {
  const salto = {
    check: 'check:queues',
    motivo: '[check-queues] NO COMPROBADO: no existe editorial/',
    desde: NOW,
  }

  it('dice «sin fallos» cuando todo lo que corrió midió', () => {
    expect(resumenIntegridad({ integrity: [], sinComprobar: [] })).toBe('sin fallos')
  })

  it('nunca dice «sin fallos» con una guarda sin comprobar, y la nombra', () => {
    const r = resumenIntegridad({ integrity: [], sinComprobar: [salto] })
    expect(r).not.toContain('sin fallos')
    expect(r).toMatch(/sin comprobar.*check:queues/)
  })

  it('cuenta los fallos y los saltos, cada uno en su sitio', () => {
    const r = resumenIntegridad({
      integrity: [{ check: 'check:json', message: 'snapshot ilegible' }],
      sinComprobar: [salto],
    })
    expect(r).toContain('check:json')
    expect(r).toMatch(/sin comprobar.*check:queues/)
    expect(r).not.toMatch(/sin comprobar.*check:json/)
  })

  it('cierra con el ✓ sólo cuando todo midió', () => {
    expect(lineaSinAvisos([])).toContain('✓')
    const l = lineaSinAvisos([salto])
    expect(l).not.toContain('✓')
    expect(l).toMatch(/sin comprobar.*check:queues/)
  })

  // Un salto no es un rojo: si entrara por `integrity`, cada 403 de una web
  // ajena sería un aviso crítico.
  it('un salto no se convierte en un aviso de integridad', () => {
    expect(codes(obs({ sinComprobar: [salto] }))).not.toContain('integrity:check:queues')
  })
})

/**
 * La pauta, decidida con el coordinador el 06-10-2026. Un salto no avisa el
 * primer día: el caso crónico es una web pública que contesta 403, y un rojo
 * diario por eso enseña a silenciar el canal. Pero tampoco se queda en el log
 * para siempre, que es justo el «verde por no correr» que este parte existe
 * para cerrar: a los siete días seguidos es un 🟠 con su propio código, y solo
 * en el parte se repite cada semana, no cada tres días. Un 403 crónico cuesta
 * así un mensaje semanal: poco para que nadie silencie el canal, y bastante
 * para que alguien arregle la descarga.
 */
describe('siete días seguidos sin comprobar: aviso propio, semanal', () => {
  const CHECK = 'check:officials-corrections'
  const MOTIVO =
    'vigencia · vigente 0 · absorbida 0 · contradicha 0 · no-comprobado 1 — NO COMPROBADO: HTTP 403'
  // El cron corre a diario a las 11:00 de Madrid, las 09:00 UTC en octubre.
  const dia = (n: number, minuto = 5) => new Date(Date.UTC(2026, 9, 1 + n, 9, minuto))
  const desdeElDia0 = (now: Date, otros: Partial<Observations> = {}) =>
    evaluateHealth(
      obs({ now, sinComprobar: [{ check: CHECK, motivo: MOTIVO, desde: dia(0) }], ...otros }),
    )

  it('el sexto día todavía no avisa', () => {
    expect(desdeElDia0(dia(6))).toEqual([])
  })

  it('el séptimo avisa, en naranja y con su propio código', () => {
    expect(desdeElDia0(dia(7))).toMatchObject([
      { code: 'sin-comprobar:check:officials-corrections', severity: 'warning' },
    ])
  })

  // Si el séptimo arranca unos minutos antes que el primero, sigue siendo el
  // séptimo: contar múltiplos exactos de 24 h lo dejaría para el octavo.
  it('cuenta días de calendario, no múltiplos de 24 h', () => {
    expect(desdeElDia0(dia(7, 1)).map((a) => a.code)).toEqual([
      'sin-comprobar:check:officials-corrections',
    ])
  })

  it('trae el motivo de la guarda, que nombra la parte, y las dos salidas', () => {
    const [a] = desdeElDia0(dia(7))
    expect(a.detail).toContain('vigencia')
    expect(a.detail).toContain('NO COMPROBADO: HTTP 403')
    expect(a.remedy).toMatch(/vuelva a medir/)
    expect(a.remedy).toMatch(/retira/)
    expect(a.remedy).toMatch(/redefine/)
  })

  const enviadoEl7 = () => ({
    fingerprint: alertFingerprint(desdeElDia0(dia(7))),
    at: dia(7).toISOString(),
  })

  it('el décimo día no se repite', () => {
    expect(tocaEnviar(desdeElDia0(dia(10)), enviadoEl7(), dia(10))).toBe(false)
  })

  it('el decimocuarto, sí', () => {
    expect(tocaEnviar(desdeElDia0(dia(14)), enviadoEl7(), dia(14))).toBe(true)
  })

  // Con otro aviso en el parte, el parte sale cada tres días por ése, y el
  // salto viaja dentro sin costar un mensaje más.
  it('junto a otro aviso manda la cadencia de los tres días', () => {
    const conElBot = (n: number) => desdeElDia0(dia(n), { botHealthy: false })
    const enviado = { fingerprint: alertFingerprint(conElBot(7)), at: dia(7).toISOString() }
    expect(tocaEnviar(conElBot(10), enviado, dia(10))).toBe(true)
  })

  // La cadencia sólo frena un parte que no ha cambiado.
  it('un aviso nuevo sale al día siguiente del envío semanal', () => {
    const conElBot = desdeElDia0(dia(8), { botHealthy: false })
    expect(tocaEnviar(conElBot, enviadoEl7(), dia(8))).toBe(true)
  })

  it('sin un envío anterior, sale', () => {
    expect(tocaEnviar(desdeElDia0(dia(7)), null, dia(7))).toBe(true)
  })

  // La fecha del último envío ilegible daba NaN días, que no llegan nunca a
  // ninguna cadencia: el parte se callaba para siempre.
  it('un último envío con la fecha ilegible no calla el parte', () => {
    const ilegible = { fingerprint: enviadoEl7().fingerprint, at: 'ayer' }
    expect(tocaEnviar(desdeElDia0(dia(9)), ilegible, dia(9))).toBe(true)
  })

  it('sin avisos no hay nada que enviar, aunque el último parte fuera otro', () => {
    expect(tocaEnviar([], enviadoEl7(), dia(7))).toBe(false)
  })

  it('un día que mide corta la racha', () => {
    expect(rachasSinComprobar({ [CHECK]: dia(0).toISOString() }, [], dia(5))).toEqual({})
  })

  it('y la que vuelve empieza de cero: su sexto día no avisa', () => {
    const cortada = rachasSinComprobar({ [CHECK]: dia(0).toISOString() }, [], dia(5))
    const desde = rachasSinComprobar(cortada, [CHECK], dia(6))[CHECK]
    expect(desde).toBe(dia(6).toISOString())
    const o = obs({
      now: dia(12),
      sinComprobar: [{ check: CHECK, motivo: MOTIVO, desde: new Date(desde) }],
    })
    expect(evaluateHealth(o)).toEqual([])
  })

  it('mientras no mida, la racha conserva su primer día', () => {
    const previas = { [CHECK]: dia(0).toISOString() }
    expect(rachasSinComprobar(previas, [CHECK], dia(5))).toEqual(previas)
  })

  // Un estado ilegible no puede fabricar una racha: sin fecha que creer, hoy.
  it('una fecha ilegible en el estado empieza hoy', () => {
    expect(rachasSinComprobar({ [CHECK]: 'ayer' }, [CHECK], dia(5))).toEqual({
      [CHECK]: dia(5).toISOString(),
    })
  })
})

describe('el bloque «Sin comprobar» de un parte que sale', () => {
  const dia = (n: number) => new Date(Date.UTC(2026, 9, 1 + n, 9, 5))
  const vieja = {
    check: 'check:officials-corrections',
    motivo: 'vigencia · no-comprobado 1 — NO COMPROBADO: HTTP 403',
    desde: dia(0),
  }
  const nueva = {
    check: 'check:queues',
    motivo: '[check-queues] NO COMPROBADO: no existe editorial/',
    desde: dia(5),
  }

  it('lista las que aún no tienen aviso propio, y no repite las que ya lo tienen', () => {
    const sinComprobar = [vieja, nueva]
    const texto = formatAlerts(
      evaluateHealth(obs({ now: dia(7), botHealthy: false, sinComprobar })),
      sinComprobar,
    )
    const bloque = texto.slice(texto.indexOf('Sin comprobar'))
    expect(bloque).toContain('check:queues')
    expect(bloque).toContain('no existe editorial/')
    expect(bloque).not.toContain('check:officials-corrections')
  })

  // El bloque informa; no avisa. Si una racha corta moviera la huella, un salto
  // que aparece o se cura reenviaría un parte que no ha cambiado.
  it('una racha corta no mueve la huella', () => {
    const conSalto = evaluateHealth(obs({ now: dia(7), botHealthy: false, sinComprobar: [nueva] }))
    const sinSalto = evaluateHealth(obs({ now: dia(7), botHealthy: false }))
    expect(alertFingerprint(conSalto)).toBe(alertFingerprint(sinSalto))
  })
})

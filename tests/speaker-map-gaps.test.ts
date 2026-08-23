import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  GIVE_UP_AFTER_ATTEMPTS,
  CURRENT_GATE,
  NEVER_ATTEMPTED,
  recordFailure,
  writtenOffChunks,
  isMapComplete,
  classifyBacklogState,
  type FailedChunk,
} from '../src/scraper/speaker-map'

/**
 * A chunk that keeps failing must stop costing a call every night.
 *
 * `15uvjew` sat at 16 of 17 with chunk 8 covering 66% against an 85% floor,
 * three attempts running. `isMapComplete` wants `done >= total`, so the session
 * headed the backlog every night and every night the pass spent its retries on
 * it. Over a twenty-night sweep that is twenty nights of quota buying nothing.
 *
 * **The premise this was built on turned out to be false, and that is worth
 * keeping written down.** Three identical 66% readings looked deterministic —
 * "the model cannot read this window". On the fourth attempt it returned 89
 * segments and the session closed at 17/17, 100%. Coverage failures here are
 * FLAKY. So a write-off is a decision to stop spending, not a finding about the
 * audio, and the tests below are about the spending rule; none of them asserts
 * that a retired chunk is unreadable, because it may well not be.
 *
 * The fix is NOT to lower the floor. A 66% chunk published as if it were whole
 * is the defect the floor exists to stop: downstream, a gap in a speaker map is
 * indistinguishable from a stretch where nobody spoke. The fix is to stop
 * RETRYING it while still declaring it — the hole stays in `failedChunks`,
 * visible, and the session leaves the queue.
 *
 * ## Why writing-off is tied to the gate that did it
 *
 * Because "permanent" has already been wrong once here, and expensively. In
 * August 2026 a third of all chunks were being discarded as unreadable; the
 * cause was the model writing M.SS where the parser expected seconds, and once
 * `decodeElapsed` absorbed that, the two chunks that had "permanently" failed
 * both passed at 100%. A verdict reached under a broken gate is not one to
 * carry forward, so a written-off chunk records WHICH gate wrote it off and
 * reopens the moment the prompt or the floor moves.
 */

// Importado, no reconstruido: una copia a mano de esta forma es exactamente la
// regla 1 de DATA_INTEGRITY, y aquí se rompería en silencio — un campo nuevo en
// `Gate` que el test no conociera dejaría de comprobarse sin ponerse rojo.
const GATE = CURRENT_GATE
const fail = (over: Partial<FailedChunk> = {}): FailedChunk => ({
  chunk: 8,
  why: 'covered 66% (floor 85%)',
  ...over,
})

describe('a failing chunk is given up on, but only after several nights', () => {
  it('counts a first failure as one attempt, not as a write-off', () => {
    const f = recordFailure(undefined, 8, 'covered 66% (floor 85%)', GATE)
    expect(f.attempts).toBe(1)
    expect(writtenOffChunks([f], GATE).has(8)).toBe(false)
  })

  it('keeps attempting it below the threshold', () => {
    let f = recordFailure(undefined, 8, 'why', GATE)
    for (let i = 1; i < GIVE_UP_AFTER_ATTEMPTS - 1; i++) f = recordFailure(f, 8, 'why', GATE)
    expect(f.attempts).toBe(GIVE_UP_AFTER_ATTEMPTS - 1)
    expect(writtenOffChunks([f], GATE).has(8)).toBe(false)
  })

  it('writes it off once the threshold is reached', () => {
    let f = recordFailure(undefined, 8, 'why', GATE)
    while ((f.attempts ?? 0) < GIVE_UP_AFTER_ATTEMPTS) f = recordFailure(f, 8, 'why', GATE)
    expect(writtenOffChunks([f], GATE).has(8)).toBe(true)
  })

  // The counter alone is not the record. Without the gate stamped alongside it,
  // a chunk written off under a broken parser stays written off after the
  // parser is fixed — which is the mm:ss incident, preserved in amber.
  it('reopens a written-off chunk when the prompt changes, and starts the count again', () => {
    const old = fail({ attempts: GIVE_UP_AFTER_ATTEMPTS, givenUpUnder: { ...GATE } })
    const nuevo = { ...GATE, prompt: `${GATE.prompt}-siguiente` }
    expect(writtenOffChunks([old], nuevo).has(8), 'stayed written off under a new prompt').toBe(
      false,
    )
    expect(recordFailure(old, 8, 'why', nuevo).attempts, 'carried the old gate’s count').toBe(1)
  })

  it('reopens it when the coverage floor moves', () => {
    const old = fail({ attempts: GIVE_UP_AFTER_ATTEMPTS, givenUpUnder: { ...GATE } })
    const nuevo = { ...GATE, floor: GATE.floor - 0.1 }
    expect(writtenOffChunks([old], nuevo).has(8)).toBe(false)
  })

  // El tercer ingrediente de la puerta, añadido el 23-ago-2026. Tres de los
  // cuatro chunks retirados de `10yl550` decían «empty response
  // (finishReason=MAX_TOKENS)»: el razonamiento se comía el techo de salida
  // antes de emitir nada. Eso es un ajuste de la PETICIÓN, no del prompt ni del
  // suelo, y sin estar en la puerta un cambio de nivel dejaría retirados unos
  // chunks que nunca se juzgaron con él.
  it('reopens it when the thinking level moves', () => {
    const old = fail({ attempts: GIVE_UP_AFTER_ATTEMPTS, givenUpUnder: { ...GATE } })
    const nuevo = { ...GATE, thinking: 'high' as const }
    expect(writtenOffChunks([old], nuevo).has(8)).toBe(false)
    expect(recordFailure(old, 8, 'why', nuevo).attempts, 'no arrastra la cuenta vieja').toBe(1)
  })

  // Y los mapas ya escritos no llevan el campo, así que sus retiradas se
  // reabren UNA vez y vuelven a contar desde cero bajo la puerta actual.
  it('reopens a write-off stamped before the thinking level existed', () => {
    const sinCampo = fail({
      attempts: GIVE_UP_AFTER_ATTEMPTS,
      givenUpUnder: { prompt: GATE.prompt, floor: GATE.floor } as typeof GATE,
    })
    expect(writtenOffChunks([sinCampo], GATE).has(8)).toBe(false)
  })
})

describe('a session with written-off gaps leaves the queue', () => {
  const map = (failed: FailedChunk[], done = 16, total = 17) => ({
    stats: { chunksTranscribed: done, chunksExpected: total, failedChunks: failed },
  })

  it('is NOT complete while its gap is still being attempted', () => {
    expect(isMapComplete(map([fail({ attempts: 1, givenUpUnder: { ...GATE } })]))).toBe(false)
  })

  it('IS complete once every outstanding chunk has been written off', () => {
    const gone = fail({ attempts: GIVE_UP_AFTER_ATTEMPTS, givenUpUnder: { ...GATE } })
    expect(isMapComplete(map([gone]))).toBe(true)
    expect(classifyBacklogState({ referenceUsable: true, map: map([gone]) })).toBeNull()
  })

  it('is NOT complete when the write-offs do not cover the shortfall', () => {
    // Two chunks missing, one written off. Declaring this finished would hide a
    // chunk nobody ever looked at behind one somebody did.
    const gone = fail({ attempts: GIVE_UP_AFTER_ATTEMPTS, givenUpUnder: { ...GATE } })
    expect(isMapComplete(map([gone], 15, 17))).toBe(false)
  })

  it('does not count a write-off from a gate that no longer applies', () => {
    const stale = fail({
      attempts: GIVE_UP_AFTER_ATTEMPTS,
      givenUpUnder: { prompt: 'speaker-map-v0', floor: 0.5 },
    })
    expect(isMapComplete(map([stale])), 'a stale write-off retired the session').toBe(false)
  })
})

/**
 * Un hueco de presupuesto —un trozo que la nocturna nunca llegó a intentar— y
 * lo que NO se puede concluir de él. Contra un fixture, y ésa es la novedad.
 *
 * Este caso vivía apuntado a la sesión del disco que en ese momento tuviera
 * huecos, y ha caducado TRES veces: `15uvjew` lo cerró la barrida el 15-08,
 * `brxx5g` la nocturna el 18-08, y el 22-08 se cerró `10yl550`, el último que
 * quedaba. Las tres veces el test avisó en rojo de que había dejado de medir lo
 * que creía medir, y las dos primeras el arreglo fue escribir a mano el nombre
 * de la siguiente sesión — o sea, volver a poner la fecha de caducidad. La
 * tercera vez el propio mensaje de fallo pedía lo que se hace aquí: darle un
 * fixture propio en vez de repuntarlo.
 *
 * Es la misma broma que este repositorio ya se ha contado con la tabla escrita a
 * mano dentro del control contra la prosa rancia, y con la lista de entregas de
 * CESEL: un control cuyo sujeto hay que renovar a mano envejece igual que lo que
 * vigila. El sujeto de un caso de comportamiento no es el mundo, es el caso.
 *
 * El literal de `why` es el que escribe `extract-speaker-map.ts`, copiado de
 * ahí y no inventado: si esa frase cambia, el filtro `/never attempted/` del
 * bloque de disco deja de encontrar nada y conviene que esto cambie con ella.
 */
describe('un hueco de presupuesto no amortiza nada', () => {
  const HUECOS_DE_PRESUPUESTO: FailedChunk[] = [
    { chunk: 15, why: 'never attempted (chunk budget spent; resumes next run)' },
    { chunk: 16, why: 'never attempted (quota exhausted earlier in the run)' },
  ]

  it('son el caso entero: sin cuenta de intentos', () => {
    expect(HUECOS_DE_PRESUPUESTO.length).toBeGreaterThan(0)
    expect(HUECOS_DE_PRESUPUESTO.every((f) => f.attempts == null)).toBe(true)
  })

  it('no se retiran por una cuenta que nadie registró', () => {
    // Leer un `attempts` ausente como «ya nos rendimos» retiraría de golpe cada
    // sesión de la cola: retirar un trozo por estar infrapresupuestado es
    // exactamente al revés.
    expect(writtenOffChunks(HUECOS_DE_PRESUPUESTO, GATE).size).toBe(0)
  })

  it('y la sesión que los tiene no se declara terminada', () => {
    // La consecuencia, y la razón por la que importa: si un hueco de
    // presupuesto contase como amortizado, la sesión saldría de la cola y esos
    // trozos no se transcribirían nunca.
    const conHuecos = {
      stats: { chunksTranscribed: 15, chunksExpected: 17, failedChunks: HUECOS_DE_PRESUPUESTO },
    }
    expect(isMapComplete(conHuecos, GATE)).toBe(false)

    // Control: que dé `false` por el hueco y no por cualquier otra cosa. Con
    // los MISMOS trozos amortizados bajo la puerta actual, la sesión sí cierra.
    // Sin esto, `isMapComplete` podría estar devolviendo false por la aritmética
    // de 15 < 17 y la aserción de arriba no probaría nada del write-off.
    const amortizados = HUECOS_DE_PRESUPUESTO.map((f) => ({
      ...f,
      attempts: GIVE_UP_AFTER_ATTEMPTS,
      givenUpUnder: { ...GATE },
    }))
    expect(
      isMapComplete(
        { stats: { chunksTranscribed: 15, chunksExpected: 17, failedChunks: amortizados } },
        GATE,
      ),
    ).toBe(true)
  })
})

describe('against the maps on disk', () => {
  /**
   * El sujeto se DERIVA, no se fija. Este bloque ya ha caducado dos veces por
   * la misma razón: apuntaba a `15uvjew`, la barrida lo terminó el 2026-08-15 y
   * su aserción de prueba-de-trabajo lo dijo en rojo; se repuntó a `brxx5g`, la
   * nocturna lo terminó el 2026-08-18 y volvió a decirlo. Las dos veces el test
   * hizo su trabajo —avisar de que había dejado de medir el mundo que creía
   * medir— y las dos veces el arreglo fue escribir a mano el nombre de la
   * siguiente sesión, o sea volver a poner la fecha de caducidad. Es el chiste
   * que este repositorio ya se ha contado tres veces (la tabla escrita a mano
   * dentro del control contra la prosa rancia, el testigo fijo del overlay).
   *
   * Ahora el bloque lee TODAS las sesiones del directorio y se queda con los
   * huecos de presupuesto —los trozos que la nocturna nunca llegó a intentar—
   * vengan de la sesión que vengan. Una barrida que termine una sesión ya no
   * rompe nada; lo único que rompe esto es que no quede NINGÚN hueco de
   * presupuesto en ninguna sesión, y eso se dice en voz alta en vez de pasar en
   * verde midiendo un conjunto vacío.
   *
   * De paso deja de exigir una sesión cuyos huecos sean TODOS de presupuesto:
   * hoy no existe ninguna (la única sin terminar, `10yl550`, mezcla diez huecos
   * de presupuesto con un fallo real de cobertura), y aislar el caso es
   * seleccionar las entradas, no esperar a que aparezca una sesión pura.
   */
  const dir = resolve('pleno-speaker-map')
  const sesiones = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({
      id: f.replace(/\.json$/, ''),
      map: JSON.parse(readFileSync(join(dir, f), 'utf8')),
    }))

  /** Trozos que el presupuesto de la nocturna nunca alcanzó, de todas las sesiones. */
  const huecosDePresupuesto = sesiones.flatMap(({ id, map }) =>
    ((map.stats?.failedChunks ?? []) as FailedChunk[])
      .filter((f) => /never attempted/.test(f.why ?? ''))
      .map((f) => ({ id, f })),
  )

  it('el directorio de mapas se lee y trae sesiones', () => {
    // Lo único que este bloque puede exigir sin ponerse fecha de caducidad.
    expect(sesiones.length, 'no hay ninguna sesión en pleno-speaker-map/').toBeGreaterThan(0)
  })

  it('ningún hueco de presupuesto del disco se da por amortizado', () => {
    // CONDICIONAL a propósito, y hoy vacío: el 2026-08-22 no queda ni un hueco
    // de presupuesto en disco. La nocturna llegó por fin a los trozos de
    // `10yl550` y los que fallaron pasaron a ser fallos de cobertura de verdad,
    // con su cuenta de intentos y su sello de puerta.
    //
    // Que esto mida cero ya NO es una laguna, porque el comportamiento vive
    // probado contra `HUECOS_DE_PRESUPUESTO` —un fixture que no depende de lo
    // que la barrida haya cerrado esta noche—. Esto es sólo la comprobación
    // contra el mundo real, y valer cero cuando el mundo real está bien es la
    // buena noticia, no el fallo.
    expect(
      writtenOffChunks(
        huecosDePresupuesto.map(({ f }) => f),
        GATE,
      ).size,
    ).toBe(0)
    const conHuecos = new Set(huecosDePresupuesto.map(({ id }) => id))
    for (const { id, map } of sesiones) {
      if (!conHuecos.has(id)) continue
      expect(isMapComplete(map), `${id}: retirada con trozos que nadie llegó a intentar`).toBe(
        false,
      )
    }
  })

  // The assertion above passes for the wrong reason on its own: the entries on
  // disk carry no gate stamp either, and the gate check alone rejects them. So
  // an absent `attempts` was never actually under test — swapping its default
  // to "given up on" left the whole file green. This is the case that isolates
  // it: gate present, count missing.
  it('an entry stamped with the current gate but no count is still not written off', () => {
    const sinCuenta = fail({ givenUpUnder: { ...GATE } })
    expect(writtenOffChunks([sinCuenta], GATE).has(8)).toBe(false)
  })
})

/**
 * Los tres finales de una noche incompleta.
 *
 * Hasta el 23-ago-2026 había dos, y el techo nuevo —peticiones, la unidad que la
 * cuota mide— habría entrado por fuerza en uno de ellos. Meterlo en
 * `quota-exhausted` diría que la API se agotó cuando la pasada se paró sola;
 * meterlo en `chunk-budget-spent` escondería cuál fue el techo que mandó. Este
 * test existe para que el siguiente que añada un final tenga que añadirlo, no
 * doblarlo.
 */
describe('un final de pasada no vale por otro', () => {
  it('da un motivo distinto y no vacío a cada desenlace', () => {
    const motivos = Object.values(NEVER_ATTEMPTED)
    expect(new Set(motivos).size, 'dos desenlaces comparten motivo').toBe(motivos.length)
    for (const m of motivos) expect(m.trim().length).toBeGreaterThan(0)
  })

  // Cada motivo tiene que nombrar SU causa: leídos en un `failedChunks` meses
  // después son lo único que queda del porqué.
  it('nombra la causa en el propio motivo', () => {
    expect(NEVER_ATTEMPTED['quota-exhausted']).toMatch(/quota/i)
    expect(NEVER_ATTEMPTED['call-budget-spent']).toMatch(/call budget/i)
    expect(NEVER_ATTEMPTED['chunk-budget-spent']).toMatch(/chunk budget/i)
  })

  // Los dos reanudables lo dicen; el de cuota no promete nada, porque depende
  // del reloj del proveedor y no de la siguiente pasada.
  it('marca como reanudables sólo los que lo son', () => {
    expect(NEVER_ATTEMPTED['call-budget-spent']).toMatch(/resumes next run/)
    expect(NEVER_ATTEMPTED['chunk-budget-spent']).toMatch(/resumes next run/)
    expect(NEVER_ATTEMPTED['quota-exhausted']).not.toMatch(/resumes next run/)
  })
})

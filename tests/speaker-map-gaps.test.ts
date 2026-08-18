import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  GIVE_UP_AFTER_ATTEMPTS,
  recordFailure,
  writtenOffChunks,
  isMapComplete,
  classifyBacklogState,
  type FailedChunk,
} from '../src/scraper/speaker-map'
import {
  SPEAKER_MAP_PROMPT_VERSION,
  SPEAKER_MAP_COVERAGE_FLOOR,
} from '../src/scraper/speaker-map-prompt'

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

const GATE = { prompt: SPEAKER_MAP_PROMPT_VERSION, floor: SPEAKER_MAP_COVERAGE_FLOOR }
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

  it('hay huecos de presupuesto en el disco que medir', () => {
    // Prueba de trabajo, sin nombre propio: si algún día la barrida cierra
    // todas las sesiones, las dos aserciones de abajo pasarían sobre un
    // conjunto vacío y este bloque diría «bien» sin haber mirado nada.
    expect(sesiones.length, 'no hay ninguna sesión en pleno-speaker-map/').toBeGreaterThan(0)
    expect(
      huecosDePresupuesto.length,
      'ninguna sesión del disco tiene ya huecos de presupuesto: este bloque ha dejado de ' +
        'aislar el caso que vigila, y hay que darle un fixture propio en vez de repuntarlo',
    ).toBeGreaterThan(0)
    // Y son lo que dicen ser: sin cuenta de intentos, que es el caso entero.
    expect(huecosDePresupuesto.every(({ f }) => f.attempts == null)).toBe(true)
  })

  it('does not retire a session on the strength of a count nobody recorded', () => {
    // These gaps are chunks the nightly budget never reached. They carry no
    // `attempts`, and they must not: retiring a chunk for being under-budgeted
    // is exactly backwards, and reading an absent count as "given up on" would
    // do it to every session in the backlog at once.
    expect(
      writtenOffChunks(
        huecosDePresupuesto.map(({ f }) => f),
        GATE,
      ).size,
    ).toBe(0)
  })

  it('una sesión con huecos que nadie miró no se declara terminada', () => {
    // La consecuencia de lo anterior sobre el fichero real, y la razón por la
    // que importa: si un hueco de presupuesto contara como amortizado, la
    // sesión saldría de la cola y esos trozos no se transcribirían nunca.
    const conHuecos = new Set(huecosDePresupuesto.map(({ id }) => id))
    expect(conHuecos.size).toBeGreaterThan(0)
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

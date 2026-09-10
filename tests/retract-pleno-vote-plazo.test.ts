import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  validateVote,
  validateSnapshot,
  validateRetraction,
  retractVoteRecord,
  retractVoteDueBy,
  revokeRetraction,
  findLiveRetraction,
  isLiveRetraction,
  PlenoVoteValidationError,
  PlenoVoteRetractionError,
  RETRACTION_SCOPES,
  type PlenoVote,
  type PlenoVotesSnapshot,
} from '../src/scraper/pleno-votes'
import { computeDepartmentStats } from '../src/lib/department-stats'
import { runRelationsChecks } from '../src/scraper/relations-check'

/**
 * El tercer alcance de una retracción: SÓLO el plazo.
 *
 * Existe por un caso publicado. La votación rx4hb4-11 lleva `dueBy: 2026-02-14`
 * y, como cita, «el día 14 este sábado es el último día»: no sale de un acta,
 * es una paráfrasis de la transcripción automática, y lo que dice es el último
 * día para PRESENTAR la solicitud a una convocatoria, no un plazo para ejecutar
 * el acuerdo. Es el único «plazo vencido» que publicaba la portada.
 *
 * Con los dos alcances que había, el curador tenía que elegir entre dejar el
 * plazo falso o retirar la votación entera, que tiene el resultado bien
 * citado. Es el mismo razonamiento que dio origen a `breakdown`: las dos
 * mitades de un registro no tienen el mismo respaldo, y quitar la que no lo
 * tiene no puede obligar a borrar la que sí.
 *
 * El corpus se construye aquí, con los validadores de producción, igual que en
 * retract-pleno-vote.test.ts; cada «desaparece» va con su ablación.
 */

const SIG = {
  reason: 'la fecha no sale literal de un acta; es la paráfrasis de otro plazo',
  editor: 'Test Curator',
  at: '2026-09-10T10:00:00.000Z',
}
const REVOKE = {
  reason: 'el acta publicada fija ese plazo con estas mismas palabras',
  editor: 'Test Curator',
  at: '2026-09-11T10:00:00.000Z',
}
const OVERDUE_BY = '2026-01-15'
const DUE_BY_SOURCE = 'con un plazo de ejecución de seis meses desde la firma del acta'
const NOW = new Date('2026-09-10')
const URL = 'https://example.org/actas/fixture.pdf'

function makeVote(id: string, over: Partial<PlenoVote> = {}): PlenoVote {
  const [plenoId, num] = id.split('-')
  const votes = over.votes ?? [
    { bloc: 'PSOE' as const, direction: 'a_favor' as const, seats: 11 },
    { bloc: 'PP' as const, direction: 'en_contra' as const, seats: 7 },
  ]
  const ref = {
    kind: 'acta' as const,
    url: URL,
    publisher: 'Fixture — Ayuntamiento de Riba-roja de Túria',
    retrievedAt: '2026-03-20',
    verification: 'sin-verificar' as const,
  }
  return validateVote({
    id,
    plenoId,
    itemNumber: Number(num),
    plenoDate: '2026-03-12',
    title: 'Aprobación del expediente de contratación del banco de pruebas',
    outcome: 'aprobado',
    sourceUrl: URL,
    sourcePublisher: 'Fixture — Ayuntamiento de Riba-roja de Túria',
    retrievedAt: '2026-03-20',
    provenance: { outcome: ref, breakdown: votes.length > 0 ? ref : null },
    ...over,
    votes,
  })
}

/** Un voto con plazo vencido y departamento, otro sin nada de eso. */
function corpus(): PlenoVotesSnapshot {
  return validateSnapshot({
    generatedAt: '2026-09-10T00:00:00.000Z',
    source: { description: 'fixture', contract: 'fixture' },
    items: [
      makeVote('fixp-01', {
        department: 'urbanismo',
        dueBy: OVERDUE_BY,
        dueBySource: DUE_BY_SOURCE,
      }),
      makeVote('fixp-02', { department: 'urbanismo' }),
    ],
    retractions: [],
  })
}

const conPlazo = (snap: PlenoVotesSnapshot) => snap.items.find((v) => v.dueBy)!
const ceros = () => Object.fromEntries(RETRACTION_SCOPES.map((s) => [s, 0]))

describe('el alcance «plazo» existe y empieza a cero', () => {
  it('es uno de los alcances, y el recuento de retracciones lo lleva', () => {
    expect(RETRACTION_SCOPES).toContain('plazo')
    const snap = corpus()
    expect(conPlazo(snap)).toBeDefined() // el corpus tiene lo que los casos necesitan
    // Derivado de la lista, no escrito: un alcance nuevo no deja esto atrás.
    expect(snap.stats.retracted).toEqual(ceros())
  })
})

describe('retractVoteDueBy — se retira el plazo y nada más', () => {
  it('quita dueBy y dueBySource; resultado, título, desglose y fuentes se quedan', () => {
    const snap = corpus()
    const target = conPlazo(snap)
    expect(target.dueBy).toBe(OVERDUE_BY) // ablación

    const after = validateSnapshot(retractVoteDueBy(snap, target.id, SIG))
    const kept = after.items.find((v) => v.id === target.id)!

    expect(kept.dueBy).toBeUndefined()
    expect(kept.dueBySource).toBeUndefined()
    expect(kept.dueByRetracted?.editor).toBe(SIG.editor)
    expect(kept.dueByRetracted?.reason).toBe(SIG.reason)
    expect(kept.outcome).toBe(target.outcome)
    expect(kept.title).toBe(target.title)
    expect(kept.votes).toEqual(target.votes)
    expect(kept.provenance).toEqual(target.provenance)
    // Los recuentos de la votación no se mueven: sólo se retiró una fecha.
    expect(after.stats.byOutcome).toEqual(snap.stats.byOutcome)
    expect(after.stats.total).toBe(snap.stats.total)
    expect(after.stats.retracted.plazo).toBe(snap.stats.retracted.plazo + 1)
  })

  it('deja de alimentar el aviso de «plazos vencidos»', () => {
    const snap = corpus()
    const target = conPlazo(snap)
    const before = computeDepartmentStats({ votes: snap, now: NOW })
    expect(before.plazosVencidosCount).toBeGreaterThan(0) // ablación

    const after = computeDepartmentStats({
      votes: validateSnapshot(retractVoteDueBy(snap, target.id, SIG)),
      now: NOW,
    })
    expect(after.plazosVencidosCount).toBe(before.plazosVencidosCount - 1)
  })

  it('archiva el plazo retirado tal cual estaba', () => {
    const snap = corpus()
    const target = conPlazo(snap)
    const after = validateSnapshot(retractVoteDueBy(snap, target.id, SIG))
    const entry = findLiveRetraction(after, target.id, 'plazo')!
    expect(entry.scope).toBe('plazo')
    expect(entry.originalPlazo).toEqual({ dueBy: OVERDUE_BY, dueBySource: DUE_BY_SOURCE })
    expect(entry.original).toBeNull()
    expect(entry.originalVotes).toBeNull()
  })

  it('rechaza una votación sin plazo, y un plazo ya retirado', () => {
    const snap = corpus()
    const sinPlazo = snap.items.find((v) => !v.dueBy)!
    expect(() => retractVoteDueBy(snap, sinPlazo.id, SIG)).toThrow(PlenoVoteRetractionError)
    const once = validateSnapshot(retractVoteDueBy(snap, conPlazo(snap).id, SIG))
    expect(() => retractVoteDueBy(once, conPlazo(snap).id, SIG)).toThrow(PlenoVoteRetractionError)
    expect(() => retractVoteDueBy(snap, 'nosuch-99', SIG)).toThrow(PlenoVoteRetractionError)
  })

  it('exige la firma, como los otros dos alcances', () => {
    const snap = corpus()
    const id = conPlazo(snap).id
    expect(() => retractVoteDueBy(snap, id, { ...SIG, reason: 'corto' })).toThrow(
      PlenoVoteRetractionError,
    )
    expect(() => retractVoteDueBy(snap, id, { ...SIG, editor: '  ' })).toThrow(
      PlenoVoteRetractionError,
    )
  })
})

describe('un plazo retirado no puede volver en silencio', () => {
  it('validateSnapshot rechaza el plazo republicado mientras la retracción siga viva', () => {
    const snap = corpus()
    const target = conPlazo(snap)
    const after = validateSnapshot(retractVoteDueBy(snap, target.id, SIG))
    const republicado = after.items.map((v) => (v.id === target.id ? target : v))

    // ABLACIÓN: esas mismas filas sin el registro de retracciones validan, así
    // que lo que rechaza es la retracción viva, no la fila.
    expect(() => validateSnapshot({ ...after, retractions: [], items: republicado })).not.toThrow()
    expect(() => validateSnapshot({ ...after, items: republicado })).toThrow(
      PlenoVoteValidationError,
    )
  })

  it('rechaza un sello dueByRetracted cuya entrada del registro ya no está', () => {
    const snap = corpus()
    const after = validateSnapshot(retractVoteDueBy(snap, conPlazo(snap).id, SIG))
    expect(() => validateSnapshot(after)).not.toThrow() // ablación
    expect(() => validateSnapshot({ ...after, retractions: [] })).toThrow(PlenoVoteValidationError)
  })

  it('rechaza una fila con plazo y sello a la vez', () => {
    const snap = corpus()
    const target = conPlazo(snap)
    expect(() =>
      validateVote({
        ...target,
        dueByRetracted: { reason: SIG.reason, editor: SIG.editor, retractedAt: SIG.at },
      }),
    ).toThrow(PlenoVoteValidationError)
  })

  it('el validador rechaza retirar el registro entero sobre un plazo retirado', () => {
    // Mismo diseño que con el desglose: el paso puro es permisivo (debilita) y
    // es el validador, que corre antes de CADA escritura, el que se niega.
    const snap = corpus()
    const id = conPlazo(snap).id
    const conRetracion = validateSnapshot(retractVoteDueBy(snap, id, SIG))
    expect(conRetracion.items.map((v) => v.id)).toContain(id) // ablación
    expect(() => validateSnapshot(retractVoteRecord(conRetracion, id, SIG))).toThrow(
      PlenoVoteValidationError,
    )
  })
})

/**
 * Lo que el CLI escribe bien también puede llegar escrito a mano, y entonces
 * sólo queda el validador. Cada guarda de la entrada y del sello tiene aquí su
 * caso: sin ellos, cualquiera de las cinco se podía quitar con la suite verde.
 */
describe('la entrada del registro y el sello de la fila se validan enteros', () => {
  const retirado = () => {
    const snap = corpus()
    const id = conPlazo(snap).id
    const after = validateSnapshot(retractVoteDueBy(snap, id, SIG))
    return {
      entry: findLiveRetraction(after, id, 'plazo')!,
      fila: after.items.find((v) => v.id === id)!,
    }
  }

  it('la entrada guarda la fecha y la cláusula enteras', () => {
    const { entry } = retirado()
    const plazo = entry.originalPlazo!
    expect(() => validateRetraction(entry)).not.toThrow() // ablación
    expect(() => validateRetraction({ ...entry, originalPlazo: null })).toThrow(/originalPlazo/)
    expect(() => validateRetraction({ ...entry, originalPlazo: undefined })).toThrow(
      /originalPlazo/,
    )
    expect(() =>
      validateRetraction({ ...entry, originalPlazo: { ...plazo, dueBy: '14/02/2026' } }),
    ).toThrow(/originalPlazo\.dueBy/)
    expect(() =>
      validateRetraction({ ...entry, originalPlazo: { ...plazo, dueBySource: 'el día 14' } }),
    ).toThrow(/originalPlazo\.dueBySource/)
  })

  it('originalPlazo sólo viaja en una retracción de plazo', () => {
    const snap = corpus()
    const sinPlazo = snap.items.find((v) => !v.dueBy)!
    const conRegistro = validateSnapshot(retractVoteRecord(snap, sinPlazo.id, SIG))
    const entry = findLiveRetraction(conRegistro, sinPlazo.id, 'record')!
    expect(() => validateRetraction(entry)).not.toThrow() // ablación
    expect(() =>
      validateRetraction({
        ...entry,
        originalPlazo: { dueBy: OVERDUE_BY, dueBySource: DUE_BY_SOURCE },
      }),
    ).toThrow(/originalPlazo belongs to a plazo retraction/)
  })

  it('el sello de la fila lleva la firma entera: motivo, editor y fecha', () => {
    const { fila } = retirado()
    const sello = fila.dueByRetracted!
    expect(() => validateVote(fila)).not.toThrow() // ablación
    expect(() => validateVote({ ...fila, dueByRetracted: { ...sello, reason: 'corto' } })).toThrow(
      /dueByRetracted\.reason/,
    )
    expect(() => validateVote({ ...fila, dueByRetracted: { ...sello, editor: '  ' } })).toThrow(
      /dueByRetracted\.editor/,
    )
    expect(() =>
      validateVote({ ...fila, dueByRetracted: { ...sello, retractedAt: 'ayer' } }),
    ).toThrow(/dueByRetracted\.retractedAt/)
  })
})

describe('revocar una retracción de plazo es explícito, firmado y deja registro', () => {
  it('devuelve el plazo con su cita y sella la entrada en vez de borrarla', () => {
    const snap = corpus()
    const target = conPlazo(snap)
    const retirado = validateSnapshot(retractVoteDueBy(snap, target.id, SIG))
    expect(retirado.items.find((v) => v.id === target.id)!.dueBy).toBeUndefined() // ablación

    const revocado = validateSnapshot(revokeRetraction(retirado, target.id, 'plazo', REVOKE))
    const back = revocado.items.find((v) => v.id === target.id)!
    expect(back.dueBy).toBe(target.dueBy)
    expect(back.dueBySource).toBe(target.dueBySource)
    expect(back.dueByRetracted).toBeUndefined()

    expect(revocado.retractions.length).toBe(retirado.retractions.length)
    const entry = revocado.retractions.find((r) => r.voteId === target.id)!
    expect(isLiveRetraction(entry)).toBe(false)
    expect(entry.revokedBy).toBe(REVOKE.editor)
    expect(revocado.stats.retracted.plazo).toBe(snap.stats.retracted.plazo)
  })
})

describe('check:relations vigila también el sello del plazo', () => {
  const run = (votes: unknown) =>
    runRelationsChecks({ votes: votes as never }).find((r) => r.name === 'votes-retractions')!

  it('cuenta la retracción de plazo como algo comprobado', () => {
    const snap = corpus()
    const after = validateSnapshot(retractVoteDueBy(snap, conPlazo(snap).id, SIG))
    const r = run(after)
    expect(r.checked).toBeGreaterThan(0)
    expect(r.status).toBe('ok')
  })

  it('se rompe con un sello de plazo sin entrada en el registro', () => {
    const snap = corpus()
    const target = conPlazo(snap)
    const after = validateSnapshot(retractVoteDueBy(snap, target.id, SIG))
    const r = run({ ...after, retractions: [] })
    expect(r.status).toBe('broken')
    expect(r.broken.join(' ')).toContain(target.id)
  })

  it('se rompe si alguien vuelve a escribir el plazo a mano', () => {
    const snap = corpus()
    const target = conPlazo(snap)
    const after = validateSnapshot(retractVoteDueBy(snap, target.id, SIG))
    const tampered = {
      ...after,
      items: after.items.map((v) => {
        if (v.id !== target.id) return v
        const { dueByRetracted: _quitado, ...rest } = v
        return { ...rest, dueBy: target.dueBy, dueBySource: target.dueBySource }
      }),
    }
    const r = run(tampered)
    expect(r.status).toBe('broken')
    expect(r.broken.join(' ')).toContain(target.id)
  })
})

/**
 * El fichero publicado, por lo que tiene que ser CIERTO de él con cero
 * retracciones de plazo o con trescientas.
 */
describe('el snapshot publicado cumple el invariante del plazo', () => {
  it('toda retracción de plazo viva deja su votación publicada, sin fecha y sellada', () => {
    const DATA = resolve(__dirname, '../public/data/pleno-votes.json')
    const snap = validateSnapshot(JSON.parse(readFileSync(DATA, 'utf8')))
    const byId = new Map(snap.items.map((v) => [v.id, v]))
    const plazos = snap.retractions.filter((r) => isLiveRetraction(r) && r.scope === 'plazo')
    let inspected = 0
    for (const r of plazos) {
      inspected += 1
      const item = byId.get(r.voteId)
      expect(item, `${r.voteId} tiene el plazo retirado pero no está publicada`).toBeDefined()
      expect(item!.dueBy).toBeUndefined()
      expect(item!.dueByRetracted).toBeDefined()
      expect(r.originalPlazo?.dueBy).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
    expect(inspected).toBe(plazos.length)
  })
})

/**
 * Lo que `extract-pleno-claims` apunta en su manifiesto según cómo acabó cada
 * sesión.
 *
 * El caso que lo trae, del 2026-11-23: re-extraer `1237hbp` hizo 225 llamadas
 * al modelo, la guarda de huérfanos se negó a sobrescribir (las declaraciones
 * nuevas dejaban sin cita a hallazgos publicados) y el manifiesto salió
 * `{"attempted":0,"skipped":{},"outcome":{"windowsAnswered":225}}` — idéntico a
 * una pasada que no hizo nada. Regla 2 de DATA_INTEGRITY: intentado / hecho /
 * nunca intentado / saltado-con-motivo, por separado.
 */
import { describe, expect, it } from 'vitest'
import { anotarDesenlace, decidirDesenlace } from '../src/scraper/pleno-claims-desenlace'
import {
  assessManifest,
  NO_LLM_STATS,
  SKIP_ORPHAN_GUARD,
  startRun,
  type RunManifest,
} from '../src/scraper/run-manifest'

const LLM_225 = { ...NO_LLM_STATS, calls: 225, ok: 225, tokens: 900_000 }

function manifiestoDe(
  desenlaces: Parameters<typeof anotarDesenlace>[1][],
  llm = LLM_225,
): RunManifest {
  const run = startRun('extract-pleno-claims', {
    backend: 'claude-code',
    getStats: () => llm,
  })
  for (const d of desenlaces) anotarDesenlace(run, d)
  run.record('windowsAnswered', 225)
  return run.finish({ write: false }).manifest
}

const codes = (m: RunManifest) => assessManifest(m).map((f) => f.code)

describe('decidirDesenlace', () => {
  const vieja = [{ id: 'a' }, { id: 'b' }]

  it('la guarda de huérfanos se niega cuando una cita publicada desaparece', () => {
    const d = decidirDesenlace({
      fresh: [{ id: 'x' }],
      previous: vieja,
      cited: new Set(['a']),
      forceOrphanFindings: false,
    })
    expect(d).toEqual({ tipo: 'orphan-guard', orphans: ['a'] })
  })

  it('con --force-orphan-findings sobrescribe (y lo dice)', () => {
    const d = decidirDesenlace({
      fresh: [{ id: 'x' }],
      previous: vieja,
      cited: new Set(['a']),
      forceOrphanFindings: true,
    })
    expect(d).toEqual({ tipo: 'overwrite', claims: 1, orphansForced: ['a'] })
  })

  it('vacía sobre una sesión poblada se conserva antes de mirar citas', () => {
    const d = decidirDesenlace({
      fresh: [],
      previous: vieja,
      cited: new Set(['a']),
      forceOrphanFindings: true,
    })
    expect(d).toEqual({ tipo: 'preserved-empty' })
  })

  it('sin citas perdidas sobrescribe', () => {
    const d = decidirDesenlace({
      fresh: [{ id: 'a' }, { id: 'z' }],
      previous: vieja,
      cited: new Set(['a']),
      forceOrphanFindings: false,
    })
    expect(d).toEqual({ tipo: 'overwrite', claims: 2, orphansForced: [] })
  })

  it('vacía sobre una sesión nueva es «vacía», no conservada', () => {
    const d = decidirDesenlace({
      fresh: [],
      previous: [],
      cited: undefined,
      forceOrphanFindings: false,
    })
    expect(d).toEqual({ tipo: 'empty' })
  })
})

describe('manifiesto de una sesión que la guarda de huérfanos conservó', () => {
  const m = manifiestoDe([{ tipo: 'orphan-guard', orphans: ['a', 'b'] }])

  it('cuenta la sesión como intentada y saltada por la guarda', () => {
    expect(m.attempted).toBe(1)
    expect(m.judged).toBe(0)
    expect(m.neverAttempted).toBe(0)
    expect(m.skipped).toEqual({ [SKIP_ORPHAN_GUARD]: 1 })
    expect(SKIP_ORPHAN_GUARD).toBe('orphan-guard')
  })

  it('check:runs lo nombra como aviso, ni error ni silencio', () => {
    const f = assessManifest(m)
    expect(f.filter((x) => x.level === 'error')).toEqual([])
    expect(codes(m)).toContain('preserved-by-guard')
    expect(codes(m)).not.toContain('no-work')
    // No fue «nuestra puerta de calidad rechazó la salida»: la salida pudo ser
    // buena; lo que se protegió fueron citas publicadas.
    expect(codes(m)).not.toContain('rejected-on-quality')
    expect(codes(m)).not.toContain('unaccounted-items')
  })

  it('el aviso dice cuántas sesiones y cuántas llamadas se descartaron', () => {
    const f = assessManifest(m).find((x) => x.code === 'preserved-by-guard')
    expect(f?.message).toContain('1 session')
    expect(f?.message).toContain('225')
  })

  it('en una pasada mixta el aviso sigue saliendo', () => {
    const mixta = manifiestoDe([
      { tipo: 'overwrite', claims: 248, orphansForced: [] },
      { tipo: 'orphan-guard', orphans: ['a'] },
    ])
    expect(mixta.attempted).toBe(2)
    expect(mixta.judged).toBe(1)
    expect(codes(mixta)).toContain('preserved-by-guard')
    expect(codes(mixta)).not.toContain('unaccounted-items')
  })

  it('un backend mudo no se esconde tras la guarda: sigue siendo no-work', () => {
    const muda = manifiestoDe([{ tipo: 'orphan-guard', orphans: ['a'] }], {
      ...NO_LLM_STATS,
      calls: 3,
      failed: 3,
    })
    expect(codes(muda)).toContain('no-work')
  })
})

describe('los otros desenlaces no cambian', () => {
  it('veda: saltada, no intentada', () => {
    const m = manifiestoDe([{ tipo: 'conservada-veda' }])
    expect(m.attempted).toBe(0)
    expect(m.skipped).toEqual({ 'loreg-freeze — atribución conservada': 1 })
  })

  it('vacía sobre poblada: intentada y saltada con su motivo', () => {
    const m = manifiestoDe([{ tipo: 'preserved-empty' }])
    expect(m.attempted).toBe(1)
    expect(m.skipped).toEqual({ 'extraction empty — previous claims preserved': 1 })
  })

  it('sobrescrita: juzgada, con sus declaraciones', () => {
    const m = manifiestoDe([{ tipo: 'overwrite', claims: 248, orphansForced: [] }])
    expect(m.attempted).toBe(1)
    expect(m.judged).toBe(1)
    expect(m.outcome.claims).toBe(248)
  })

  it('vacía nueva: nunca intentada', () => {
    const m = manifiestoDe([{ tipo: 'empty' }])
    expect(m.attempted).toBe(1)
    expect(m.neverAttempted).toBe(1)
  })
})

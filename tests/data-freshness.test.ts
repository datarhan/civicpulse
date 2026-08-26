/**
 * Freshness-helper contract tests.
 *
 * Locks the boundaries so a future refactor can't silently shift the
 * tone scheme — operators rely on the visual signal to triage stale
 * scrapers, and a Pill that turns warn 1h too early or too late would
 * be a quiet trust erosion.
 */
import { describe, expect, it } from 'vitest'

import {
  ageHours,
  freshnessLabelKey,
  freshnessTone,
  worstFreshness,
} from '../src/lib/data-freshness'

const REF_NOW = new Date('2026-05-21T12:00:00.000Z').getTime()

function isoHoursAgo(h: number): string {
  return new Date(REF_NOW - h * 60 * 60 * 1000).toISOString()
}

describe('ageHours', () => {
  it('returns 0 for an iso equal to now', () => {
    expect(ageHours(isoHoursAgo(0), REF_NOW)).toBe(0)
  })

  it('returns the elapsed hours for a past iso', () => {
    expect(ageHours(isoHoursAgo(5), REF_NOW)).toBeCloseTo(5)
    expect(ageHours(isoHoursAgo(168), REF_NOW)).toBeCloseTo(168)
  })

  it('clamps future iso to 0', () => {
    expect(ageHours(isoHoursAgo(-12), REF_NOW)).toBe(0)
  })

  it('returns +Infinity for missing input', () => {
    expect(ageHours(undefined as unknown as string, REF_NOW)).toBe(Number.POSITIVE_INFINITY)
    expect(ageHours('', REF_NOW)).toBe(Number.POSITIVE_INFINITY)
    expect(ageHours(null as unknown as string, REF_NOW)).toBe(Number.POSITIVE_INFINITY)
  })

  it('returns +Infinity for an unparseable string', () => {
    expect(ageHours('not a date', REF_NOW)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('freshnessTone', () => {
  it('returns ok for < 36 h', () => {
    expect(freshnessTone(isoHoursAgo(0), REF_NOW)).toBe('ok')
    expect(freshnessTone(isoHoursAgo(12), REF_NOW)).toBe('ok')
    expect(freshnessTone(isoHoursAgo(35), REF_NOW)).toBe('ok')
  })

  it('flips to civic at the 36 h boundary', () => {
    expect(freshnessTone(isoHoursAgo(35.99), REF_NOW)).toBe('ok')
    expect(freshnessTone(isoHoursAgo(36), REF_NOW)).toBe('civic')
  })

  it('stays civic up to 7 d', () => {
    expect(freshnessTone(isoHoursAgo(24 * 6), REF_NOW)).toBe('civic')
    expect(freshnessTone(isoHoursAgo(24 * 7 - 0.01), REF_NOW)).toBe('civic')
  })

  it('flips to warn at the 7 d boundary', () => {
    expect(freshnessTone(isoHoursAgo(24 * 7), REF_NOW)).toBe('warn')
  })

  it('stays warn up to 30 d', () => {
    expect(freshnessTone(isoHoursAgo(24 * 29), REF_NOW)).toBe('warn')
    expect(freshnessTone(isoHoursAgo(24 * 30 - 0.01), REF_NOW)).toBe('warn')
  })

  it('flips to crit at the 30 d boundary', () => {
    expect(freshnessTone(isoHoursAgo(24 * 30), REF_NOW)).toBe('crit')
    expect(freshnessTone(isoHoursAgo(24 * 90), REF_NOW)).toBe('crit')
  })

  it('treats missing/invalid iso as crit (broken signal)', () => {
    expect(freshnessTone(undefined as unknown as string, REF_NOW)).toBe('crit')
    expect(freshnessTone('', REF_NOW)).toBe('crit')
    expect(freshnessTone('garbage', REF_NOW)).toBe('crit')
  })
})

describe('freshnessLabelKey', () => {
  it('maps every tone bucket to a stable i18n key', () => {
    expect(freshnessLabelKey(isoHoursAgo(1), REF_NOW)).toBe('freshness.fresh')
    expect(freshnessLabelKey(isoHoursAgo(48), REF_NOW)).toBe('freshness.recent')
    expect(freshnessLabelKey(isoHoursAgo(24 * 14), REF_NOW)).toBe('freshness.stale')
    expect(freshnessLabelKey(isoHoursAgo(24 * 60), REF_NOW)).toBe('freshness.dead')
  })

  it('treats missing iso as freshness.dead', () => {
    expect(freshnessLabelKey('', REF_NOW)).toBe('freshness.dead')
  })
})

// ---------------------------------------------------------------------------
// Presupuesto por clase de cadencia.
//
// El umbral plano de 30 días llamaba `crit` —«dead — likely broken»— a
// `promises.json` con 51 días, mientras `check:cadence` lo daba VERDE con su
// plazo curado de 120. Un mismo fichero, dos veredictos, y /departamentos le
// enseñaba al lector el que asusta. Con presupuesto, el tono de lectura y la
// puerta de cadencia dicen lo mismo.
//
// Sin presupuesto NO cambia nada: los `describe` de arriba fijan los umbrales
// planos y son la prueba de que las otras quince páginas que usan <DataAsOf>
// siguen igual.
// ---------------------------------------------------------------------------
describe('freshnessTone con presupuesto de cadencia', () => {
  const B = 120 // días, la clase `curated`

  it('el defecto que motivó todo esto: 51 d de 120 es ok, no crit', () => {
    expect(freshnessTone(isoHoursAgo(24 * 51), REF_NOW)).toBe('crit') // plano: falso
    expect(freshnessTone(isoHoursAgo(24 * 51), REF_NOW, B)).toBe('ok') // por clase: cierto
  })

  it('ok por debajo de medio presupuesto', () => {
    expect(freshnessTone(isoHoursAgo(0), REF_NOW, B)).toBe('ok')
    expect(freshnessTone(isoHoursAgo(24 * 59.99), REF_NOW, B)).toBe('ok')
  })

  it('civic entre medio presupuesto y el plazo', () => {
    expect(freshnessTone(isoHoursAgo(24 * 60), REF_NOW, B)).toBe('civic')
    expect(freshnessTone(isoHoursAgo(24 * 119.99), REF_NOW, B)).toBe('civic')
  })

  it('warn al pasarse del plazo — que es justo lo que dice check:cadence', () => {
    expect(freshnessTone(isoHoursAgo(24 * 120), REF_NOW, B)).toBe('warn')
    expect(freshnessTone(isoHoursAgo(24 * 179.99), REF_NOW, B)).toBe('warn')
  })

  it('crit a partir de vez y media el plazo', () => {
    expect(freshnessTone(isoHoursAgo(24 * 180), REF_NOW, B)).toBe('crit')
  })

  it('escala con el plazo: 40 d es crit para un nocturno de 3 d', () => {
    expect(freshnessTone(isoHoursAgo(24 * 40), REF_NOW, 3)).toBe('crit')
    expect(freshnessTone(isoHoursAgo(24 * 1.2), REF_NOW, 3)).toBe('ok')
  })

  it('un presupuesto ausente o absurdo cae a los umbrales planos', () => {
    expect(freshnessTone(isoHoursAgo(24 * 51), REF_NOW, null)).toBe('crit')
    expect(freshnessTone(isoHoursAgo(24 * 51), REF_NOW, 0)).toBe('crit')
    expect(freshnessTone(isoHoursAgo(24 * 51), REF_NOW, -5)).toBe('crit')
  })

  it('un iso ausente sigue siendo crit, haya presupuesto o no', () => {
    expect(freshnessTone('', REF_NOW, B)).toBe('crit')
    expect(freshnessTone('garbage', REF_NOW, B)).toBe('crit')
  })
})

// ---------------------------------------------------------------------------
// Agregado de varias fuentes.
//
// /departamentos publicaba `stamps.sort()[0]` — la fecha MÁS VIEJA— y la
// pintaba con el umbral plano. Eso escondía el fallo contrario: un raspador
// nocturno muerto queda tapado por un fichero curado más viejo que él, porque
// el `min()` elige el curado y el curado tiene derecho a ser viejo.
//
// La fecha que se enseña sigue siendo la más vieja (es verdad que ése es el
// material más antiguo de la página); el TONO es el peor de todos contra el
// plazo de cada uno.
// ---------------------------------------------------------------------------
describe('worstFreshness', () => {
  it('la página real de hoy: nada incumple su plazo → ok', () => {
    const r = worstFreshness(
      [
        { file: 'officials.json', label: 'cargos', iso: isoHoursAgo(24 * 1.2) },
        { file: 'plenos-agendas.json', label: 'agendas', iso: isoHoursAgo(24 * 1.3) },
        { file: 'promises.json', label: 'promesas', iso: isoHoursAgo(24 * 51) },
        { file: 'pleno-votes.json', label: 'votos', iso: isoHoursAgo(24 * 21) },
        { file: 'quejas.json', label: 'quejas', iso: isoHoursAgo(8) },
      ],
      REF_NOW,
    )
    expect(r.tone).toBe('ok')
    // y sin perder el dato: la fecha enseñada sigue siendo la más vieja
    expect(r.oldestIso).toBe(isoHoursAgo(24 * 51))
  })

  it('REGRESIÓN H2: un nocturno muerto NO puede quedar tapado por un curado más viejo', () => {
    const r = worstFreshness(
      [
        // 40 días para un plazo de 3: muerto de verdad.
        { file: 'officials.json', label: 'cargos', iso: isoHoursAgo(24 * 40) },
        // Más VIEJO en fecha, pero dentro de su plazo curado de 120.
        { file: 'promises.json', label: 'promesas', iso: isoHoursAgo(24 * 51) },
      ],
      REF_NOW,
    )
    expect(r.tone).toBe('crit')
    // el `min()` habría señalado a promesas; el culpable es el nocturno
    expect(r.pinnedBy?.file).toBe('officials.json')
    expect(r.oldestIso).toBe(isoHoursAgo(24 * 51))
  })

  it('puntúa cada entrada contra SU plazo y las devuelve todas', () => {
    const r = worstFreshness(
      [
        { file: 'officials.json', label: 'cargos', iso: isoHoursAgo(24 * 40) },
        { file: 'promises.json', label: 'promesas', iso: isoHoursAgo(24 * 51) },
      ],
      REF_NOW,
    )
    expect(r.inputs).toHaveLength(2)
    expect(r.inputs.map((i) => i.tone)).toEqual(['crit', 'ok'])
    expect(r.inputs.map((i) => i.budgetDays)).toEqual([3, 120])
  })

  it('un fichero sin expectativa registrada usa los umbrales planos', () => {
    const r = worstFreshness(
      [{ file: 'no-existe-en-el-registro.json', label: 'x', iso: isoHoursAgo(24 * 51) }],
      REF_NOW,
    )
    expect(r.inputs[0].budgetDays).toBe(null)
    expect(r.tone).toBe('crit')
  })

  it('una entrada sin iso es crit — ausencia es señal rota, no desconocida', () => {
    const r = worstFreshness(
      [
        { file: 'officials.json', label: 'cargos', iso: isoHoursAgo(2) },
        { file: 'promises.json', label: 'promesas', iso: null },
      ],
      REF_NOW,
    )
    expect(r.tone).toBe('crit')
    expect(r.pinnedBy?.file).toBe('promises.json')
  })

  it('sin entradas no inventa un veredicto', () => {
    const r = worstFreshness([], REF_NOW)
    expect(r.tone).toBe('crit')
    expect(r.oldestIso).toBe(null)
    expect(r.pinnedBy).toBe(null)
  })
})

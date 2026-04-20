import { describe, it, expect } from 'vitest'
import { inferVotesFromTranscript } from '../src/scraper/pleno-vote-inference'

// A canonical Spanish pleno phrasing used by Spanish municipal secretarías.
// The "Se somete a votación" phrase is the segment boundary.
const CASTILIAN_PLENO = `
Señora Secretaria, passamos al siguiente punto del orden del día. Punto 3.—
Aprobación inicial del presupuesto municipal para el ejercicio 2026.

El concejal de Hacienda presenta el proyecto. Intervienen los grupos en el
turno correspondiente.

Se somete a votación el punto tercero. Votan a favor los grupos PSOE y
Compromís, con un total de 12 votos a favor. Vota en contra el Partido
Popular, 7 votos en contra. El grupo VOX se abstiene, 2 abstenciones. Queda
aprobado el punto.

Pasamos al punto 4.— Modificación de la ordenanza fiscal reguladora del IBI.

Se somete a votación el punto cuarto. A favor PSOE, PP, Compromís: 19 votos
a favor. En contra nadie: 0 votos en contra. Se abstiene VOX: 2 abstenciones.
Queda aprobado el punto.
`

// Valencian pleno phrasing (standard AVL spelling).
const VALENCIAN_PLENO = `
Senyora Secretària, passem al següent punt de l'ordre del dia. Punt 5.
Aprovació de la moció sobre mobilitat urbana.

S'assotmet a votació. A favor PSOE i Compromís, 12 vots a favor. En contra
el PP, 7 vots en contra. VOX s'absté, 2 abstencions. S'aprova la moció.
`

// Noise that should NOT produce a vote (no boundary phrase, no bloc-direction near each other).
const PREAMBLE_ONLY = `
Buenos días a todos. Damos comienzo al pleno ordinario. Antes de empezar,
saludamos a los vecinos que nos acompañan en la sala y a los que nos siguen
por el canal de YouTube del Ayuntamiento.
`

describe('pleno-vote-inference · CASTILIAN_PLENO', () => {
  const res = inferVotesFromTranscript(CASTILIAN_PLENO, {
    plenoId: 'test-cast',
    plenoDate: '2026-04-20',
  })

  it('scans two votable segments', () => {
    expect(res.stats.segmentsScanned).toBe(2)
  })

  it('emits both as suggestions with high confidence', () => {
    expect(res.suggestions).toHaveLength(2)
    for (const s of res.suggestions) {
      expect(s.confidence).toBeGreaterThanOrEqual(0.6)
    }
  })

  it('detects outcome: aprobado', () => {
    expect(res.suggestions.every((s) => s.outcome === 'aprobado')).toBe(true)
  })

  it('extracts bloc directions matching the tally', () => {
    const first = res.suggestions[0]
    const byBloc = Object.fromEntries(first.votes.map((v) => [v.bloc, v.direction]))
    expect(byBloc.PSOE).toBe('a_favor')
    expect(byBloc.Compromís).toBe('a_favor')
    expect(byBloc.PP).toBe('en_contra')
    expect(byBloc.VOX).toBe('abstencion')
  })

  it('flags every suggestion for human approval', () => {
    expect(res.suggestions.every((s) => s.requiresHumanApproval === true)).toBe(true)
  })

  it('captures the itemNumber when the transcript uses "Punto N"', () => {
    expect(res.suggestions[0].itemNumber).toBe(3)
    expect(res.suggestions[1].itemNumber).toBe(4)
  })
})

describe('pleno-vote-inference · VALENCIAN_PLENO', () => {
  const res = inferVotesFromTranscript(VALENCIAN_PLENO, {
    plenoId: 'test-val',
    plenoDate: '2026-04-20',
  })

  it('detects the segment boundary "S\'assotmet a votació"', () => {
    expect(res.stats.segmentsScanned).toBe(1)
  })

  it('emits one suggestion with four blocs', () => {
    expect(res.suggestions).toHaveLength(1)
    expect(res.suggestions[0].votes.length).toBeGreaterThanOrEqual(3)
    expect(res.suggestions[0].outcome).toBe('aprobado')
  })
})

describe('pleno-vote-inference · PREAMBLE_ONLY', () => {
  const res = inferVotesFromTranscript(PREAMBLE_ONLY, {
    plenoId: 'test-empty',
    plenoDate: '2026-04-20',
  })

  it('emits zero suggestions (no voting boundary phrase)', () => {
    expect(res.suggestions).toHaveLength(0)
  })
})

describe('pleno-vote-inference · confidence gating', () => {
  it('drops segments below the minConfidence threshold', () => {
    const thin = `Se somete a votación. El PSOE vota a favor.`
    const res = inferVotesFromTranscript(thin, {
      plenoId: 'test-thin',
      plenoDate: '2026-04-20',
      minConfidence: 0.8,
    })
    expect(res.suggestions).toHaveLength(0)
    expect(res.stats.droppedLowConfidence).toBeGreaterThan(0)
  })
})

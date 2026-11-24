/**
 * Re-applying Gate 2b to stored maps: only ever weakening, idempotent, and
 * «not evaluated» kept apart from «kept». Built from the REAL stored map of
 * 10yl550 (pleno-speaker-map/), whose chunk 2 holds the roll-call @1571–1587 s.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SpeakerMap } from '../src/scraper/speaker-map'
import { revalidarMapa, REGLA_REVALIDACION } from '../src/scraper/speaker-map-revalidar'
import { conservarAlReanudar } from '../src/scraper/speaker-map'

const REAL = JSON.parse(
  readFileSync(resolve('pleno-speaker-map/10yl550.json'), 'utf8'),
) as SpeakerMap
// The test must keep working after the stored map itself is cleaned, so it
// rebuilds the pre-cleaning state: chunk 2's roll-call rows are put back in
// exactly as the map stored them before 2026-11-24 (copied verbatim).
const ROLLCALL_ROWS = [
  {
    label: 'c02/SPEAKER_06',
    bloc: 'VOX',
    slug: 'jose-luis-fernandez-santamaria',
    heardAs: null,
    evidence: [
      { spokenBy: 'c02/SPEAKER_00', at: 1579, quote: 'Vox?', relation: 'turn-grant' as const },
    ],
    namesIndividual: true,
    weak: false,
  },
  {
    label: 'c02/SPEAKER_07',
    bloc: 'Compromís',
    slug: 'rafael-folgado-navarro',
    heardAs: null,
    evidence: [
      {
        spokenBy: 'c02/SPEAKER_00',
        at: 1583,
        quote: 'Compromís?',
        relation: 'turn-grant' as const,
      },
    ],
    namesIndividual: true,
    weak: false,
  },
]
const base = (): SpeakerMap => {
  const m = structuredClone(REAL)
  m.rows = [
    ...m.rows.filter((r) => !ROLLCALL_ROWS.some((x) => x.label === r.label)),
    ...structuredClone(ROLLCALL_ROWS),
  ]
  m.rejected = m.rejected.filter((r) => !ROLLCALL_ROWS.some((x) => x.label === r.label))
  delete m.revalidaciones
  return m
}

describe('revalidarMapa on 10yl550', () => {
  const before = base()
  const r = revalidarMapa(before, '2026-11-24')

  it('the fixture is what we think: the roll-call segments are in the stored map', () => {
    expect(
      before.segments.some((s) => s.speaker === 'c02/SPEAKER_06' && s.text === 'Abstenció.'),
    ).toBe(true)
  })

  it("moves the two roll-call rows to rejected, with the gate's own reason", () => {
    const moved = r.retiradas.map((x) => x.label)
    expect(moved).toEqual(expect.arrayContaining(['c02/SPEAKER_06', 'c02/SPEAKER_07']))
    for (const l of ['c02/SPEAKER_06', 'c02/SPEAKER_07']) {
      expect(r.map.rows.find((x) => x.label === l)).toBeUndefined()
      expect(r.map.rejected.find((x) => x.label === l)?.reason).toBe('roll-call')
    }
  })

  it('only weakens: every kept row is byte-identical to a row it had', () => {
    const had = new Set(before.rows.map((x) => JSON.stringify(x)))
    for (const row of r.map.rows) expect(had.has(JSON.stringify(row))).toBe(true)
    expect(r.map.rows.length + r.retiradas.length).toBe(before.rows.length)
    expect(r.map.segments).toEqual(before.segments)
    expect(r.map.generatedAt).toBe(before.generatedAt)
  })

  it("keeps chunk 2's real grants", () => {
    expect(r.map.rows.find((x) => x.label === 'c02/SPEAKER_02')?.bloc).toBe('PSOE')
  })

  it('records the pass, and the stats agree with the rows', () => {
    expect(r.map.revalidaciones).toEqual([
      {
        fecha: '2026-11-24',
        regla: REGLA_REVALIDACION,
        retiradas: r.retiradas.length,
        noEvaluadas: r.noEvaluadas.length,
      },
    ])
    expect(r.map.stats.rowsAccepted).toBe(r.map.rows.length)
    expect(r.map.stats.rowsRejected).toBe(r.map.rejected.length)
  })

  it('is idempotent: a second pass changes nothing', () => {
    const again = revalidarMapa(r.map, '2026-11-25')
    expect(again.retiradas).toHaveLength(0)
    expect(again.map).toEqual(r.map)
  })

  it('a first pass over a clean map still leaves its record', () => {
    const clean = revalidarMapa(r.map, '2026-11-24').map
    const fresh = structuredClone(clean)
    delete fresh.revalidaciones
    expect(revalidarMapa(fresh, '2026-11-26').map.revalidaciones?.[0]?.retiradas).toBe(0)
  })

  it('a row whose cited segment is no longer in the map is moved, under its own reason', () => {
    const m = base()
    m.rows.push({
      ...structuredClone(ROLLCALL_ROWS[0]),
      label: 'c02/SPEAKER_99',
      evidence: [{ spokenBy: 'c02/SPEAKER_00', at: 999999, quote: 'Vox?', relation: 'turn-grant' }],
    })
    const out = revalidarMapa(m, '2026-11-24')
    expect(out.map.rows.some((x) => x.label === 'c02/SPEAKER_99')).toBe(false)
    expect(out.map.rejected.find((x) => x.label === 'c02/SPEAKER_99')?.reason).toBe(
      'evidence-segment-missing',
    )
  })

  it('a row with no evidence is kept and counted as not evaluated, never as clean', () => {
    const m = base()
    m.rows.push({ ...structuredClone(ROLLCALL_ROWS[0]), label: 'c02/SPEAKER_98', evidence: [] })
    const out = revalidarMapa(m, '2026-11-24')
    expect(out.noEvaluadas.map((x) => x.label)).toContain('c02/SPEAKER_98')
    expect(out.map.rows.some((x) => x.label === 'c02/SPEAKER_98')).toBe(true)
  })

  it('a back-reference is kept and counted as not evaluated: Gate 2b does not apply to it', () => {
    const m = base()
    m.rows.push({
      ...structuredClone(ROLLCALL_ROWS[0]),
      label: 'c02/SPEAKER_97',
      weak: true,
      evidence: [
        { spokenBy: 'c02/SPEAKER_00', at: 1579, quote: 'Vox?', relation: 'back-reference' },
      ],
    })
    const out = revalidarMapa(m, '2026-11-24')
    expect(out.noEvaluadas.map((x) => x.label)).toContain('c02/SPEAKER_97')
    expect(out.map.rows.some((x) => x.label === 'c02/SPEAKER_97')).toBe(true)
    expect(out.conservadas + out.noEvaluadas.length + out.retiradas.length).toBe(m.rows.length)
  })
})

describe('conservarAlReanudar — segments follow their LABEL, like rows', () => {
  // The 15uvjew shape: chunk 2's reading ran past 1800 s. Re-opening chunk 3
  // must not take chunk 2's tail with it.
  const prior = {
    segments: [
      { start: 1790, end: 1799, speaker: 'c02/SPEAKER_01', text: 'Han votat…' },
      { start: 1857, end: 1858, speaker: 'c02/SPEAKER_01', text: '¿Esquerra Unida Podem?' },
      { start: 1858, end: 1859, speaker: 'c02/SPEAKER_05', text: 'A favor.' },
      { start: 1810, end: 1830, speaker: 'c03/SPEAKER_02', text: 'En el documento…' },
    ],
    rows: [
      {
        label: 'c02/SPEAKER_05',
        bloc: 'EU-Podem',
        slug: null,
        heardAs: null,
        evidence: [],
        namesIndividual: true,
        weak: false,
      },
      {
        label: 'c03/SPEAKER_02',
        bloc: 'PP',
        slug: null,
        heardAs: null,
        evidence: [],
        namesIndividual: false,
        weak: false,
      },
    ],
  }
  const kept = conservarAlReanudar(prior, new Set([2]))

  it("keeps chunk 2's overshooting tail with chunk 2's rows", () => {
    expect(kept.segments.map((x) => x.start)).toEqual([1790, 1857, 1858])
    expect(kept.rows.map((x) => x.label)).toEqual(['c02/SPEAKER_05'])
  })

  it("drops the re-opened chunk 3's own reading, by label, even inside chunk 3's time", () => {
    expect(kept.segments.some((x) => x.speaker.startsWith('c03/'))).toBe(false)
  })
})

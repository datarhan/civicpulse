import { describe, it, expect } from 'vitest'
import {
  matchAnnouncedOfficial,
  proposeFromSegments,
  longestRunFor,
} from '../scripts/propose-voice-references'

/**
 * Binding a voice to a named councillor is the same libel boundary as naming
 * an individual in a finding, so these proposals must be conservative: a
 * guess that reaches a curator as "confirmed" is worse than no guess at all.
 */

const OFFICIALS = [
  { slug: 'jose-angel-hernandez-carrizosa', name: 'José Ángel Hernández Carrizosa', party: 'PSOE' },
  { slug: 'jose-luis-ramos-march', name: 'José Luis Ramos March', party: 'PSOE' },
  { slug: 'laura-guzman-bruno', name: 'Laura Guzman Bruno', party: 'PP' },
  { slug: 'robert-raga-gadea', name: 'Robert Raga Gadea', party: 'PSOE' },
]

const seg = (start: number, end: number, speaker: string, text: string) => ({
  start,
  end,
  speaker,
  text,
})

describe('propose-voice-references — matchAnnouncedOfficial', () => {
  it('matches a full name regardless of accents and case', () => {
    expect(matchAnnouncedOfficial('Tiene la palabra JOSE LUIS RAMOS MARCH.', OFFICIALS)?.slug).toBe(
      'jose-luis-ramos-march',
    )
  })

  it('matches a given-name + surname pair', () => {
    expect(matchAnnouncedOfficial('Gràcies. Laura Guzman.', OFFICIALS)?.slug).toBe(
      'laura-guzman-bruno',
    )
  })

  it('refuses a bare given name shared by several councillors', () => {
    // "José" alone identifies nobody in a council with two of them.
    expect(matchAnnouncedOfficial('Passem la paraula a José.', OFFICIALS)).toBeNull()
  })

  it('accepts a bare given name when it is unique on the roster', () => {
    // The chair almost always announces by first name only. Rejecting every
    // bare given name found just 1 of 18 councillors on a real session; the
    // safety property that matters is uniqueness, not how many words are said.
    expect(matchAnnouncedOfficial('Endavant, Laura.', OFFICIALS)?.slug).toBe('laura-guzman-bruno')
  })

  it('resolves an ambiguous given name once a second name disambiguates it', () => {
    expect(matchAnnouncedOfficial('Ara, José Ángel.', OFFICIALS)?.slug).toBe(
      'jose-angel-hernandez-carrizosa',
    )
  })

  it('still refuses a two-part form that remains ambiguous', () => {
    const roster = [
      { slug: 'jose-luis-ramos-march', name: 'José Luis Ramos March' },
      { slug: 'jose-luis-fernandez-santamaria', name: 'José Luis Fernández Santamaría' },
    ]
    // Two José Luis on the roster — the pair identifies neither.
    expect(matchAnnouncedOfficial('Té la paraula José Luis.', roster)).toBeNull()
    // ...but the full name does.
    expect(matchAnnouncedOfficial('Té la paraula José Luis Ramos March.', roster)?.slug).toBe(
      'jose-luis-ramos-march',
    )
  })

  it('matches a distinctive surname on its own', () => {
    expect(matchAnnouncedOfficial('Gràcies, Guzman.', OFFICIALS)?.slug).toBe('laura-guzman-bruno')
  })

  it('prefers the longest matching name form', () => {
    const hit = matchAnnouncedOfficial('José Ángel Hernández Carrizosa, endavant.', OFFICIALS)
    expect(hit?.slug).toBe('jose-angel-hernandez-carrizosa')
  })

  it('returns null when no councillor is named', () => {
    expect(
      matchAnnouncedOfficial('Passem al següent punt de l ordre del dia.', OFFICIALS),
    ).toBeNull()
  })
})

describe('propose-voice-references — proposeFromSegments', () => {
  const known = new Set(['Robert Raga Gadea'])

  it('pairs an announcement by a known speaker with the next anonymous cluster', () => {
    const segs = [
      seg(0, 5, 'Robert Raga Gadea', 'Passem al punt 4. José Luis Ramos March.'),
      seg(5, 40, 'B', 'Sí, gràcies. El contracte...'),
    ]
    const out = proposeFromSegments(segs, OFFICIALS, known)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ cluster: 'B', slug: 'jose-luis-ramos-march' })
    expect(out[0].evidence).toContain('José Luis Ramos March')
  })

  it('ignores announcements made by an unidentified speaker', () => {
    // If we do not know who is talking, we cannot trust who they name.
    const segs = [seg(0, 5, 'C', 'Ara parla José Luis Ramos March.'), seg(5, 40, 'B', 'Bon dia...')]
    expect(proposeFromSegments(segs, OFFICIALS, known)).toEqual([])
  })

  it('never proposes a cluster that is already identified', () => {
    const segs = [
      seg(0, 5, 'Robert Raga Gadea', 'Endavant, Laura Guzman.'),
      seg(5, 40, 'Robert Raga Gadea', 'Segueixo jo mateix...'),
    ]
    expect(proposeFromSegments(segs, OFFICIALS, known)).toEqual([])
  })

  it('deduplicates repeated cluster→councillor pairings', () => {
    const segs = [
      seg(0, 5, 'Robert Raga Gadea', 'Laura Guzman.'),
      seg(5, 30, 'B', 'Primera intervenció'),
      seg(30, 35, 'Robert Raga Gadea', 'Una altra vegada, Laura Guzman.'),
      seg(35, 60, 'B', 'Segona intervenció'),
    ]
    const out = proposeFromSegments(segs, OFFICIALS, known)
    expect(out).toHaveLength(1)
  })

  it('skips the announcement when nobody else speaks afterwards', () => {
    const segs = [seg(0, 5, 'Robert Raga Gadea', 'Laura Guzman.')]
    expect(proposeFromSegments(segs, OFFICIALS, known)).toEqual([])
  })
})

describe('propose-voice-references — longestRunFor', () => {
  it('picks the longest contiguous segment for the cluster', () => {
    const segs = [seg(0, 3, 'B', 'corto'), seg(10, 60, 'B', 'largo'), seg(60, 62, 'C', 'otro')]
    expect(longestRunFor(segs, 'B')?.text).toBe('largo')
  })

  it('returns null for a cluster with no segments', () => {
    expect(longestRunFor([seg(0, 3, 'B', 'x')], 'ZZZ')).toBeNull()
  })
})

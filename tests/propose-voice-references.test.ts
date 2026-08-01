import { describe, it, expect } from 'vitest'
import {
  clipWindowAt,
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

  it('ignores a surname that is really part of a place name', () => {
    // Real false positive from session 15uvjew: "Pla de Tochar" is a local
    // area, not councillor Alfredo Plá. Handing over the floor ends with the
    // person's name; a toponym mid-sentence does not.
    const roster = [{ slug: 'alfredo-pla-gimenez', name: 'Alfredo Plá Gimenez' }]
    expect(
      matchAnnouncedOfficial('en este caso en la zona de diseminados del Pla de Tochar.', roster),
    ).toBeNull()
    expect(matchAnnouncedOfficial('Té la paraula, Alfredo.', roster)?.slug).toBe(
      'alfredo-pla-gimenez',
    )
  })

  it('ignores a name mentioned in passing rather than given the floor', () => {
    // Also real: "…facilitar a Manel, a Paula i a Diana, …" mentions Paula
    // mid-list. Whoever speaks next is not necessarily her.
    const roster = [{ slug: 'paula-navarro-sanfeliu', name: 'Paula Navarro Sanfeliu' }]
    expect(
      matchAnnouncedOfficial(
        'Aquest és el pressupost que anem a facilitar a Manel, a Paula i a Diana, i que recull...',
        roster,
      ),
    ).toBeNull()
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

describe('propose-voice-references — clipWindowAt', () => {
  const segs = [
    seg(0, 5, 'Robert Raga Gadea', 'Té la paraula, Laura.'),
    seg(5, 9, 'B', 'Bon dia a tots'),
    seg(9, 14, 'B', 'i moltes gràcies'),
    seg(14, 40, 'C', 'una altra veu completament distinta'),
    seg(200, 260, 'B', 'molt més tard, el mateix clúster'),
  ]

  it('cuts from the segment the evidence points at, not the longest run', () => {
    // The bug this pins: the clip used to come from the cluster's longest
    // segment anywhere in the session (here t=200), while the quote proves
    // only who spoke at t=5. When the diarizer's label is noisy those are
    // different people, which is exactly what the embedding cross-check
    // caught — two clips of "Alberto" scored 0.21 against each other.
    const w = clipWindowAt(segs, 'B', 5)
    expect(w).not.toBeNull()
    expect(w!.start).toBe(5)
  })

  it('extends across contiguous segments of the same speaker', () => {
    const w = clipWindowAt(segs, 'B', 5)
    // 5→9 and 9→14 are the same speaker back to back: 9 s available, capped at 8.
    expect(w!.duration).toBeCloseTo(8, 1)
  })

  it('stops at a speaker change rather than bleeding into the next voice', () => {
    const short = [seg(0, 3, 'B', 'corto'), seg(3, 30, 'C', 'otra persona')]
    const w = clipWindowAt(short, 'B', 0)
    expect(w!.duration).toBeCloseTo(3, 1)
  })

  it('returns null when the window would be too short to embed', () => {
    const tiny = [seg(0, 0.8, 'B', 'sí'), seg(0.8, 30, 'C', 'otra')]
    expect(clipWindowAt(tiny, 'B', 0)).toBeNull()
  })

  it('returns null when no segment of that speaker starts there', () => {
    expect(clipWindowAt(segs, 'ZZZ', 5)).toBeNull()
  })
})

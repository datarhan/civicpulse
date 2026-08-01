import { describe, it, expect } from 'vitest'
import { titleNamesOfficial, cvDocForOfficial } from '../src/lib/official-cv'

const roster = [
  { slug: 'robert-raga-gadea', name: 'Robert Raga Gadea' },
  { slug: 'jose-luis-ramos-march', name: 'José Luis Ramos March' },
  { slug: 'jose-luis-fernandez-santamaria', name: 'José Luis Fernández Santamaría' },
]
const docs = {
  docs: [
    {
      category: 'cv',
      label: 'Dades biogràfiques Robert Raga',
      url: 'https://x/PSOE-Robert-Raga-Gadea.pdf',
    },
    {
      category: 'cv',
      label: 'Dades biogràfiques José Luis Ramos',
      url: 'https://x/PSOE-Jose-Luis-Ramos.pdf',
    },
    { category: 'rpt', label: 'RPT 2025', url: 'https://x/rpt.pdf' },
  ],
}

describe('official-cv', () => {
  it('matches a councillor by given name plus a surname', () => {
    expect(titleNamesOfficial('Dades biogràfiques Robert Raga', roster[0])).toBe(true)
  })

  it('ignores accents and case', () => {
    expect(titleNamesOfficial('DADES BIOGRAFIQUES JOSE LUIS RAMOS', roster[1])).toBe(true)
  })

  it('refuses a given name with no surname', () => {
    // "José" alone fits three councillors here.
    expect(titleNamesOfficial('Dades biogràfiques José', roster[1])).toBe(false)
  })

  it('finds the right PDF for a councillor', () => {
    expect(cvDocForOfficial(docs, roster[1], roster)?.url).toContain('Jose-Luis-Ramos')
  })

  it('never returns a document belonging to a different councillor', () => {
    // José Luis Fernández must NOT inherit José Luis Ramos's CV.
    expect(cvDocForOfficial(docs, roster[2], roster)).toBeNull()
  })

  it('ignores non-CV documents', () => {
    expect(cvDocForOfficial({ docs: [docs.docs[2]] }, roster[0], roster)).toBeNull()
  })

  it('tolerates a missing snapshot', () => {
    expect(cvDocForOfficial(null, roster[0], roster)).toBeNull()
  })
})

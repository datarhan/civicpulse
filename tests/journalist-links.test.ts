/**
 * bioReportRoutes — the /cargos «Biografía →» join. Reproducer for the
 * 2026-07-30 fix: the card linked the ribarroja.es transparency LISTING
 * page (useless as a bio); it now routes to the official's published
 * journalist report, and superseded/archived assignments must never
 * resurrect old links.
 */
import { describe, expect, it } from 'vitest'
import { bioReportRoutes } from '../src/lib/journalist-links'

const ASSIGNMENTS = {
  items: [
    {
      id: 'a-bio-v1',
      status: 'archived',
      subject: { slug: 'robert-raga-gadea', kind: 'official' },
    },
    {
      id: 'a-bio-v4',
      status: 'promoted',
      subject: { slug: 'robert-raga-gadea', kind: 'official' },
    },
    { id: 'a-place', status: 'promoted', subject: { slug: 'mas-de-traver', kind: 'place' } },
    { id: 'a-nodraft', status: 'pending', subject: { slug: 'other-official', kind: 'official' } },
  ],
}

describe('bioReportRoutes', () => {
  it('routes an official to their published report and ignores archived/unpublished/non-official', () => {
    const reports = {
      items: [
        { assignmentId: 'a-bio-v1', promotedAt: '2026-07-20T00:00:00Z' },
        { assignmentId: 'a-bio-v4', promotedAt: '2026-07-30T00:00:00Z' },
        { assignmentId: 'a-place', promotedAt: '2026-07-30T00:00:00Z' },
      ],
    }
    const routes = bioReportRoutes(ASSIGNMENTS, reports)
    expect(routes.get('robert-raga-gadea')).toBe('/laboratorio/agentes/a-bio-v4')
    expect(routes.has('mas-de-traver')).toBe(false)
    expect(routes.has('other-official')).toBe(false)
    expect(routes.size).toBe(1)
  })

  it('requires a published report even when the assignment claims promoted', () => {
    const routes = bioReportRoutes(
      { items: [{ id: 'a-x', status: 'promoted', subject: { slug: 's', kind: 'official' } }] },
      { items: [] },
    )
    expect(routes.size).toBe(0)
  })

  it('picks the newest promotedAt when two live assignments cover one official', () => {
    const routes = bioReportRoutes(
      {
        items: [
          { id: 'a-old', status: 'promoted', subject: { slug: 's', kind: 'official' } },
          { id: 'a-new', status: 'promoted', subject: { slug: 's', kind: 'official' } },
        ],
      },
      {
        items: [
          { assignmentId: 'a-old', promotedAt: '2026-01-01T00:00:00Z' },
          { assignmentId: 'a-new', promotedAt: '2026-07-01T00:00:00Z' },
        ],
      },
    )
    expect(routes.get('s')).toBe('/laboratorio/agentes/a-new')
  })

  it('tolerates null/missing snapshots', () => {
    expect(bioReportRoutes(null, null).size).toBe(0)
    expect(bioReportRoutes({}, undefined).size).toBe(0)
  })
})

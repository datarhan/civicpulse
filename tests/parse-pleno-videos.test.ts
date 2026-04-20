import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  parseVideoEntry,
  parseChannelFeed,
  matchVideosToPlenos,
} from '../src/scraper/pleno-videos'

const FIXTURE = readFileSync(
  resolve('tests/fixtures/rr_youtube_channel_sample.jsonl'),
  'utf8',
)

describe('pleno-videos · parseVideoEntry', () => {
  it('extracts a canonical "Ple Ordinari" title', () => {
    const entry = parseVideoEntry({
      id: 'M1ywm72VHdo',
      title: "Ple Ordinari  20 d´abril  de 2026.",
    })
    expect(entry).not.toBeNull()
    expect(entry!.plenoDate).toBe('2026-04-20')
    expect(entry!.kind).toBe('ordinario')
    expect(entry!.url).toBe('https://www.youtube.com/watch?v=M1ywm72VHdo')
  })

  it('classifies "Ple extraordinari i urgent" as urgente', () => {
    const entry = parseVideoEntry({
      id: 'D4oEDO8jAIo',
      title: 'Ple extraordinari i urgent, 16 de març de 2026.',
    })
    expect(entry).not.toBeNull()
    expect(entry!.plenoDate).toBe('2026-03-16')
    expect(entry!.kind).toBe('urgente')
  })

  it('classifies a bare "Ple extraordinari" as extraordinario', () => {
    const entry = parseVideoEntry({
      id: '11CHARS_OK0',
      title: 'Ple extraordinari 5 de juliol de 2024',
    })
    expect(entry).not.toBeNull()
    expect(entry!.kind).toBe('extraordinario')
  })

  it('rejects "Declaracions portaveus" clips that quote a session date', () => {
    const entry = parseVideoEntry({
      id: 'xt7TEqr7eSQ',
      title: 'Declaracions portaveus Ple ordinari 9 de febrer de 2026',
    })
    expect(entry).toBeNull()
  })

  it('rejects an unrelated TV-program upload', () => {
    const entry = parseVideoEntry({
      id: '-3fmb7CU92w',
      title: 'Programa Tele Riba-roja 16 abril 2026',
    })
    expect(entry).toBeNull()
  })

  it('parses each Valencian month correctly', () => {
    const months = [
      ['gener',    '01'],
      ['febrer',   '02'],
      ['març',     '03'],
      ['abril',    '04'],
      ['maig',     '05'],
      ['juny',     '06'],
      ['juliol',   '07'],
      ['agost',    '08'],
      ['setembre', '09'],
      ['octubre',  '10'],
      ['novembre', '11'],
      ['desembre', '12'],
    ] as const
    // Pad the synthetic ytId with ASCII chars — YouTube ids only use [A-Za-z0-9_-].
    for (const [name, iso] of months) {
      const entry = parseVideoEntry({
        id: `test${iso}00000`.slice(0, 11),
        title: `Ple Ordinari 1 de ${name} de 2024`,
      })
      expect(entry).not.toBeNull()
      expect(entry!.plenoDate).toBe(`2024-${iso}-01`)
    }
  })

  it('handles day-with-apostrophe Valencian form (d\'abril)', () => {
    const entry = parseVideoEntry({
      id: 'abcdefghijk',
      title: "Ple Ordinari 20 d'abril de 2026",
    })
    expect(entry).not.toBeNull()
    expect(entry!.plenoDate).toBe('2026-04-20')
  })

  it('rejects invalid ytId format', () => {
    expect(parseVideoEntry({ id: 'short', title: 'Ple Ordinari 1 de gener de 2024' })).toBeNull()
    expect(parseVideoEntry({ id: 12345, title: 'Ple Ordinari 1 de gener de 2024' })).toBeNull()
  })

  it('rejects title without a year component', () => {
    expect(parseVideoEntry({ id: 'abcdefghijk', title: 'Ple Ordinari 1 de gener' })).toBeNull()
  })
})

describe('pleno-videos · parseChannelFeed', () => {
  it('walks the JSONL fixture and extracts only pleno sessions', () => {
    const snap = parseChannelFeed(FIXTURE, { generatedAt: '2026-04-20T00:00:00Z' })
    expect(snap.stats.totalVideosScanned).toBeGreaterThan(20)
    expect(snap.stats.plenoVideosMatched).toBeGreaterThan(0)
    // Every matched entry has a valid ISO date.
    for (const e of snap.items) {
      expect(e.plenoDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('sorts entries newest-first', () => {
    const snap = parseChannelFeed(FIXTURE)
    const dates = snap.items.map((i) => i.plenoDate)
    const sorted = [...dates].sort().reverse()
    expect(dates).toEqual(sorted)
  })

  it('aggregates byKind counts consistently', () => {
    const snap = parseChannelFeed(FIXTURE)
    const sum =
      snap.stats.byKind.ordinario +
      snap.stats.byKind.extraordinario +
      snap.stats.byKind.urgente +
      snap.stats.byKind.otro
    expect(sum).toBe(snap.stats.plenoVideosMatched)
  })

  it('deduplicates when the same ytId appears twice', () => {
    const dup = `
{"id":"M1ywm72VHdo","title":"Ple Ordinari 20 d'abril de 2026"}
{"id":"M1ywm72VHdo","title":"Ple Ordinari 20 d'abril de 2026"}
`
    const snap = parseChannelFeed(dup)
    expect(snap.items).toHaveLength(1)
  })
})

describe('pleno-videos · matchVideosToPlenos', () => {
  it('matches by exact date', () => {
    const snap = parseChannelFeed(FIXTURE)
    const match = matchVideosToPlenos(
      [
        { id: 'k4olcs',  date: '2026-04-20' },
        { id: 'ma87e0',  date: '2026-03-16' },
        { id: 'unmatch', date: '1999-01-01' },
      ],
      snap.items,
    )
    expect(match.k4olcs?.ytId).toBe('M1ywm72VHdo')
    expect(match.ma87e0?.ytId).toBe('D4oEDO8jAIo')
    expect(match.unmatch).toBeUndefined()
  })

  it('prefers a non-"otro" kind when two videos share a date', () => {
    const match = matchVideosToPlenos(
      [{ id: 'x', date: '2024-01-01' }],
      [
        { ytId: '11111111111', title: 'Stream test — 1 de gener de 2024', plenoDate: '2024-01-01', kind: 'otro', url: 'https://x' },
        { ytId: '22222222222', title: 'Ple Ordinari 1 de gener de 2024', plenoDate: '2024-01-01', kind: 'ordinario', url: 'https://y' },
      ],
    )
    expect(match.x.ytId).toBe('22222222222')
  })
})

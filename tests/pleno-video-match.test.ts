import { describe, it, expect } from 'vitest'
import { resolveVideoForPleno } from '../src/scraper/pleno-video-match'

const plenos = [
  { id: 'p-abr', date: '2026-04-20', kind: 'ordinario' },
  { id: 'p-mar', date: '2026-03-16', kind: 'urgente' },
]
const videos = [
  { plenoDate: '2026-04-20', kind: 'ordinario', url: 'https://yt/abr', ytId: 'abr' },
  { plenoDate: '2026-03-16', kind: 'urgente', url: 'https://yt/mar', ytId: 'mar' },
]

describe('resolveVideoForPleno', () => {
  it('resolves the video for a pleno by date with no warnings on a clean match', () => {
    const r = resolveVideoForPleno('p-abr', plenos, videos)
    expect(r.url).toBe('https://yt/abr')
    expect(r.warnings).toEqual([])
  })

  it('throws when the pleno id is unknown', () => {
    expect(() => resolveVideoForPleno('nope', plenos, videos)).toThrow(/pleno not found/i)
  })

  it('throws when no video matches the date', () => {
    expect(() => resolveVideoForPleno('p-mar', plenos, [videos[0]])).toThrow(/no video/i)
  })

  it('warns (but proceeds) when the single matched video kind disagrees with the pleno kind', () => {
    const r = resolveVideoForPleno('p-abr', plenos, [
      { plenoDate: '2026-04-20', kind: 'extraordinario', url: 'https://yt/x', ytId: 'x' },
    ])
    expect(r.url).toBe('https://yt/x')
    expect(r.warnings.join(' ')).toMatch(/kind mismatch|tipo/i)
  })

  it('disambiguates multiple same-date videos by matching kind', () => {
    const r = resolveVideoForPleno('p-abr', plenos, [
      { plenoDate: '2026-04-20', kind: 'extraordinario', url: 'https://yt/x', ytId: 'x' },
      { plenoDate: '2026-04-20', kind: 'ordinario', url: 'https://yt/ok', ytId: 'ok' },
    ])
    expect(r.url).toBe('https://yt/ok')
    expect(r.warnings.join(' ')).toMatch(/varios|multiple|2/i)
  })

  it('ABORTS (throws) when multiple videos share the date and kind cannot disambiguate', () => {
    const r = () =>
      resolveVideoForPleno('p-abr', plenos, [
        { plenoDate: '2026-04-20', kind: 'ordinario', url: 'https://yt/a', ytId: 'a' },
        { plenoDate: '2026-04-20', kind: 'ordinario', url: 'https://yt/b', ytId: 'b' },
      ])
    expect(r).toThrow(/ambig/i)
  })
})

import { describe, expect, it } from 'vitest'
import { timeAgo, prettyNeighborhood } from '../../src/lib/formatters'

// Build an ISO string a given number of milliseconds in the past.
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('timeAgo (unified canonical: round / 24h / 30d)', () => {
  it('returns "" for null/undefined/empty', () => {
    expect(timeAgo(null)).toBe('')
    expect(timeAgo(undefined)).toBe('')
    expect(timeAgo('')).toBe('')
  })

  it('shows "ahora" under a minute', () => {
    expect(timeAgo(ago(10_000))).toBe('ahora')
  })

  it('shows minutes under an hour', () => {
    expect(timeAgo(ago(5 * MIN))).toBe('hace 5 min')
  })

  it('shows hours under a day', () => {
    expect(timeAgo(ago(3 * HOUR))).toBe('hace 3 h')
  })

  it('shows days under 30 days', () => {
    expect(timeAgo(ago(5 * DAY))).toBe('hace 5 d')
  })

  it('falls back to an absolute es-ES date past 30 days', () => {
    const out = timeAgo(ago(60 * DAY))
    expect(out).not.toMatch(/^hace /)
    expect(out).not.toBe('ahora')
    // Localised "12 abr 2026"-style string — contains a 4-digit year.
    expect(out).toMatch(/\d{4}/)
  })
})

describe('prettyNeighborhood', () => {
  it('returns "" for falsy input', () => {
    expect(prettyNeighborhood('')).toBe('')
    expect(prettyNeighborhood(null)).toBe('')
    expect(prettyNeighborhood(undefined)).toBe('')
  })

  it('title-cases hyphen-, underscore-, and space-separated slugs', () => {
    expect(prettyNeighborhood('santa-rosa')).toBe('Santa Rosa')
    expect(prettyNeighborhood('l_oliveral')).toBe('L Oliveral')
    expect(prettyNeighborhood('vallesa de mandor')).toBe('Vallesa De Mandor')
  })
})

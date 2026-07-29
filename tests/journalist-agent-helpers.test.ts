import { describe, it, expect } from 'vitest'
import { keepValidUrlAccounts } from '../src/scraper/journalist-agent/shared'

describe('keepValidUrlAccounts', () => {
  it('drops rows whose url would fail the section validator (URL_RE)', () => {
    const rows = [
      { platform: 'twitter', handle: '@raga', url: 'https://twitter.com/raga' },
      { platform: 'instagram', handle: '@raga', url: 'instagram.com/raga' }, // no scheme
      { platform: 'facebook', handle: 'Robert Raga', url: '' },
      { platform: 'linkedin', handle: 'raga', url: null },
    ]
    const kept = keepValidUrlAccounts(rows)
    expect(kept).toHaveLength(1)
    expect(kept[0].platform).toBe('twitter')
  })

  it('keeps http and https, passes empty input through', () => {
    expect(
      keepValidUrlAccounts([{ platform: 'web', handle: 'blog', url: 'http://raga.example' }]),
    ).toHaveLength(1)
    expect(keepValidUrlAccounts([])).toEqual([])
  })
})

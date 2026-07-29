import { describe, it, expect } from 'vitest'
import { describeWebSearchBackend } from '../src/scraper/journalist-tools/web'

describe('describeWebSearchBackend', () => {
  it('prefers searxng when SEARXNG_URL is set', () => {
    const d = describeWebSearchBackend({ SEARXNG_URL: 'http://localhost:8888', EXA_API_KEY: 'x' })
    expect(d.backend).toBe('searxng')
    expect(d.detail).toContain('http://localhost:8888')
  })

  it('falls back to exa when only EXA_API_KEY is set', () => {
    const d = describeWebSearchBackend({ EXA_API_KEY: 'x' })
    expect(d.backend).toBe('exa')
  })

  it('reports none (with the fix command) when nothing is configured', () => {
    const d = describeWebSearchBackend({})
    expect(d.backend).toBe('none')
    expect(d.detail).toContain('searxng:up')
  })

  it('treats a whitespace-only SEARXNG_URL as unset', () => {
    expect(describeWebSearchBackend({ SEARXNG_URL: '   ' }).backend).toBe('none')
  })
})

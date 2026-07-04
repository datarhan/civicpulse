import { describe, it, expect, vi } from 'vitest'
import { withRetry, isTransientFetchError } from '../../src/scraper/retry'

const noSleep = () => Promise.resolve()

describe('scraper/retry — withRetry', () => {
  it('returns on first success without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    expect(await withRetry(fn, { retries: 3, sleep: noSleep })).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries transient failures then succeeds, firing onRetry each time', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('HTTP 503'))
      .mockRejectedValueOnce(new Error('HTTP 503'))
      .mockResolvedValue('ok')
    const onRetry = vi.fn()
    const r = await withRetry(fn, { retries: 3, sleep: noSleep, onRetry })
    expect(r).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
    expect(onRetry).toHaveBeenCalledTimes(2)
  })

  it('throws the last error after exhausting retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'))
    await expect(withRetry(fn, { retries: 2, sleep: noSleep })).rejects.toThrow('boom')
    expect(fn).toHaveBeenCalledTimes(3) // 1 initial + 2 retries
  })

  it('stops immediately when shouldRetry says no', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('HTTP 404'))
    await expect(
      withRetry(fn, { retries: 3, sleep: noSleep, shouldRetry: () => false }),
    ).rejects.toThrow('HTTP 404')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('backs off exponentially between attempts', async () => {
    const delays: number[] = []
    const fn = vi.fn().mockRejectedValue(new Error('x'))
    await withRetry(fn, {
      retries: 3,
      baseDelayMs: 100,
      sleep: (ms) => {
        delays.push(ms)
        return Promise.resolve()
      },
    }).catch(() => {})
    expect(delays).toEqual([100, 200, 400])
  })
})

describe('scraper/retry — isTransientFetchError', () => {
  it('treats timeouts + network errors as transient', () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' })
    expect(isTransientFetchError(timeout)).toBe(true)
    expect(isTransientFetchError(new TypeError('fetch failed'))).toBe(true)
  })

  it('retries 429 + 5xx but not other 4xx', () => {
    expect(isTransientFetchError(new Error('HTTP 429 fetching x'))).toBe(true)
    expect(isTransientFetchError(new Error('HTTP 502 fetching x'))).toBe(true)
    expect(isTransientFetchError(new Error('HTTP 404 fetching x'))).toBe(false)
    expect(isTransientFetchError(new Error('HTTP 403 fetching x'))).toBe(false)
  })
})

import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { installFetchMock } from './setup/mockFetch'
import { useJsonFetch } from '../src/hooks/useJsonFetch'

const FALLBACK = { items: [] }

describe('useJsonFetch (snapshot-store backed)', () => {
  it('loads data with loading→ready lifecycle', async () => {
    installFetchMock({ '/data/x.json': { items: [1] } })
    const { result } = renderHook(() => useJsonFetch('/data/x.json'))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.data).toEqual({ items: [1] })
  })

  it('two mounts of the same path fetch once and share data', async () => {
    const fetchFn = installFetchMock({ '/data/shared.json': { n: 7 } })
    const a = renderHook(() => useJsonFetch('/data/shared.json'))
    const b = renderHook(() => useJsonFetch('/data/shared.json'))
    await waitFor(() => expect(a.result.current.loading).toBe(false))
    await waitFor(() => expect(b.result.current.loading).toBe(false))
    expect(a.result.current.data).toEqual({ n: 7 })
    expect(b.result.current.data).toEqual({ n: 7 })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('404 with fallback resolves to the fallback, no error', async () => {
    installFetchMock({})
    const { result } = renderHook(() => useJsonFetch('/data/absent.json', FALLBACK))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.data).toBe(FALLBACK)
  })

  it('404 without fallback surfaces an error', async () => {
    installFetchMock({})
    const { result } = renderHook(() => useJsonFetch('/data/absent.json'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(String(result.current.error)).toContain('404')
    expect(result.current.data).toBeNull()
  })

  it('non-ok non-404 surfaces an error and a remount retries', async () => {
    globalThis.fetch = async () => new Response('boom', { status: 500 })
    const first = renderHook(() => useJsonFetch('/data/e500.json'))
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(String(first.result.current.error)).toContain('500')
    first.unmount()
    const fetchFn = installFetchMock({ '/data/e500.json': { ok: 1 } })
    const second = renderHook(() => useJsonFetch('/data/e500.json'))
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(second.result.current.data).toEqual({ ok: 1 })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})

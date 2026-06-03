import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useJsonFetch } from '../../src/hooks/useJsonFetch'
import { usePadron } from '../../src/hooks/usePadron'
import { useTenders } from '../../src/hooks/useTenders'
import { useJournalistReports } from '../../src/hooks/useJournalistReports'
import { installFetchMock } from '../setup/mockFetch'

describe('useJsonFetch', () => {
  it('resolves to { loading:false, error:null, data } on a 200', async () => {
    installFetchMock({ '/data/thing.json': { hello: 'world' } })
    const { result } = renderHook(() => useJsonFetch('/data/thing.json'))
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.data).toEqual({ hello: 'world' })
  })

  it('surfaces an Error mentioning the status on a non-ok response', async () => {
    installFetchMock({}) // every unknown path → 404
    const { result } = renderHook(() => useJsonFetch('/data/missing.json'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toBeNull()
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error.message).toContain('404')
  })

  it('resolves to the fallback (not an error) on a 404 when a fallback is given', async () => {
    installFetchMock({}) // every unknown path → 404
    const FALLBACK = { items: [] }
    const { result } = renderHook(() => useJsonFetch('/data/missing.json', FALLBACK))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.data).toBe(FALLBACK)
  })

  it('does not set state after unmount (cancellation guard)', async () => {
    let resolveFetch
    globalThis.fetch = vi.fn(
      () =>
        new Promise((res) => {
          resolveFetch = res
        }),
    )
    const { result, unmount } = renderHook(() => useJsonFetch('/data/slow.json'))
    unmount()
    // Resolve only AFTER unmount; the cancelled guard must swallow the update.
    resolveFetch(
      new Response(JSON.stringify({ x: 1 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await new Promise((r) => setTimeout(r, 10))
    // State stays at its initial loading value — no post-unmount write.
    expect(result.current.loading).toBe(true)
    expect(result.current.data).toBeNull()
  })
})

describe('migrated domain hooks compose useJsonFetch', () => {
  it('usePadron loads /data/padron.json', async () => {
    installFetchMock({ '/data/padron.json': { series: [1, 2, 3] } })
    const { result } = renderHook(() => usePadron())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual({ series: [1, 2, 3] })
  })

  it('useTenders loads /data/tenders.json', async () => {
    installFetchMock({ '/data/tenders.json': { contracts: [], tenders: [] } })
    const { result } = renderHook(() => useTenders())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual({ contracts: [], tenders: [] })
  })

  it('useJournalistReports resolves an empty snapshot on 404 (curated file may not exist yet)', async () => {
    installFetchMock({}) // → 404
    const { result } = renderHook(() => useJournalistReports())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.data.items).toEqual([])
    expect(result.current.data.methodologyUrl).toBe('/metodologia')
  })
})

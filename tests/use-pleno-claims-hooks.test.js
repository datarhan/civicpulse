import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { installFetchMock } from './setup/mockFetch'
import { usePlenoClaims, usePlenoClaimsManifest, usePlenoChunk } from '../src/hooks/usePlenoClaims'

describe('usePlenoClaimsManifest', () => {
  it('returns the manifest plenos descriptors', async () => {
    installFetchMock({
      '/data/pleno-claims/index.json': {
        plenos: [{ plenoId: 'a', byVerdict: { verificado: 2 } }],
        totals: { items: 2 },
      },
    })
    const { result } = renderHook(() => usePlenoClaimsManifest())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data.plenos[0].plenoId).toBe('a')
  })

  it('falls back to empty on 404', async () => {
    installFetchMock({}) // unknown path → 404
    const { result } = renderHook(() => usePlenoClaimsManifest())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data.plenos).toEqual([])
  })
})

describe('usePlenoChunk', () => {
  it('fetches the chunk for the given plenoId', async () => {
    installFetchMock({
      '/data/pleno-claims/k4olcs.json': { plenoId: 'k4olcs', items: [{ claim: { id: 'x' } }] },
    })
    const { result } = renderHook(() => usePlenoChunk('k4olcs'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data.items).toHaveLength(1)
  })

  it('falls back to empty items on 404', async () => {
    installFetchMock({}) // unknown path → 404
    const { result } = renderHook(() => usePlenoChunk('missing'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data.items).toEqual([])
  })
})

describe('usePlenoClaims (store-backed)', () => {
  it('flattens manifest + chunks and fetches each file once across two mounts', async () => {
    const fetchFn = installFetchMock({
      '/data/pleno-claims/index.json': {
        generatedAt: '2026-07-29T00:00:00Z',
        plenos: [
          { plenoId: 'aaa', chunkPath: 'pleno-claims/aaa.json' },
          { plenoId: 'bbb', chunkPath: 'pleno-claims/bbb.json' },
        ],
        totals: { items: 3, byVerdict: { verificado: 1 } },
      },
      '/data/pleno-claims/aaa.json': { items: [{ claim: { id: 'a1' } }, { claim: { id: 'a2' } }] },
      '/data/pleno-claims/bbb.json': { items: [{ claim: { id: 'b1' } }] },
    })
    const first = renderHook(() => usePlenoClaims())
    await waitFor(() => expect(first.result.current.loading).toBe(false))
    expect(first.result.current.data.items.map((it) => it.claim.id)).toEqual(['a1', 'a2', 'b1'])
    expect(first.result.current.data.stats.total).toBe(3)
    const callsAfterFirst = fetchFn.mock.calls.length
    const second = renderHook(() => usePlenoClaims())
    await waitFor(() => expect(second.result.current.loading).toBe(false))
    expect(fetchFn.mock.calls.length).toBe(callsAfterFirst) // fully served from cache
  })

  it('manifest 404 resolves to the honest-empty ledger', async () => {
    installFetchMock({})
    const { result } = renderHook(() => usePlenoClaims())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBeNull()
    expect(result.current.data.items).toEqual([])
    expect(result.current.data.stats.total).toBe(0)
  })

  it('a failing chunk surfaces as an error', async () => {
    installFetchMock({
      '/data/pleno-claims/index.json': {
        plenos: [{ plenoId: 'aaa', chunkPath: 'pleno-claims/aaa.json' }],
        totals: { items: 1, byVerdict: {} },
      },
      // aaa.json absent → 404 → chunk load throws
    })
    const { result } = renderHook(() => usePlenoClaims())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).not.toBeNull()
  })
})

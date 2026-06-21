import { describe, it, expect } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { installFetchMock } from './setup/mockFetch'
import { usePlenoClaimsManifest, usePlenoChunk } from '../src/hooks/usePlenoClaims'

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

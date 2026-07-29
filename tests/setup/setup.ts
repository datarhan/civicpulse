import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'

afterEach(() => {
  cleanup()
})

// Reset fetch-layer state between tests: the snapshot store is a
// module-level session cache, and hook tests remap the same path with
// different installFetchMock payloads across tests in one file.
beforeEach(() => {
  invalidateSnapshots()
})

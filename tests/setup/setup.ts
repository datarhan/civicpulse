import { beforeEach } from 'vitest'
import { invalidateSnapshots } from '../../src/lib/snapshot-store'

// Se mira el entorno y no la extensión: un `.ts` que declara
// `// @vitest-environment happy-dom` tiene DOM y necesita lo mismo que un `.jsx`.
if (typeof document !== 'undefined') await import('./setup-dom')

// Reset fetch-layer state between tests: the snapshot store is a
// module-level session cache, and hook tests remap the same path with
// different installFetchMock payloads across tests in one file.
beforeEach(() => {
  invalidateSnapshots()
})

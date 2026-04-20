import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})

// Reset any fetch mocks between tests.
beforeEach(() => {
  // jsdom/happy-dom ship with a fetch stub; we override per test.
})

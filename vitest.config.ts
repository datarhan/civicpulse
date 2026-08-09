import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.{js,ts,mjs,jsx,tsx}', 'src/**/*.test.{js,ts,jsx,tsx}'],
    globals: false,
    // no-network first: its hooks must register before anything else so the
    // guard is the baseline `fetch` every test starts from.
    setupFiles: ['./tests/setup/no-network.ts', './tests/setup/setup.ts'],
  },
})

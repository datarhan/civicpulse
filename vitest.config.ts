import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    include: [
      'tests/**/*.test.{js,ts,mjs,jsx,tsx}',
      'src/**/*.test.{js,ts,jsx,tsx}',
    ],
    globals: false,
    setupFiles: ['./tests/setup/setup.ts'],
  },
})

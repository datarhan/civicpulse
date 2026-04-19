import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.{js,ts,mjs}', 'src/**/*.test.{js,ts,jsx,tsx}'],
    globals: false,
  },
})

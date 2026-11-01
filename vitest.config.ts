import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
// @ts-expect-error — JS sin tipos, compartido con vite.config.js a propósito:
// las constantes de build tienen que resolverse igual en la app y en la suite,
// o una página renderiza en producción y revienta en los tests.
import { buildDefines } from './build-defines.js'

export default defineConfig({
  plugins: [react()],
  define: buildDefines(),
  test: {
    globals: false,
    // no-network first: its hooks must register before anything else so the
    // guard is the baseline `fetch` every test starts from.
    setupFiles: ['./tests/setup/no-network.ts', './tests/setup/setup.ts'],
    // Cada fichero paga sólo el entorno que usa: un `.ts` o un `.js` que necesite
    // DOM lo declara con `// @vitest-environment happy-dom` en su primera línea.
    // Por qué, y cuánto: tests/entorno-por-extension.test.ts.
    projects: [
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'happy-dom',
          include: ['tests/**/*.test.{jsx,tsx}', 'src/**/*.test.{jsx,tsx}'],
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.{js,ts,mjs}', 'src/**/*.test.{js,ts}'],
        },
      },
    ],
  },
})

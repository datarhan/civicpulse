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
    // `maxWorkers` se queda en su defecto, que en un runner de cuatro son tres. Se
    // probó con cuatro el 01-11-2026: 401 y 411 s frente a 411–438 s con tres en
    // runners igual de lentos, y cada fichero un 30 % más lento. Esos 20 s no pagan
    // la competencia que añade a las pruebas con plazo: ahí manda la CPU que hay, así
    // que el tiempo baja quitando trabajo, no repartiéndolo.
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
          include: [
            'tests/**/*.test.{jsx,tsx}',
            'src/**/*.test.{jsx,tsx}',
            // También corre en `node`: la guarda vigila los dos entornos, y su
            // prueba sólo demuestra el entorno en el que corre.
            'tests/network-guard.test.ts',
          ],
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

import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.PORT || 4178)
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // La suite completa fallaba en local una de cada tres o cuatro pasadas, en un
  // spec distinto cada vez. La causa, reproducida a propósito y no supuesta:
  // **reconstruir mientras la suite corre**. `npm run test:e2e` no construye
  // —CI lo hace en un paso aparte— y `vite build` vacía y reescribe `dist/`, así
  // que cualquier página que cargue dentro de esa ventana pide un asset que
  // durante un instante no existe y se lleva un 404. Por eso saltaba en un spec
  // distinto cada vez: en el que tocara estar cargando.
  //
  // La prueba: con cinco builds lanzados durante una pasada, 8 flaky en vez de
  // 0–1. Antes de eso se descartaron el tiempo de espera (caía en <0,5 s), la
  // carga por sí sola (300 cargas concurrentes, cero 4xx) y la ruta concreta
  // (ninguna de las nueve implicadas da un 4xx aislada).
  //
  // CI es inmune: construye y prueba en pasos serializados y no reutiliza
  // servidor. En local el reintento absorbe la ventana, y no esconde nada —
  // Playwright informa de lo reintentado como «flaky», no como «passed», que es
  // la condición para que un reintento sea aceptable.
  //
  // Si ves «flaky» aquí: comprueba primero que no había un build en marcha.
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
      testIgnore: /mobile\.spec\.ts$/,
    },
    {
      name: 'mobile-iphone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
      },
      testMatch: /mobile\.spec\.ts$/,
    },
  ],
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})

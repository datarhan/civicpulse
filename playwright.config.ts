import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.PORT || 4178)
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // En local había 0 reintentos con los workers por defecto —cinco en una
  // máquina de diez núcleos— contra un único `vite preview`. En CI son 2
  // workers y 2 reintentos, así que la pasada local era ESTRICTAMENTE menos
  // tolerante que la puerta que pretende predecir: una de cada tres o cuatro
  // pasadas completas fallaba, en un spec distinto cada vez.
  //
  // Diagnosticado, y no era un tiempo agotado: caía siempre en la aserción de
  // «sin errores de consola», en menos de medio segundo, con un 404 suelto. No
  // se reproduce en ninguna ruta por separado, ni repitiendo un spec 36 veces
  // con seis workers: sólo con la suite entera encima del servidor de preview.
  // Ninguna de las nueve rutas implicadas devuelve un 4xx cuando se carga sola.
  //
  // Un reintento iguala la tolerancia local a la de CI. No esconde nada:
  // Playwright informa de lo reintentado como «flaky», no como «passed», así
  // que un test que de verdad se vuelva inestable se sigue viendo.
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
